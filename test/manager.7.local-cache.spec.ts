// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, StorageData } from '../src/types.js';

describe('plugins_local as a pure code cache', function () {
  const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const intelMatch = ['https://intel.ingress.com/*'];

  function createManager(): Manager {
    storage.resetStorage();
    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: () => {},
      onPluginEvent: () => {},
      onProgress: () => {},
      isDaemon: false,
    };
    return new Manager(params);
  }

  let manager: Manager;
  beforeEach(async function () {
    manager = createManager();
    await manager.run();
    await manager.managePlugin(pluginAUid, 'on');
  });

  it('stores only { code, filename, updatedAt } for an enabled built-in', async function () {
    const db = await storage.get(['release_plugins_local']);
    const local = (db['release_plugins_local'] as StorageData)[pluginAUid] as StorageData;
    expect(Object.keys(local).sort()).to.deep.equal(['code', 'filename', 'updatedAt']);
    // No catalog metadata leaks into the local cache
    expect(local).to.not.have.property('name');
    expect(local).to.not.have.property('version');
    expect(local).to.not.have.property('match');
  });

  it('does not write catalog metadata to local on a forced update', async function () {
    await manager.checkUpdates(true);
    const db = await storage.get(['release_plugins_local']);
    const local = (db['release_plugins_local'] as StorageData)[pluginAUid] as StorageData;
    expect(Object.keys(local).sort()).to.deep.equal(['code', 'filename', 'updatedAt']);
  });

  it('getEnabledPlugins returns match from the catalog even though local has none', async function () {
    const plugins = await manager.getEnabledPlugins();
    expect(plugins[pluginAUid]).to.have.property('code');
    expect(plugins[pluginAUid].match).to.deep.equal(intelMatch);
  });

  it('reflects catalog metadata changes in injection without re-downloading', async function () {
    const before = await storage.get(['release_plugins_catalog', 'release_plugins_local']);
    const catalog = before['release_plugins_catalog'] as StorageData;
    const localBefore = (before['release_plugins_local'] as StorageData)[pluginAUid] as StorageData;

    (catalog[pluginAUid] as StorageData)['version'] = '9.9.9';
    (catalog[pluginAUid] as StorageData)['name'] = 'Renamed A';
    await storage.set({ release_plugins_catalog: catalog });

    const plugins = await manager.getEnabledPlugins();
    expect(plugins[pluginAUid]).to.have.property('version', '9.9.9');
    expect(plugins[pluginAUid]).to.have.property('name', 'Renamed A');

    // Local code cache is untouched (no re-download triggered)
    const after = await storage.get(['release_plugins_local']);
    const localAfter = (after['release_plugins_local'] as StorageData)[pluginAUid] as StorageData;
    expect(localAfter['code']).to.equal(localBefore['code']);
  });

  it('heals a legacy local record with stale metadata from the catalog', async function () {
    // Legacy record: full metadata baked into plugins_local (pre-fix shape)
    const db = await storage.get(['release_plugins_local']);
    const local = db['release_plugins_local'] as StorageData;
    local[pluginAUid] = {
      uid: pluginAUid,
      name: 'Stale Name',
      version: '0.0.0',
      match: [],
      code: '// ==UserScript==\nstale();',
      filename: 'plugin-a.user.js',
    } as Plugin;
    await storage.set({ release_plugins_local: local });

    const plugins = await manager.getEnabledPlugins();
    // Metadata comes from the catalog, not the stale local copy
    expect(plugins[pluginAUid].match).to.deep.equal(intelMatch);
    expect(plugins[pluginAUid]).to.have.property('name', 'Plugin A');
    // Code still comes from the local cache
    expect(plugins[pluginAUid].code).to.include('stale();');
  });

  it('hides a plugin missing from the catalog and restores it when the catalog returns', async function () {
    const full = await storage.get(['release_plugins_catalog']);
    const catalog = full['release_plugins_catalog'] as StorageData;
    const savedEntry = catalog[pluginAUid];

    // Remove from catalog (simulate a transient meta.json gap); local code + state stay
    delete catalog[pluginAUid];
    await storage.set({ release_plugins_catalog: catalog });

    const { plugins: view } = await manager.getPluginsView();
    expect(view).to.not.have.property(pluginAUid);
    const enabled = await manager.getEnabledPlugins();
    expect(enabled).to.not.have.property(pluginAUid);

    // Restore catalog -> plugin reappears and is injectable again
    catalog[pluginAUid] = savedEntry;
    await storage.set({ release_plugins_catalog: catalog });

    const { plugins: view2 } = await manager.getPluginsView();
    expect(view2).to.have.property(pluginAUid);
    const enabled2 = await manager.getEnabledPlugins();
    expect(enabled2).to.have.property(pluginAUid);
    expect(enabled2[pluginAUid].match).to.deep.equal(intelMatch);
  });

  it('injects a user override with its own @match unchanged', async function () {
    manager = createManager();
    await manager.run();
    await manager.addUserScripts([
      {
        meta: {
          namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
          name: 'Plugin A',
          match: ['https://custom.example/*'],
        },
        code: '// ==UserScript==\n// @match https://custom.example/*\nreturn false;',
      },
    ]);

    const plugins = await manager.getEnabledPlugins();
    expect(plugins[pluginAUid].match).to.deep.equal(['https://custom.example/*']);
    expect(plugins[pluginAUid].override).to.be.true;
  });
});
