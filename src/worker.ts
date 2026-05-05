// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { fetchResource, clearWait, getUID, isSet, parseMeta, wait } from './helpers.js';
import { wrapPluginCode, appendSourceUrl } from './wrapper.js';
import { getGmApiCode } from './gm-api.js';
import { aggregateMatchPatterns } from './matching.js';
import type {
  Channel,
  ManagerConfig,
  GmApiConfig,
  StorageAPI,
  StorageData,
  NetworkHost,
  Plugin,
  PluginDict,
  PluginStateDict,
  PluginsView,
  CategoryViewDict,
  PluginEventType,
  PluginEventData,
  UpdateType,
  RequestVariant,
  FetchResourceOptions,
  FetchResourceResult,
  MetaJsonResponse,
} from './types.js';

export const IITC_CORE_UID =
  'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
export const GM_API_UID = 'gm_api';
export const GM_API_DEFAULT_MATCH = 'https://intel.ingress.com/*';

/**
 * This class contains methods for managing IITC and plugins.
 */
export class Worker {
  config: ManagerConfig;
  storage: StorageAPI;
  channel!: Channel;
  networkHost!: NetworkHost;
  isDaemon!: boolean;
  useFetchHeadMethod!: boolean;
  isInitialized: boolean;
  gmApi?: GmApiConfig;
  sourceUrlPrefix: string;
  progressIntervalId: ReturnType<typeof setInterval> | null;
  updateTimeoutId: ReturnType<typeof setTimeout> | null;
  externalUpdateTimeoutId: ReturnType<typeof setTimeout> | null;

  message?: (message: string, args?: string | string[]) => void;
  onProgress?: (isShow: boolean) => void;
  injectPlugin: (plugin: Plugin) => Promise<void>;
  onPluginEvent: (event: PluginEventData) => void;
  onPluginsViewChanged?: (view: PluginsView) => void;
  newPluginThreshold: number;
  _gmApiMatches: string[];

  /**
   * Creates an instance of Manager class with the specified parameters
   *
   * @param config - Environment parameters for an instance of Manager class.
   */
  constructor(config: ManagerConfig) {
    this.config = config;
    this.progressIntervalId = null;
    this.updateTimeoutId = null;
    this.externalUpdateTimeoutId = null;
    this.storage =
      typeof this.config.storage !== 'undefined'
        ? this.config.storage
        : (console.error("config key 'storage' is not set") as unknown as StorageAPI);
    this.message = this.config.message;
    this.onProgress = this.config.onProgress;
    this.injectPlugin =
      this.config.injectPlugin ||
      function () {
        return Promise.resolve();
      };
    this.onPluginEvent = this.config.onPluginEvent || function () {};
    this.gmApi = this.config.gmApi;
    this.sourceUrlPrefix = this.config.sourceUrlPrefix || '';
    this.onPluginsViewChanged = this.config.onPluginsViewChanged;
    this.newPluginThreshold = this.config.newPluginThreshold ?? 3600;

    this._gmApiMatches = [GM_API_DEFAULT_MATCH];
    this.isInitialized = false;
    this._init().then();
  }

