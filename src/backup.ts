// Copyright (C) 2023-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { isSet, parseMeta, sanitizeFileName } from './helpers.js';
import deepmerge from '@bundled-es-modules/deepmerge';
import type { BackupParams, StorageData } from './types.js';
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
  const default_params: BackupParams = {
    settings: false,
    data: false,
    external: false,
  };

  // Combine the default parameters with the input parameters using spread syntax
  return { ...default_params, ...(params as Partial<BackupParams>) };
}

/**
 * Exports specific IITC settings from the provided storage object.
 *
 * This function takes a storage object and extracts specific IITC settings based on
 * predefined keys. It creates a new object containing only the specified IITC settings
 * and returns it.
 *
 * @param all_storage - The storage object containing all data.
 */
export const exportIitcSettings = (all_storage: StorageData): StorageData => {
  const iitc_settings: StorageData = {};

  // An array of predefined keys for IITC settings
  const storage_keys = [
    'channel',
    'network_host',
    'release_update_check_interval',
    'beta_update_check_interval',
    'custom_update_check_interval',
  ];

  // Loop through all_storage and check if the keys are present in storage_keys
  // If present, add them to the iitc_settings object
  for (const key in all_storage) {
    if (storage_keys.includes(key) && isSet(all_storage[key])) {
      iitc_settings[key] = all_storage[key];
    }
  }
  return iitc_settings;
};

/**
 * Exports specific plugin settings from the provided storage object.
 *
 * This function takes a storage object and extracts plugin settings that have keys starting
 * with the prefix 'VMin'. It creates a new object containing only the plugin settings
 * and returns it.
 *
 * @param all_storage - The storage object containing all data.
 */
export const exportPluginsSettings = (all_storage: StorageData): StorageData => {
  const plugins_storage: StorageData = {};

  // Loop through all_storage and check if the keys start with the prefix 'VMin'
  // If so, add them to the plugins_storage object
  for (const key in all_storage) {
    if (key.startsWith('VMin')) {
      plugins_storage[key] = all_storage[key];
    }
  }
  return plugins_storage;
};

/**
 * Exports external IITC core and plugins from the provided storage object.
 *
 * This function takes a storage object and extracts external IITC core and plugins based on predefined keys.
 * It creates a new object containing the external plugins organized by their channels and filenames,
 * and returns it.
 *
 * @param all_storage - The storage object containing all data.
 */
export const exportExternalPlugins = (
  all_storage: StorageData
): { [channel: string]: { [filename: string]: string } } => {
  const external_plugins: { [channel: string]: { [filename: string]: string } } = {};

  // An array of predefined keys for external plugins
  const storage_keys = [
    'release_iitc_core_user',
    'beta_iitc_core_user',
    'custom_iitc_core_user',
    'release_plugins_user',
    'beta_plugins_user',
    'custom_plugins_user',
  ];

  // Loop through all_storage and check if the keys are present in storage_keys
  // If present, process and add the external plugins to the external_plugins object
  for (const key in all_storage) {
    if (storage_keys.includes(key)) {
      // Extract the channel name from the key by splitting at '_'
      const channel = key.split('_')[0];
      const variant = key.split('_')[1];

      // Create a channel if it doesn't exist
      if (!(channel in external_plugins)) {
        external_plugins[channel] = {};
      }

      // Add a custom IITC core to the external_plugins object
      const storageValue = all_storage[key] as StorageData;
      if (variant === 'iitc' && isSet(storageValue) && isSet(storageValue['code'])) {
        const plugin_filename = 'total-conversion-build.user.js';
        external_plugins[channel][plugin_filename] = storageValue['code'] as string;
        continue;
      }

      // Loop through each plugin UID in the current key's storage data
      const plugins = all_storage[key] as StorageData;
      for (const plugin_uid in plugins) {
        // Get the plugin's filename and code from the storage data and add to the external_plugins object
        const plugin = plugins[plugin_uid] as StorageData;
        let plugin_filename = plugin['filename'] as string;
        if (!plugin_filename) {
          plugin_filename = sanitizeFileName(`${plugin['name']}.user.js`);
        }
        external_plugins[channel][plugin_filename] = plugin['code'] as string;
      }
    }
  }

  return external_plugins;
};

