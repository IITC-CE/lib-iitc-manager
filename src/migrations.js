//@license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import pkg from 'compare-versions';
const { compare } = pkg;

export async function migrate(storage, last_version) {
    last_version = "0.7.0"
    if (compare(last_version, "2.0.0", "<")) {
        const local = await storage.get([
            "release_plugins_flat",
            "test_plugins_flat",
            "local_plugins_flat"
        ]);

        for (let channel of Object.keys(local)) {
            if (local[channel] === null) continue;

            for (let plugin of Object.keys(local[channel])) {
                const plugin_obj = local[channel][plugin];

                if (plugin_obj["user"] === true && plugin_obj["category"] === undefined) {
                    plugin_obj["category"] = "Misc";
                }
            }
        }

        await storage.set(local);
    }
}
