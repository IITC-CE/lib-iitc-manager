// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, PluginsView } from '../src/types.js';

/**
 * Returns a Promise that resolves with the next onPluginsViewChanged invocation payload.
 * Replaces the callback with a one-shot wrapper, then restores the original.
 */
function nextPluginsViewChanged(manager: Manager): Promise<PluginsView> {
  return new Promise<PluginsView>(resolve => {
    const prev = manager.onPluginsViewChanged;
    manager.onPluginsViewChanged = (view: PluginsView) => {
      manager.onPluginsViewChanged = prev;
      if (prev) prev(view);
      resolve(view);
    };
  });
}

describe('onPluginsViewChanged callback', function () {
  const firstPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const secondPluginUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const thirdPluginUid = 'Plugin C+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const baseConfig: Omit<ManagerConfig, 'onPluginsViewChanged'> = {
    storage,
    channel: 'release',
    networkHost: {
      release: 'http://127.0.0.1:31606/release',
      beta: 'http://127.0.0.1:31606/beta',
      custom: 'http://127.0.0.1/',
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    inject_user_script: () => {},
    injectPlugin: () => {},
    onProgress: () => {},
    isDaemon: false,
  };

  describe('fires on each mutating operation', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager({ ...baseConfig, onPluginsViewChanged: () => {} });
    });

    it('fires on run() and delivers all catalog plugins', async function () {
      const next = nextPluginsViewChanged(manager);
      await manager.run();
      const { plugins } = await next;
      expect(plugins).to.include.all.keys(firstPluginUid, secondPluginUid, thirdPluginUid);
    });

    it('fires on managePlugin on with updated status', async function () {
      const next = nextPluginsViewChanged(manager);
      await manager.managePlugin(firstPluginUid, 'on');
      const { plugins } = await next;
      expect(plugins[firstPluginUid].status).to.equal('on');
    });

    it('fires on managePlugin off with updated status', async function () {
      const next = nextPluginsViewChanged(manager);
      await manager.managePlugin(firstPluginUid, 'off');
      const { plugins } = await next;
      expect(plugins[firstPluginUid].status).to.equal('off');
    });

    it('fires on addUserScripts and new plugin is present', async function () {
      const extUid = 'Test External+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const next = nextPluginsViewChanged(manager);
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
      const { plugins } = await next;
      expect(plugins).to.have.property(extUid);
      expect(plugins[extUid].user).to.be.true;
      expect(plugins[extUid].status).to.equal('on');
    });

    it('fires on managePlugin delete and plugin is absent', async function () {
      const extUid = 'Test External+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const next = nextPluginsViewChanged(manager);
      await manager.managePlugin(extUid, 'delete');
      const { plugins } = await next;
      expect(plugins).to.not.have.property(extUid);
    });

    it('fires on setChannel and reflects channel switch', async function () {
      const next = nextPluginsViewChanged(manager);
      await manager.setChannel('beta');
      await next;
      expect(manager.channel).to.equal('beta');

      const next2 = nextPluginsViewChanged(manager);
      await manager.setChannel('release');
      await next2;
      expect(manager.channel).to.equal('release');
    });
  });

  describe('merged view correctness via getPluginsView()', function () {
    let manager: Manager;

    before(async function () {
      storage.resetStorage();
      manager = new Manager(baseConfig);
      await manager.run();
    });

    it('catalog-only plugin has status off (not yet installed)', async function () {
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.have.property(secondPluginUid);
      expect(plugins[secondPluginUid].status).to.equal('off');
    });

    it('enabled built-in shows status on without user or override flags', async function () {
      await manager.managePlugin(firstPluginUid, 'on');
      const { plugins } = await manager.getPluginsView();
      expect(plugins[firstPluginUid].status).to.equal('on');
      expect(plugins[firstPluginUid].user).to.not.be.true;
      expect(plugins[firstPluginUid].override).to.not.be.true;
    });

    it('user plugin replacing a built-in gets override and user flags in merged view', async function () {
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Plugin C',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const { plugins } = await manager.getPluginsView();
      expect(plugins[thirdPluginUid].override).to.be.true;
      expect(plugins[thirdPluginUid].user).to.be.true;
      expect(plugins[thirdPluginUid].status).to.equal('on');
    });

    it('after override removal plugin has no override or user flags', async function () {
      await manager.managePlugin(thirdPluginUid, 'delete');
      const { plugins } = await manager.getPluginsView();
      expect(plugins[thirdPluginUid].override).to.not.be.true;
      expect(plugins[thirdPluginUid].user).to.not.be.true;
    });

    it('plugins stored under another channel are excluded from the current view', async function () {
      const betaUid = 'Beta Only Plugin+https://example.com';
      await storage.set({
        beta_plugins_local: {
          [betaUid]: { uid: betaUid, status: 'on', code: '// beta-only' },
        },
      });
      const { plugins } = await manager.getPluginsView();
      expect(plugins).to.not.have.property(betaUid);
    });

    it('categories contains all plugin categories sorted alphabetically', async function () {
      const { categories } = await manager.getPluginsView();
      const names = Object.keys(categories);
      expect(names.length).to.be.greaterThan(0);
      expect(names).to.deep.equal([...names].sort((a, b) => a.localeCompare(b)));
      for (const cat of Object.values(categories)) {
        expect(cat).to.have.property('name').that.is.a('string');
        expect(cat).to.have.property('isNew').that.is.a('boolean');
      }
    });

    it('isNew is true for a category with a recently added user plugin', async function () {
      const recentManager = new Manager({ ...baseConfig, newPluginThreshold: 3600 });
      await recentManager.run();
      await recentManager.addUserScripts([
        {
          meta: {
            namespace: 'https://example.com',
            name: 'Brand New Plugin',
            category: 'Misc',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const { categories } = await recentManager.getPluginsView();
      expect(categories['Misc'].isNew).to.be.true;
    });

    it('isNew is false for catalog-only categories (no addedAt)', async function () {
      storage.resetStorage();
      const freshManager = new Manager(baseConfig);
      await freshManager.run();
      const { categories } = await freshManager.getPluginsView();
      for (const cat of Object.values(categories)) {
        expect(cat.isNew, `category ${cat.name} should not be new`).to.be.false;
      }
    });

    it('core is populated with code after run()', async function () {
      const { core } = await manager.getPluginsView();
      expect(core, 'core must not be null after run()').to.not.be.null;
      expect(core!.uid).to.equal(IITC_CORE_UID);
      expect(core!.code).to.be.a('string').and.include('// ==UserScript==');
    });

    it('core has override flag after user installs iitc core script', async function () {
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'IITC: Ingress intel map total conversion',
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const { core } = await manager.getPluginsView();
      expect(core!.override).to.be.true;
      await manager.managePlugin(IITC_CORE_UID, 'delete');
    });
  });
});
