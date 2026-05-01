// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, Plugin, StorageData } from '../src/types.js';

describe('manage.js custom repo integration tests', function () {
  let manager: Manager | null = null;
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

  describe('Custom repository', function () {
    const customRepo = 'http://127.0.0.1:31606/custom';

    it('Setting the URL of the custom repository', async function () {
      const run = await manager!.setCustomChannelUrl(customRepo);
      expect(run).to.be.undefined;
    });

    it('Check the URL of the custom repository', async function () {
      const networkHost = await storage
        .get(['network_host'])
        .then(data => data.network_host as StorageData);
      expect(networkHost.custom).to.equal(customRepo);
    });

    it('Switching to a custom channel', async function () {
      const channel = await manager!.setChannel('custom');
      expect(channel).to.be.undefined;
    });

    it('Check the IITC version', async function () {
      const script = await storage
        .get(['custom_iitc_core'])
        .then(data => (data['custom_iitc_core'] as StorageData)['code'] as string);
      expect(script).to.include('@version        0.99.0');
    });

    it('Switching back to the Release channel', async function () {
      const channel = await manager!.setChannel('release');
      expect(channel).to.be.undefined;
    });
  });
});
