// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { isSet } from './helpers.js';

export function number_of_migrations() {
    return migrates.length;
}

const migrates = [migration_0001, migration_0002];

export async function migrate(storage) {
    const local = await storage.get(['release_plugins_flat', 'test_plugins_flat', 'local_plugins_flat', 'lastversion', 'storage_version']);

    if (!isSet(local['storage_version']) && isSet(local['lastversion'])) {
        local['storage_version'] = 0;
    }

    let is_migrated = false;
    for (const migrate of migrates) {
        const index = migrates.indexOf(migrate);
        if (parseInt(local['storage_version']) < index + 1) {
            await migrate(local);
            is_migrated = true;
        }
    }

    local['storage_version'] = migrates.length;
    await storage.set(local);
    return is_migrated;
}

async function migration_0001(local) {
    for (let channel of Object.keys(local)) {
        if (!isSet(local[channel])) continue;

        for (let plugin of Object.keys(local[channel])) {
            const plugin_obj = local[channel][plugin];

            if (plugin_obj['user'] === true && plugin_obj['category'] === undefined) {
                plugin_obj['category'] = 'Misc';
            }
        }
    }
}

async function migration_0002(local) {
    if (['test', 'local'].includes(local.channel)) {
        local.channel = 'release';
        local.network_host.custom = local.network_host.local;
    }
}
