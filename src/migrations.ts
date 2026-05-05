// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { isSet, getUID, parseMeta } from './helpers.js';
import type { StorageAPI, StorageData } from './types.js';

export function numberOfMigrations(): number {
  return migrates.length;
}

type MigrationFn = (
  storageIitcCode: StorageData,
  storagePluginsFlat: StorageData,
  storagePluginsUser: StorageData,
  storageMisc: StorageData,
  updateCheckInterval: StorageData,
  storagePluginsCatalog: StorageData,
  storageCategories: StorageData,
  storagePluginsLocal: StorageData,
  storageGlobal: StorageData,
  storageIitcCoreUser: StorageData
) => Promise<void>;

const migrates: MigrationFn[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
  migration0007,
  migration0008,
];

export async function migrate(storage: StorageAPI): Promise<boolean> {
  const storageIitcCode = await storage.get([
    'release_iitc_code',
    'beta_iitc_code',
    'custom_iitc_code',
  ]);
  const storagePluginsFlat = await storage.get([
    'release_plugins_flat',
    'beta_plugins_flat',
    'custom_plugins_flat',
    'test_plugins_flat',
    'local_plugins_flat',
  ]);
  const storagePluginsCatalog = await storage.get([
    'release_plugins_catalog',
    'beta_plugins_catalog',
    'custom_plugins_catalog',
  ]);
  const storageCategories = await storage.get([
    'release_categories',
    'beta_categories',
    'custom_categories',
  ]);
  const storagePluginsUser = await storage.get([
    'release_plugins_user',
    'beta_plugins_user',
    'custom_plugins_user',
    'test_plugins_user',
    'local_plugins_user',
  ]);
  const storagePluginsLocal = await storage.get([
    'release_plugins_local',
    'beta_plugins_local',
    'custom_plugins_local',
  ]);
  const storageMisc = await storage.get([
    'channel',
    'network_host',
    'lastversion',
    'storage_version',
  ]);
  const updateCheckInterval = await storage.get([
    'release_update_check_interval',
    'beta_update_check_interval',
    'custom_update_check_interval',
    'external_update_check_interval',
  ]);

  const storageIitcCoreUser = await storage.get([
    'release_iitc_core_user',
    'beta_iitc_core_user',
    'custom_iitc_core_user',
  ]);

  // Output object for migration0007+: global plugins_state, plugins_user, iitc_core_user
  const storageGlobal: StorageData = {};

  if (!isSet(storageMisc['storage_version']) && isSet(storageMisc['lastversion'])) {
    storageMisc['storage_version'] = 0;
  }

  let isMigrated = false;
  for (const migrate of migrates) {
    const index = migrates.indexOf(migrate);
    if (parseInt(storageMisc['storage_version'] as string) < index + 1) {
      await migrate(
        storageIitcCode,
        storagePluginsFlat,
        storagePluginsUser,
        storageMisc,
        updateCheckInterval,
        storagePluginsCatalog,
        storageCategories,
        storagePluginsLocal,
        storageGlobal,
        storageIitcCoreUser
      );
      isMigrated = true;
    }
  }

  storageMisc['storage_version'] = migrates.length;
  await storage.set({
    ...storageIitcCode,
    ...storagePluginsFlat,
    ...storagePluginsCatalog,
    ...storagePluginsUser,
    ...storagePluginsLocal,
    ...storageMisc,
    ...updateCheckInterval,
    ...storageCategories,
    ...storageIitcCoreUser,
    ...storageGlobal,
  });
  return isMigrated;
}

async function migration0001(
  _storageIitcCode: StorageData,
  storagePluginsFlat: StorageData
): Promise<void> {
  for (const channel of Object.keys(storagePluginsFlat)) {
    if (!isSet(storagePluginsFlat[channel])) continue;

    const plugins = storagePluginsFlat[channel] as StorageData;
    for (const plugin of Object.keys(plugins)) {
      const pluginObj = plugins[plugin] as StorageData;

      if (pluginObj['user'] === true && pluginObj['category'] === undefined) {
        pluginObj['category'] = 'Misc';
      }
    }
  }
}

