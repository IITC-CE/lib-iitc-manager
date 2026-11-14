// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { StorageAPI, StorageData } from '../src/types.js';

const fixtureHost = 'http://127.0.0.1:31606/release';
const offlineHost = 'http://127.0.0.1:1/release';
const now = () => Math.floor(Date.now() / 1000);

/** Creates a manager and records every requested URL. */
function createManager(
  host: string,
  managerStorage: StorageAPI = storage
): { manager: Manager; urls: string[] } {
  const manager = new Manager({
    storage: managerStorage,
    channel: 'release',
    networkHost: { release: host, beta: host, custom: host },
    isDaemon: false,
  });
  const urls: string[] = [];
  const getUrl = manager._getUrl.bind(manager);
  manager._getUrl = async (url, variant) => {
    urls.push(url);
    return getUrl(url, variant);
  };
  return { manager, urls };
}

async function read(key: string): Promise<StorageData[string]> {
  return (await storage.get([key]))[key];
}

describe('Update check schedule', function () {
  it('a check that is not due makes no requests and keeps the timestamp', async function () {
    storage.resetStorage();
    await createManager(fixtureHost).manager.run();
    const lastCheck = now() - 100;
    await storage.set({ last_check_update: lastCheck });

    const { manager, urls } = createManager(fixtureHost);
    await manager.checkUpdates(false);

    expect(urls).to.be.empty;
    expect(await read('last_check_update')).to.equal(lastCheck);
  });

  it('a timestamp from the future does not postpone the check', async function () {
    storage.resetStorage();
    await storage.set({
      release_last_modified: 'previous',
      last_check_update: now() + 10 * 24 * 60 * 60,
    });
    const { manager, urls } = createManager(fixtureHost);
    await manager.checkUpdates(false);
    expect(urls).to.not.be.empty;
  });

  describe('failed check backs off', function () {
    const lastCheck = now() - 2 * 24 * 60 * 60;

    before(async function () {
      storage.resetStorage();
      await storage.set({
        release_last_modified: 'previous',
        last_check_update: lastCheck,
      });
    });

    it('keeps the timestamp and records a pause', async function () {
      await createManager(offlineHost).manager.checkUpdates(false);
      expect(await read('last_check_update')).to.equal(lastCheck);
      const retry = (await read('update_check_retry')) as StorageData;
      expect(retry.failures).to.equal(1);
      expect(retry.at).to.be.greaterThan(now());
    });

    it('makes no requests until the pause ends', async function () {
      await storage.set({ update_check_retry: { failures: 1, at: now() + 60 } });
      const { manager, urls } = createManager(offlineHost);
      await manager.checkUpdates(false);
      expect(urls).to.be.empty;
    });

    it('retries once the pause ends', async function () {
      await storage.set({ update_check_retry: { failures: 1, at: now() - 1 } });
      const { manager, urls } = createManager(offlineHost);
      await manager.checkUpdates(false);
      expect(urls).to.not.be.empty;
      expect(((await read('update_check_retry')) as StorageData).failures).to.equal(2);
    });

    it('success clears the pause and writes the timestamp', async function () {
      await storage.set({ update_check_retry: { failures: 2, at: now() - 1 } });
      await createManager(fixtureHost).manager.checkUpdates(false);
      expect(await read('update_check_retry')).to.be.null;
      expect(await read('last_check_update')).to.be.at.least(now() - 5);
    });
  });

  it('pause stays within a minute while the channel has never been fetched', async function () {
    storage.resetStorage();
    const { manager } = createManager(offlineHost);
    await manager.checkUpdates(true);
    await manager.checkUpdates(true);
    const retry = (await read('update_check_retry')) as StorageData;
    expect(retry.failures).to.equal(2);
    expect((retry.at as number) - now()).to.be.within(0, 60);
  });

  describe('external plugins', function () {
    const pluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const metaUrl = `${fixtureHost}/plugins/plugin-a.meta.js`;
    // Missing keys read as undefined, as in browser storage
    const data: StorageData = {
      plugins_user: {
        [pluginUid]: {
          uid: pluginUid,
          name: 'Plugin A',
          version: '0.1.0',
          updateURL: metaUrl,
          downloadURL: `${fixtureHost}/plugins/plugin-a.user.js`,
          code: '',
        },
      },
    };
    const plainStorage: StorageAPI = {
      get: async keys => Object.fromEntries((keys ?? []).map(key => [key, data[key]])),
      set: async obj => void Object.assign(data, obj),
    };

    it('runs when never checked and writes the timestamp', async function () {
      const { manager, urls } = createManager(fixtureHost, plainStorage);
      await manager.checkUpdates(false);
      expect(urls.some(url => url.startsWith(metaUrl))).to.be.true;
      expect(data.last_check_external_update).to.be.at.least(now() - 5);
    });

    it('a check that is not due keeps the timestamp', async function () {
      const lastCheck = now() - 100;
      data.last_check_external_update = lastCheck;
      const { manager, urls } = createManager(fixtureHost, plainStorage);
      await manager.checkUpdates(false);
      expect(urls.some(url => url.startsWith(metaUrl))).to.be.false;
      expect(data.last_check_external_update).to.equal(lastCheck);
    });
  });
});
