// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { isSet, getUID } from './helpers.js';

export function number_of_migrations() {
    return migrates.length;
}

const migrates = [migration_0001, migration_0002, migration_0003];

export async function migrate(storage) {
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

    if (!isSet(storage_misc['storage_version']) && isSet(storage_misc['lastversion'])) {
        storage_misc['storage_version'] = 0;
    }

    let is_migrated = false;
    for (const migrate of migrates) {
        const index = migrates.indexOf(migrate);
        if (parseInt(storage_misc['storage_version']) < index + 1) {
            await migrate(storage_plugins_flat, storage_plugins_user, storage_misc);
            is_migrated = true;
        }
    }

    storage_misc['storage_version'] = migrates.length;
    await storage.set({ ...storage_plugins_flat, ...storage_plugins_user, ...storage_misc });
    return is_migrated;
}

async function migration_0001(storage_plugins_flat) {
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

async function migration_0003(storage_plugins_flat, storage_plugins_user, storage_misc) {
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