async function migration0002(): Promise<void> {}

async function migration0003(
  _storageIitcCode: StorageData,
  _storagePluginsFlat: StorageData,
  storagePluginsUser: StorageData,
  storageMisc: StorageData
): Promise<void> {
  if (['test', 'local'].includes(storageMisc.channel as string)) {
    storageMisc.channel = 'release';
    (storageMisc.network_host as StorageData).custom = (
      storageMisc.network_host as StorageData
    ).local;
  }
  if (!['release', 'beta', 'custom'].includes(storageMisc.channel as string)) {
    storageMisc.channel = 'release';
  }
  for (const channel of Object.keys(storagePluginsUser)) {
    if (!isSet(storagePluginsUser[channel])) continue;

    const plugins = storagePluginsUser[channel] as StorageData;
    for (const plugin of Object.keys(plugins)) {
      const pluginObj = plugins[plugin] as StorageData;

      if (pluginObj['uid'] === undefined) {
        pluginObj['uid'] = getUID(pluginObj as unknown as import('./types.js').PluginMeta);
      }
      if (pluginObj['status'] === undefined) {
        pluginObj['status'] = 'off';
      }
    }
  }
}

async function migration0004(storageIitcCode: StorageData): Promise<void> {
  for (const channelIitcCode of Object.keys(storageIitcCode)) {
    const code = storageIitcCode[channelIitcCode] as string;
    const channel = channelIitcCode.replace('_iitc_code', '');
    delete storageIitcCode[channelIitcCode];

    if (isSet(code)) {
      const meta = parseMeta(code) as StorageData;
      meta['code'] = code;
      storageIitcCode[channel + '_iitc_core'] = meta;
    }
  }
}

async function migration0005(
  _storageIitcCode: StorageData,
  _storagePluginsFlat: StorageData,
  _storagePluginsUser: StorageData,
  _storageMisc: StorageData,
  updateCheckInterval: StorageData
): Promise<void> {
  for (const channel of Object.keys(updateCheckInterval)) {
    const interval = updateCheckInterval[channel] as number;
    if (!isSet(interval)) {
      delete updateCheckInterval[channel];
      continue;
    }
    if (interval !== 24 * 60 * 60) {
      updateCheckInterval[channel] = interval * 60 * 60;
    }
  }
}

const RUNTIME_PLUGIN_FIELDS = [
  'code',
  'status',
  'user',
  'override',
  'addedAt',
  'statusChangedAt',
  'updatedAt',
];

async function migration0006(
  _storageIitcCode: StorageData,
  storagePluginsFlat: StorageData,
  _storagePluginsUser: StorageData,
  _storageMisc: StorageData,
  _updateCheckInterval: StorageData,
  storagePluginsCatalog: StorageData,
  storageCategories: StorageData
): Promise<void> {
  for (const key of Object.keys(storagePluginsFlat)) {
    if (!isSet(storagePluginsFlat[key])) continue;

    const flat = storagePluginsFlat[key] as StorageData;
    const catalogKey = key.replace('_plugins_flat', '_plugins_catalog');
    const catalog: StorageData = {};

    for (const uid of Object.keys(flat)) {
      const plugin = flat[uid] as StorageData;
      const entry: StorageData = {};
      for (const field of Object.keys(plugin)) {
        if (!RUNTIME_PLUGIN_FIELDS.includes(field)) {
          entry[field] = plugin[field];
        }
      }
      catalog[uid] = entry;
    }

    storagePluginsCatalog[catalogKey] = catalog;
    storagePluginsFlat[key] = null;
  }

  for (const key of Object.keys(storageCategories)) {
    storageCategories[key] = null;
  }
}

