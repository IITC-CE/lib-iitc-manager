// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { ajaxGet, clearWait, getUID, isSet, parseMeta, wait } from './helpers.js';

/**
 * @namespace manager
 */

/**
 * @namespace storage
 */

/**
 * Environment parameters for an instance of Manager class.
 * Specifying only the "storage" parameter is enough to run in lightweight form,
 * but for full functionality you also need to specify callbacks.
 *
 * @typedef {Object} config
 * @memberOf manager
 * @property {storage.channel} channel - Update channel for IITC and plugins.
 * @property {storage.storage} storage - Platform-dependent data storage class.
 * For example, "browser.storage.local" in webextensions.
 * @property {boolean} is_daemon=true - In daemon mode, the class does not terminate
 * and runs a periodic check for updates.
 * @property {manager.network_host} network_host - URLs of repositories with IITC and plugins for different release branches.
 * If the parameter is not specified, the default values are used.
 * @property {manager.message} message - Function for sending an information message to a user.
 * @property {manager.progressbar} progressbar - Function for controls the display of progress bar.
 * @property {manager.inject_user_script} inject_user_script - Function for injecting UserScript code
 * into the Ingress Intel window.
 * @property {manager.inject_plugin} inject_plugin - Function for injecting UserScript plugin
 * into the Ingress Intel window.
 * @property {manager.plugin_event} plugin_event - The function is called when the plugin status changes
 * (enabled/disabled, updated).
 */

/**
 * Platform-dependent data storage class.
 * For example, when using this library in a browser extension, the
 * [storage.local API]{@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage}
 * is compatible.
 * Other platforms may have other ways of dealing with local storage,
 * but it is sufficient to create a small layer for storage to have the specified methods.
 *
 * @typedef {Object} storage.storage
 * @memberOf storage
 * @property {storage.get} get - Retrieves one or more items from the storage area.
 * @property {storage.set} set - Stores one or more items in the storage area, or update existing items.
 */

/**
 * Retrieves one or more items from the storage area.
 * This method accepts a key (string) or keys (an array of strings) to identify the item(s) to be retrieved from storage.
 * This is an asynchronous function that returns a Promise that resolves to a results object,
 * containing every object in keys that was found in the storage area.
 *
 * @typedef {Function} storage.get
 * @memberOf storage
 * @param {string|string[]} keys
 * @returns {Promise<storage.data>}
 */

/**
 * Stores one or more items in the storage area, or update existing items.
 * This is an asynchronous function that returns a Promise
 * that will be fulfilled with no arguments if the operation succeeded.
 *
 * @typedef {Function} storage.set
 * @memberOf storage
 * @param {storage.data} data
 * @returns {Promise<null>}
 */

/**
 * URLs of repositories with IITC and plugins for different release branches
 *
 * @typedef {Object} network_host
 * @memberOf manager
 * @property {string} release=https://iitc.app/build/release - Release branch.
 * @property {string} beta=https://iitc.app/build/beta - Beta branch.
 * @property {string} custom=http://localhost:8000 - URL address of a custom repository.
 */

/**
 * Sends an information message to user.
 *
 * @callback manager.message
 * @memberOf manager
 * @param {string} message - The name of the message sent to user.
 * You then need to map the message name to human-readable text in application.
 * @param {string|string[]} [args] - A single substitution string, or an array of substitution strings.
 */

/**
 * Controls progress bar display.
 *
 * @callback manager.progressbar
 * @memberOf manager
 * @param {boolean} is_show - Show progress bar.
 */

/**
 * Calls a function that injects UserScript code into the Ingress Intel window.
 *
 * @deprecated since version 1.5.0. Use {@link manager.inject_plugin} instead.
 * @callback manager.inject_user_script
 * @memberOf manager
 * @param {string} code - UserScript code to run in the Ingress Intel window
 */

/**
 * Calls a function that injects UserScript plugin into the Ingress Intel window.
 *
 * @callback manager.inject_plugin
 * @memberOf manager
 * @param {plugin} plugin - UserScript plugin to run in the Ingress Intel window
 */