/**
 * Imports IITC settings from the provided backup object.
 *
 * @param self - IITC manager object.
 * @param backup - The backup object containing IITC settings to import.
 */
export const importIitcSettings = async (self: Manager, backup: StorageData): Promise<void> => {
  const backup_obj = Object.assign({}, backup);
  const default_channel = self.channel;

  // Set the IITC settings from the backup object into the storage
  await self.storage.set(backup_obj);

  // Check if the channel in the backup object is different from the original channel
  const set_channel = backup_obj.channel as import('./types.js').Channel;
  if (set_channel !== default_channel) {
    await self.setChannel(set_channel);
  }
};

/**
 * Imports plugin settings from the provided backup object.
 *
 * The function first retrieves all data from the storage object
 * using `self.storage.get(null)` and filters out the records with keys starting with 'VMin'
 * to create a new object `vMinRecords` containing only plugin-related data. The function then
 * merges the `vMinRecords` object with the provided backup object using the `deepmerge` library,
 * resulting in a new storage object `new_storage` that contains updated plugin settings. Finally,
 * the updated storage object is set into the 'self' object using `self.storage.set()`.
 *
 * @param self - IITC manager object.
 * @param backup - The backup object containing plugin settings to import.
 */
export const importPluginsSettings = async (self: Manager, backup: StorageData): Promise<void> => {
  const all_storage = await self.storage.get(null);

  // Create a new object containing only plugin-related data (keys starting with 'VMin')
  const vMinRecords: StorageData = {};
  Object.keys(all_storage).forEach(key => {
    if (key.startsWith('VMin')) {
      vMinRecords[key] = all_storage[key];
    }
  });

  // Merge the 'vMinRecords' object with the provided backup object and set into storage
  const new_storage = deepmerge(vMinRecords, backup) as StorageData;
  await self.storage.set(new_storage);
};

/**
 * Imports external plugins from the provided backup object.
 *
 * The function iterates through each channel in the backup object,
 * sets the current channel using `self.setChannel()`, and then extracts the plugin information
 * (metadata and code) for each plugin in the channel. The plugin information is added to the 'scripts'
 * array, which is then passed to `self.addUserScripts()` to add the external plugins. After processing
 * all channels, the function sets the default channel using `self.setChannel()` if it was changed during
 * the import process.
 *
 * @param self - IITC manager object.
 * @param backup - The backup object containing external plugins to import.
 */
export const importExternalPlugins = async (
  self: Manager,
  backup: { [channel: string]: { [filename: string]: string } }
): Promise<void> => {
  const default_channel = self.channel;

  // Iterate through each channel in the backup object
  for (const channel of Object.keys(backup)) {
    // Initialize an empty array to store the plugin information (metadata and code)
    const scripts: { meta: import('./types.js').PluginMeta; code: string }[] = [];
    await self.setChannel(channel as import('./types.js').Channel);

    // Iterate through each plugin in the current channel and extract plugin information
    for (const [filename, code] of Object.entries(backup[channel])) {
      // Parse the metadata from the plugin code using the 'parseMeta()' function
      const meta = parseMeta(code)!;
      meta['filename'] = filename;

      // Push the plugin information (metadata and code) to the 'scripts' array
      scripts.push({ meta: meta, code: code });
    }

    // Add the external plugins using the 'self.addUserScripts()' method
    await self.addUserScripts(scripts);
  }

  // If the current channel is different from the default channel,
  // set the default channel using the 'self.setChannel()' method
  if (self.channel !== default_channel) {
    await self.setChannel(default_channel);
  }
};
