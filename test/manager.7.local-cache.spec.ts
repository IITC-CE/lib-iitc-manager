// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type {
  ManagerConfig,
  Plugin,
  PluginDict,
  PluginEventData,
  StorageData,
} from '../src/types.js';

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

  it('emits a one-time remove when an enabled plugin drops from the catalog', async function () {
    const db = await storage.get(['release_plugins_catalog', 'release_plugins_local']);
    const fullCatalog = db['release_plugins_catalog'] as PluginDict;
    const local = db['release_plugins_local'] as PluginDict;

    const catalogWithoutA = { ...fullCatalog };
    delete catalogWithoutA[pluginAUid];

    // First run after the drop: remove once, but keep the cached code
    const res1 = await manager._updateLocalPlugins('release', catalogWithoutA, { ...local });
    expect(res1.removedUids).to.include(pluginAUid);
    expect(res1.pluginsLocal[pluginAUid]).to.have.property('code');

    // Persist the A-less catalog, then run again: stays silent, code still cached
    await storage.set({ release_plugins_catalog: catalogWithoutA });
    const res2 = await manager._updateLocalPlugins('release', catalogWithoutA, res1.pluginsLocal);
    expect(res2.removedUids).to.not.include(pluginAUid);
    expect(res2.pluginsLocal[pluginAUid]).to.have.property('code');

    // Catalog returns: A is re-fetched and surfaces again for the host to re-inject
    const res3 = await manager._updateLocalPlugins('release', fullCatalog, res2.pluginsLocal);
    expect(res3.updatedUids).to.include(pluginAUid);
  });

  it('does not inject or emit when re-enabling a catalog-absent cached plugin', async function () {
    // Cache the code, then disable so managePlugin('on') hits the cached-entry branch
    await manager.managePlugin(pluginAUid, 'off');

    // Drop from the catalog (transient gap); local code + state stay
    const db = await storage.get(['release_plugins_catalog']);
    const catalog = db['release_plugins_catalog'] as StorageData;
    delete catalog[pluginAUid];
    await storage.set({ release_plugins_catalog: catalog });

    let injected = 0;
    const events: PluginEventData[] = [];
    manager.injectPlugin = () => {
      injected += 1;
    };
    manager.onPluginEvent = (event: PluginEventData) => events.push(event);

    await manager.managePlugin(pluginAUid, 'on');

    // Stays silent: nothing injected and no event carries the plugin
    expect(injected).to.equal(0);
    const emittedForA = events.some(event =>
      Object.prototype.hasOwnProperty.call(event.plugins, pluginAUid)
    );
    expect(emittedForA).to.be.false;

    // State is still enabled, so it restores once the catalog returns
    const state = await storage.get(['plugins_state']);
    expect((state['plugins_state'] as StorageData)[pluginAUid]).to.have.property('status', 'on');
  });

  it('does not one-time-remove a plugin that has an active user override', async function () {
    // Override the enabled built-in; local[A] (cache) and user[A] (override) now coexist
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

    const db = await storage.get(['release_plugins_catalog', 'release_plugins_local']);
    const catalogWithoutA = { ...(db['release_plugins_catalog'] as PluginDict) };
    delete catalogWithoutA[pluginAUid];
    const local = db['release_plugins_local'] as PluginDict;

    // The override keeps the plugin active, so dropping the built-in from the
    // catalog must not emit a remove for it.
    const res = await manager._updateLocalPlugins('release', catalogWithoutA, { ...local });
    expect(res.removedUids).to.not.include(pluginAUid);

    // Parity: getEnabledPlugins still injects the override
    await storage.set({ release_plugins_catalog: catalogWithoutA });
    const enabled = await manager.getEnabledPlugins();
    expect(enabled).to.have.property(pluginAUid);
    expect(enabled[pluginAUid].match).to.deep.equal(['https://custom.example/*']);
  });
});
