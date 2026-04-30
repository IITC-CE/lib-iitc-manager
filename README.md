# lib IITC manager

Library for managing [IITC and plugins](https://iitc.app/).

## Getting started

```
npm install lib-iitc-manager --save
```

## Usage

Example code to use in WebExtension.
Imports the library, passes environment parameters and starts loading IITC and plugins.

```js
import { Manager } from 'lib-iitc-manager';

const manager = new Manager({
    storage: browser.storage.local,
    message: (message, args) => {
        console.log("Message for user:", message, args);
    },
    progressbar: is_show => {
        console.log(is_show ? "Show progress bar" : "Hide progress bar");
    },
    inject_plugin: plugin => {
        console.log("Injecting plugin:", plugin.name);
        console.log(plugin.code);
    },
    plugins_view_changed: ({ plugins, categories }) => {
        // Called whenever the plugin set changes.
        // plugins - merged view of all plugins (catalog + state + user overrides).
        // categories - non-empty categories derived from plugins, sorted alphabetically.
        console.log("Plugin list updated:", Object.keys(plugins).length, "plugins");
        console.log("Categories:", Object.keys(categories));
    },
});

manager.run().then();
```

### Getting the current plugin list and categories

```js
const { plugins, categories } = await manager.getPluginsView();

// plugins is a PluginDict - keyed by uid, each entry is a merged Plugin object.
// Fields: uid, name, category, status ('on'/'off'), user, override, code, ...
for (const [uid, plugin] of Object.entries(plugins)) {
    console.log(uid, plugin.status, plugin.user ? '(user)' : '');
}

// categories is a CategoryViewDict - keyed by category name, sorted alphabetically.
// Each entry: { name: string, isNew: boolean }
// isNew is true if any plugin in that category was added within new_plugin_threshold seconds.
for (const [name, cat] of Object.entries(categories)) {
    console.log(name, cat.isNew ? '(new)' : '');
}
```

### Reacting to plugin list changes

Pass `plugins_view_changed` in the config (see above), or poll with `getPluginsView()` as needed.

### Example of use helpers

```js
import { getUniqId } from "lib-iitc-manager";

const uniqId = getUniqId("tmp");
```

[See more in documentation](https://iitc-ce.github.io/lib-iitc-manager/)

## Storage layout

The library uses two kinds of storage keys.

**Global keys** - shared across all channels:

| Key | Description |
|---|---|
| `channel` | Active update channel (`release`, `beta`, or `custom`) |
| `network_host` | Repository URLs per channel |
| `storage_version` | Schema version; incremented automatically during migrations |
| `last_check_update` | Unix timestamp of the last built-in plugin update check |
| `last_check_external_update` | Unix timestamp of the last user-plugin update check |
| `plugins_state` | `{ [uid]: { status, statusChangedAt? } }` - enabled/disabled state for every plugin the user has ever touched |
| `plugins_user` | `{ [uid]: Plugin }` - user-installed scripts (custom plugins and IITC core overrides) |
| `iitc_core_user` | Custom IITC core script uploaded by the user, or `null` |

**Channel-specific keys** - `{channel}` is one of `release`, `beta`, `custom`:

| Key | Description |
|---|---|
| `{channel}_iitc_core` | IITC core script downloaded from the channel server |
| `{channel}_iitc_version` | IITC version string for the channel |
| `{channel}_last_modified` | ETag / Last-Modified value from the channel's `meta.json` |
| `{channel}_plugins_catalog` | `{ [uid]: Plugin }` - plugin metadata fetched from the remote catalog |
| `{channel}_plugins_local` | `{ [uid]: Plugin }` - downloaded plugin code cache |
| `{channel}_update_check_interval` | Update check interval in seconds for IITC and built-in plugins |

## Migrating from v1

### `plugins_flat` and `${channel}_categories` removed

`${channel}_plugins_flat` and `${channel}_categories` is no longer written to storage. Plugins and categories are computed on demand from the plugin set and returned as part of `PluginsView`.

### `${channel}_plugins_state` and `${channel}_plugins_user` merged into global keys

Per-channel state keys (`release_plugins_state`, `beta_plugins_state`, …) and per-channel user-plugin keys (`release_plugins_user`, …) have been replaced by a single `plugins_state` and `plugins_user` shared across all channels. The migration runs automatically on the first `run()` call.

### `${channel}_iitc_core_user` merged into global `iitc_core_user`

The custom IITC core script was previously stored under per-channel keys (`release_iitc_core_user`, …). It is now stored in a single `iitc_core_user` key shared across all channels. The migration runs automatically on the first `run()` call.

## License

lib-iitc-manager is licensed under [GNU General Public License v3.0 (GPL-3.0)](/LICENSE).
For distribution through application stores (Apple App Store, Google Play Store, and others),
please refer to the [COPYING.STORE](/COPYING.STORE) file, which provides an exception for the application store
distribution requirements while maintaining GPL-3.0 compliance for the source code.
