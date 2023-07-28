// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { parseMeta } from './helpers.js';
import deepmerge from '@bundled-es-modules/deepmerge';

/**
 * Processes the input parameters for backup data retrieval.
 *
 * This function takes an input object containing parameters for backup data retrieval
 * and returns a new object with processed parameters. If the input parameters are not
 * an object, an empty object is used as the default value. The function combines the
 * input parameters with default parameters to ensure all required properties are present.
 *
 * @param {BackupParams} params - The parameters for setting the backup data.
 * @returns {Object} The processed parameters object.
 */
export function paramsProcessing(params) {
    if (typeof params !== 'object') params = {};

    // Default parameters
    const default_params = {
        settings: false,
        data: false,
        external: false,
    };

    // Combine the default parameters with the input parameters using spread syntax
    return { ...default_params, ...params };
}

/**
 * Exports specific IITC settings from the provided storage object.
 *
 * This function takes a storage object and extracts specific IITC settings based on
 * predefined keys. It creates a new object containing only the specified IITC settings
 * and returns it.
 *
 * @param {Object} all_storage - The storage object containing all data.
 * @returns {Object} An object containing specific IITC settings.
 */
export const exportIitcSettings = (all_storage) => {
    const iitc_settings = {};

    // An array of predefined keys for IITC settings
    const storage_keys = ['channel', 'network_host', 'release_update_check_interval', 'beta_update_check_interval', 'custom_update_check_interval'];

    // Loop through all_storage and check if the keys are present in storage_keys
    // If present, add them to the iitc_settings object
    for (const key in all_storage) {
        if (storage_keys.includes(key)) {
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
 * @param {Object} all_storage - The storage object containing all data.
 * @returns {Object} An object containing specific plugin settings.
 */
export const exportPluginsSettings = (all_storage) => {
    const plugins_storage = {};

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
 * Exports external plugins from the provided storage object.
 *
 * This function takes a storage object and extracts external plugins based on predefined keys.
 * It creates a new object containing the external plugins organized by their channels and filenames,
 * and returns it.
 *
 * @param {Object} all_storage - The storage object containing all data.
 * @returns {Object} An object containing external plugins organized by channels and filenames.
 */
export const exportExternalPlugins = (all_storage) => {
    const external_plugins = {};

    // An array of predefined keys for external plugins
    const storage_keys = ['release_plugins_user', 'beta_plugins_user', 'custom_plugins_user'];

    // Loop through all_storage and check if the keys are present in storage_keys
    // If present, process and add the external plugins to the external_plugins object
    for (const key in all_storage) {
        if (storage_keys.includes(key)) {
            // Extract the channel name from the key by splitting at '_'
            const channel = key.split('_')[0];
            external_plugins[channel] = {};

            // Loop through each plugin UID in the current key's storage data
            for (const plugin_uid in all_storage[key]) {
                // Get the plugin's filename and code from the storage data and add to the external_plugins object
                const plugin_filename = all_storage[key][plugin_uid]['filename'];
                external_plugins[channel][plugin_filename] = all_storage[key][plugin_uid]['code'];
            }
        }
    }

    return external_plugins;
};

/**
 * Imports IITC settings from the provided backup object.
 *
 * @async
 * @param {Object} self - IITC manager object.
 * @param {Object} backup - The backup object containing IITC settings to import.
 * @returns {Promise<void>} A promise that resolves when the import is complete.
 */
export const importIitcSettings = async (self, backup) => {
    const backup_obj = Object.assign({}, backup);
    const default_channel = self.channel;

    // Set the IITC settings from the backup object into the storage
    await self.storage.set(backup_obj);

    // Check if the channel in the backup object is different from the original channel
    const set_channel = backup_obj.channel;
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
 * @async
 * @param {Object} self - IITC manager object.
 * @param {Object} backup - The backup object containing plugin settings to import.
 * @returns {Promise<void>} A promise that resolves when the import is complete.
 */
export const importPluginsSettings = async (self, backup) => {
    const all_storage = await self.storage.get(null);

    // Create a new object containing only plugin-related data (keys starting with 'VMin')
    const vMinRecords = {};
    Object.keys(all_storage).forEach((key) => {
        if (key.startsWith('VMin')) {
            vMinRecords[key] = all_storage[key];
        }
    });

    // Merge the 'vMinRecords' object with the provided backup object and set into storage
    const new_storage = deepmerge(vMinRecords, backup);
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
 * @async
 * @param {Object} self - IITC manager object.
 * @param {Object} backup - The backup object containing external plugins to import.
 * @returns {Promise<void>} A promise that resolves when the import is complete.
 */
export const importExternalPlugins = async (self, backup) => {
    const default_channel = self.channel;

    // Iterate through each channel in the backup object
    for (const channel of Object.keys(backup)) {
        // Initialize an empty array to store the plugin information (metadata and code)
        const scripts = [];
        await self.setChannel(channel);

        // Iterate through each plugin in the current channel and extract plugin information
        for (const [filename, code] of Object.entries(backup[channel])) {
            // Parse the metadata from the plugin code using the 'parseMeta()' function
            const meta = parseMeta(code);
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
