// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { isSet, getUID, parseMeta } from './helpers.js';
import type { StorageAPI, StorageData } from './types.js';

export function number_of_migrations(): number {
  return migrates.length;
}

type MigrationFn = (
  storage_iitc_code: StorageData,
  storage_plugins_flat: StorageData,
  storage_plugins_user: StorageData,
  storage_misc: StorageData,
  update_check_interval: StorageData,
  storage_plugins_catalog: StorageData,
  storage_categories: StorageData,
  storage_plugins_local: StorageData,
  storage_global: StorageData,
  storage_iitc_core_user: StorageData
) => Promise<void>;

const migrates: MigrationFn[] = [
  migration_0001,
  migration_0002,
  migration_0003,
  migration_0004,
  migration_0005,
  migration_0006,
  migration_0007,
  migration_0008,
];

export async function migrate(storage: StorageAPI): Promise<boolean> {
  const storage_iitc_code = await storage.get([
    'release_iitc_code',
    'beta_iitc_code',
    'custom_iitc_code',
  ]);
  const storage_plugins_flat = await storage.get([
    'release_plugins_flat',
    'beta_plugins_flat',
    'custom_plugins_flat',
    'test_plugins_flat',
    'local_plugins_flat',
  ]);
  const storage_plugins_catalog = await storage.get([
    'release_plugins_catalog',
    'beta_plugins_catalog',
    'custom_plugins_catalog',
  ]);
  const storage_categories = await storage.get([
    'release_categories',
    'beta_categories',
    'custom_categories',
  ]);
  const storage_plugins_user = await storage.get([
    'release_plugins_user',
    'beta_plugins_user',
    'custom_plugins_user',
    'test_plugins_user',
    'local_plugins_user',
  ]);
  const storage_plugins_local = await storage.get([
    'release_plugins_local',
    'beta_plugins_local',
    'custom_plugins_local',
  ]);
  const storage_misc = await storage.get([
    'channel',
    'network_host',
    'lastversion',
    'storage_version',
  ]);
  const update_check_interval = await storage.get([
    'release_update_check_interval',
    'beta_update_check_interval',
    'custom_update_check_interval',
    'external_update_check_interval',
  ]);

  const storage_iitc_core_user = await storage.get([
    'release_iitc_core_user',
    'beta_iitc_core_user',
    'custom_iitc_core_user',
  ]);

  // Output object for migration_0007+: global plugins_state, plugins_user, iitc_core_user
  const storage_global: StorageData = {};

  if (!isSet(storage_misc['storage_version']) && isSet(storage_misc['lastversion'])) {
    storage_misc['storage_version'] = 0;
  }

  let is_migrated = false;
  for (const migrate of migrates) {
    const index = migrates.indexOf(migrate);
    if (parseInt(storage_misc['storage_version'] as string) < index + 1) {
      await migrate(
        storage_iitc_code,
        storage_plugins_flat,
        storage_plugins_user,
        storage_misc,
        update_check_interval,
        storage_plugins_catalog,
        storage_categories,
        storage_plugins_local,
        storage_global,
        storage_iitc_core_user
      );
      is_migrated = true;
    }
  }

  storage_misc['storage_version'] = migrates.length;
  await storage.set({
    ...storage_iitc_code,
    ...storage_plugins_flat,
    ...storage_plugins_catalog,
    ...storage_plugins_user,
    ...storage_plugins_local,
    ...storage_misc,
    ...update_check_interval,
    ...storage_categories,
    ...storage_iitc_core_user,
    ...storage_global,
  });
  return is_migrated;
}

async function migration_0001(
  _storage_iitc_code: StorageData,
  storage_plugins_flat: StorageData
): Promise<void> {
  for (const channel of Object.keys(storage_plugins_flat)) {
    if (!isSet(storage_plugins_flat[channel])) continue;

    const plugins = storage_plugins_flat[channel] as StorageData;
    for (const plugin of Object.keys(plugins)) {
      const plugin_obj = plugins[plugin] as StorageData;

      if (plugin_obj['user'] === true && plugin_obj['category'] === undefined) {
        plugin_obj['category'] = 'Misc';
      }
    }
  }
}

async function migration_0002(): Promise<void> {}

async function migration_0003(
  _storage_iitc_code: StorageData,
  _storage_plugins_flat: StorageData,
  storage_plugins_user: StorageData,
  storage_misc: StorageData
): Promise<void> {
  if (['test', 'local'].includes(storage_misc.channel as string)) {
    storage_misc.channel = 'release';
    (storage_misc.network_host as StorageData).custom = (
      storage_misc.network_host as StorageData
    ).local;
  }
  if (!['release', 'beta', 'custom'].includes(storage_misc.channel as string)) {
    storage_misc.channel = 'release';
  }
  for (const channel of Object.keys(storage_plugins_user)) {
    if (!isSet(storage_plugins_user[channel])) continue;

    const plugins = storage_plugins_user[channel] as StorageData;
    for (const plugin of Object.keys(plugins)) {
      const plugin_obj = plugins[plugin] as StorageData;

      if (plugin_obj['uid'] === undefined) {
        plugin_obj['uid'] = getUID(plugin_obj as unknown as import('./types.js').PluginMeta);
      }
      if (plugin_obj['status'] === undefined) {
        plugin_obj['status'] = 'off';
      }
    }
  }
}

