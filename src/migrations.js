// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { isSet, getUID, parseMeta } from './helpers.js';

export function number_of_migrations() {
    return migrates.length;
}

const migrates = [migration_0001, migration_0002, migration_0003, migration_0004, migration_0005];

export async function migrate(storage) {
    const storage_iitc_code = await storage.get(['release_iitc_code', 'beta_iitc_code', 'custom_iitc_code']);
    const storage_plugins_flat = await storage.get([
        'release_plugins_flat',
        'beta_plugins_flat',
        'custom_plugins_flat',
        'test_plugins_flat',
        'local_plugins_flat',
    ]);
    const storage_plugins_user = await storage.get([
        'release_plugins_user',
        'beta_plugins_user',
        'custom_plugins_user',
        'test_plugins_user',
        'local_plugins_user',
    ]);
    const storage_misc = await storage.get(['channel', 'network_host', 'lastversion', 'storage_version']);
    const update_check_interval = await storage.get([
        'release_update_check_interval',
        'beta_update_check_interval',
        'custom_update_check_interval',
        'external_update_check_interval',
    ]);

    if (!isSet(storage_misc['storage_version']) && isSet(storage_misc['lastversion'])) {
        storage_misc['storage_version'] = 0;
    }

    let is_migrated = false;
    for (const migrate of migrates) {
        const index = migrates.indexOf(migrate);
        if (parseInt(storage_misc['storage_version']) < index + 1) {
            await migrate(storage_iitc_code, storage_plugins_flat, storage_plugins_user, storage_misc, update_check_interval);
            is_migrated = true;
        }
    }

    storage_misc['storage_version'] = migrates.length;
    await storage.set({ ...storage_iitc_code, ...storage_plugins_flat, ...storage_plugins_user, ...storage_misc, ...update_check_interval });
    return is_migrated;
}

async function migration_0001(storage_iitc_code, storage_plugins_flat) {
    for (let channel of Object.keys(storage_plugins_flat)) {
        if (!isSet(storage_plugins_flat[channel])) continue;

        for (let plugin of Object.keys(storage_plugins_flat[channel])) {
            const plugin_obj = storage_plugins_flat[channel][plugin];

            if (plugin_obj['user'] === true && plugin_obj['category'] === undefined) {
                plugin_obj['category'] = 'Misc';
            }
        }
    }
}

async function migration_0002() {}

async function migration_0003(storage_iitc_code, storage_plugins_flat, storage_plugins_user, storage_misc) {
    if (['test', 'local'].includes(storage_misc.channel)) {
        storage_misc.channel = 'release';
        storage_misc.network_host.custom = storage_misc.network_host.local;
    }
    if (!['release', 'beta', 'custom'].includes(storage_misc.channel)) {
        storage_misc.channel = 'release';
    }
    for (let channel of Object.keys(storage_plugins_user)) {
        if (!isSet(storage_plugins_user[channel])) continue;

        for (let plugin of Object.keys(storage_plugins_user[channel])) {
            const plugin_obj = storage_plugins_user[channel][plugin];

            if (plugin_obj['uid'] === undefined) {
                plugin_obj['uid'] = getUID(plugin_obj);
            }
            if (plugin_obj['status'] === undefined) {
                plugin_obj['status'] = 'off';
            }
        }
    }
}

async function migration_0004(storage_iitc_code) {
    for (let channel_iitc_code of Object.keys(storage_iitc_code)) {
        const code = storage_iitc_code[channel_iitc_code];
        const channel = channel_iitc_code.replace('_iitc_code', '');
        delete storage_iitc_code[channel_iitc_code];

        if (isSet(code)) {
            storage_iitc_code[channel + 'iitc_core'] = parseMeta(code);
            storage_iitc_code[channel + 'iitc_core']['code'] = code;
        }
    }
}

async function migration_0005(storage_iitc_code, storage_plugins_flat, storage_plugins_user, storage_misc, update_check_interval) {
    for (let channel of Object.keys(update_check_interval)) {
        const interval = update_check_interval[channel];
        if (!isSet(interval)) {
            delete update_check_interval[channel];
            continue;
        }
        if (interval !== 24 * 60 * 60) {
            update_check_interval[channel] = interval * 60 * 60;
        }
    }
}
