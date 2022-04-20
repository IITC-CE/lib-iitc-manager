// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import * as helpers from './helpers.js';
import * as migrations from './migrations.js';
import {createRequire} from 'module';

export class Manager {
    constructor(config) {
        this.progress_interval_id = null;
        this.update_timeout_id = null;
        this.external_update_timeout_id = null;

        this.channel = 'release';
        this.network_host = (typeof config.network_host !== 'undefined') ? config.network_host : {
            release: 'https://iitc.app/build/release',
            beta: 'https://iitc.app/build/beta',
            test: 'https://iitc.app/build/test',
            local: 'http://localhost:8000'
        };

        this.is_daemon = (typeof config.is_daemon !== 'undefined') ? config.is_daemon : true;
        this.storage = (typeof config.storage !== 'undefined') ? config.storage : console.error("config key 'storage' is not set");
        this.message = config.message;
        this.progressbar = config.progressbar;
        this.inject_user_script = config.inject_user_script;
    }

    async run() {
        const require = createRequire(import.meta.url);
        const currentVersion = require('root-require')('package.json').version;
        const lastVersion = await this.storage
            .get('lastversion')
            .then(obj => obj['lastversion']);

        if (lastVersion !== currentVersion) {
            if (lastVersion) {
                await migrations.migrate(this.storage, lastVersion);
            }
            await this.checkUpdates(true);
            await this.#checkExternalUpdates(true);

            this.storage.set({lastversion: currentVersion});
        } else {
            await this.checkUpdates();
            await this.#checkExternalUpdates();
        }
    }