/**
 * Called to handle changes in plugin status for multiple plugins at once, such as enabling, disabling, or updating.
 * This function is invoked with detailed information about the plugin events, encapsulating the changes in a single call.
 * The input object contains the type of event and a mapping of unique identifiers (UIDs) to plugin data, enabling
 * batch processing of plugin state changes.
 *
 * @callback manager.plugin_event
 * @memberOf manager
 * @param {Object} plugin_event - An object containing the event type and a mapping of plugin data.
 * @param {'add'|'update'|'remove'} plugin_event.event - The type of event that occurred,
 *        indicating the action being taken on the plugins.
 * @param {Object.<string, Object|{}>} plugin_event.plugins - A mapping of plugin UIDs to their respective data objects.
 *        For 'add' and 'update' events, these objects contain the relevant plugin data.
 *        For 'remove' events, the corresponding data object will be an empty object ({}).
 */

/**
 * Key-value data in storage
 *
 * @memberOf storage
 * @typedef {Object.<string, string|number|object>} storage.data
 */

/**
 * URLs of repositories with IITC and plugins for different release branches
 *
 * @typedef {Object} plugin
 * @property {string} uid - Unique identifier (UID) of plugin. Created by lib-iitc-manager.
 * @property {string} id
 * @property {string} name
 * @property {string} author
 * @property {string} category
 * @property {string} version
 * @property {string} description
 * @property {string} namespace
 * @property {string} status
 * @property {string} code
 * @property {boolean} user
 * @property {boolean} override
 * @property {string[]} match
 * @property {string[]} include
 * @property {string[]} exclude-match
 * @property {string[]} exclude
 * @property {string[]} require
 * @property {string[]} grant
 * @property {number} [addedAt] - Unix timestamp of when the external plugin was first added. Only for external plugins.
 * @property {number} [statusChangedAt] - Unix timestamp of when the plugin's status (on/off) was last changed.
 * @property {number} [updatedAt] - Unix timestamp of when the plugin's code was last updated.
 */

/**
 * Parameters for retrieving backup data.
 *
 * @typedef {Object} BackupParams
 * @property {boolean} settings - Whether to import/export IITC settings.
 * @property {boolean} data - Whether to import/export plugins' data.
 * @property {boolean} external - Whether to import/export external plugins.
 */

/**
 * @classdesc This class contains methods for managing IITC and plugins.
 */
export class Worker {
    /**
     * Creates an instance of Manager class with the specified parameters
     *
     * @param {manager.config} config - Environment parameters for an instance of Manager class.
     * @return {void}
     */
    constructor(config) {
        this.config = config;
        this.progress_interval_id = null;
        this.update_timeout_id = null;
        this.external_update_timeout_id = null;
        this.iitc_main_script_uid = 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';

        this.storage = typeof this.config.storage !== 'undefined' ? this.config.storage : console.error("config key 'storage' is not set");
        this.message = this.config.message;
        this.progressbar = this.config.progressbar;
        this.inject_user_script = this.config.inject_user_script || function () {};
        this.inject_plugin = this.config.inject_plugin || function () {};
        this.plugin_event = this.config.plugin_event || function () {};

        this.is_initialized = false;
        this._init().then();
    }

    /**
     * Set values for the class properties.
     *
     * @async
     * @return {Promise<void>}
     * @private
     */
    async _init() {
        this.channel = await this._syncStorage('channel', 'release', this.config.channel);
        this.network_host = await this._syncStorage(
            'network_host',
            {
                release: 'https://iitc.app/build/release',
                beta: 'https://iitc.app/build/beta',
                custom: 'http://localhost:8000',
            },
            this.config.network_host
        );
        this.is_daemon = await this._syncStorage('is_daemon', true, this.config.is_daemon);
        this.is_initialized = true;
    }

    /**
     * Overwrites the values in the storage and returns the new value.
     * If the value is not set, the default value is returned.
     *
     * @async
     * @param {string} key - Storage entry key.
     * @param {string|number|object} defaults - Default value.
     * @param {string|number|object|undefined} [override=undefined] - Value to override the default value.
     * @return {Promise<string|number|object>}
     * @private
     */
    async _syncStorage(key, defaults, override) {
        let data;
        if (typeof override !== 'undefined') {
            data = override;
        } else {
            data = await this.storage.get([key]).then((result) => result[key]);
        }
        if (!isSet(data)) data = defaults;

        this[key] = data;
        await this._save(this.channel, { [key]: data });
        return data;
    }

