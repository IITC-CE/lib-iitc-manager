// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { fetchResource, clearWait, getUID, isSet, parseMeta, wait } from './helpers.js';
import type {
  Channel,
  ManagerConfig,
  StorageAPI,
  StorageData,
  NetworkHost,
  Plugin,
  PluginDict,
  PluginEventType,
  PluginEventData,
  UpdateType,
  RequestVariant,
  FetchResourceOptions,
  FetchResourceResult,
  CategoryDict,
  MetaJsonResponse,
} from './types.js';

/**
 * This class contains methods for managing IITC and plugins.
 */
export class Worker {
  config: ManagerConfig;
  storage: StorageAPI;
  channel!: Channel;
  network_host!: NetworkHost;
  is_daemon!: boolean;
  use_fetch_head_method!: boolean;
  is_initialized: boolean;

  iitc_main_script_uid: string;
  progress_interval_id: ReturnType<typeof setInterval> | null;
  update_timeout_id: ReturnType<typeof setTimeout> | null;
  external_update_timeout_id: ReturnType<typeof setTimeout> | null;

  message?: (message: string, args?: string | string[]) => void;
  progressbar?: (is_show: boolean) => void;
  inject_user_script: (code: string) => void;
  inject_plugin: (plugin: Plugin) => void;
  plugin_event: (event: PluginEventData) => void;

