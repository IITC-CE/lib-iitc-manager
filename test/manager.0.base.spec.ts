// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, PluginEventData } from '../src/types.js';

describe('manage.js base integration tests', function () {
  let manager: Manager | null = null;
  before(function () {
    storage.resetStorage();
    const params: ManagerConfig = {
      storage: storage,
      channel: 'beta',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      inject_user_script: function callBack(data: string) {
        expect(data).to.include('// ==UserScript==');
      },
      injectPlugin: (data: Plugin) => {
        expect(data['code']).to.include('// ==UserScript==');
      },
      onPluginEvent: (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(IITC_CORE_UID);
        expect(data['plugins'][IITC_CORE_UID]).to.have.property('uid', IITC_CORE_UID);
      },
      onProgress: (isShow: boolean) => {
        expect(isShow).to.be.oneOf([true, false]);
      },
      isDaemon: false,
    };
    manager = new Manager(params);
  });

  describe('run', function () {
    it('Should not return an error', async function () {
      const run = await manager!.run();
      expect(run).to.be.undefined;
    });
  });

  describe('Check channel', function () {
    it('Should return beta', async function () {
      const channel = await storage.get(['channel']).then(data => data.channel);
      expect(channel).to.equal('beta');
    });
  });

  describe('setChannel', function () {
    it('Should not return an error', async function () {
      const channel = await manager!.setChannel('release');
      expect(channel).to.be.undefined;
    });
  });

  describe('setUpdateCheckInterval', function () {
    it('Should not return an error', async function () {
      const fn = await manager!.setUpdateCheckInterval(24 * 60 * 60, 'release');
      expect(fn).to.be.undefined;
    });
    it('Should set correct interval in seconds', async function () {
      const interval = await storage
        .get(['release_update_check_interval'])
        .then(data => data.release_update_check_interval);
      expect(interval).to.equal(24 * 60 * 60);
    });
  });

  describe('inject', function () {
    it('Should not return an error', async function () {
      const inject = await manager!.inject();
      expect(inject).to.be.undefined;
    });
  });
});
