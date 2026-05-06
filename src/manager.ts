// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { Worker, IITC_CORE_UID, GM_API_UID, GM_API_DEFAULT_MATCH } from './worker.js';
import * as migrations from './migrations.js';
import { getUID, isSet, sanitizeFileName } from './helpers.js';
import { appendSourceUrl } from './wrapper.js';
import { aggregateMatchPatterns } from './matching.js';
import * as backup from './backup.js';
import type {
  Channel,
  Plugin,
  PluginDict,
  PluginStateDict,
  PluginsView,
  StorageData,
  BackupParams,
  BackupData,
  UserScript,
} from './types.js';

/**
 * This class contains methods for managing IITC and plugins.
 */
export class Manager extends Worker {
  /**
   * Changes the update channel and calls for an update.
   *
   * @param channel - Update channel for IITC and plugins.
   */
  async setChannel(channel: Channel): Promise<void> {
    const globalData = await this.storage.get(['plugins_user']);
    const pluginsUser = (globalData['plugins_user'] || {}) as PluginDict;

    // Fire 'remove' for channel-specific enabled plugins; core and gm_api are filtered in _sendPluginsEvent
    const oldEnabledPlugins = await this.getEnabledPlugins();
    const channelSpecificUids = Object.keys(oldEnabledPlugins).filter(uid => !pluginsUser[uid]);
    if (channelSpecificUids.length) {
      await this._sendPluginsEvent(this.channel, channelSpecificUids, 'remove');
    }

    // Change channel in storage and object
    this.channel = channel;
    await this._save(channel, { channel: channel, last_check_update: null });

    // Ensure local code cache exists for new channel
    const newChannelData = await this.storage.get([`${channel}_plugins_local`]);
    if (!newChannelData[`${channel}_plugins_local`]) {
      await this.storage.set({ [`${channel}_plugins_local`]: {} });
    }

    // checkUpdates fires 'update' for IITC core and re-injects enabled built-ins
    await this.checkUpdates(true);
  }

  /**
   * Changes the update check interval. If the interval for the current channel changes, a forced update check is started to apply the new interval.
   *
   * @param interval - Update check interval in seconds.
   * @param channel - Update channel for IITC and plugins.
   */
  async setUpdateCheckInterval(interval: number, channel?: string): Promise<void> {
    if (typeof channel === 'undefined') channel = this.channel;

    const data: StorageData = {};
    data[channel + '_update_check_interval'] = interval;
    await this.storage.set(data);

    if (channel === this.channel) await this.checkUpdates(true);
  }

  /**
   * Returns the update check interval in seconds for the given channel (defaults to the current channel).
   *
   * @param channel - Update channel for IITC and plugins.
   */
  async getUpdateCheckInterval(channel?: string): Promise<number> {
    if (typeof channel === 'undefined') channel = this.channel;
    const key = `${channel}_update_check_interval`;
    const data = await this.storage.get([key]);
    return (data[key] as number) || 24 * 60 * 60;
  }

  /**
   * Changes the URL of the repository with IITC and plugins for the custom channel.
   *
   * @param url - URL of the repository.
   */
  async setCustomChannelUrl(url: string): Promise<void> {
    const networkHost = (await this.storage
      .get(['network_host'])
      .then(data => data.network_host)) as typeof this.networkHost;
    networkHost.custom = url;
    await this.storage.set({ network_host: networkHost });
    this.networkHost = networkHost;
  }

