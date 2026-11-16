// Copyright (C) 2023-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { isSet, parseMeta, sanitizeFileName } from './helpers.js';
import deepmerge from '@bundled-es-modules/deepmerge';
import type {
  BackupParams,
  Channel,
  NetworkHost,
  PluginDict,
  PluginStateDict,
  StorageData,
  UserScript,
} from './types.js';
import type { Manager } from './manager.js';

/**
 * Processes the input parameters for backup data retrieval.
 *
 * This function takes an input object containing parameters for backup data retrieval
 * and returns a new object with processed parameters. If the input parameters are not
 * an object, an empty object is used as the default value. The function combines the
 * input parameters with default parameters to ensure all required properties are present.
 *
 * @param params - The parameters for setting the backup data.
 */
export function paramsProcessing(params: Partial<BackupParams> | unknown): BackupParams {
  if (typeof params !== 'object' || params === null) params = {};

  // Default parameters
  const defaultParams: BackupParams = {
    settings: false,
    data: false,
    external: false,
  };

  // Combine the default parameters with the input parameters using spread syntax
  return { ...defaultParams, ...(params as Partial<BackupParams>) };
}

/**
 * Exports specific IITC settings from the provided storage object.
 *
 * This function takes a storage object and extracts specific IITC settings based on
 * predefined keys. It creates a new object containing only the specified IITC settings
 * and returns it.
 *
 * @param allStorage - The storage object containing all data.
 */
export const exportIitcSettings = (allStorage: StorageData): StorageData => {
  const iitcSettings: StorageData = {};

  // An array of predefined keys for IITC settings
  const storageKeys = [
    'channel',
    'network_host',
    'release_update_check_interval',
    'beta_update_check_interval',
    'custom_update_check_interval',
  ];

  // Loop through all_storage and check if the keys are present in storage_keys
  // If present, add them to the iitc_settings object
  for (const key in allStorage) {
    if (storageKeys.includes(key) && isSet(allStorage[key])) {
      iitcSettings[key] = allStorage[key];
    }
  }

  // Export plugin on/off state without runtime timestamps
  const pluginsState = allStorage['plugins_state'] as StorageData | undefined;
  if (isSet(pluginsState) && pluginsState) {
    const stateExport: StorageData = {};
    for (const uid of Object.keys(pluginsState)) {
      const entry = pluginsState[uid] as StorageData;
      if (entry?.status) stateExport[uid] = { status: entry.status };
    }
    if (Object.keys(stateExport).length) iitcSettings['plugins_state'] = stateExport;
  }

  return iitcSettings;
};

/**
 * Exports specific plugin settings from the provided storage object.
 *
 * This function takes a storage object and extracts plugin settings that have keys starting
 * with the prefix 'VMin'. It creates a new object containing only the plugin settings
 * and returns it.
 *
 * @param allStorage - The storage object containing all data.
 */
export const exportPluginsSettings = (allStorage: StorageData): StorageData => {
  const pluginsStorage: StorageData = {};

  // Loop through all_storage and check if the keys start with the prefix 'VMin'
  // If so, add them to the plugins_storage object
  for (const key in allStorage) {
    if (key.startsWith('VMin')) {
      pluginsStorage[key] = allStorage[key];
    }
  }
  return pluginsStorage;
};

/**
 * Exports external IITC core and plugins from the provided storage object.
 *
 * This function takes a storage object and extracts external IITC core and plugins based on predefined keys.
 * It creates a new object containing the external plugins organized by their channels and filenames,
 * and returns it.
 *
 * @param allStorage - The storage object containing all data.
 */
export const exportExternalPlugins = (
  allStorage: StorageData
): { [channel: string]: { [filename: string]: string } } => {
  const externalPlugins: { [channel: string]: { [filename: string]: string } } = {};
  const shared: { [filename: string]: string } = {};

  // Export global IITC core user script
  const iitcCoreUser = allStorage['iitc_core_user'] as StorageData;
  if (isSet(iitcCoreUser) && isSet(iitcCoreUser['code'])) {
    shared['total-conversion-build.user.js'] = iitcCoreUser['code'] as string;
  }

  // Export global user plugins
  const pluginsUser = allStorage['plugins_user'] as StorageData | null | undefined;
  if (isSet(pluginsUser) && pluginsUser) {
    for (const pluginUid in pluginsUser) {
      const plugin = pluginsUser[pluginUid] as StorageData;
      let pluginFilename = plugin['filename'] as string;
      if (!pluginFilename) {
        pluginFilename = sanitizeFileName(`${plugin['name']}.user.js`);
      }
      shared[pluginFilename] = plugin['code'] as string;
    }
  }

  if (Object.keys(shared).length) externalPlugins['shared'] = shared;

  return externalPlugins;
};

