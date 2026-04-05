// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin } from '../src/types.js';

describe('Manager GM API integration', function () {
  const injectedPlugins: Plugin[] = [];

  function createManager(withGmApi: boolean): Manager {
    storage.resetStorage();
    injectedPlugins.length = 0;

    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      network_host: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      inject_plugin: function (plugin: Plugin) {
        injectedPlugins.push({ ...plugin });
      },
      plugin_event: function () {},
      progressbar: function () {},
      is_daemon: false,
      ...(withGmApi
        ? {
            gm_api: {
              bridge_adapter_code: 'window.__iitc_gm_bridge__ = { send() {}, onResponse() {} };',
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

    it('should not inject GM API bridge adapter', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      const uids = injectedPlugins.map(p => p.uid);
      expect(uids).to.not.include('gm_api_bridge_adapter');
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

    it('should inject bridge adapter first', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      expect(injectedPlugins.length).to.be.greaterThan(0);
      expect(injectedPlugins[0].uid).to.equal('gm_api_bridge_adapter');
      expect(injectedPlugins[0].code).to.include('__iitc_gm_bridge__');
    });

    it('should inject GM API factory second', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      expect(injectedPlugins.length).to.be.greaterThan(1);
      expect(injectedPlugins[1].uid).to.equal('gm_api');
      expect(injectedPlugins[1].code).to.include('window.GM');
    });

    it('should not wrap IITC core code with GM IIFE', async function () {
      injectedPlugins.length = 0;
      await manager.inject();
      // Third plugin should be IITC core (after bridge adapter and GM API)
      const iitcPlugin = injectedPlugins[2];
      expect(iitcPlugin).to.exist;
      expect(iitcPlugin.code).to.include('==UserScript==');
      expect(iitcPlugin.code).to.not.match(/^\(\(GM\)=>\{/);
    });
  });
});