    /**
     * Saves passed data to local storage.
     * Adds the name of release branch before key, if necessary.
     *
     * @async
     * @param {string} channel - Current channel.
     * @param {storage.data} options - Key-value data to be saved.
     * @return {Promise<void>}
     * @private
     */
    async _save(channel, options) {
        const data = {};
        Object.keys(options).forEach((key) => {
            if (
                ['iitc_version', 'last_modified', 'iitc_core', 'iitc_core_user', 'categories', 'plugins_flat', 'plugins_local', 'plugins_user'].indexOf(key) !==
                -1
            ) {
                data[`${channel}_${key}`] = options[key];
            } else {
                data[key] = options[key];
            }
        });
        await this.storage.set(data);
    }

    /**
     * The method requests data from the specified URL.
     * It is a wrapper over {@link ajaxGet} function, with the addition of retries to load in case of problems
     * and a message to user about errors.
     *
     * @async
     * @param {string} url - URL of the resource you want to fetch.
     * @param {"parseJSON" | "Last-Modified" | null} [variant=null] - Type of request (see {@link ajaxGet}).
     * @param {boolean|number} [retry] - Is retry in case of an error | number of request attempt.
     * @return {Promise<string|object|null>}
     * @private
     */
    async _getUrl(url, variant, retry) {
        if (retry > 1) {
            let seconds = retry * retry;
            if (seconds > 30 * 60) seconds = 30 * 60; // maximum is 30 minutes
            try {
                this.message('serverNotAvailableRetry', String(seconds));
            } catch {
                // Ignore if there is no message receiver
            }
            await wait(seconds);
        }

        clearInterval(this.progress_interval_id);
        this.progress_interval_id = setInterval(async () => {
            this.progressbar(true);
        }, 300);
        try {
            const response = await ajaxGet(url, variant);
            if (response) {
                clearInterval(this.progress_interval_id);
                this.progressbar(false);
            }
            return response;
        } catch {
            if (retry === undefined) {
                clearInterval(this.progress_interval_id);
                return null;
            }
            return await this._getUrl(url, variant, retry + 1);
        }
    }

    /**
     * Runs periodic checks and installs updates for IITC and plugins.
     *
     * @async
     * @param {boolean} [force=false] - Forced to run the update right now.
     * @return {Promise<void>}
     * @private
     */
    async _checkInternalUpdates(force) {
        const channel = this.channel;
        const storage = await this.storage.get([
            'last_check_update',
            `${channel}_update_check_interval`,
            `${channel}_last_modified`,
            `${channel}_categories`,
            `${channel}_plugins_flat`,
            `${channel}_plugins_local`,
            `${channel}_plugins_user`,
        ]);

        let update_check_interval = storage[`${channel}_update_check_interval`];
        if (!update_check_interval) update_check_interval = 24 * 60 * 60;

        if (!isSet(storage[`${channel}_last_modified`]) || !isSet(storage.last_check_update)) {
            clearWait();
            clearTimeout(this.update_timeout_id);
            this.update_timeout_id = null;
            await this._updateInternalIITC(channel, storage, null);
        } else {
            const time_delta = Math.floor(Date.now() / 1000) - update_check_interval - storage.last_check_update;
            if (time_delta >= 0 || force) {
                clearWait();
                clearTimeout(this.update_timeout_id);
                this.update_timeout_id = null;
                const last_modified = await this._getUrl(this.network_host[channel] + `${channel}/meta.json`, 'Last-Modified', true);
                if (last_modified !== storage[`${channel}_last_modified`] || force) {
                    await this._updateInternalIITC(channel, storage, last_modified);
                }
            }
        }
        if (!this.update_timeout_id) {
            await this._save(channel, {
                last_check_update: Math.floor(Date.now() / 1000),
            });

            if (this.is_daemon) {
                this.update_timeout_id = setTimeout(async () => {
                    await this._checkInternalUpdates();
                }, update_check_interval * 1000);
            } else {
                this.update_timeout_id = null;
            }
        }
    }

