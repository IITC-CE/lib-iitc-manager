// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, PluginEventData } from '../src/types.js';

// No `channel` in config: the channel is then read from storage asynchronously
const baseConfig: ManagerConfig = {
  storage,
  networkHost: {
    release: 'http://127.0.0.1:31606/release',
    beta: 'http://127.0.0.1:31606/beta',
    custom: 'http://127.0.0.1/',
  },
  isDaemon: false,
};

describe('Public methods wait for initialization', function () {
  it('getUpdateCheckInterval called right after construction reads the stored channel', async function () {
    storage.resetStorage();
    await storage.set({ channel: 'beta', beta_update_check_interval: 3600 });
    const manager = new Manager(baseConfig);
    expect(await manager.getUpdateCheckInterval()).to.equal(3600);
  });

  it('initialization survives a failing migration', async function () {
    storage.resetStorage();
    // migration0003 throws on a legacy channel without network_host
    await storage.set({ channel: 'test', storage_version: 2 });
    const manager = new Manager(baseConfig);
    expect(await manager.getUpdateCheckInterval()).to.equal(24 * 60 * 60);
  });

  describe('storage migrated before run()', function () {
    const uid = 'User plugin+https://example.com';
    const events: PluginEventData[] = [];
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      // Schema before migration0007: per-channel plugins_user with status inside
      await storage.set({
        channel: 'release',
        lastversion: '2.0.0',
        storage_version: 6,
        release_plugins_user: {
          [uid]: {
            uid,
            name: 'User plugin',
            namespace: 'https://example.com',
            match: ['https://intel.ingress.com/*'],
            code: '// ==UserScript==\n// ==/UserScript==',
            status: 'on',
          },
        },
      });
      manager = new Manager({ ...baseConfig, onPluginEvent: e => events.push(e) });
    });

    it('getPluginsView sees migrated user plugin', async function () {
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(uid);
      expect(plugins[uid].status).to.equal('on');
    });

    it('run() re-registers user plugins after migration', async function () {
      await manager.run();
      const userEvents = events.filter(e => uid in e.plugins).map(e => e.event);
      expect(userEvents).to.deep.equal(['remove', 'add']);
    });
  });
});
