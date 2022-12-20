// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { Worker } from './worker.js';
import * as migrations from './migrations.js';
import { getUID, isSet } from './helpers.js';

/**
 * @classdesc This class contains methods for managing IITC and plugins.
 */
export class Manager extends Worker {
    /**
     * Changes the update channel.
     *
     * @async
     * @param {"release" | "beta" | "custom"} channel - Update channel for IITC and plugins.
     * @return {Promise<void>}
     */
    async setChannel(channel) {
        await this._save({ channel: channel, last_check_update: null });
        this.channel = channel;
        await this.checkUpdates();
    }

    /**
     * Changes the update check interval. If the interval for the current channel changes, a forced update check is started to apply the new interval.
     *
     * @async
     * @param {number} interval - Update check interval in seconds.
     * @param {"release" | "beta" | "custom" | undefined} [channel=undefined] - Update channel for IITC and plugins.
     * If not specified, the current channel is used.
     * @return {Promise<void>}
     */
    async setUpdateCheckInterval(interval, channel) {
        if (typeof channel === 'undefined') channel = this.channel;

        const data = {};
        data[channel + '_update_check_interval'] = interval;
        await this.storage.set(data);

        if (channel === this.channel) await this.checkUpdates(true);
    }

    /**
     * Changes the URL of the repository with IITC and plugins for the custom channel.
     *
     * @async
     * @param {string} url - URL of the repository.
     * @return {Promise<void>}
     */
    async setCustomChannelUrl(url) {
        const network_host = await this.storage.get(['network_host']).then((data) => data.network_host);
        network_host.custom = url;
        await this.storage.set({ network_host: network_host });
        this.network_host = network_host;
    }

    /**
     * Running the IITC and plugins manager.
     * Migrates data storage as needed, then loads or updates UserScripts from the repositories.
     *
     * @async
     * @return {Promise<void>}
     */
    async run() {
        if (!this.is_initialized) {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return await this.run();
        }
        const is_migrated = await migrations.migrate(this.storage);
        await this.checkUpdates(is_migrated);
    }

    /**
     * Invokes the injection of IITC and plugins to the page
     */
    async inject() {
        const storage = await this.storage.get([
            this.channel + '_iitc_code',
            this.channel + '_plugins_flat',
            this.channel + '_plugins_local',
            this.channel + '_plugins_user',
        ]);

        const iitc_code = storage[this.channel + '_iitc_code'];

        const plugins_local = storage[this.channel + '_plugins_local'];
        const plugins_user = storage[this.channel + '_plugins_user'];

        if (iitc_code !== undefined) {
            const userscripts = [];

            // IITC is injected first, then plugins. This is the correct order, because the initialization of IITC takes some time.
            // During this time, plugins have time to be added to `window.bootPlugins` and are not started immediately.
            // In addition, thanks to the injecting of plugins after IITC,
            // plugins do not throw errors when attempting to access IITC, leaflet, etc. during the execution of the wrapper.
            userscripts.push(iitc_code);
            const plugins_flat = storage[this.channel + '_plugins_flat'];
            for (const uid of Object.keys(plugins_flat)) {
                if (plugins_flat[uid]['status'] === 'on') {
                    userscripts.push(plugins_flat[uid]['user'] === true ? plugins_user[uid]['code'] : plugins_local[uid]['code']);
                }
            }

            await Promise.all(userscripts.map((code) => this.inject_user_script(code)));
        }
    }

    /**
     * Runs periodic checks and installs updates for IITC, internal and external plugins.
     *
     * @async
     * @param {boolean} [force=false] - Forced to run the update right now.
     * @return {Promise<void>}
     */
    async checkUpdates(force) {
        await Promise.all([this._checkInternalUpdates(force), this._checkExternalUpdates(force)]);
    }

