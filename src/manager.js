// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { Worker } from './worker.js';
import * as migrations from './migrations.js';
import { getUID, isSet, sanitizeFileName } from './helpers.js';
import * as backup from './backup.js';

/**
 * @classdesc This class contains methods for managing IITC and plugins.
 */
export class Manager extends Worker {
    /**
     * Changes the update channel and calls for an update.
     *
     * @async
     * @param {"release" | "beta" | "custom"} channel - Update channel for IITC and plugins.
     * @return {Promise<void>}
     */
    async setChannel(channel) {
        // Get active plugins from current channel and notify about removal
        const oldEnabledPlugins = await this.getEnabledPlugins();
        await this._sendPluginsEvent(channel, Object.keys(oldEnabledPlugins), 'remove');

        // Change channel in storage and object
        this.channel = channel;
        await this._save(channel, { channel: channel, last_check_update: null });

        // Ensure minimal data structures exist for new channel
        const newChannelData = await this.storage.get([`${channel}_plugins_flat`, `${channel}_plugins_local`, `${channel}_plugins_user`]);

        // Initialize missing structures if needed
        const updates = {};
        if (!newChannelData[`${channel}_plugins_flat`]) updates[`${channel}_plugins_flat`] = {};
        if (!newChannelData[`${channel}_plugins_local`]) updates[`${channel}_plugins_local`] = {};
        if (!newChannelData[`${channel}_plugins_user`]) updates[`${channel}_plugins_user`] = {};

        // Save initializations if needed
        if (Object.keys(updates).length > 0) {
            await this.storage.set(updates);
        }

        // Get active plugins from new channel and notify about addition
        const newEnabledPlugins = await this.getEnabledPlugins();
        await this._sendPluginsEvent(channel, Object.keys(newEnabledPlugins), 'add');

        await this.checkUpdates(true);
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
     * Returns an object of all enabled plugins, including IITC core, with plugin UID as the key and plugin data as the value.
     *
     * @async
     * @returns {Promise<Object>} A promise that resolves to an object containing enabled plugins and IITC core data.
     */
    async getEnabledPlugins() {
        const channel = this.channel;
        const storage = await this.storage.get([
            `${channel}_iitc_core`,
            `${channel}_iitc_core_user`,
            `${channel}_plugins_flat`,
            `${channel}_plugins_local`,
            `${channel}_plugins_user`,
        ]);

        const plugins_flat = storage[`${channel}_plugins_flat`] || {};
        const plugins_local = storage[`${channel}_plugins_local`] || {};
        const plugins_user = storage[`${channel}_plugins_user`] || {};

        const enabled_plugins = {};
        let iitc_script = await this.getIITCCore(storage);
        if (iitc_script !== null) {
            enabled_plugins[this.iitc_main_script_uid] = iitc_script;

            for (const uid in plugins_flat) {
                if (plugins_flat[uid]['status'] === 'on') {
                    // If the plugin is marked as 'user', use its 'user' version; otherwise, use its 'local' version
                    enabled_plugins[uid] = plugins_flat[uid]['user'] === true ? plugins_user[uid] || {} : plugins_local[uid] || {};
                }
            }
        }
        return enabled_plugins;
    }

    /**
     * Invokes the injection of IITC core script and plugins to the page.
     * IITC core is injected first to ensure it initializes before any plugins. This is crucial because
     * the initialization of IITC takes some time, and during this time, plugins can be added to `window.bootPlugins`
     * without being started immediately. Injecting IITC first also prevents plugins from throwing errors
     * when attempting to access IITC, leaflet, or other dependencies during their initialization.
     *
     * @async
     * @returns {Promise<void>}
     */
    async inject() {
        const plugins = await this.getEnabledPlugins();

        // Ensure IITC core is injected first
        if (plugins[this.iitc_main_script_uid]) {
            this.inject_user_script(plugins[this.iitc_main_script_uid].code);
            this.inject_plugin(plugins[this.iitc_main_script_uid]);
            delete plugins[this.iitc_main_script_uid]; // Remove IITC core from the list to avoid re-injecting
        }

        // Now inject the rest of the plugins
        for (const uid in plugins) {
            const plugin = plugins[uid];
            if (plugin && plugin.code) {
                this.inject_user_script(plugin.code);
                this.inject_plugin(plugin);
            }
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
        const channel = this.channel;
        let local = await this.storage.get([`${channel}_plugins_flat`, `${channel}_plugins_local`, `${channel}_plugins_user`]);

        let plugins_flat = local[`${channel}_plugins_flat`];
        let plugins_local = local[`${channel}_plugins_local`];
        let plugins_user = local[`${channel}_plugins_user`];

        if (!isSet(plugins_local)) plugins_local = {};
        if (!isSet(plugins_user)) plugins_user = {};

        const currentTime = Math.floor(Date.now() / 1000);

        if (action === 'on') {
            const isUserPlugin = plugins_flat[uid]['user'];
            if ((isUserPlugin === false && plugins_local[uid] !== undefined) || isUserPlugin === true) {
                plugins_flat[uid]['status'] = 'on';
                plugins_flat[uid]['statusChangedAt'] = currentTime;

                if (isUserPlugin) {
                    plugins_user[uid]['status'] = 'on';
                    plugins_user[uid]['statusChangedAt'] = currentTime;
                } else {
                    plugins_local[uid]['status'] = 'on';
                    plugins_local[uid]['statusChangedAt'] = currentTime;
                }

                this.inject_user_script(isUserPlugin === true ? plugins_user[uid]['code'] : plugins_local[uid]['code']);
                this.inject_plugin(isUserPlugin === true ? plugins_user[uid] : plugins_local[uid]);

                await this._save(channel, {
                    plugins_flat: plugins_flat,
                    plugins_local: plugins_local,
                    plugins_user: plugins_user,
                });
                await this._sendPluginsEvent(channel, [uid], 'add');
            } else {
                let filename = plugins_flat[uid]['filename'];
                let response = await this._getUrl(`${this.network_host[channel]}/plugins/${filename}`);
                if (response) {
                    plugins_flat[uid]['status'] = 'on';
                    plugins_flat[uid]['statusChangedAt'] = currentTime;
                    plugins_flat[uid]['code'] = response;
                    plugins_local[uid] = { ...plugins_flat[uid] };

                    this.inject_user_script(plugins_local[uid]['code']);
                    this.inject_plugin(plugins_local[uid]);

                    await this._save(channel, {
                        plugins_flat: plugins_flat,
                        plugins_local: plugins_local,
                    });
                    await this._sendPluginsEvent(channel, [uid], 'add');
                }
            }
        }
        if (action === 'off') {
            plugins_flat[uid]['status'] = 'off';
            plugins_flat[uid]['statusChangedAt'] = currentTime;

            if (plugins_flat[uid]['user']) {
                plugins_user[uid]['status'] = 'off';
                plugins_user[uid]['statusChangedAt'] = currentTime;
            } else {
                plugins_local[uid]['status'] = 'off';
                plugins_local[uid]['statusChangedAt'] = currentTime;
            }

            await this._save(channel, {
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user,
            });
            await this._sendPluginsEvent(channel, [uid], 'remove');
        }
        if (action === 'delete') {
            if (uid === this.iitc_main_script_uid) {
                await this._save(channel, {
                    iitc_core_user: {},
                });
                await this._sendPluginsEvent(channel, [uid], 'update');
            } else {
                const isEnabled = plugins_flat[uid]['status'] === 'on';
                if (plugins_flat[uid]['override']) {
                    if (plugins_local[uid] !== undefined) {
                        plugins_flat[uid] = { ...plugins_local[uid] };
                    }
                    plugins_flat[uid]['user'] = false;
                    plugins_flat[uid]['override'] = false;
                    plugins_flat[uid]['status'] = 'off';
                    delete plugins_flat[uid]['addedAt'];
                } else {
                    delete plugins_flat[uid];
                }
                delete plugins_user[uid];

                await this._save(channel, {
                    plugins_flat: plugins_flat,
                    plugins_local: plugins_local,
                    plugins_user: plugins_user,
                });
                if (isEnabled) {
                    await this._sendPluginsEvent(channel, [uid], 'remove');
                }
            }
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
        const channel = this.channel;
        let local = await this.storage.get([
            `${channel}_iitc_core_user`,
            `${channel}_categories`,
            `${channel}_plugins_flat`,
            `${channel}_plugins_local`,
            `${channel}_plugins_user`,
        ]);

        let iitc_core_user = local[`${channel}_iitc_core_user`];
        let categories = local[`${channel}_categories`];
        let plugins_flat = local[`${channel}_plugins_flat`];
        let plugins_local = local[`${channel}_plugins_local`];
        let plugins_user = local[`${channel}_plugins_user`];

        if (!isSet(categories)) categories = {};
        if (!isSet(plugins_flat)) plugins_flat = {};
        if (!isSet(plugins_local)) plugins_local = {};
        if (!isSet(plugins_user)) plugins_user = {};

        const added_uids = [];
        const updated_uids = [];
        const installed_scripts = {};
        const currentTime = Math.floor(Date.now() / 1000);

        scripts.forEach((script) => {
            let meta = script['meta'];
            const code = script['code'];
            const plugin_uid = getUID(meta);

            if (plugin_uid === null) throw new Error('The plugin has an incorrect ==UserScript== header');

            if (plugin_uid === this.iitc_main_script_uid) {
                iitc_core_user = Object.assign(meta, {
                    uid: plugin_uid,
                    code: code,
                });
                updated_uids.push(plugin_uid);
                installed_scripts[plugin_uid] = iitc_core_user;
            } else {
                const is_user_plugins = plugins_user[plugin_uid] !== undefined;
                plugins_user[plugin_uid] = Object.assign(meta, {
                    uid: plugin_uid,
                    status: 'on',
                    filename: meta['filename'] ? meta['filename'] : sanitizeFileName(`${meta['name']}.user.js`),
                    code: code,
                    addedAt: currentTime,
                    statusChangedAt: currentTime,
                });

                if (plugin_uid in plugins_flat && !is_user_plugins) {
                    if (plugin_uid in plugins_local && plugins_flat[plugin_uid]['status'] !== 'off') {
                        plugins_local[plugin_uid]['status'] = 'off';
                    }

                    plugins_flat[plugin_uid]['status'] = 'on';
                    plugins_flat[plugin_uid]['code'] = code;
                    plugins_flat[plugin_uid]['override'] = true;
                    plugins_flat[plugin_uid]['addedAt'] = currentTime;
                    plugins_flat[plugin_uid]['statusChangedAt'] = currentTime;
                    updated_uids.push(plugin_uid);
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
                    added_uids.push(plugin_uid);
                }
                plugins_flat[plugin_uid]['user'] = true;
                installed_scripts[plugin_uid] = plugins_flat[plugin_uid];
            }
        });

        await this._save(channel, {
            iitc_core_user: iitc_core_user,
            categories: categories,
            plugins_flat: plugins_flat,
            plugins_local: plugins_local,
            plugins_user: plugins_user,
        });

        if (added_uids.length) await this._sendPluginsEvent(channel, added_uids, 'add');
        if (updated_uids.length) await this._sendPluginsEvent(channel, updated_uids, 'update');

        return installed_scripts;
    }

    /**
     * Returns information about requested plugin by UID.
     *
     * @async
     * @param {string} uid - Plugin UID.
     * @return {Promise<plugin|null>}
     */
    async getPluginInfo(uid) {
        let all_plugins = await this.storage.get([this.channel + '_plugins_flat']).then((data) => data[this.channel + '_plugins_flat']);
        if (all_plugins === undefined) return null;
        return all_plugins[uid];
    }

    /**
     * Returns IITC core script.
     *
     * @async
     * @param {Object|undefined} [storage=undefined] - Storage object with keys `channel_iitc_core` and `channel_iitc_core_user`.
     * If not specified, the data is queried from the storage.
     * @param {"release" | "beta" | "custom" | undefined} [channel=undefined] - Current channel.
     * If not specified, the current channel is used.
     * @return {Promise<plugin|null>}
     */
    async getIITCCore(storage, channel) {
        if (typeof channel === 'undefined') channel = this.channel;

        if (storage === undefined || !isSet(storage[`${channel}_iitc_core`])) {
            storage = await this.storage.get([`${channel}_iitc_core`, `${channel}_iitc_core_user`]);
        }

        const iitc_core = storage[`${channel}_iitc_core`];
        const iitc_core_user = storage[`${channel}_iitc_core_user`];

        let iitc_script = null;
        if (isSet(iitc_core_user) && isSet(iitc_core_user['code'])) {
            iitc_script = iitc_core_user;
            iitc_script['override'] = true;
        } else if (isSet(iitc_core) && isSet(iitc_core['code'])) {
            iitc_script = iitc_core;
        }
        return iitc_script;
    }

    /**
     * Asynchronously retrieves backup data based on the specified parameters.
     *
     * @async
     * @param {BackupParams} params - The parameters for the backup data retrieval.
     * @return {Promise<object>} A promise that resolves to the backup data.
     */
    async getBackupData(params) {
        // Process the input parameters using the 'paramsProcessing' function from the 'backup' module.
        params = backup.paramsProcessing(params);

        // Initialize the backup_data object with its properties.
        const backup_data = {
            external_plugins: {},
            data: {
                iitc_settings: {},
                plugins_data: {},
                app: 'IITC Button',
            },
        };

        // Retrieve all_storage using the 'get' method of 'storage' module.
        const all_storage = await this.storage.get(null);

        if (params.settings) backup_data.data.iitc_settings = backup.exportIitcSettings(all_storage);
        if (params.data) backup_data.data.plugins_data = backup.exportPluginsSettings(all_storage);
        if (params.external) backup_data.external_plugins = backup.exportExternalPlugins(all_storage);

        // Return the backup_data object.
        return backup_data;
    }

    /**
     * Asynchronously sets backup data based on the specified parameters.
     *
     * This function takes the provided parameters and backup data object and sets the data
     * accordingly. The input parameters are processed using the 'paramsProcessing' function
     * from the 'backup' module. Depending on the parameters, the function imports IITC settings,
     * plugin data, and external plugins into the 'this' object using appropriate functions from
     * the 'backup' module.
     *
     * @async
     * @param {BackupParams} params - The parameters for setting the backup data.
     * @param {object} backup_data - The backup data object containing the data to be set.
     * @return {Promise<void>} A promise that resolves when the backup data is set.
     */
    async setBackupData(params, backup_data) {
        // Process the input parameters using the 'paramsProcessing' function from the 'backup' module.
        params = backup.paramsProcessing(params);

        if (params.settings) await backup.importIitcSettings(this, backup_data.data.iitc_settings);
        if (params.data) await backup.importPluginsSettings(this, backup_data.data.plugins_data);
        if (params.external) await backup.importExternalPlugins(this, backup_data.external_plugins);
    }
}
