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
  update_check_interval: StorageData
) => Promise<void>;

const migrates: MigrationFn[] = [
  migration_0001,
  migration_0002,
  migration_0003,
  migration_0004,
  migration_0005,
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
  const storage_plugins_user = await storage.get([
    'release_plugins_user',
    'beta_plugins_user',
    'custom_plugins_user',
    'test_plugins_user',
    'local_plugins_user',
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
        update_check_interval
      );
      is_migrated = true;
    }
  }

  storage_misc['storage_version'] = migrates.length;
  await storage.set({
    ...storage_iitc_code,
    ...storage_plugins_flat,
    ...storage_plugins_user,
    ...storage_misc,
    ...update_check_interval,
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