    /**
     * Updates IITC, passes control to {@link _updateLocalPlugins} function to update plugins.
     *
     * @async
     * @param {string} channel - Current channel.
     * @param {storage.data} local - Data from storage.
     * @param {string|null} last_modified - Last modified date of "meta.json" file.
     * @return {Promise<void>}
     * @private
     */
    async _updateInternalIITC(channel, local, last_modified) {
        const response = await this._getUrl(this.network_host[channel] + '/meta.json', 'parseJSON', true);
        if (!response) return;

        let plugins_flat = this._getPluginsFlat(response);
        let categories = this._getCategories(response);
        let plugins_local = local[`${channel}_plugins_local`];
        let plugins_user = local[`${channel}_plugins_user`];

        if (!isSet(plugins_user)) plugins_user = {};
        categories = this._rebuildingCategories(categories, plugins_user);

        const p_iitc = async () => {
            const iitc_code = await this._getUrl(this.network_host[channel] + '/total-conversion-build.user.js');
            if (iitc_code) {
                const iitc_core = parseMeta(iitc_code);
                iitc_core['uid'] = getUID(iitc_core);
                iitc_core['code'] = iitc_code;
                await this._save(channel, {
                    iitc_core: iitc_core,
                });
                await this._sendPluginsEvent(channel, [iitc_core['uid']], 'update', 'local');
            }
        };

        const p_plugins = async () => {
            plugins_local = await this._updateLocalPlugins(channel, plugins_flat, plugins_local);

            plugins_flat = this._rebuildingArrayCategoriesPlugins(plugins_flat, plugins_local, plugins_user);
            await this._save(channel, {
                iitc_version: response['iitc_version'],
                last_modified: last_modified,
                categories: categories,
                plugins_flat: plugins_flat,
                plugins_local: plugins_local,
                plugins_user: plugins_user,
            });
        };

        await Promise.all([p_iitc, p_plugins].map((fn) => fn()));
    }

    /**
     * Builds a dictionary from received meta.json file, in which it places names and descriptions of categories.
     *
     * @param {Object} data - Data from received meta.json file.
     * @return {Object.<string, Object.<string, string>>}} - Dictionary with names and descriptions of categories.
     * @private
     */
    _getCategories(data) {
        if (!('categories' in data)) return {};
        const categories = data['categories'];

        Object.keys(categories).forEach((cat) => {
            if ('plugins' in categories[cat]) {
                delete categories[cat]['plugins'];
            }
        });

        return categories;
    }

    /**
     * Converting a list of categories with plugins inside into a flat structure.
     *
     * @param {Object} data - Data from received meta.json file.
     * @return {Object.<string, plugin>} - Dictionary of plugin name and plugin data.
     * @private
     */
    _getPluginsFlat(data) {
        if (!('categories' in data)) return {};
        const plugins = {};
        const categories = data['categories'];

        Object.keys(categories).forEach((cat) => {
            if (cat === 'Obsolete' || cat === 'Deleted') return;

            if ('plugins' in categories[cat]) {
                Object.keys(categories[cat]['plugins']).forEach((id) => {
                    const plugin = categories[cat]['plugins'][id];
                    plugin['uid'] = getUID(plugin);
                    plugin['status'] = 'off';
                    plugin['category'] = cat;
                    plugins[plugin['uid']] = plugin;
                });
            }
        });
        return plugins;
    }

    /**
     * Runs periodic checks and installs updates for external plugins.
     *
     * @async
     * @param {boolean} [force=false] - Forced to run the update right now.
     * @return {Promise<void>}
     * @private
     */
    async _checkExternalUpdates(force) {
        const channel = this.channel;
        const local = await this.storage.get(['channel', 'last_check_external_update', 'external_update_check_interval', `${channel}_plugins_user`]);

        let update_check_interval = local['external_update_check_interval'];
        if (!update_check_interval) {
            update_check_interval = 24 * 60 * 60;
        }

        const time_delta = Math.floor(Date.now() / 1000) - update_check_interval - local.last_check_external_update;
        if (time_delta >= 0 || force) {
            clearTimeout(this.external_update_timeout_id);
            this.external_update_timeout_id = null;
            await this._updateExternalPlugins(channel, local);
        }

        if (!this.external_update_timeout_id) {
            await this._save(channel, {
                last_check_external_update: Math.floor(Date.now() / 1000),
            });

            if (this.is_daemon) {
                this.external_update_timeout_id = setTimeout(async () => {
                    await this._checkExternalUpdates();
                }, update_check_interval * 1000);
            } else {
                this.external_update_timeout_id = null;
            }
        }
    }