  /**
   * Set values for the class properties.
   * @internal
   */
  async _init(): Promise<void> {
    this.channel = await this._syncStorage('channel', 'release', this.config.channel);
    this.networkHost = await this._syncStorage(
      'network_host',
      {
        release: 'https://iitc.app/build/release',
        beta: 'https://iitc.app/build/beta',
        custom: 'http://localhost:8000',
      },
      this.config.networkHost
    );
    this.isDaemon = await this._syncStorage('is_daemon', true, this.config.isDaemon);
    this.useFetchHeadMethod = await this._syncStorage(
      'use_fetch_head_method',
      true,
      this.config.useFetchHeadMethod
    );
    this.isInitialized = true;
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
        ['iitc_version', 'last_modified', 'iitc_core', 'plugins_catalog', 'plugins_local'].indexOf(
          key
        ) !== -1
      ) {
        data[`${channel}_${key}`] = options[key];
      } else {
        data[key] = options[key];
      }
    });
    await this.storage.set(data);

    // Channel-scoped changes only affect the view when they belong to the active channel
    const channelScopedKeys = ['plugins_catalog', 'plugins_local', 'iitc_core'];
    const globalPluginsKeys = ['plugins_user', 'plugins_state', 'channel', 'iitc_core_user'];
    const affectsView =
      (Object.keys(options).some(k => channelScopedKeys.includes(k)) && channel === this.channel) ||
      Object.keys(options).some(k => globalPluginsKeys.includes(k));
    if (affectsView) {
      this._emitPluginsChanged();
    }
  }

  /**
   * Builds the gm_api pseudo-plugin with the given aggregated match patterns.
   * @internal
   */
  _buildGmApiPlugin(matches: string[]): Plugin {
    return {
      uid: GM_API_UID,
      name: 'GM API',
      match: matches,
      code: appendSourceUrl({
        code: this.gmApi!.bridgeAdapterCode + '\n' + getGmApiCode(),
        name: 'GM_api',
        prefix: this.sourceUrlPrefix,
        suffix: '.js',
      }),
    };
  }

  /**
   * Reads storage and computes the aggregated set of @match patterns
   * from IITC core and all currently enabled plugins.
   * @internal
   */
  async _computeGmApiMatches(): Promise<string[]> {
    const channel = this.channel;
    const data = await this.storage.get([
      `${channel}_iitc_core`,
      'iitc_core_user',
      `${channel}_plugins_local`,
      'plugins_user',
      'plugins_state',
    ]);

    const pluginsLocal = (data[`${channel}_plugins_local`] || {}) as PluginDict;
    const pluginsUser = (data['plugins_user'] || {}) as PluginDict;
    const pluginsState = (data['plugins_state'] || {}) as PluginStateDict;
    const iitcCore = data[`${channel}_iitc_core`] as Plugin | undefined;
    const iitcCoreUser = data['iitc_core_user'] as Plugin | undefined;

    const candidates: PluginDict = {};

    const core = this._computeCore(iitcCore, iitcCoreUser);
    if (core) candidates[IITC_CORE_UID] = core;

    for (const uid in pluginsState) {
      if (pluginsState[uid]?.status !== 'on') continue;
      const plugin = uid in pluginsUser ? pluginsUser[uid] : pluginsLocal[uid];
      if (plugin) candidates[uid] = plugin;
    }

    return Array.from(
      new Set([GM_API_DEFAULT_MATCH, ...aggregateMatchPatterns(candidates)])
    ).sort();
  }

  /**
   * Fires the onPluginsViewChanged callback with the current merged plugin view.
   * Overridden in Manager where getPlugins() is available.
   * @internal
   */
  _emitPluginsChanged(): void {}

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

    clearInterval(this.progressIntervalId!);
    this.progressIntervalId = setInterval(async () => {
      this.onProgress!(true);
    }, 300);
    try {
      const options: FetchResourceOptions = {
        useFetchHeadMethod: this.useFetchHeadMethod,
      };

      if (variant === 'parseJSON') {
        options.parseJSON = true;
      } else if (variant === 'head') {
        options.headOnly = true;
      }

      const result = await fetchResource(url, options);

      clearInterval(this.progressIntervalId!);
      if (result.data !== null || result.version !== null) {
        this.onProgress!(false);
      }
      return result;
    } catch {
      if (retry === undefined) {
        clearInterval(this.progressIntervalId!);
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
      `${channel}_plugins_local`,
    ]);

    let updateCheckInterval = storage[`${channel}_update_check_interval`] as number;
    if (!updateCheckInterval) updateCheckInterval = 24 * 60 * 60;

    if (!isSet(storage[`${channel}_last_modified`]) || !isSet(storage.last_check_update)) {
      clearWait();
      clearTimeout(this.updateTimeoutId!);
      this.updateTimeoutId = null;
      await this._updateInternalIITC(channel, storage);
    } else {
      const timeDelta =
        Math.floor(Date.now() / 1000) - updateCheckInterval - (storage.last_check_update as number);
      if (timeDelta >= 0 || force) {
        clearWait();
        clearTimeout(this.updateTimeoutId!);
        this.updateTimeoutId = null;
        const result = await this._getUrl(this.networkHost[channel] + '/meta.json', 'head', true);
        if (result.version !== storage[`${channel}_last_modified`] || force) {
          await this._updateInternalIITC(channel, storage);
        }
      }
    }
    if (!this.updateTimeoutId) {
      await this._save(channel, {
        last_check_update: Math.floor(Date.now() / 1000),
      });

      if (this.isDaemon) {
        this.updateTimeoutId = setTimeout(async () => {
          await this._checkInternalUpdates();
        }, updateCheckInterval * 1000);
      } else {
        this.updateTimeoutId = null;
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
    const result = await this._getUrl(this.networkHost[channel] + '/meta.json', 'parseJSON', true);
    if (!result.data) return;

    const response = result.data as MetaJsonResponse;
    const lastModified = result.version;

    const pluginsCatalog = this._getPluginsCatalog(response);
    let pluginsLocal = local[`${channel}_plugins_local`] as PluginDict;

    const pIitc = async () => {
      const res = await this._getUrl(
        this.networkHost[this.channel] + '/total-conversion-build.user.js'
      );
      if (res.data) {
        const iitcCore = parseMeta(res.data as string) as Plugin;
        iitcCore['uid'] = getUID(iitcCore)!;
        iitcCore['code'] = res.data as string;
        await this._save(channel, {
          iitc_core: iitcCore,
        });
        await this._sendPluginsEvent(channel, [iitcCore['uid']], 'update', 'local');
      }
    };

    const pPlugins = async () => {
      const res = await this._updateLocalPlugins(channel, pluginsCatalog, pluginsLocal);
      pluginsLocal = res.pluginsLocal;
      await this._save(channel, {
        iitc_version: response['iitc_version'],
        last_modified: lastModified,
        plugins_catalog: pluginsCatalog,
        plugins_local: pluginsLocal,
      });
      if (res.updatedUids.length)
        await this._sendPluginsEvent(channel, res.updatedUids, 'update', 'local');
      if (res.removedUids.length)
        await this._sendPluginsEvent(channel, res.removedUids, 'remove', 'local');
      if (res.addedUids.length)
        await this._sendPluginsEvent(channel, res.addedUids, 'add', 'local');
    };

    await Promise.all([pIitc, pPlugins].map(fn => fn()));
  }

  /**
   * Converts a list of categories with plugins into a flat catalog dictionary.
   * Contains only server-side metadata fields - no runtime state (status, code, user, etc.).
   *
   * @param data - Data from received meta.json file.
   * @internal
   */
  _getPluginsCatalog(data: MetaJsonResponse): PluginDict {
    if (!('categories' in data)) return {};
    const plugins: PluginDict = {};
    const categories = data['categories'];

    Object.keys(categories).forEach(cat => {
      if (cat === 'Obsolete' || cat === 'Deleted') return;

      if ('plugins' in categories[cat] && categories[cat].plugins) {
        Object.keys(categories[cat].plugins!).forEach(id => {
          const plugin = { ...(categories[cat].plugins![id] as unknown as Plugin) };
          plugin['uid'] = getUID(plugin)!;
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
      'plugins_user',
    ]);

    let updateCheckInterval = local['external_update_check_interval'] as number;
    if (!updateCheckInterval) {
      updateCheckInterval = 24 * 60 * 60;
    }

    const timeDelta =
      Math.floor(Date.now() / 1000) -
      updateCheckInterval -
      (local.last_check_external_update as number);
    if (timeDelta >= 0 || force) {
      clearTimeout(this.externalUpdateTimeoutId!);
      this.externalUpdateTimeoutId = null;
      await this._updateExternalPlugins(channel, local);
    }

    if (!this.externalUpdateTimeoutId) {
      await this._save(channel, {
        last_check_external_update: Math.floor(Date.now() / 1000),
      });

      if (this.isDaemon) {
        this.externalUpdateTimeoutId = setTimeout(async () => {
          await this._checkExternalUpdates();
        }, updateCheckInterval * 1000);
      } else {
        this.externalUpdateTimeoutId = null;
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
    const pluginsUser = local['plugins_user'] as PluginDict | undefined;
    if (pluginsUser) {
      let existUpdates = false;
      const hash = `?${Date.now()}`;
      const updatedUids: string[] = [];
      const currentTime = Math.floor(Date.now() / 1000);

      for (const uid of Object.keys(pluginsUser)) {
        const plugin = pluginsUser[uid];

        if (plugin['updateURL'] && plugin['downloadURL']) {
          // download meta info
          const resultMeta = await this._getUrl(plugin['updateURL'] + hash);
          if (resultMeta.data) {
            const meta = parseMeta(resultMeta.data as string);
            // if new version
            if (meta && meta['version'] && meta['version'] !== plugin['version']) {
              // download userscript
              const resultCode = await this._getUrl(plugin['downloadURL'] + hash);
              if (resultCode.data) {
                existUpdates = true;
                pluginsUser[uid] = {
                  ...meta,
                  uid,
                  code: resultCode.data as string,
                  updatedAt: currentTime,
                  addedAt: plugin.addedAt,
                } as Plugin;
                updatedUids.push(uid);
              }
            }
          }
        }
      }

      if (existUpdates) {
        await this._save(channel, {
          plugins_user: pluginsUser,
        });
        await this._sendPluginsEvent(channel, updatedUids, 'update', 'user');
      }
    }
  }

  /**
   * Updates plugins.
   *
   * @param channel - Current channel.
   * @param pluginsCatalog - Data from storage, key "[channel]_plugins_catalog".
   * @param pluginsLocal - Data from storage, key "[channel]_plugins_local".
   * @internal
   */
  async _updateLocalPlugins(
    channel: Channel,
    pluginsCatalog: PluginDict,
    pluginsLocal: PluginDict
  ): Promise<{
    pluginsLocal: PluginDict;
    addedUids: string[];
    updatedUids: string[];
    removedUids: string[];
  }> {
    if (!isSet(pluginsLocal))
      return { pluginsLocal: {}, addedUids: [], updatedUids: [], removedUids: [] };

    const updatedUids: string[] = [];
    const removedUids: string[] = [];
    const addedUids: string[] = [];
    const currentTime = Math.floor(Date.now() / 1000);

    const globalData = await this.storage.get(['plugins_state']);
    const pluginsState = (globalData['plugins_state'] || {}) as PluginStateDict;

    // For each uid in local cache or catalog:
    // already cached + in catalog -> re-download (update)
    // already cached + gone from catalog -> remove
    // not cached + in catalog + enabled -> download (add)
    const allUids = new Set([...Object.keys(pluginsLocal), ...Object.keys(pluginsCatalog)]);
    for (const uid of allUids) {
      if (uid in pluginsLocal) {
        const filename = pluginsLocal[uid]['filename'] as string;
        if (filename && pluginsCatalog[uid]) {
          const result = await this._getUrl(
            `${this.networkHost[this.channel]}/plugins/${filename}`
          );
          if (result.data) {
            pluginsLocal[uid]['code'] = result.data as string;
            pluginsLocal[uid]['updatedAt'] = currentTime;
            updatedUids.push(uid);
          }
        } else {
          delete pluginsLocal[uid];
          removedUids.push(uid);
        }
      } else if (pluginsState[uid]?.status === 'on') {
        const filename = (pluginsCatalog[uid] as Plugin)['filename'] as string;
        if (filename) {
          const result = await this._getUrl(
            `${this.networkHost[this.channel]}/plugins/${filename}`
          );
          if (result.data) {
            pluginsLocal[uid] = {
              ...(pluginsCatalog[uid] as Plugin),
              code: result.data as string,
            };
            addedUids.push(uid);
          }
        }
      }
    }

    return { pluginsLocal, addedUids, updatedUids, removedUids };
  }

  /** @internal */
  _computePlugins(
    rawPlugins: PluginDict,
    pluginsLocal: PluginDict,
    pluginsUser: PluginDict,
    pluginsState: PluginStateDict
  ): PluginDict {
    if (!isSet(pluginsLocal)) pluginsLocal = {};
    if (!isSet(pluginsUser)) pluginsUser = {};

    const data: PluginDict = {};
    for (const [uid, plugin] of Object.entries(rawPlugins)) {
      data[uid] = { ...plugin, status: 'off' };
    }

    // Build a set of catalog UIDs to skip stale local entries removed from the server catalog
    const currentChannelPluginUids = new Set(Object.keys(data));

    Object.keys(pluginsLocal).forEach(pluginUid => {
      if (currentChannelPluginUids.has(pluginUid)) {
        const localPlugin = pluginsLocal[pluginUid];
        const state = pluginsState[pluginUid];
        data[pluginUid].status = state?.status ?? 'off';
        data[pluginUid].statusChangedAt = state?.statusChangedAt;
        data[pluginUid].code = localPlugin.code;
        data[pluginUid].updatedAt = localPlugin.updatedAt;
      }
    });

    Object.keys(pluginsUser).forEach(pluginUid => {
      const userPlugin = pluginsUser[pluginUid];
      const state = pluginsState[pluginUid];
      const pluginStatus = state?.status ?? 'off';
      if (pluginUid in data) {
        data[pluginUid].status = pluginStatus;
        data[pluginUid].statusChangedAt = state?.statusChangedAt;
        data[pluginUid].code = userPlugin.code;
        data[pluginUid].user = true;
        data[pluginUid].override = true;
        data[pluginUid].addedAt = userPlugin.addedAt;
        data[pluginUid].updatedAt = userPlugin.updatedAt;
      } else {
        data[pluginUid] = {
          ...userPlugin,
          status: pluginStatus,
          statusChangedAt: state?.statusChangedAt,
        };
      }
      data[pluginUid].user = true;
    });

    return data;
  }

  /** @internal */
  _computeCategories(plugins: PluginDict): CategoryViewDict {
    const now = Math.floor(Date.now() / 1000);
    const threshold = this.newPluginThreshold;
    const rawCategories: CategoryViewDict = {};
    for (const plugin of Object.values(plugins)) {
      const cat = plugin.category || 'Misc';
      if (!(cat in rawCategories)) {
        rawCategories[cat] = { name: cat, isNew: false };
      }
      if (plugin.addedAt && now - plugin.addedAt <= threshold) {
        rawCategories[cat].isNew = true;
      }
    }
    return Object.fromEntries(Object.entries(rawCategories).sort(([a], [b]) => a.localeCompare(b)));
  }

  /** @internal */
  _computeCore(iitcCore: Plugin | undefined, iitcCoreUser: Plugin | undefined): Plugin | null {
    if (isSet(iitcCoreUser) && isSet(iitcCoreUser!['code'])) {
      iitcCoreUser!['override'] = true;
      return iitcCoreUser!;
    }
    if (isSet(iitcCore) && isSet(iitcCore!['code'])) {
      return iitcCore!;
    }
    return null;
  }

  /**
   * Computes a merged view of all plugins, categories and IITC core.
   *
   * @param rawPlugins - Dictionary of plugins downloaded from the server.
   * @param pluginsLocal - Dictionary of installed plugins from IITC-CE distribution.
   * @param pluginsUser - Dictionary of external UserScripts.
   * @param pluginsState - Dictionary of plugin state entries.
   * @param iitcCore - Channel core plugin from storage.
   * @param iitcCoreUser - User-installed core override from storage.
   * @internal
   */
  _computePluginsView(
    rawPlugins: PluginDict,
    pluginsLocal: PluginDict,
    pluginsUser: PluginDict,
    pluginsState: PluginStateDict,
    iitcCore?: Plugin,
    iitcCoreUser?: Plugin
  ): PluginsView {
    const plugins = this._computePlugins(rawPlugins, pluginsLocal, pluginsUser, pluginsState);
    const categories = this._computeCategories(plugins);
    const core = this._computeCore(iitcCore, iitcCoreUser);
    return { plugins, categories, core };
  }

  /**
   * Asynchronously sends an event for a list of plugins based on the given parameters.
   * It calls `onPluginEvent` once with the event type and a map of the selected plugins.
   * If the action is "remove", the plugins are represented by empty objects.
   *
   * @param channel - Current channel.
   * @param uids - Array of unique identifiers (UID) of plugins.
   * @param event - The type of event to handle.
   * @param updateType - Specifies the update type to determine which plugin versions to use.
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
    updateType?: UpdateType
  ): Promise<void> {
    const validEvents: PluginEventType[] = ['add', 'update', 'remove'];
    if (!validEvents.includes(event)) return;

    // Read global state once for status checks across all uids
    const globalData = await this.storage.get(['plugins_user', 'plugins_state']);
    const allPluginsUser = (globalData['plugins_user'] || {}) as PluginDict;
    const allPluginsState = (globalData['plugins_state'] || {}) as PluginStateDict;

    const plugins: PluginEventData['plugins'] = {};

    for (const uid of uids) {
      if (uid === GM_API_UID) continue;

      const isCore = uid === IITC_CORE_UID;
      if (isCore && event !== 'update') continue;

      const storageKeys = isCore
        ? [`${channel}_iitc_core`, 'iitc_core_user']
        : [`${channel}_plugins_local`];
      const storage = await this.storage.get(storageKeys);

      const pluginLocal = isCore
        ? (storage[`${channel}_iitc_core`] as Plugin | undefined)
        : (storage[`${channel}_plugins_local`] as PluginDict)?.[uid];
      const pluginUser = isCore
        ? (storage['iitc_core_user'] as Plugin | undefined)
        : allPluginsUser[uid];

      if (event === 'remove' || (!isSet(pluginLocal) && !isSet(pluginUser))) {
        plugins[uid] = {};
        continue;
      }

      const useLocal = !isSet(pluginUser) && (updateType === undefined || updateType === 'local');
      const useUser = isSet(pluginUser) && (updateType === undefined || updateType === 'user');

      if (useLocal) {
        plugins[uid] = pluginLocal || {};
      } else if (useUser) {
        plugins[uid] = pluginUser || {};
      }

      // Updating a disabled plugin should not trigger the event
      if (!isCore && allPluginsState[uid]?.status !== 'on') {
        delete plugins[uid];
      }
    }

    if (Object.keys(plugins).length) {
      // Wrap plugin code with GM API bindings when gm_api is configured
      if (this.gmApi && (event === 'add' || event === 'update')) {
        for (const uid in plugins) {
          const plugin = plugins[uid] as Plugin;
          if (plugin?.code) {
            const wrapped = { ...plugin };
            wrapped.code = wrapPluginCode(wrapped, this.sourceUrlPrefix);
            plugins[uid] = wrapped;
          }
        }
      }

      this.onPluginEvent({
        event,
        plugins,
      });
    }

    if (this.gmApi) {
      const newMatches = await this._computeGmApiMatches();
      if (newMatches.join('\0') !== this._gmApiMatches.join('\0')) {
        this._gmApiMatches = newMatches;
        this.onPluginEvent({
          event: 'update',
          plugins: { [GM_API_UID]: this._buildGmApiPlugin(newMatches) },
        });
      }
    }
  }

  /**
   * Injects a plugin, optionally wrapping its code with GM API bindings
   * when `gmApi` config is provided.
   *
   * @param plugin - Plugin to inject.
   * @internal
   */
  async _injectWithGmApi(plugin: Plugin): Promise<void> {
    if (this.gmApi && plugin.code) {
      plugin = { ...plugin, code: wrapPluginCode(plugin, this.sourceUrlPrefix) };
    }
    await this.injectPlugin(plugin);
  }
}
