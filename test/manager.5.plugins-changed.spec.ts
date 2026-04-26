// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, PluginDict } from '../src/types.js';

/**
 * Returns a Promise that resolves with the next plugins_changed invocation payload.
 * Replaces the callback with a one-shot wrapper, then restores the original.
 */
function nextPluginsChanged(manager: Manager): Promise<PluginDict> {
  return new Promise<PluginDict>(resolve => {
    const prev = manager.plugins_changed;
    manager.plugins_changed = (plugins: PluginDict) => {
      manager.plugins_changed = prev;
      if (prev) prev(plugins);
      resolve(plugins);
    };
  });
}

describe('plugins_changed callback', function () {
  const first_plugin_uid =
    'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const second_plugin_uid = 'Bing maps+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const third_plugin_uid = 'Missions+https://github.com/IITC-CE/ingress-intel-total-conversion';

  const base_config: Omit<ManagerConfig, 'plugins_changed'> = {
    storage,
    channel: 'release',
    network_host: {
      release: 'http://127.0.0.1:31606/release',
      beta: 'http://127.0.0.1:31606/beta',
      custom: 'http://127.0.0.1/',
    },
    inject_user_script: () => {},
    inject_plugin: () => {},
    progressbar: () => {},
    is_daemon: false,
  };

  describe('fires on each mutating operation', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager({ ...base_config, plugins_changed: () => {} });
    });

    it('fires on run() and delivers all catalog plugins', async function () {
      const next = nextPluginsChanged(manager);
      await manager.run();
      const plugins = await next;
      expect(plugins).to.include.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
    });

    it('fires on managePlugin on with updated status', async function () {
      const next = nextPluginsChanged(manager);
      await manager.managePlugin(first_plugin_uid, 'on');
      const plugins = await next;
      expect(plugins[first_plugin_uid].status).to.equal('on');
    });

    it('fires on managePlugin off with updated status', async function () {
      const next = nextPluginsChanged(manager);
      await manager.managePlugin(first_plugin_uid, 'off');
      const plugins = await next;
      expect(plugins[first_plugin_uid].status).to.equal('off');
    });

    it('fires on addUserScripts and new plugin is present', async function () {
      const ext_uid = 'Test External+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const next = nextPluginsChanged(manager);
      await manager.addUserScripts([
        {
          meta: {
            id: 'test-ext',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Test External',
            category: 'Misc',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const plugins = await next;
      expect(plugins).to.have.property(ext_uid);
      expect(plugins[ext_uid].user).to.be.true;
      expect(plugins[ext_uid].status).to.equal('on');
    });

    it('fires on managePlugin delete and plugin is absent', async function () {
      const ext_uid = 'Test External+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const next = nextPluginsChanged(manager);
      await manager.managePlugin(ext_uid, 'delete');
      const plugins = await next;
      expect(plugins).to.not.have.property(ext_uid);
    });

    it('fires on setChannel and reflects channel switch', async function () {
      const next = nextPluginsChanged(manager);
      await manager.setChannel('beta');
      await next;
      expect(manager.channel).to.equal('beta');

      const next2 = nextPluginsChanged(manager);
      await manager.setChannel('release');
      await next2;
      expect(manager.channel).to.equal('release');
    });
  });

  describe('merged view correctness via getPlugins()', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager(base_config);
      await manager.run();
    });

    it('catalog-only plugin has status off (not yet installed)', async function () {
      const plugins = await manager.getPlugins();
      expect(plugins).to.have.property(second_plugin_uid);
      expect(plugins[second_plugin_uid].status).to.equal('off');
    });

    it('enabled built-in shows status on without user or override flags', async function () {
      await manager.managePlugin(first_plugin_uid, 'on');
      const plugins = await manager.getPlugins();
      expect(plugins[first_plugin_uid].status).to.equal('on');
      expect(plugins[first_plugin_uid].user).to.not.be.true;
      expect(plugins[first_plugin_uid].override).to.not.be.true;
    });

    it('user plugin replacing a built-in gets override and user flags in merged view', async function () {
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Missions',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const plugins = await manager.getPlugins();
      expect(plugins[third_plugin_uid].override).to.be.true;
      expect(plugins[third_plugin_uid].user).to.be.true;
      expect(plugins[third_plugin_uid].status).to.equal('on');
    });

    it('after override removal plugin has no override or user flags', async function () {
      await manager.managePlugin(third_plugin_uid, 'delete');
      const plugins = await manager.getPlugins();
      expect(plugins[third_plugin_uid].override).to.not.be.true;
      expect(plugins[third_plugin_uid].user).to.not.be.true;
    });

    it('plugins stored under another channel are excluded from the current view', async function () {
      const beta_uid = 'Beta Only Plugin+https://example.com';
      await storage.set({
        beta_plugins_local: {
          [beta_uid]: { uid: beta_uid, status: 'on', code: '// beta-only' },
        },
      });
      const plugins = await manager.getPlugins();
      expect(plugins).to.not.have.property(beta_uid);
    });
  });
});