async function migration_0004(storage_iitc_code: StorageData): Promise<void> {
  for (const channel_iitc_code of Object.keys(storage_iitc_code)) {
    const code = storage_iitc_code[channel_iitc_code] as string;
    const channel = channel_iitc_code.replace('_iitc_code', '');
    delete storage_iitc_code[channel_iitc_code];

    if (isSet(code)) {
      const meta = parseMeta(code) as StorageData;
      meta['code'] = code;
      storage_iitc_code[channel + 'iitc_core'] = meta;
    }
  }
}

async function migration_0005(
  _storage_iitc_code: StorageData,
  _storage_plugins_flat: StorageData,
  _storage_plugins_user: StorageData,
  _storage_misc: StorageData,
  update_check_interval: StorageData
): Promise<void> {
  for (const channel of Object.keys(update_check_interval)) {
    const interval = update_check_interval[channel] as number;
    if (!isSet(interval)) {
      delete update_check_interval[channel];
      continue;
    }
    if (interval !== 24 * 60 * 60) {
      update_check_interval[channel] = interval * 60 * 60;
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

async function migration_0006(
  _storage_iitc_code: StorageData,
  storage_plugins_flat: StorageData,
  _storage_plugins_user: StorageData,
  _storage_misc: StorageData,
  _update_check_interval: StorageData,
  storage_plugins_catalog: StorageData,
  storage_categories: StorageData
): Promise<void> {
  for (const key of Object.keys(storage_plugins_flat)) {
    if (!isSet(storage_plugins_flat[key])) continue;

    const flat = storage_plugins_flat[key] as StorageData;
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

    storage_plugins_catalog[catalogKey] = catalog;
    storage_plugins_flat[key] = null;
  }

  for (const key of Object.keys(storage_categories)) {
    storage_categories[key] = null;
  }
}

async function migration_0007(
  _storage_iitc_code: StorageData,
  _storage_plugins_flat: StorageData,
  storage_plugins_user: StorageData,
  _storage_misc: StorageData,
  _update_check_interval: StorageData,
  _storage_plugins_catalog: StorageData,
  _storage_categories: StorageData,
  storage_plugins_local: StorageData,
  storage_global: StorageData
): Promise<void> {
  const plugins_state: StorageData = {};
  const plugins_user_merged: StorageData = {};

  // Merges status into plugins_state, keeping entry with most recent statusChangedAt
  const mergeState = (uid: string, status: 'on' | 'off', statusChangedAt: number | undefined) => {
    const existing = plugins_state[uid] as StorageData | undefined;
    const existingTs = existing?.['statusChangedAt'] as number | undefined;
    const isNewer =
      !existing ||
      statusChangedAt === undefined ||
      existingTs === undefined ||
      statusChangedAt > existingTs;
    if (isNewer) {
      plugins_state[uid] = statusChangedAt !== undefined ? { status, statusChangedAt } : { status };
    }
  };

  // Merge per-channel plugins_user into global; move status/statusChangedAt to plugins_state
  for (const key of Object.keys(storage_plugins_user)) {
    if (!isSet(storage_plugins_user[key])) continue;
    const channel_plugins = storage_plugins_user[key] as StorageData;
    for (const uid of Object.keys(channel_plugins)) {
      const plugin = channel_plugins[uid] as StorageData;
      mergeState(
        uid,
        (plugin['status'] as 'on' | 'off') || 'off',
        plugin['statusChangedAt'] as number | undefined
      );
      // Conflict: most recently updated/added version wins
      const newTs = (plugin['updatedAt'] as number) || (plugin['addedAt'] as number) || 0;
      const existing = plugins_user_merged[uid] as StorageData | undefined;
      const oldTs = existing
        ? (existing['updatedAt'] as number) || (existing['addedAt'] as number) || 0
        : -1;
      if (!existing || newTs > oldTs) {
        const clean: StorageData = {};
        for (const [f, v] of Object.entries(plugin)) {
          if (f !== 'status' && f !== 'statusChangedAt') clean[f] = v;
        }
        plugins_user_merged[uid] = clean;
      }
    }
    storage_plugins_user[key] = null;
  }

  // Strip status/statusChangedAt from per-channel plugins_local
  for (const key of Object.keys(storage_plugins_local)) {
    if (!isSet(storage_plugins_local[key])) continue;
    const channel_plugins = storage_plugins_local[key] as StorageData;
    const stripped: StorageData = {};
    for (const uid of Object.keys(channel_plugins)) {
      const plugin = channel_plugins[uid] as StorageData;
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
    storage_plugins_local[key] = stripped;
  }

  storage_global['plugins_state'] = plugins_state;
  storage_global['plugins_user'] = plugins_user_merged;
}

async function migration_0008(
  _storage_iitc_code: StorageData,
  _storage_plugins_flat: StorageData,
  _storage_plugins_user: StorageData,
  _storage_misc: StorageData,
  _update_check_interval: StorageData,
  _storage_plugins_catalog: StorageData,
  _storage_categories: StorageData,
  _storage_plugins_local: StorageData,
  storage_global: StorageData,
  storage_iitc_core_user: StorageData
): Promise<void> {
  for (const channel of ['release', 'beta', 'custom']) {
    const key = `${channel}_iitc_core_user`;
    const core = storage_iitc_core_user[key] as StorageData | undefined;
    if (isSet(core) && isSet(core!['code'])) {
      storage_global['iitc_core_user'] = core;
    }
    storage_iitc_core_user[key] = null;
  }
}
