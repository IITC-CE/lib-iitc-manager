// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

export async function migrate(storage) {

    const migrates = [
        migration_0001
    ];
    const local = await storage.get([
        'release_plugins_flat',
        'test_plugins_flat',
        'local_plugins_flat',
        'lastversion',
        'storage_version'
    ]);

    if (local['storage_version'] === null && local['lastversion'] !== null) {
        local['storage_version'] = 0;
    }

    let is_migrated = false;
    for (const migrate of migrates) {
        const index = migrates.indexOf(migrate);
        if (parseInt(local['storage_version']) < index+1) {
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
        if (local[channel] === null) continue;

        for (let plugin of Object.keys(local[channel])) {
            const plugin_obj = local[channel][plugin];

            if (plugin_obj['user'] === true && plugin_obj['category'] === undefined) {
                plugin_obj['category'] = 'Misc';
            }
        }
    }
}
