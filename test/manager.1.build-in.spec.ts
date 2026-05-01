// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, PluginEventData, StorageData } from '../src/types.js';

describe('manage.js build-in plugins integration tests', function () {
  let manager: Manager | null = null;
  let pluginEventCallback = (data: PluginEventData) => {
    expect(data).to.have.all.keys('event', 'plugins');
    expect(data['event']).to.equal('update');
    expect(data['plugins']).to.have.all.keys(IITC_CORE_UID);
    expect(data['plugins'][IITC_CORE_UID]).to.have.property('uid', IITC_CORE_UID);
  };
  before(function () {
    storage.resetStorage();
    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: (data: Plugin) => {
        expect(data['code']).to.include('// ==UserScript==');
      },
      onPluginEvent: (data: PluginEventData) => {
        pluginEventCallback(data);
      },
      onProgress: (isShow: boolean) => {
        expect(isShow).to.be.oneOf([true, false]);
      },
      isDaemon: false,
    };
    manager = new Manager(params);
  });

  const firstPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const secondPluginUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const thirdPluginUid = 'Plugin C+https://github.com/IITC-CE/ingress-intel-total-conversion';

  describe('run', function () {
    it('Should not return an error', async function () {
      const run = await manager!.run();
      expect(run).to.be.undefined;
    });
  });

  describe('Manage build-in plugins', function () {
    it('Enable first plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(firstPluginUid);
        expect(data['plugins'][firstPluginUid]).to.have.property('uid', firstPluginUid);
      };

      const run = await manager!.managePlugin(firstPluginUid, 'on');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'release_plugins_local',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsLocal = dbData['release_plugins_local'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsLocal, 'release_plugins_local').to.have.all.keys(firstPluginUid);

      expect(
        (pluginsState[firstPluginUid] as StorageData)['status'],
        'pluginsState: ' + firstPluginUid
      ).to.equal('on');
      const { plugins: allPlugins1 } = await manager!.getPluginsView();
      expect(
        allPlugins1[secondPluginUid]['status'],
        'getPluginsView(): ' + secondPluginUid
      ).to.not.equal('on');
    });

    it('Enable second plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(secondPluginUid);
        expect(data['plugins'][secondPluginUid]).to.have.property('uid', secondPluginUid);
      };

      const run = await manager!.managePlugin(secondPluginUid, 'on');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'release_plugins_local',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsLocal = dbData['release_plugins_local'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsLocal, 'release_plugins_local').to.have.all.keys(
        firstPluginUid,
        secondPluginUid
      );

      expect(
        (pluginsState[firstPluginUid] as StorageData)['status'],
        'pluginsState: ' + firstPluginUid
      ).to.equal('on');

      expect(
        (pluginsState[secondPluginUid] as StorageData)['status'],
        'pluginsState: ' + secondPluginUid
      ).to.equal('on');
    });

    it('Disable plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(firstPluginUid);
        expect(data['plugins'][firstPluginUid]).to.be.empty;
      };

      const run = await manager!.managePlugin(firstPluginUid, 'off');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'release_plugins_local',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsLocal = dbData['release_plugins_local'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsLocal, 'release_plugins_local').to.have.all.keys(
        firstPluginUid,
        secondPluginUid
      );

      expect(
        (pluginsState[firstPluginUid] as StorageData)['status'],
        'pluginsState: ' + firstPluginUid
      ).to.equal('off');

      expect(
        (pluginsState[secondPluginUid] as StorageData)['status'],
        'pluginsState: ' + secondPluginUid
      ).to.equal('on');
    });

    it('Info about plugin', async function () {
      const info = await manager!.getPluginInfo(firstPluginUid);
      expect(info).to.be.an('object');
      expect(info!['uid']).to.be.equal(firstPluginUid);
      expect(info!['status']).to.be.equal('off');
    });
  });
});