/**
 * Imports IITC settings from the backup object, notifies the host of plugins it disables
 * or enables, and runs a forced update check.
 *
 * @param self - IITC manager object.
 * @param backup - The backup object containing IITC settings to import.
 */
export const importIitcSettings = async (self: Manager, backup: StorageData): Promise<void> => {
  const backupObj = Object.assign({}, backup);
  // Backups exported without settings have no channel
  const channel = backupObj.channel as Channel;
  const isChannel = ['release', 'beta', 'custom'].includes(channel);
  if (!isChannel) delete backupObj.channel;

  const enabledUids = (storage: StorageData): string[] => {
    const pluginsState = (storage['plugins_state'] || {}) as PluginStateDict;
    return Object.keys(pluginsState).filter(uid => pluginsState[uid]?.status === 'on');
  };
  const { removed, added } = await self._mutatePlugins(async () => {
    const old = await self.storage.get(['plugins_state', 'plugins_user']);
    const before = enabledUids(old);
    await self.storage.set(backupObj);
    // A backup without plugins_state keeps the stored one
    const after = enabledUids(await self.storage.get(['plugins_state']));
    const pluginsUser = (old['plugins_user'] || {}) as PluginDict;
    return {
      removed: before.filter(uid => !after.includes(uid)),
      // Built-ins may have no cached code yet; the forced check announces them
      added: after.filter(uid => !before.includes(uid) && uid in pluginsUser),
    };
  });

  // The running manager keeps its own copy of the hosts
  if (isSet(backupObj.network_host)) self.networkHost = backupObj.network_host as NetworkHost;

  if (removed.length) await self._sendPluginsEvent(self.channel, removed, 'remove');
  if (added.length) await self._sendPluginsEvent(self.channel, added, 'add');

  // setChannel runs the same forced check
  if (isChannel && channel !== self.channel) await self.setChannel(channel);
  else await self.checkUpdates(true);
};

/**
 * Imports plugin settings from the provided backup object.
 *
 * The function first retrieves all data from the storage object
 * using `self.storage.get(null)` and filters out the records with keys starting with 'VMin'
 * to create a new object `vMinRecords` containing only plugin-related data. The function then
 * merges the `vMinRecords` object with the provided backup object using the `deepmerge` library,
 * resulting in a new storage object `newStorage` that contains updated plugin settings. Finally,
 * the updated storage object is set into the 'self' object using `self.storage.set()`.
 *
 * @param self - IITC manager object.
 * @param backup - The backup object containing plugin settings to import.
 */
export const importPluginsSettings = async (self: Manager, backup: StorageData): Promise<void> => {
  const allStorage = await self.storage.get(null);

  // Create a new object containing only plugin-related data (keys starting with 'VMin')
  const vMinRecords: StorageData = {};
  Object.keys(allStorage).forEach(key => {
    if (key.startsWith('VMin')) {
      vMinRecords[key] = allStorage[key];
    }
  });

  // Merge the 'vMinRecords' object with the provided backup object and set into storage
  const newStorage = deepmerge(vMinRecords, backup) as StorageData;
  await self.storage.set(newStorage);
};

/**
 * Imports external plugins from a backup. Throws without saving any of them
 * if a file has no valid ==UserScript== header.
 *
 * @param self - IITC manager object.
 * @param backup - Plugin code keyed by group ('shared', or a channel in older backups) and filename.
 */
export const importExternalPlugins = async (
  self: Manager,
  backup: { [group: string]: { [filename: string]: string } }
): Promise<void> => {
  const scripts: UserScript[] = [];
  for (const group of Object.values(backup)) {
    for (const [filename, code] of Object.entries(group)) {
      // A file without a header gets no uid and is rejected by addUserScripts
      scripts.push({ meta: { ...parseMeta(code), filename }, code });
    }
  }
  if (scripts.length) await self.addUserScripts(scripts);
};