    /**
     * Controls the plugin. Allows you to enable, disable and remove the plugin.
     *
     * @async
     * @param {string} uid - Unique identifier of the plugin.
     * @param {"on" | "off" | "delete"} action - Type of action with the plugin.
     * @return {Promise<void>}
     */
    async managePlugin(uid, action) {
        let local = await this.storage.get([this.channel + '_plugins_flat', this.channel + '_plugins_local', this.channel + '_plugins_user']);

        let plugins_flat = local[this.channel + '_plugins_flat'];
        let plugins_local = local[this.channel + '_plugins_local'];
        let plugins_user = local[this.channel + '_plugins_user'];

        if (!isSet(plugins_local)) plugins_local = {};
        if (!isSet(plugins_user)) plugins_user = {};

        if (action === 'on') {
            if ((plugins_flat[uid]['user'] === false && plugins_local[uid] !== undefined) || plugins_flat[uid]['user'] === true) {
                plugins_flat[uid]['status'] = 'on';
                if (plugins_flat[uid]['user']) {
                    plugins_user[uid]['status'] = 'on';
                } else {
                    plugins_local[uid]['status'] = 'on';
                }

                this.inject_user_script(plugins_flat[uid]['user'] === true ? plugins_user[uid]['code'] : plugins_local[uid]['code']);

                await this._save({
                    plugins_flat: plugins_flat,
                    plugins_local: plugins_local,
                    plugins_user: plugins_user,
                });
            } else {
                let filename = plugins_flat[uid]['filename'];
                let response = await this._getUrl(`${this.network_host[this.channel]}/plugins/${filename}`);
                if (response) {
                    plugins_flat[uid]['status'] = 'on';
                    plugins_local[uid] = plugins_flat[uid];
                    plugins_local[uid]['code'] = response;

                    this.inject_user_script(plugins_local[uid]['code']);

                    await this._save({
                        plugins_flat: plugins_flat,
                        plugins_local: plugins_local,
                    });
                }
            }
        }
        if (action === 'off') {
            plugins_flat[uid]['status'] = 'off';
            if (plugins_flat[uid]['user']) {
                plugins_user[uid]['status'] = 'off';
            } else {
                plugins_local[uid]['status'] = 'off';
            }

            await this._save({
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user,
            });
        }
        if (action === 'delete') {
            if (plugins_flat[uid]['override']) {
                plugins_flat[uid] = { ...plugins_local[uid] };
                plugins_flat[uid]['status'] = 'off';
            } else {
                delete plugins_flat[uid];
            }
            delete plugins_user[uid];

            await this._save({
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user,
            });
        }
    }

    /**
     * Allows adding third-party UserScript plugins to IITC.
     * Returns the dictionary of installed or updated plugins.
     *
     * @async
     * @param {Object[]} scripts - Array of UserScripts.
     * @param {plugin} scripts[].meta - Parsed "meta" object of UserScript.
     * @param {string} scripts[].code - UserScript code.
     * @return {Promise<Object.<string, plugin>>}
     */
    async addUserScripts(scripts) {
        let local = await this.storage.get([
            this.channel + '_categories',
            this.channel + '_plugins_flat',
            this.channel + '_plugins_local',
            this.channel + '_plugins_user',
        ]);

        let categories = local[this.channel + '_categories'];
        let plugins_flat = local[this.channel + '_plugins_flat'];
        let plugins_local = local[this.channel + '_plugins_local'];
        let plugins_user = local[this.channel + '_plugins_user'];

        if (!isSet(categories)) categories = {};
        if (!isSet(plugins_flat)) plugins_flat = {};
        if (!isSet(plugins_local)) plugins_local = {};
        if (!isSet(plugins_user)) plugins_user = {};

        const installed_scripts = {};
        scripts.forEach((script) => {
            let meta = script['meta'];
            const code = script['code'];
            const plugin_uid = getUID(meta);

            if (plugin_uid === null) throw new Error('The plugin has an incorrect ==UserScript== header');

            const is_user_plugins = plugins_user[plugin_uid] !== undefined;
            plugins_user[plugin_uid] = Object.assign(meta, {
                uid: plugin_uid,
                status: 'on',
                code: code,
            });

            if (plugin_uid in plugins_flat && !is_user_plugins) {
                if (plugin_uid in plugins_local && plugins_flat[plugin_uid]['status'] !== 'off') {
                    plugins_local[plugin_uid]['status'] = 'off';
                }

                plugins_flat[plugin_uid]['status'] = 'on';
                plugins_flat[plugin_uid]['code'] = code;
                plugins_flat[plugin_uid]['override'] = true;
            } else {
                let category = plugins_user[plugin_uid]['category'];
                if (category === undefined) {
                    category = 'Misc';
                    plugins_user[plugin_uid]['category'] = category;
                }
                if (!(category in categories)) {
                    categories[category] = {
                        name: category,
                        description: '',
                    };
                }
                plugins_flat[plugin_uid] = { ...plugins_user[plugin_uid] };
            }
            plugins_flat[plugin_uid]['user'] = true;
            installed_scripts[plugin_uid] = plugins_flat[plugin_uid];
        });

        await this._save({
            categories: categories,
            plugins_flat: plugins_flat,
            plugins_local: plugins_local,
            plugins_user: plugins_user,
        });
        return installed_scripts;
    }
}