describe('Delete external plugins - comprehensive tests', function () {
  let manager: Manager | null = null;
  const externalPluginUid = 'Test Plugin+https://github.com/IITC-CE/ingress-intel-total-conversion';

  // Track plugin events for verification
  let receivedPluginEvent: PluginEventData | null = null;
  const pluginEventCallback = (data: PluginEventData) => {
    receivedPluginEvent = data;
  };

  before(function () {
    storage.resetStorage();
    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: (data: Plugin) => {
        expect(data['code']).to.include('// ==UserScript==');
      },
      onPluginEvent: (data: PluginEventData) => {
        pluginEventCallback(data);
      },
      onProgress: (isShow: boolean) => {
        expect(isShow).to.be.oneOf([true, false]);
      },
      isDaemon: false,
    };
    manager = new Manager(params);
  });

  beforeEach(function () {
    storage.resetStorage();
    receivedPluginEvent = null;
  });

  // Test deletion of active external plugin
  it('should correctly delete active external plugin', async function () {
    // Setup: Add external plugin with status 'on'
    const pluginData = {
      meta: {
        id: 'test-plugin',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Test Plugin',
        category: 'Test',
      },
      code: '// ==UserScript==\nreturn false;',
    };

    await manager!.addUserScripts([pluginData]);

    // Delete the plugin
    await manager!.managePlugin(externalPluginUid, 'delete');

    // Verify storage state
    const storageAfter = await manager!.storage.get(['plugins_user']);

    // Verify plugin was removed from user plugins
    expect(storageAfter['plugins_user']).to.be.empty;

    // Verify plugin event was fired (since plugin was active)
    expect(receivedPluginEvent).to.have.property('event', 'remove');
    expect(receivedPluginEvent!.plugins).to.have.property(externalPluginUid);
  });

  // Test deletion of inactive external plugin
  it('should correctly delete inactive external plugin without firing event', async function () {
    // Setup: Add external plugin and set it to 'off'
    const pluginData = {
      meta: {
        id: 'test-plugin',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Test Plugin',
        category: 'Test',
      },
      code: '// ==UserScript==\nreturn false;',
    };

    await manager!.addUserScripts([pluginData]);
    await manager!.managePlugin(externalPluginUid, 'off');

    // Reset event tracking before deletion
    receivedPluginEvent = null;

    // Delete the plugin
    await manager!.managePlugin(externalPluginUid, 'delete');

    // Verify storage state
    const storageAfter = await manager!.storage.get(['plugins_user']);

    // Verify plugin was removed from user plugins
    expect(storageAfter['plugins_user']).to.be.empty;

    // Verify no plugin event was fired (since plugin was inactive)
    expect(receivedPluginEvent).to.be.null;
  });

  // Test deletion of external plugin that overrides built-in plugin
  it('should correctly handle deletion of plugin with override flag', async function () {
    // First, load built-in plugins through manager.run()
    const run = await manager!.run();
    expect(run).to.be.undefined;

    // Setup: Add external plugin that overrides built-in plugin
    const builtInUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const overridePlugin = {
      meta: {
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Plugin A',
      },
      code: '// ==UserScript==\nreturn false;',
    };

    // Add overriding plugin
    await manager!.addUserScripts([overridePlugin]);

    // Verify override flag is set before deletion
    const pluginBefore = await manager!.getPluginInfo(builtInUid);
    expect(pluginBefore!.override).to.be.true;
    expect(pluginBefore!.user).to.be.true;
    expect(pluginBefore!.status).to.equal('on');

    // Delete the plugin
    await manager!.managePlugin(builtInUid, 'delete');

    // Verify storage state after deletion
    const storageAfter = await manager!.storage.get(['plugins_user']);

    // Verify plugin was removed from user plugins
    expect(storageAfter['plugins_user']).to.be.empty;

    const pluginAfter = await manager!.getPluginInfo(builtInUid);
    // Verify built-in plugin was restored to original state
    expect(pluginAfter!.override).to.not.be.true;
    expect(pluginAfter!.user).to.not.be.true;
    expect(pluginAfter!.status).to.not.equal('on');
  });

  describe('Timestamps for built-in plugins', function () {
    let manager: Manager | null = null;
    const builtInPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

    beforeEach(async function () {
      // Reset storage before each test
      storage.resetStorage();
      manager = new Manager({
        storage: storage,
        channel: 'release',
        networkHost: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        injectPlugin: (data: Plugin) => {
          expect(data['code']).to.include('// ==UserScript==');
        },
        onPluginEvent: () => {},
        onProgress: (isShow: boolean) => {
          expect(isShow).to.be.oneOf([true, false]);
        },
        isDaemon: false,
      });

      // Initialize built-in plugins
      await manager.run();
    });

    it('should set statusChangedAt when enabling built-in plugin first time', async function () {
      // Enable plugin
      await manager!.managePlugin(builtInPluginUid, 'on');

      const dbData = await storage.get(['plugins_state', 'release_plugins_local']);
      const state = (dbData['plugins_state'] as StorageData)[builtInPluginUid] as StorageData;

      // Check statusChangedAt set in plugins_state
      expect(state).to.have.property('statusChangedAt');

      // Local code cache should not have addedAt (built-in plugins don't have addedAt)
      const localPlugin = (dbData['release_plugins_local'] as StorageData)[
        builtInPluginUid
      ] as StorageData;
      expect(localPlugin).to.not.have.property('addedAt');
    });

    it('should update statusChangedAt when toggling built-in plugin', async function () {
      // First enable
      await manager!.managePlugin(builtInPluginUid, 'on');
      const before = await storage.get(['plugins_state']);
      const initialStatusChangedAt = (
        (before['plugins_state'] as StorageData)[builtInPluginUid] as StorageData
      ).statusChangedAt as number;

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Disable plugin
      await manager!.managePlugin(builtInPluginUid, 'off');

      const after = await storage.get(['plugins_state']);
      const afterState = (after['plugins_state'] as StorageData)[builtInPluginUid] as StorageData;

      // Check statusChangedAt updated
      expect(afterState.statusChangedAt as number).to.be.above(initialStatusChangedAt);
    });

    it('should set updatedAt when updating built-in plugin', async function () {
      // First enable plugin to get it downloaded
      await manager!.managePlugin(builtInPluginUid, 'on');

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force update check
      await manager!.checkUpdates(true);

      const dbData = await storage.get(['release_plugins_local']);
      const localPlugin = (dbData['release_plugins_local'] as StorageData)[
        builtInPluginUid
      ] as StorageData;

      // Check updatedAt is set in local code cache
      expect(localPlugin).to.have.property('updatedAt');
    });
  });
});