  /**
   * Creates an instance of Manager class with the specified parameters
   *
   * @param config - Environment parameters for an instance of Manager class.
   */
  constructor(config: ManagerConfig) {
    this.config = config;
    this.progress_interval_id = null;
    this.update_timeout_id = null;
    this.external_update_timeout_id = null;
    this.iitc_main_script_uid =
      'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';

    this.storage =
      typeof this.config.storage !== 'undefined'
        ? this.config.storage
        : (console.error("config key 'storage' is not set") as unknown as StorageAPI);
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
   * @internal
   */
  async _init(): Promise<void> {
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
    this.use_fetch_head_method = await this._syncStorage(
      'use_fetch_head_method',
      true,
      this.config.use_fetch_head_method
    );
    this.is_initialized = true;
  }

  /**
   * Overwrites the values in the storage and returns the new value.
   * If the value is not set, the default value is returned.
   *
   * @param key - Storage entry key.
   * @param defaults - Default value.
   * @param override - Value to override the default value.
   * @internal
   */
  async _syncStorage<T>(key: string, defaults: T, override?: T): Promise<T> {
    let data: T | undefined;
    if (typeof override !== 'undefined') {
      data = override;
    } else {
      data = await this.storage.get([key]).then(result => result[key] as T);
    }
    if (!isSet(data)) data = defaults;

    (this as unknown as Record<string, unknown>)[key] = data;
    await this._save(this.channel, { [key]: data } as StorageData);
    return data!;
  }

  /**
   * Saves passed data to local storage.
   * Adds the name of release branch before key, if necessary.
   *
   * @param channel - Current channel.
   * @param options - Key-value data to be saved.
   * @internal
   */
  async _save(channel: Channel, options: StorageData): Promise<void> {
    const data: StorageData = {};
    Object.keys(options).forEach(key => {
      if (
        [
          'iitc_version',
          'last_modified',
          'iitc_core',
          'iitc_core_user',
          'categories',
          'plugins_flat',
          'plugins_local',
          'plugins_user',
        ].indexOf(key) !== -1
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
   * It is a wrapper over {@link fetchResource} function, with the addition of retries to load in case of problems
   * and a message to user about errors.
   *
   * @param url - URL of the resource you want to fetch.
   * @param variant - Type of request.
   * @param retry - Is retry in case of an error | number of request attempt.
   * @internal
   */
  async _getUrl(
    url: string,
    variant?: RequestVariant,
    retry?: boolean | number
  ): Promise<FetchResourceResult> {
    if ((retry as number) > 1) {
      let seconds = (retry as number) * (retry as number);
      if (seconds > 30 * 60) seconds = 30 * 60; // maximum is 30 minutes
      try {
        this.message!('serverNotAvailableRetry', String(seconds));
      } catch {
        // Ignore if there is no message receiver
      }
      await wait(seconds);
    }

    clearInterval(this.progress_interval_id!);
    this.progress_interval_id = setInterval(async () => {
      this.progressbar!(true);
    }, 300);
    try {
      const options: FetchResourceOptions = {
        use_fetch_head_method: this.use_fetch_head_method,
      };

      if (variant === 'parseJSON') {
        options.parseJSON = true;
      } else if (variant === 'head') {
        options.headOnly = true;
      }

      const result = await fetchResource(url, options);

      if (result.data !== null || result.version !== null) {
        clearInterval(this.progress_interval_id!);
        this.progressbar!(false);
      }
      return result;
    } catch {
      if (retry === undefined) {
        clearInterval(this.progress_interval_id!);
        return { data: null, version: null };
      }
      return await this._getUrl(url, variant, (retry as number) + 1);
    }
  }

  /**
   * Runs periodic checks and installs updates for IITC and plugins.
   *
   * @param force - Forced to run the update right now.
   * @internal
   */
  async _checkInternalUpdates(force?: boolean): Promise<void> {
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

    let update_check_interval = storage[`${channel}_update_check_interval`] as number;
    if (!update_check_interval) update_check_interval = 24 * 60 * 60;

    if (!isSet(storage[`${channel}_last_modified`]) || !isSet(storage.last_check_update)) {
      clearWait();
      clearTimeout(this.update_timeout_id!);
      this.update_timeout_id = null;
      await this._updateInternalIITC(channel, storage);
    } else {
      const time_delta =
        Math.floor(Date.now() / 1000) -
        update_check_interval -
        (storage.last_check_update as number);
      if (time_delta >= 0 || force) {
        clearWait();
        clearTimeout(this.update_timeout_id!);
        this.update_timeout_id = null;
        const result = await this._getUrl(this.network_host[channel] + '/meta.json', 'head', true);
        if (result.version !== storage[`${channel}_last_modified`] || force) {
          await this._updateInternalIITC(channel, storage);
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
   * @param channel - Current channel.
   * @param local - Data from storage.
   * @internal
   */
  async _updateInternalIITC(channel: Channel, local: StorageData): Promise<void> {
    const result = await this._getUrl(this.network_host[channel] + '/meta.json', 'parseJSON', true);
    if (!result.data) return;

    const response = result.data as MetaJsonResponse;
    const last_modified = result.version;

    let plugins_flat = this._getPluginsFlat(response);
    let categories = this._getCategories(response);
    let plugins_local = local[`${channel}_plugins_local`] as PluginDict;
    let plugins_user = local[`${channel}_plugins_user`] as PluginDict;

    if (!isSet(plugins_user)) plugins_user = {};
    categories = this._rebuildingCategories(categories, plugins_user);

    const p_iitc = async () => {
      const result = await this._getUrl(
        this.network_host[this.channel] + '/total-conversion-build.user.js'
      );
      if (result.data) {
        const iitc_core = parseMeta(result.data as string) as Plugin;
        iitc_core['uid'] = getUID(iitc_core)!;
        iitc_core['code'] = result.data as string;
        await this._save(channel, {
          iitc_core: iitc_core,
        });
        await this._sendPluginsEvent(channel, [iitc_core['uid']], 'update', 'local');
      }
    };

    const p_plugins = async () => {
      plugins_local = await this._updateLocalPlugins(channel, plugins_flat, plugins_local);

      plugins_flat = this._rebuildingArrayCategoriesPlugins(
        plugins_flat,
        plugins_local,
        plugins_user
      );
      await this._save(channel, {
        iitc_version: response['iitc_version'],
        last_modified: last_modified,
        categories: categories,
        plugins_flat: plugins_flat,
        plugins_local: plugins_local,
        plugins_user: plugins_user,
      });
    };

    await Promise.all([p_iitc, p_plugins].map(fn => fn()));
  }

  /**
   * Builds a dictionary from received meta.json file, in which it places names and descriptions of categories.
   *
   * @param data - Data from received meta.json file.
   * @internal
   */
  _getCategories(data: MetaJsonResponse): CategoryDict {
    if (!('categories' in data)) return {};
    const categories = data['categories'];

    Object.keys(categories).forEach(cat => {
      if ('plugins' in categories[cat]) {
        delete categories[cat]['plugins'];
      }
    });

    return categories;
  }

  /**
   * Converting a list of categories with plugins inside into a flat structure.
   *
   * @param data - Data from received meta.json file.
   * @internal
   */
  _getPluginsFlat(data: MetaJsonResponse): PluginDict {
    if (!('categories' in data)) return {};
    const plugins: PluginDict = {};
    const categories = data['categories'];

    Object.keys(categories).forEach(cat => {
      if (cat === 'Obsolete' || cat === 'Deleted') return;

      if ('plugins' in categories[cat] && categories[cat].plugins) {
        Object.keys(categories[cat].plugins!).forEach(id => {
          const plugin = categories[cat].plugins![id] as unknown as Plugin;
          plugin['uid'] = getUID(plugin)!;
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
   * @param force - Forced to run the update right now.
   * @internal
   */
  async _checkExternalUpdates(force?: boolean): Promise<void> {
    const channel = this.channel;
    const local = await this.storage.get([
      'channel',
      'last_check_external_update',
      'external_update_check_interval',
      `${channel}_plugins_user`,
    ]);

    let update_check_interval = local['external_update_check_interval'] as number;
    if (!update_check_interval) {
      update_check_interval = 24 * 60 * 60;
    }

    const time_delta =
      Math.floor(Date.now() / 1000) -
      update_check_interval -
      (local.last_check_external_update as number);
    if (time_delta >= 0 || force) {
      clearTimeout(this.external_update_timeout_id!);
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
   * @param channel - Current channel.
   * @param local - Data from storage.
   * @internal
   */
  async _updateExternalPlugins(channel: Channel, local: StorageData): Promise<void> {
    const plugins_user = local[`${channel}_plugins_user`] as PluginDict | undefined;
    if (plugins_user) {
      let exist_updates = false;
      const hash = `?${Date.now()}`;
      const updated_uids: string[] = [];
      const currentTime = Math.floor(Date.now() / 1000);

      for (const uid of Object.keys(plugins_user)) {
        const plugin = plugins_user[uid];

        if (plugin['updateURL'] && plugin['downloadURL']) {
          // download meta info
          const result_meta = await this._getUrl(plugin['updateURL'] + hash);
          if (result_meta.data) {
            const meta = parseMeta(result_meta.data as string);
            // if new version
            if (meta && meta['version'] && meta['version'] !== plugin['version']) {
              // download userscript
              const result_code = await this._getUrl(plugin['updateURL'] + hash);
              if (result_code.data) {
                exist_updates = true;
                plugins_user[uid] = {
                  ...meta,
                  uid,
                  code: result_code.data as string,
                  updatedAt: currentTime,
                  addedAt: plugin.addedAt,
                  statusChangedAt: plugin.statusChangedAt,
                } as Plugin;
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
   * @param channel - Current channel.
   * @param plugins_flat - Data from storage, key "[channel]_plugins_flat".
   * @param plugins_local - Data from storage, key "[channel]_plugins_local".
   * @internal
   */
  async _updateLocalPlugins(
    channel: Channel,
    plugins_flat: PluginDict,
    plugins_local: PluginDict
  ): Promise<PluginDict> {
    // If no plugins installed
    if (!isSet(plugins_local)) return {};

    const updated_uids: string[] = [];
    const removed_uids: string[] = [];
    const currentTime = Math.floor(Date.now() / 1000);

    // Iteration local plugins
    for (const uid of Object.keys(plugins_local)) {
      const filename = plugins_local[uid]['filename'];

      if (filename && plugins_flat[uid]) {
        const result = await this._getUrl(`${this.network_host[this.channel]}/plugins/${filename}`);
        if (result.data) {
          plugins_local[uid]['code'] = result.data as string;
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
   * @param categories - Dictionary with names and descriptions of categories.
   * @param plugins_user - Dictionary of external UserScripts.
   * @internal
   */
  _rebuildingCategories(categories: CategoryDict, plugins_user: PluginDict): CategoryDict {
    if (Object.keys(plugins_user).length) {
      Object.keys(plugins_user).forEach(plugin_uid => {
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
   * @param raw_plugins - Dictionary of plugins downloaded from the server.
   * @param plugins_local - Dictionary of installed plugins from IITC-CE distribution.
   * @param plugins_user - Dictionary of external UserScripts.
   * @internal
   */
  _rebuildingArrayCategoriesPlugins(
    raw_plugins: PluginDict,
    plugins_local: PluginDict,
    plugins_user: PluginDict
  ): PluginDict {
    const data: PluginDict = { ...raw_plugins };

    if (!isSet(plugins_local)) plugins_local = {};
    if (!isSet(plugins_user)) plugins_user = {};

    // Get valid UIDs for current channel to prevent cross-channel contamination
    const currentChannelPluginUIDs = new Set(Object.keys(data));

    // Apply data from local plugins - only for plugins that exist in current channel
    Object.keys(plugins_local).forEach(plugin_uid => {
      if (currentChannelPluginUIDs.has(plugin_uid)) {
        const localPlugin = plugins_local[plugin_uid];
        data[plugin_uid].status = localPlugin.status || 'off';
        data[plugin_uid].updatedAt = localPlugin.updatedAt;
        data[plugin_uid].statusChangedAt = localPlugin.statusChangedAt;
      }
    });

    // Apply user plugins
    if (Object.keys(plugins_user).length) {
      Object.keys(plugins_user).forEach(plugin_uid => {
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
   * @param channel - Current channel.
   * @param uids - Array of unique identifiers (UID) of plugins.
   * @param event - The type of event to handle.
   * @param update_type - Specifies the update type to determine which plugin versions to use.
   * When set to 'local', actions with plugins marked as "user" are ignored, and vice versa.
   * This parameter is intended to ignore updates from 'local' plugins when a 'user' plugin is used, and vice versa.
   * If not specified, no ignoring logic is applied, and the function attempts to process the plugin event
   * based on available data.
   * @internal
   */
  async _sendPluginsEvent(
    channel: Channel,
    uids: string[],
    event: PluginEventType,
    update_type?: UpdateType
  ): Promise<void> {
    const validEvents: PluginEventType[] = ['add', 'update', 'remove'];
    if (!validEvents.includes(event)) return;

    const plugins: PluginEventData['plugins'] = {};

    for (const uid of uids) {
      const isCore = uid === this.iitc_main_script_uid;
      if (isCore && event !== 'update') continue;

      const storageKeys = isCore
        ? [`${channel}_iitc_core`, `${channel}_iitc_core_user`]
        : [`${channel}_plugins_local`, `${channel}_plugins_user`];
      const storage = await this.storage.get(storageKeys);

      const plugin_local = isCore
        ? (storage[`${channel}_iitc_core`] as Plugin | undefined)
        : (storage[`${channel}_plugins_local`] as PluginDict)?.[uid];
      const plugin_user = isCore
        ? (storage[`${channel}_iitc_core_user`] as Plugin | undefined)
        : (storage[`${channel}_plugins_user`] as PluginDict)?.[uid];

      if (event === 'remove' || (!isSet(plugin_local) && !isSet(plugin_user))) {
        plugins[uid] = {};
        continue;
      }

      const useLocal =
        !isSet(plugin_user) && (update_type === undefined || update_type === 'local');
      const useUser = isSet(plugin_user) && (update_type === undefined || update_type === 'user');

      if (useLocal) {
        plugins[uid] = plugin_local || {};
      } else if (useUser) {
        plugins[uid] = plugin_user || {};
      }

      // Updating a disabled plugin should not trigger the event
      if (!isCore && (plugins[uid] as Plugin)?.status !== 'on') {
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