    /**
     * Updates external plugins.
     *
     * @async
     * @param {string} channel - Current channel.
     * @param {storage.data} local - Data from storage.
     * @return {Promise<void>}
     * @private
     */
    async _updateExternalPlugins(channel, local) {
        const plugins_user = local[`${channel}_plugins_user`];
        if (plugins_user) {
            let exist_updates = false;
            const hash = `?${Date.now()}`;
            const updated_uids = [];
            const currentTime = Math.floor(Date.now() / 1000);

            for (const uid of Object.keys(plugins_user)) {
                const plugin = plugins_user[uid];

                if (plugin['updateURL'] && plugin['downloadURL']) {
                    // download meta info
                    const response_meta = await this._getUrl(plugin['updateURL'] + hash);
                    if (response_meta) {
                        let meta = parseMeta(response_meta);
                        // if new version
                        if (meta && meta['version'] && meta['version'] !== plugin['version']) {
                            // download userscript
                            let response_code = await this._getUrl(plugin['updateURL'] + hash);
                            if (response_code) {
                                exist_updates = true;
                                plugins_user[uid] = {
                                    ...meta,
                                    code: response_code,
                                    updatedAt: currentTime,
                                    addedAt: plugin.addedAt,
                                    statusChangedAt: plugin.statusChangedAt,
                                };
                                updated_uids.push(uid);
                            }
                        }
                    }
                }
            }

            if (exist_updates) {
                await this._save(channel, {
                    plugins_user: plugins_user,
                });
                await this._sendPluginsEvent(channel, updated_uids, 'update', 'user');
            }
        }
    }

    /**
     * Updates plugins.
     *
     * @async
     * @param {string} channel - Current channel.
     * @param {Object.<string, plugin>} plugins_flat - Data from storage, key "[channel]_plugins_flat".
     * @param {Object.<string, plugin>} plugins_local - Data from storage, key "[channel]_plugins_local".
     * @return {Promise<Object.<string, plugin>>}
     * @private
     */
    async _updateLocalPlugins(channel, plugins_flat, plugins_local) {
        // If no plugins installed
        if (!isSet(plugins_local)) return {};

        const updated_uids = [];
        const removed_uids = [];
        const currentTime = Math.floor(Date.now() / 1000);

        // Iteration local plugins
        for (const uid of Object.keys(plugins_local)) {
            let filename = plugins_local[uid]['filename'];

            if (filename && plugins_flat[uid]) {
                let code = await this._getUrl(`${this.network_host[channel]}/plugins/${filename}`);
                if (code) {
                    plugins_local[uid]['code'] = code;
                    plugins_local[uid]['updatedAt'] = currentTime;
                    updated_uids.push(uid);
                }
            } else {
                delete plugins_local[uid];
                removed_uids.push(uid);
            }
        }

        if (updated_uids.length) await this._sendPluginsEvent(channel, updated_uids, 'update', 'local');
        if (removed_uids.length) await this._sendPluginsEvent(channel, removed_uids, 'remove', 'local');

        return plugins_local;
    }

    /**
     * Updates categories by adding custom categories of external plugins.
     *
     * @param {Object.<string, Object.<string, string>>} categories - Dictionary with names and descriptions of categories.
     * @param {Object.<string, plugin>} plugins_user - Dictionary of external UserScripts.
     * @return {Object.<string, Object.<string, string>>} - Dictionary with names and descriptions of categories.
     */
    _rebuildingCategories(categories, plugins_user) {
        if (Object.keys(plugins_user).length) {
            Object.keys(plugins_user).forEach((plugin_uid) => {
                let category = plugins_user[plugin_uid]['category'];
                if (category === undefined) {
                    category = 'Misc';
                }
                if (!(category in categories)) {
                    categories[category] = {
                        name: category,
                        description: '',
                    };
                }
            });
        }
        return categories;
    }

