// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, PluginEventData, StorageData } from '../src/types.js';

const baseConfig: Omit<ManagerConfig, 'channel' | 'onPluginEvent'> = {
  storage,
  networkHost: {
    release: 'http://127.0.0.1:31606/release',
    beta: 'http://127.0.0.1:31606/beta',
    custom: 'http://127.0.0.1/',
  },
  injectPlugin: () => {},
  onProgress: () => {},
  isDaemon: false,
};

describe('Cross-channel plugin state preservation', function () {
  const firstPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const drawToolsUid = 'Beta plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

  describe('Beta-only plugin state survives channel switch and recovers on return', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager({ ...baseConfig, channel: 'release', onPluginEvent: () => {} });
      await manager.run();
      await manager.setChannel('beta');
      await manager.managePlugin(drawToolsUid, 'on');
    });

    it('Beta plugin A is enabled in beta', async function () {
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(drawToolsUid);
      expect(plugins[drawToolsUid].status).to.equal('on');
    });

    it('plugins_state records Beta plugin A as on', async function () {
      const db = await storage.get(['plugins_state']);
      const state = (db['plugins_state'] as StorageData)[drawToolsUid] as StorageData;
      expect(state?.status).to.equal('on');
    });

    it('after switching to release: Beta plugin A absent from getPluginsView()', async function () {
      await manager.setChannel('release');
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.not.have.property(drawToolsUid);
    });

    it('after switching to release: plugins_state still records Beta plugin A as on', async function () {
      const db = await storage.get(['plugins_state']);
      const state = (db['plugins_state'] as StorageData)[drawToolsUid] as StorageData;
      expect(state?.status).to.equal('on');
    });

    it('after switching back to beta: Beta plugin A is visible and enabled', async function () {
      const drawEvents: PluginEventData[] = [];
      manager.onPluginEvent = (data: PluginEventData) => {
        if (drawToolsUid in data.plugins) drawEvents.push(data);
      };
      await manager.setChannel('beta');
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(drawToolsUid);
      expect(plugins[drawToolsUid].status).to.equal('on');
      const injectEvent = drawEvents.find(e => e.event === 'add' || e.event === 'update');
      expect(injectEvent, 'add or update event must fire').to.exist;
      const plugin = injectEvent!.plugins[drawToolsUid] as Plugin;
      expect(plugin.code, 'plugin in event must carry code, not be empty')
        .to.be.a('string')
        .and.include('// ==UserScript==');
    });
  });

  describe('User plugin visible across all channels', function () {
    let manager: Manager;
    const userUid = 'My Plugin+https://github.com/IITC-CE/ingress-intel-total-conversion';

    before(async function () {
      storage.resetStorage();
      manager = new Manager({ ...baseConfig, channel: 'release', onPluginEvent: () => {} });
      await manager.run();
      await manager.addUserScripts([
        {
          meta: {
            id: 'my-plugin',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'My Plugin',
            category: 'Misc',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
    });

    it('user plugin visible in release with status on', async function () {
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(userUid);
      expect(plugins[userUid].status).to.equal('on');
      expect(plugins[userUid].user).to.be.true;
    });

    it('user plugin still visible after switching to beta', async function () {
      await manager.setChannel('beta');
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(userUid);
      expect(plugins[userUid].status).to.equal('on');
    });

    it('user plugin still visible after switching back to release', async function () {
      await manager.setChannel('release');
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(userUid);
      expect(plugins[userUid].status).to.equal('on');
    });

    it('user plugin stored in global plugins_user, not channel-prefixed', async function () {
      const db = await storage.get(['plugins_user', 'release_plugins_user', 'beta_plugins_user']);
      expect(db['plugins_user'] as StorageData).to.have.property(userUid);
      // channel-prefixed keys must not exist (migration to global storage)
      expect(db['release_plugins_user']).to.be.null;
      expect(db['beta_plugins_user']).to.be.null;
    });
  });

  describe('Delete user override of built-in globally disables plugin via plugins_state', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager({ ...baseConfig, channel: 'release', onPluginEvent: () => {} });
      await manager.run();
      await manager.managePlugin(firstPluginUid, 'on');
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Plugin A',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
    });

    it('override is active before deletion', async function () {
      const info = await manager.getPluginInfo(firstPluginUid);
      expect(info!.override).to.be.true;
      expect(info!.status).to.equal('on');
    });

    it('after delete: plugins_state[uid].status is off', async function () {
      await manager.managePlugin(firstPluginUid, 'delete');
      const db = await storage.get(['plugins_state']);
      const state = (db['plugins_state'] as StorageData)[firstPluginUid] as StorageData;
      expect(state?.status).to.equal('off');
    });

    it('after delete: plugin no longer in global plugins_user', async function () {
      const db = await storage.get(['plugins_user']);
      expect(db['plugins_user'] as StorageData).to.not.have.property(firstPluginUid);
    });

    it('after switching to beta: plugin remains globally off', async function () {
      await manager.setChannel('beta');
      const { plugins } = await manager.getPluginsView();
      expect(plugins[firstPluginUid].status).to.not.equal('on');
    });
  });

  describe('Catalog catch-up: enabled plugin auto-downloaded when it appears in catalog', function () {
    let manager: Manager;
    const seenEvents: PluginEventData[] = [];

    before(async function () {
      storage.resetStorage();
      // Simulate scenario: plugins_state says Beta plugin A is on but local cache is empty.
      // This can happen after a storage migration or when switching to a channel that
      // now includes a plugin the user had previously enabled.
      await storage.set({
        plugins_state: { [drawToolsUid]: { status: 'on' } },
        beta_plugins_local: {},
      });
      manager = new Manager({
        ...baseConfig,
        channel: 'beta',
        onPluginEvent: (data: PluginEventData) => {
          if (drawToolsUid in data.plugins) seenEvents.push(data);
        },
      });
      await manager.run();
    });

    it('Beta plugin A code is present in beta_plugins_local after run()', async function () {
      const db = await storage.get(['beta_plugins_local']);
      const local = db['beta_plugins_local'] as StorageData;
      expect(local).to.have.property(drawToolsUid);
      const plugin = local[drawToolsUid] as StorageData;
      expect(plugin.code).to.be.a('string').and.include('// ==UserScript==');
    });

    it('add event for Beta plugin A carries plugin code, not an empty object', async function () {
      const addEvent = seenEvents.find(e => e.event === 'add');
      expect(addEvent, 'add event must fire').to.exist;
      const plugin = addEvent!.plugins[drawToolsUid] as Plugin;
      expect(plugin.code, 'plugin in add event must carry code, not be empty')
        .to.be.a('string')
        .and.include('// ==UserScript==');
    });
  });
});