async function migration0007(
  _storageIitcCode: StorageData,
  _storagePluginsFlat: StorageData,
  storagePluginsUser: StorageData,
  _storageMisc: StorageData,
  _updateCheckInterval: StorageData,
  _storagePluginsCatalog: StorageData,
  _storageCategories: StorageData,
  storagePluginsLocal: StorageData,
  storageGlobal: StorageData
): Promise<void> {
  const pluginsState: StorageData = {};
  const pluginsUserMerged: StorageData = {};

  // Merges status into plugins_state, keeping entry with most recent statusChangedAt
  const mergeState = (uid: string, status: 'on' | 'off', statusChangedAt: number | undefined) => {
    const existing = pluginsState[uid] as StorageData | undefined;
    const existingTs = existing?.['statusChangedAt'] as number | undefined;
    const isNewer =
      !existing ||
      statusChangedAt === undefined ||
      existingTs === undefined ||
      statusChangedAt > existingTs;
    if (isNewer) {
      pluginsState[uid] = statusChangedAt !== undefined ? { status, statusChangedAt } : { status };
    }
  };

  // Merge per-channel plugins_user into global; move status/statusChangedAt to plugins_state
  for (const key of Object.keys(storagePluginsUser)) {
    if (!isSet(storagePluginsUser[key])) continue;
    const channelPlugins = storagePluginsUser[key] as StorageData;
    for (const uid of Object.keys(channelPlugins)) {
      const plugin = channelPlugins[uid] as StorageData;
      mergeState(
        uid,
        (plugin['status'] as 'on' | 'off') || 'off',
        plugin['statusChangedAt'] as number | undefined
      );
      // Conflict: most recently updated/added version wins
      const newTs = (plugin['updatedAt'] as number) || (plugin['addedAt'] as number) || 0;
      const existing = pluginsUserMerged[uid] as StorageData | undefined;
      const oldTs = existing
        ? (existing['updatedAt'] as number) || (existing['addedAt'] as number) || 0
        : -1;
      if (!existing || newTs > oldTs) {
        const clean: StorageData = {};
        for (const [f, v] of Object.entries(plugin)) {
          if (f !== 'status' && f !== 'statusChangedAt') clean[f] = v;
        }
        pluginsUserMerged[uid] = clean;
      }
    }
    storagePluginsUser[key] = null;
  }

  // Strip status/statusChangedAt from per-channel plugins_local
  for (const key of Object.keys(storagePluginsLocal)) {
    if (!isSet(storagePluginsLocal[key])) continue;
    const channelPlugins = storagePluginsLocal[key] as StorageData;
    const stripped: StorageData = {};
    for (const uid of Object.keys(channelPlugins)) {
      const plugin = channelPlugins[uid] as StorageData;
      mergeState(
        uid,
        (plugin['status'] as 'on' | 'off') || 'off',
        plugin['statusChangedAt'] as number | undefined
      );
      const clean: StorageData = {};
      for (const [f, v] of Object.entries(plugin)) {
        if (f !== 'status' && f !== 'statusChangedAt') clean[f] = v;
      }
      stripped[uid] = clean;
    }
    storagePluginsLocal[key] = stripped;
  }

  storageGlobal['plugins_state'] = pluginsState;
  storageGlobal['plugins_user'] = pluginsUserMerged;
}

async function migration0008(
  _storageIitcCode: StorageData,
  _storagePluginsFlat: StorageData,
  _storagePluginsUser: StorageData,
  _storageMisc: StorageData,
  _updateCheckInterval: StorageData,
  _storagePluginsCatalog: StorageData,
  _storageCategories: StorageData,
  _storagePluginsLocal: StorageData,
  storageGlobal: StorageData,
  storageIitcCoreUser: StorageData
): Promise<void> {
  for (const channel of ['release', 'beta', 'custom']) {
    const key = `${channel}_iitc_core_user`;
    const core = storageIitcCoreUser[key] as StorageData | undefined;
    if (isSet(core) && isSet(core!['code'])) {
      storageGlobal['iitc_core_user'] = core;
    }
    storageIitcCoreUser[key] = null;
  }
}
