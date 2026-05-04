// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import { GM_API_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, PluginEventData } from '../src/types.js';

describe('Manager GM API integration', function () {
  const injectedPlugins: Plugin[] = [];

  function createManager(withGmApi: boolean): Manager {
    storage.resetStorage();
    injectedPlugins.length = 0;

    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: (plugin: Plugin) => {
        injectedPlugins.push({ ...plugin });
      },
      onPluginEvent: function () {},
      onProgress: function () {},
      isDaemon: false,
      ...(withGmApi
        ? {
            gmApi: {
              bridgeAdapterCode: 'window.__iitc_gm_bridge__ = { send() {}, onResponse() {} };',
            },
          }
        : {}),
    };
    return new Manager(params);
  }

  describe('inject() without gm_api config', function () {
    let manager: Manager;

    before(async function () {
      manager = createManager(false);
      await manager.run();
    });

    it('should not inject GM API', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      const uids = injectedPlugins.map(p => p.uid);
      expect(uids).to.not.include('gm_api');
    });

    it('should inject IITC core with original code', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      const iitcPlugin = injectedPlugins.find(p => p.code?.includes('==UserScript=='));
      expect(iitcPlugin).to.exist;
      // Original code should not be wrapped in GM IIFE
      expect(iitcPlugin!.code).to.not.match(/^\(\(GM\)=>\{/);
    });
  });

  describe('inject() with gm_api config', function () {
    let manager: Manager;

    before(async function () {
      manager = createManager(true);
      await manager.run();
    });

    it('should inject GM API first with bridge adapter and factory combined', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      expect(injectedPlugins.length).to.be.greaterThan(0);
      expect(injectedPlugins[0].uid).to.equal('gm_api');
      expect(injectedPlugins[0].code).to.include('__iitc_gm_bridge__');
      expect(injectedPlugins[0].code).to.include('window.GM');
    });

    it('should not wrap IITC core code with GM IIFE', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      // Second plugin should be IITC core (after GM API)
      const iitcPlugin = injectedPlugins[1];
      expect(iitcPlugin).to.exist;
      expect(iitcPlugin.code).to.include('==UserScript==');
      expect(iitcPlugin.code).to.not.match(/^\(\(GM\)=>\{/);
    });
  });

  describe('getEnabledPlugins() with gm_api config', function () {
    let manager: Manager;

    before(async function () {
      manager = createManager(true);
      await manager.run();
    });

    it('should include GM API with match patterns aggregated from enabled plugins', async function () {
      const plugins = await manager.getEnabledPlugins();
      const gmApi = plugins['gm_api'];

      expect(gmApi).to.exist;
      expect(gmApi.match).to.deep.equal(['https://intel.ingress.com/*']);
      expect(gmApi.code).to.include('__iitc_gm_bridge__');
      expect(gmApi.code).to.include('window.GM');
    });

    it('should return GM API before IITC core', async function () {
      const plugins = await manager.getEnabledPlugins();
      const keys = Object.keys(plugins);
      expect(keys[0]).to.equal('gm_api');
    });
  });

  describe('getEnabledPlugins() without gm_api config', function () {
    let manager: Manager;

    before(async function () {
      manager = createManager(false);
      await manager.run();
    });

    it('should not include GM API', async function () {
      const plugins = await manager.getEnabledPlugins();
      expect(plugins).to.not.have.property('gm_api');
    });
  });

  describe('GM API match aggregation in getEnabledPlugins()', function () {
    const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
    let manager: Manager;

    before(async function () {
      manager = createManager(true);
      await manager.run();
    });

    it('match list contains only IITC core pattern when no extra plugins enabled', async function () {
      const plugins = await manager.getEnabledPlugins();
      expect(plugins[GM_API_UID].match).to.deep.equal(['https://intel.ingress.com/*']);
    });

    it('enabling a plugin with same @match does not duplicate the pattern', async function () {
      await manager.managePlugin(pluginAUid, 'on');
      const plugins = await manager.getEnabledPlugins();
      expect(plugins[GM_API_UID].match).to.deep.equal(['https://intel.ingress.com/*']);
    });

    it('enabling a plugin with extra @match expands the list', async function () {
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://example.com',
            name: 'External Plugin',
            match: ['https://example.com/*'],
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const plugins = await manager.getEnabledPlugins();
      expect(plugins[GM_API_UID].match).to.include('https://example.com/*');
      expect(plugins[GM_API_UID].match).to.include('https://intel.ingress.com/*');
    });
  });

  describe('onPluginEvent gm_api update notification', function () {
    const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

    function nextGmApiEvent(manager: Manager): Promise<PluginEventData> {
      return new Promise(resolve => {
        const prev = manager.onPluginEvent;
        manager.onPluginEvent = (event: PluginEventData) => {
          if (event.plugins[GM_API_UID]) {
            manager.onPluginEvent = prev;
            if (prev) prev(event);
            resolve(event);
          } else {
            if (prev) prev(event);
          }
        };
      });
    }

    it('does not emit gm_api update after run() when IITC core match equals the default', async function () {
      storage.resetStorage();
      let gmApiEventFired = false;
      const manager = new Manager({
        storage,
        channel: 'release',
        networkHost: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        injectPlugin: () => {},
        onProgress: () => {},
        isDaemon: false,
        gmApi: { bridgeAdapterCode: 'window.__iitc_gm_bridge__ = { send() {}, onResponse() {} };' },
        onPluginEvent: (event: PluginEventData) => {
          if (event.plugins[GM_API_UID]) gmApiEventFired = true;
        },
      });
      await manager.run();
      expect(gmApiEventFired).to.be.false;
    });

    it('emits gm_api update when a plugin with new @match is enabled', async function () {
      storage.resetStorage();
      const manager = createManager(true);
      await manager.run();

      const gmApiEvent = nextGmApiEvent(manager);
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://example.com',
            name: 'Extra Plugin',
            match: ['https://example.com/*'],
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);
      const event = await gmApiEvent;
      expect(event.event).to.equal('update');
      expect((event.plugins[GM_API_UID] as Plugin).match).to.include('https://example.com/*');
    });

    it('does not emit gm_api update when enabling a plugin with already-covered @match', async function () {
      storage.resetStorage();
      const manager = createManager(true);
      await manager.run();

      let gmApiEventFired = false;
      const prev = manager.onPluginEvent;
      manager.onPluginEvent = (event: PluginEventData) => {
        if (event.plugins[GM_API_UID]) gmApiEventFired = true;
        if (prev) prev(event);
      };

      // Plugin A has same @match as IITC core, so match set should not change
      await manager.managePlugin(pluginAUid, 'on');

      expect(gmApiEventFired).to.be.false;
    });

    it('emits gm_api update when plugin with unique @match is disabled', async function () {
      storage.resetStorage();
      const manager = createManager(true);
      await manager.run();

      const extUid = 'Extra Plugin+https://example.com';
      await manager.addUserScripts([
        {
          meta: {
            namespace: 'https://example.com',
            name: 'Extra Plugin',
            match: ['https://example.com/*'],
          },
          code: '// ==UserScript==\nreturn false;',
        },
      ]);

      const gmApiEvent = nextGmApiEvent(manager);
      await manager.managePlugin(extUid, 'off');
      const event = await gmApiEvent;
      expect(event.event).to.equal('update');
      expect((event.plugins[GM_API_UID] as Plugin).match).to.not.include('https://example.com/*');
    });
  });
});