    async #save(options) {
        const data = {};
        Object.keys(options).forEach(key => {
            if (
                [
                    'iitc_version',
                    'last_modified',
                    'iitc_code',
                    'categories',
                    'plugins_flat',
                    'plugins_local',
                    'plugins_user'
                ].indexOf(key) !== -1
            ) {
                data[this.channel + '_' + key] = options[key];
            } else {
                data[key] = options[key];
            }
        });
        await this.storage.set(data);
    }

    async #getUrl(url, variant, retry) {
        if (retry > 1) {
            let seconds = retry * retry;
            if (seconds > 60 * 60 * 24) seconds = 60 * 60 * 24;
            try {
                this.message('serverNotAvailableRetry', seconds);
            } catch {
                // Ignore if there is no message receiver
            }
            await helpers.wait(seconds);
        }

        clearInterval(this.progress_interval_id);
        this.progress_interval_id = setInterval(async () => {
            await this.#showProgress(true);
        }, 300);
        try {
            const response = await helpers.ajaxGet(url, variant);
            if (response) {
                clearInterval(this.progress_interval_id);
                await this.#showProgress(false);
            }
            return response;
        } catch {
            if (retry === undefined) {
                clearInterval(this.progress_interval_id);
                return null;
            }
            return await this.#getUrl(url, variant, retry + 1);
        }
    }

    async #showProgress(value) {
        try {
            this.progressbar(value);
        } catch {
            // Ignore if there is no message receiver
        }
    }

    async checkUpdates(force) {
        const local = await this.storage.get([
            'channel',
            'last_check_update',
            'local_server_host',
            'release_update_check_interval',
            'beta_update_check_interval',
            'test_update_check_interval',
            'local_update_check_interval',
            'release_last_modified',
            'beta_last_modified',
            'test_last_modified',
            'local_last_modified',
            'release_categories',
            'beta_categories',
            'test_categories',
            'local_categories',
            'release_plugins_flat',
            'beta_plugins_flat',
            'test_plugins_flat',
            'local_plugins_flat',
            'release_plugins_local',
            'beta_plugins_local',
            'test_plugins_local',
            'local_plugins_local',
            'release_plugins_user',
            'beta_plugins_user',
            'test_plugins_user',
            'local_plugins_user'
        ]);

        if (local.channel) this.channel = local.channel;
        if (local.local_server_host) {this.network_host['local'] = `http://${local.local_server_host}`;}

        let update_check_interval =
            local[this.channel + '_update_check_interval'] * 60 * 60;
        if (!update_check_interval) update_check_interval = 24 * 60 * 60;
        if (this.channel === 'local') update_check_interval = 5; // check every 5 seconds

        if (
            local[this.channel + '_last_modified'] === null ||
            local.last_check_update === null
        ) {
            helpers.clearWait();
            clearTimeout(this.update_timeout_id);
            this.update_timeout_id = null;
            await this.#downloadMeta(local, null);
        } else {
            const time_delta =
                Math.floor(Date.now() / 1000) -
                update_check_interval -
                local.last_check_update;
            if (time_delta >= 0 || force) {
                helpers.clearWait();
                clearTimeout(this.update_timeout_id);
                this.update_timeout_id = null;
                const last_modified = await this.#getUrl(
                    this.network_host[this.channel] + '/meta.json',
                    'Last-Modified',
                    true
                );
                if (last_modified !== local[this.channel + '_last_modified'] || force) {
                    await this.#downloadMeta(local, last_modified);
                }
            }
        }
        if (!this.update_timeout_id) {
            await this.#save({
                last_check_update: Math.floor(Date.now() / 1000)
            });

            if (this.is_daemon) {
                this.update_timeout_id = setTimeout(async () => {
                    await this.checkUpdates();
                }, update_check_interval * 1000);
            } else {
                this.update_timeout_id = null;
            }
        }
    }

    async #downloadMeta(local, last_modified) {
        const response = await this.#getUrl(
            this.network_host[this.channel] + '/meta.json',
            'parseJSON',
            true
        );
        if (!response) return;

        let plugins_flat = this.#getPluginsFlat(response);
        const categories = this.#getCategories(response);
        let plugins_local = local[this.channel + '_plugins_local'];
        const plugins_user = local[this.channel + '_plugins_user'];

        const p_iitc = async () => {
            const iitc_code = await this.#getUrl(
                this.network_host[this.channel] + '/total-conversion-build.user.js'
            );
            if (iitc_code) {
                await this.#save({
                    iitc_code: iitc_code
                });
            }
        };

        const p_plugins = async () => {
            plugins_local = await this.#updateLocalPlugins(plugins_flat, plugins_local);

            plugins_flat = this.#rebuildingArrayCategoriesPlugins(
                categories,
                plugins_flat,
                plugins_local,
                plugins_user
            );
            await this.#save({
                iitc_version: response['iitc_version'],
                last_modified: last_modified,
                categories: categories,
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user
            });
        };

        await Promise.all([p_iitc, p_plugins].map(fn => fn()));
    }

    #getCategories(data) {
        if (!('categories' in data)) return {};
        const categories = data['categories'];

        Object.keys(categories).forEach(cat => {
            if ('plugins' in categories[cat]) {
                delete categories[cat]['plugins'];
            }
        });

        return categories;
    }

    #getPluginsFlat(data) {
        if (!('categories' in data)) return {};
        const plugins = {};
        const categories = data['categories'];

        Object.keys(categories).forEach(cat => {
            if ('plugins' in categories[cat]) {
                Object.keys(categories[cat]['plugins']).forEach(id => {
                    const plugin = categories[cat]['plugins'][id];
                    plugin['uid'] = helpers.getUID(plugin);
                    plugin['status'] = 'off';
                    plugin['category'] = cat;
                    plugins[plugin['uid']] = plugin;
                });
            }
        });
        return plugins;
    }

    async #checkExternalUpdates(force) {
        const local = await this.storage.get([
            'channel',
            'last_check_external_update',
            'external_update_check_interval',
            'release_plugins_user',
            'beta_plugins_user',
            'test_plugins_user',
            'local_plugins_user'
        ]);

        if (local.channel) this.channel = local.channel;

        let update_check_interval = local['external_update_check_interval'] * 60 * 60;
        if (!update_check_interval) {
            update_check_interval = 24 * 60 * 60;
        }

        const time_delta =
            Math.floor(Date.now() / 1000) -
            update_check_interval -
            local.last_check_external_update;
        if (time_delta >= 0 || force) {
            clearTimeout(this.external_update_timeout_id);
            this.external_update_timeout_id = null;
            await this.#updateExternalPlugins(local);
        }

        if (!this.external_update_timeout_id) {
            await this.#save({
                last_check_external_update: Math.floor(Date.now() / 1000)
            });

            if (this.is_daemon) {
                this.external_update_timeout_id = setTimeout(async () => {
                    await this.checkUpdates();
                }, update_check_interval * 1000);
            } else {
                this.external_update_timeout_id = null;
            }
        }
    }

    async #updateExternalPlugins(local) {
        const plugins_user = local[this.channel + '_plugins_user'];
        if (plugins_user) {
            let exist_updates = false;
            const hash = `?${Date.now()}`;

            for (const uid of Object.keys(plugins_user)) {
                const plugin = plugins_user[uid];

                if (plugin['updateURL'] && plugin['downloadURL']) {
                    // download meta info
                    const response_meta = await this.#getUrl(plugin['updateURL'] + hash);
                    if (response_meta) {
                        let meta = helpers.parseMeta(response_meta);
                        // if new version
                        if (
                            meta &&
                            meta['version'] &&
                            meta['version'] !== plugin['version']
                        ) {
                            // download userscript
                            let response_code = await this.#getUrl(plugin['updateURL'] + hash);
                            if (response_code) {
                                exist_updates = true;
                                plugins_user[uid] = meta;
                                plugins_user[uid]['code'] = response_code;
                            }
                        }
                    }
                }
            }

            if (exist_updates) {
                await this.#save({
                    plugins_user: plugins_user
                });
            }
        }
    }

    async #updateLocalPlugins(plugins_flat, plugins_local) {
        // If no plugins installed
        if (plugins_local === null) return {};

        // Iteration local plugins
        for (const uid of Object.keys(plugins_local)) {
            let filename = plugins_local[uid]['filename'];

            if (filename && plugins_flat[uid]) {
                let code = await this.#getUrl(`${this.network_host[this.channel]}/plugins/${filename}`);
                if (code) plugins_local[uid]['code'] = code;
            } else {
                delete plugins_local[uid];
            }
        }

        return plugins_local;
    }

    async managePlugin(uid, action) {
        let local = await this.storage.get([
            this.channel + '_plugins_flat',
            this.channel + '_plugins_local',
            this.channel + '_plugins_user'
        ]);

        let plugins_flat = local[this.channel + '_plugins_flat'];
        let plugins_local = local[this.channel + '_plugins_local'];
        let plugins_user = local[this.channel + '_plugins_user'];

        if (plugins_local === null) plugins_local = {};
        if (plugins_user === null) plugins_user = {};

        if (action === 'on') {
            if (
                (plugins_flat[uid]['user'] === false &&
                    plugins_local[uid] !== undefined) ||
                plugins_flat[uid]['user'] === true
            ) {
                plugins_flat[uid]['status'] = 'on';
                if (plugins_flat[uid]['user']) {
                    plugins_user[uid]['status'] = 'on';
                } else {
                    plugins_local[uid]['status'] = 'on';
                }

                await this.inject_user_script(
                    plugins_flat[uid]['user'] === true
                        ? plugins_user[uid]['code']
                        : plugins_local[uid]['code']
                );

                await this.#save({
                    plugins_flat: plugins_flat,
                    plugins_local: plugins_local,
                    plugins_user: plugins_user
                });
            } else {
                let filename = plugins_flat[uid]['filename'];
                let response = await this.#getUrl(
                    `${this.network_host[this.channel]}/plugins/${filename}`
                );
                if (response) {
                    plugins_flat[uid]['status'] = 'on';
                    plugins_local[uid] = plugins_flat[uid];
                    plugins_local[uid]['code'] = response;

                    await this.inject_user_script(plugins_local[uid]['code']);

                    await this.#save({
                        plugins_flat: plugins_flat,
                        plugins_local: plugins_local
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

            await this.#save({
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user
            });
        }
        if (action === 'delete') {
            if (plugins_flat[uid]['override']) {
                plugins_flat[uid] = {...plugins_local[uid]};
                plugins_flat[uid]['status'] = 'off';
            } else {
                delete plugins_flat[uid];
            }
            delete plugins_user[uid];

            await this.#save({
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user
            });
        }
    }

    async addUserScripts(scripts) {
        let local = await this.storage.get([
            this.channel + '_categories',
            this.channel + '_plugins_flat',
            this.channel + '_plugins_local',
            this.channel + '_plugins_user'
        ]);

        let categories = local[this.channel + '_categories'];
        let plugins_flat = local[this.channel + '_plugins_flat'];
        let plugins_local = local[this.channel + '_plugins_local'];
        let plugins_user = local[this.channel + '_plugins_user'];

        if (plugins_local === null) plugins_local = {};
        if (plugins_user === null) plugins_user = {};

        scripts.forEach(script => {
            let meta = script['meta'];
            const code = script['code'];
            const plugin_uid = helpers.getUID(meta);

            if (plugin_uid === null) throw new Error('The plugin has an incorrect ==UserScript== header');

            plugins_user[plugin_uid] = Object.assign(meta, {
                uid: plugin_uid,
                status: 'on',
                code: code
            });

            if (plugin_uid in plugins_flat) {
                if (
                    plugin_uid in plugins_local &&
                    plugins_flat[plugin_uid]['status'] !== 'off'
                ) {
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
                        description: ''
                    };
                }
                plugins_flat[plugin_uid] = {...plugins_user[plugin_uid]};
            }
            plugins_flat[plugin_uid]['user'] = true;
        });

        await this.#save({
            categories: categories,
            plugins_flat: plugins_flat,
            plugins_local: plugins_local,
            plugins_user: plugins_user
        });
    }

    #rebuildingArrayCategoriesPlugins(
        categories,
        raw_plugins,
        plugins_local,
        plugins_user
    ) {
        let data = {};
        if (plugins_local === null) plugins_local = {};
        if (plugins_user === null) plugins_user = {};

        if (raw_plugins['Obsolete'] !== undefined) delete raw_plugins['Obsolete'];
        if (raw_plugins['Deleted'] !== undefined) delete raw_plugins['Deleted'];
        data = {...raw_plugins};

        // Build local plugins
        Object.keys(plugins_local).forEach(plugin_uid => {
            data[plugin_uid]['status'] = plugins_local[plugin_uid]['status'];
        });

        // Build External plugins
        if (Object.keys(plugins_user).length) {
            Object.keys(plugins_user).forEach(plugin_uid => {
                if (plugin_uid in data) {
                    data[plugin_uid]['status'] = plugins_user[plugin_uid]['status'];
                    data[plugin_uid]['code'] = plugins_user[plugin_uid]['code'];
                    data[plugin_uid]['override'] = true;
                } else {
                    data[plugin_uid] = plugins_user[plugin_uid];
                }
                data[plugin_uid]['user'] = true;
            });
        }

        return data;
    }
}