  /**
   * Running the IITC and plugins manager.
   * Migrates data storage as needed, then loads or updates UserScripts from the repositories.
   */
  async run(): Promise<void> {
    if (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 1));
      return await this.run();
    }
    const isMigrated = await migrations.migrate(this.storage);
    await this.checkUpdates(isMigrated);
    if (isMigrated) {
      const local = await this.storage.get(['plugins_user']);
      const pluginsUser = (local['plugins_user'] || {}) as PluginDict;
      const allUids = Object.keys(pluginsUser);
      if (allUids.length) {
        await this._sendPluginsEvent(this.channel, allUids, 'remove', 'user');
        await this._sendPluginsEvent(this.channel, allUids, 'add', 'user');
      }
    }
  }

  /**
   * Returns the merged view of all plugins and categories for the current channel.
   * Combines server catalog with local installation state and user overrides.
   */
  async getPluginsView(): Promise<PluginsView> {
    const channel = this.channel;
    const storage = await this.storage.get([
      `${channel}_plugins_catalog`,
      `${channel}_plugins_local`,
      `${channel}_iitc_core`,
      'iitc_core_user',
      'plugins_user',
      'plugins_state',
    ]);

    const pluginsCatalog = (storage[`${channel}_plugins_catalog`] || {}) as PluginDict;
    const pluginsLocal = (storage[`${channel}_plugins_local`] || {}) as PluginDict;
    const pluginsUser = (storage['plugins_user'] || {}) as PluginDict;
    const pluginsState = (storage['plugins_state'] || {}) as PluginStateDict;
    const iitcCore = storage[`${channel}_iitc_core`] as Plugin | undefined;
    const iitcCoreUser = storage['iitc_core_user'] as Plugin | undefined;

    return this._computePluginsView(
      pluginsCatalog,
      pluginsLocal,
      pluginsUser,
      pluginsState,
      iitcCore,
      iitcCoreUser
    );
  }

  _emitPluginsChanged(): void {
    if (!this.onPluginsViewChanged) return;
    this.getPluginsView().then(view => this.onPluginsViewChanged!(view));
  }

  /**
   * Returns an object of all enabled plugins, including IITC core, with plugin UID as the key.
   */
  async getEnabledPlugins(): Promise<PluginDict> {
    const channel = this.channel;
    const storage = await this.storage.get([
      `${channel}_iitc_core`,
      'iitc_core_user',
      `${channel}_plugins_catalog`,
      `${channel}_plugins_local`,
      'plugins_user',
      'plugins_state',
    ]);

    const pluginsCatalog = (storage[`${channel}_plugins_catalog`] || {}) as PluginDict;
    const pluginsLocal = (storage[`${channel}_plugins_local`] || {}) as PluginDict;
    const pluginsUser = (storage['plugins_user'] || {}) as PluginDict;
    const pluginsState = (storage['plugins_state'] || {}) as PluginStateDict;
    const iitcCore = storage[`${channel}_iitc_core`] as Plugin | undefined;
    const iitcCoreUser = storage['iitc_core_user'] as Plugin | undefined;

    const { plugins: allPlugins, core: iitcScript } = this._computePluginsView(
      pluginsCatalog,
      pluginsLocal,
      pluginsUser,
      pluginsState,
      iitcCore,
      iitcCoreUser
    );

    const enabledPlugins: PluginDict = {};
    if (iitcScript !== null) {
      if (iitcScript.code) {
        iitcScript.code = appendSourceUrl({
          code: iitcScript.code,
          name: iitcScript.name || 'IITC',
          prefix: this.sourceUrlPrefix,
        });
      }
      enabledPlugins[IITC_CORE_UID] = iitcScript;

      for (const uid in allPlugins) {
        if (allPlugins[uid]['status'] === 'on') {
          // If the plugin is marked as 'user', use its 'user' version; otherwise, use its 'local' version
          enabledPlugins[uid] =
            allPlugins[uid]['user'] === true
              ? pluginsUser[uid] || ({} as Plugin)
              : pluginsLocal[uid] || ({} as Plugin);
        }
      }
    }

    // GM API (bridge adapter + factory) must be first
    if (this.gmApi) {
      const matches = Array.from(
        new Set([GM_API_DEFAULT_MATCH, ...aggregateMatchPatterns(enabledPlugins)])
      ).sort();
      return {
        [GM_API_UID]: this._buildGmApiPlugin(matches),
        ...enabledPlugins,
      };
    }
    return enabledPlugins;
  }

  /**
   * Invokes the injection of IITC core script and plugins to the page.
   *
   * Injection order:
   * 1. GM API components (bridge adapter + factory) - if `gmApi` is configured
   * 2. IITC core
   * 3. Plugins
   *
   * IITC core is injected before plugins to ensure it initializes first. During this time,
   * plugins can be added to `window.bootPlugins` without being started immediately.
   */
  async inject(): Promise<void> {
    const plugins = await this.getEnabledPlugins();
    for (const uid in plugins) {
      const plugin = plugins[uid];
      if (!plugin || !plugin.code) continue;

      const isGmComponent = uid === GM_API_UID;
      const isCore = uid === IITC_CORE_UID;

      if (isCore) {
        await this.injectPlugin(plugin);
      } else if (isGmComponent) {
        await this.injectPlugin(plugin);
      } else {
        await this._injectWithGmApi(plugin);
      }
    }
  }

  /**
   * Runs periodic checks and installs updates for IITC, internal and external plugins.
   *
   * @param force - Forced to run the update right now.
   */
  async checkUpdates(force?: boolean): Promise<void> {
    await Promise.all([this._checkInternalUpdates(force), this._checkExternalUpdates(force)]);
  }

  /**
   * Controls the plugin. Allows you to enable, disable and remove the plugin.
   *
   * @param uid - Unique identifier of the plugin.
   * @param action - Type of action with the plugin.
   */
  async managePlugin(uid: string, action: 'on' | 'off' | 'delete'): Promise<void> {
    const channel = this.channel;
    const local = await this.storage.get([
      `${channel}_plugins_catalog`,
      `${channel}_plugins_local`,
      'plugins_user',
      'plugins_state',
    ]);

    const pluginsCatalog = (local[`${channel}_plugins_catalog`] || {}) as PluginDict;
    let pluginsLocal = local[`${channel}_plugins_local`] as PluginDict;
    const pluginsUser = (local['plugins_user'] || {}) as PluginDict;
    const pluginsState = (local['plugins_state'] || {}) as PluginStateDict;

    if (!isSet(pluginsLocal)) pluginsLocal = {};

    const currentTime = Math.floor(Date.now() / 1000);
    const isUserPlugin = uid in pluginsUser;

    if (action === 'on') {
      if (isUserPlugin || pluginsLocal[uid] !== undefined) {
        pluginsState[uid] = { status: 'on', statusChangedAt: currentTime };
        const pluginToInject = isUserPlugin ? pluginsUser[uid] : pluginsLocal[uid];
        await this._injectWithGmApi(pluginToInject);
        await this._save(channel, { plugins_state: pluginsState });
        await this._sendPluginsEvent(channel, [uid], 'add');
      } else {
        const filename = pluginsCatalog[uid]?.['filename'];
        const result = await this._getUrl(`${this.networkHost[channel]}/plugins/${filename}`);
        if (result.data) {
          pluginsLocal[uid] = {
            ...pluginsCatalog[uid],
            code: result.data as string,
          };
          pluginsState[uid] = { status: 'on', statusChangedAt: currentTime };

          await this._injectWithGmApi(pluginsLocal[uid]);

          await this._save(channel, { plugins_local: pluginsLocal, plugins_state: pluginsState });
          await this._sendPluginsEvent(channel, [uid], 'add');
        }
      }
    }
    if (action === 'off') {
      pluginsState[uid] = { status: 'off', statusChangedAt: currentTime };
      await this._save(channel, { plugins_state: pluginsState });
      await this._sendPluginsEvent(channel, [uid], 'remove');
    }
    if (action === 'delete') {
      if (uid === IITC_CORE_UID) {
        await this._save(channel, { iitc_core_user: null });
        await this._sendPluginsEvent(channel, [uid], 'update');
      } else {
        const isEnabled = pluginsState[uid]?.status === 'on';

        delete pluginsUser[uid];
        pluginsState[uid] = { status: 'off' };

        await this._save(channel, { plugins_user: pluginsUser, plugins_state: pluginsState });
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
   * @param scripts - Array of UserScripts.
   */
  async addUserScripts(scripts: UserScript[]): Promise<PluginDict> {
    const channel = this.channel;
    const local = await this.storage.get([
      'iitc_core_user',
      `${channel}_plugins_catalog`,
      `${channel}_plugins_local`,
      'plugins_user',
      'plugins_state',
    ]);

    let iitcCoreUser = local['iitc_core_user'] as Plugin | undefined;
    const pluginsCatalog = (local[`${channel}_plugins_catalog`] || {}) as PluginDict;
    let pluginsLocal = local[`${channel}_plugins_local`] as PluginDict;
    const pluginsUser = (local['plugins_user'] || {}) as PluginDict;
    const pluginsState = (local['plugins_state'] || {}) as PluginStateDict;

    if (!isSet(pluginsLocal)) pluginsLocal = {};

    const addedUids: string[] = [];
    const updatedUids: string[] = [];
    const installedScripts: PluginDict = {};
    const currentTime = Math.floor(Date.now() / 1000);

    scripts.forEach(script => {
      const meta = script['meta'];
      const code = script['code'];
      const pluginUid = getUID(meta);

      if (pluginUid === null) throw new Error('The plugin has an incorrect ==UserScript== header');

      if (pluginUid === IITC_CORE_UID) {
        iitcCoreUser = Object.assign(meta, {
          uid: pluginUid,
          code: code,
        }) as Plugin;
        updatedUids.push(pluginUid);
        installedScripts[pluginUid] = iitcCoreUser;
      } else {
        const isUserPlugin = pluginsUser[pluginUid] !== undefined;
        pluginsUser[pluginUid] = Object.assign(meta, {
          uid: pluginUid,
          filename: meta['filename']
            ? meta['filename']
            : sanitizeFileName(`${meta['name']}.user.js`),
          code: code,
          addedAt: currentTime,
        }) as Plugin;
        pluginsState[pluginUid] = { status: 'on', statusChangedAt: currentTime };

        if (pluginUid in pluginsCatalog && !isUserPlugin) {
          updatedUids.push(pluginUid);
          // Return merged catalog+user view with override flag (mirrors _computePluginsView)
          const catalogEntry = pluginsCatalog[pluginUid];
          const userEntry = pluginsUser[pluginUid];
          const state = pluginsState[pluginUid];
          const overridePlugin: Plugin = {
            ...catalogEntry,
            status: state.status,
            code: userEntry.code,
            user: true,
            override: true,
            addedAt: userEntry.addedAt,
            statusChangedAt: state.statusChangedAt,
          } as Plugin;
          delete overridePlugin.match;
          if (userEntry.match !== undefined) overridePlugin.match = userEntry.match;
          installedScripts[pluginUid] = overridePlugin;
        } else {
          if (pluginsUser[pluginUid]['category'] === undefined) {
            pluginsUser[pluginUid]['category'] = 'Misc';
          }
          addedUids.push(pluginUid);
          const state = pluginsState[pluginUid];
          installedScripts[pluginUid] = {
            ...pluginsUser[pluginUid],
            status: state.status,
            statusChangedAt: state.statusChangedAt,
            user: true,
          };
        }
      }
    });

    await this._save(channel, {
      iitc_core_user: iitcCoreUser,
      plugins_local: pluginsLocal,
      plugins_user: pluginsUser,
      plugins_state: pluginsState,
    });

    if (addedUids.length) await this._sendPluginsEvent(channel, addedUids, 'add');
    if (updatedUids.length) await this._sendPluginsEvent(channel, updatedUids, 'update');

    return installedScripts;
  }

  /**
   * Returns information about requested plugin by UID.
   *
   * @param uid - Plugin UID.
   */
  async getPluginInfo(uid: string): Promise<Plugin | null> {
    const { plugins } = await this.getPluginsView();
    return plugins[uid] ?? null;
  }

  /**
   * Asynchronously retrieves backup data based on the specified parameters.
   *
   * @param params - The parameters for the backup data retrieval.
   */
  async getBackupData(params: Partial<BackupParams>): Promise<BackupData> {
    // Process the input parameters using the 'paramsProcessing' function from the 'backup' module.
    const processedParams = backup.paramsProcessing(params);

    // Initialize the backup_data object with its properties.
    const backupData: BackupData = {
      external_plugins: {},
      data: {
        iitc_settings: {},
        plugins_data: {},
        app: 'IITC Button',
      },
    };

    // Retrieve all_storage using the 'get' method of 'storage' module.
    const allStorage = await this.storage.get(null);

    if (processedParams.settings)
      backupData.data.iitc_settings = backup.exportIitcSettings(allStorage);
    if (processedParams.data)
      backupData.data.plugins_data = backup.exportPluginsSettings(allStorage);
    if (processedParams.external)
      backupData.external_plugins = backup.exportExternalPlugins(allStorage);

    // Return the backup_data object.
    return backupData;
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
   * @param params - The parameters for setting the backup data.
   * @param backupData - The backup data object containing the data to be set.
   */
  async setBackupData(params: Partial<BackupParams>, backupData: BackupData): Promise<void> {
    // Process the input parameters using the 'paramsProcessing' function from the 'backup' module.
    const processedParams = backup.paramsProcessing(params);

    if (processedParams.settings)
      await backup.importIitcSettings(this, backupData.data.iitc_settings);
    if (processedParams.data)
      await backup.importPluginsSettings(this, backupData.data.plugins_data);
    if (processedParams.external)
      await backup.importExternalPlugins(this, backupData.external_plugins);
  }
}