    /**
     * Rebuilds the plugins array maintaining proper isolation between channels.
     *
     * @param {Object.<string, plugin>} raw_plugins - Dictionary of plugins downloaded from the server.
     * @param {Object.<string, plugin>} plugins_local - Dictionary of installed plugins from IITC-CE distribution.
     * @param {Object.<string, plugin>} plugins_user - Dictionary of external UserScripts.
     * @return {Object<string, plugin>}
     * @private
     */
    _rebuildingArrayCategoriesPlugins(raw_plugins, plugins_local, plugins_user) {
        let data = { ...raw_plugins };

        if (!isSet(plugins_local)) plugins_local = {};
        if (!isSet(plugins_user)) plugins_user = {};

        // Get valid UIDs for current channel to prevent cross-channel contamination
        const currentChannelPluginUIDs = new Set(Object.keys(data));

        // Apply data from local plugins - only for plugins that exist in current channel
        Object.keys(plugins_local).forEach((plugin_uid) => {
            if (currentChannelPluginUIDs.has(plugin_uid)) {
                const localPlugin = plugins_local[plugin_uid];
                data[plugin_uid].status = localPlugin.status || 'off';
                data[plugin_uid].updatedAt = localPlugin.updatedAt;
                data[plugin_uid].statusChangedAt = localPlugin.statusChangedAt;
            }
        });

        // Apply user plugins
        if (Object.keys(plugins_user).length) {
            Object.keys(plugins_user).forEach((plugin_uid) => {
                const userPlugin = plugins_user[plugin_uid];
                if (plugin_uid in data) {
                    data[plugin_uid].status = userPlugin.status || 'off';
                    data[plugin_uid].code = userPlugin.code;
                    data[plugin_uid].user = true;
                    data[plugin_uid].override = true;
                    data[plugin_uid].addedAt = userPlugin.addedAt;
                    data[plugin_uid].updatedAt = userPlugin.updatedAt;
                    data[plugin_uid].statusChangedAt = userPlugin.statusChangedAt;
                } else {
                    data[plugin_uid] = userPlugin;
                }
                data[plugin_uid].user = true;
            });
        }

        return data;
    }

    /**
     * Asynchronously sends an event for a list of plugins based on the given parameters.
     * It calls `plugin_event` once with the event type and a map of the selected plugins.
     * If the action is "remove", the plugins are represented by empty objects.
     *
     * @async
     * @param {string} channel - Current channel.
     * @param {string[]} uids - Array of unique identifiers (UID) of plugins.
     * @param {'add'|'update'|'remove'} event - The type of event to handle.
     * @param {'local'|'user'} [update_type] - Specifies the update type to determine which plugin versions to use.
     * When set to 'local', actions with plugins marked as "user" are ignored, and vice versa.
     * This parameter is intended to ignore updates from 'local' plugins when a 'user' plugin is used, and vice versa.
     * If not specified, no ignoring logic is applied, and the function attempts to process the plugin event
     * based on available data.
     * @returns {Promise<void>} A promise that resolves when the event has been processed.
     */
    async _sendPluginsEvent(channel, uids, event, update_type) {
        const validEvents = ['add', 'update', 'remove'];
        if (!validEvents.includes(event)) return;

        const plugins = {};

        for (const uid of uids) {
            const isCore = uid === this.iitc_main_script_uid;
            if (isCore && event !== 'update') continue;

            const storageKeys = isCore ? [`${channel}_iitc_core`, `${channel}_iitc_core_user`] : [`${channel}_plugins_local`, `${channel}_plugins_user`];
            const storage = await this.storage.get(storageKeys);

            let plugin_local = isCore ? storage[`${channel}_iitc_core`] : storage[`${channel}_plugins_local`]?.[uid];
            let plugin_user = isCore ? storage[`${channel}_iitc_core_user`] : storage[`${channel}_plugins_user`]?.[uid];

            if (event === 'remove' || (!isSet(plugin_local) && !isSet(plugin_user))) {
                plugins[uid] = {};
                continue;
            }

            const useLocal = !isSet(plugin_user) && (update_type === undefined || update_type === 'local');
            const useUser = isSet(plugin_user) && (update_type === undefined || update_type === 'user');

            if (useLocal) {
                plugins[uid] = plugin_local || {};
            } else if (useUser) {
                plugins[uid] = plugin_user || {};
            }

            // Updating a disabled plugin should not trigger the event
            if (!isCore && event !== 'remove' && plugins[uid]?.status !== 'on') {
                delete plugins[uid];
            }
        }

        if (Object.keys(plugins).length) {
            this.plugin_event({
                event,
                plugins,
            });
        }
    }
}
