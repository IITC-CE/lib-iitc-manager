// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { FetchResourceResult, RequestVariant, StorageData } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const metaUrl = `${host}/meta.json`;
const coreUrl = `${host}/total-conversion-build.user.js`;
const pluginUrl = `${host}/plugins/plugin-a.user.js`;
const pluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
const now = () => Math.floor(Date.now() / 1000);
const networkError: FetchResourceResult = {
  data: null,
  version: null,
  error: { kind: 'network' },
};
const httpError = (status: number): FetchResourceResult => ({
  data: null,
  version: null,
  error: { kind: 'http', status },
});

async function read(key: string): Promise<StorageData[string]> {
  return (await storage.get([key]))[key];
}

describe('Partial update check failures', function () {
  let manager: Manager;
  let calls: [RequestVariant | undefined, string][];
  let override: (url: string, variant?: RequestVariant) => FetchResourceResult | undefined;

  beforeEach(async function () {
    storage.resetStorage();
    manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: host, custom: host },
      isDaemon: false,
    });
    await manager.run();
    await manager.managePlugin(pluginUid, 'on');

    calls = [];
    override = () => undefined;
    const getUrl = manager._getUrl.bind(manager);
    manager._getUrl = async (url, variant) => {
      calls.push([variant, url.split('?')[0]]);
      return override(url, variant) ?? getUrl(url, variant);
    };
  });

  it('HEAD network error stops the check; HEAD HTTP error falls back to GET', async function () {
    await storage.set({ last_check_update: now() - 2 * 24 * 60 * 60 });
    override = (url, variant) => (variant === 'head' ? networkError : undefined);
    await manager.checkUpdates(false);
    expect(calls).to.deep.equal([['head', metaUrl]]);

    calls = [];
    await storage.set({ update_check_retry: null });
    override = (url, variant) => (variant === 'head' ? httpError(405) : undefined);
    await manager.checkUpdates(false);
    expect(calls).to.deep.include(['parseJSON', metaUrl]);
  });

  it('without HEAD support reuses the meta.json body', async function () {
    manager.useFetchHeadMethod = false;
    await storage.set({
      release_last_modified: 'previous',
      last_check_update: now() - 2 * 24 * 60 * 60,
    });
    await manager.checkUpdates(false);
    expect(calls.filter(([, url]) => url === metaUrl)).to.have.lengthOf(1);
  });

  it('keeps the old core when the server returns a non-userscript', async function () {
    const oldCore = (await read('release_iitc_core')) as StorageData;
    override = url =>
      url === coreUrl ? { data: '<html>Wi-Fi login</html>', version: null } : undefined;
    await manager.checkUpdates(true);
    expect(((await read('release_iitc_core')) as StorageData).code).to.equal(oldCore.code);
    expect(await read('release_pending_files')).to.deep.equal([IITC_CORE_UID]);
  });

  it('a plugin 404 completes the check and is retried alone with the same ETag', async function () {
    override = url => (url === pluginUrl ? httpError(404) : undefined);
    await storage.set({ release_last_modified: null });
    await manager.checkUpdates(true);
    expect(await read('last_check_update')).to.be.at.least(now() - 5);
    expect(await read('release_last_modified')).to.exist;
    expect(await read('release_pending_files')).to.deep.equal([pluginUid]);

    calls = [];
    override = () => undefined;
    await storage.set({ last_check_update: now() - 2 * 24 * 60 * 60 });
    await manager.checkUpdates(false);
    expect(calls).to.deep.equal([
      ['head', metaUrl],
      ['parseJSON', metaUrl],
      [undefined, pluginUrl],
    ]);
    expect(await read('release_pending_files')).to.be.empty;
  });

  it('a plugin network error on the first check fails it; the retry fetches only that file', async function () {
    await storage.set({ release_last_modified: null, last_check_update: null });
    override = url => (url === pluginUrl ? networkError : undefined);
    await manager.checkUpdates(false);
    expect(await read('last_check_update')).to.be.null;
    expect(((await read('update_check_retry')) as StorageData).failures).to.equal(1);
    expect(await read('release_pending_files')).to.deep.equal([pluginUid]);

    calls = [];
    override = () => undefined;
    await storage.set({ update_check_retry: { failures: 1, at: now() - 1 } });
    await manager.checkUpdates(false);
    expect(calls).to.deep.equal([
      ['head', metaUrl],
      ['parseJSON', metaUrl],
      [undefined, pluginUrl],
    ]);
  });

  it('downloads everything when meta.json changed between HEAD and GET', async function () {
    override = url => (url === coreUrl ? httpError(404) : undefined);
    await manager.checkUpdates(true);
    expect(await read('release_pending_files')).to.deep.equal([IITC_CORE_UID]);

    const oldVersion = await read('release_last_modified');
    calls = [];
    override = () => undefined;
    const getUrl = manager._getUrl;
    manager._getUrl = async (url, variant) => {
      if (variant === 'head') {
        calls.push([variant, url.split('?')[0]]);
        return { data: null, version: oldVersion as string };
      }
      const result = await getUrl(url, variant);
      return variant === 'parseJSON' ? { ...result, version: 'new' } : result;
    };
    await storage.set({ last_check_update: now() - 2 * 24 * 60 * 60 });
    await manager.checkUpdates(false);
    expect(calls).to.deep.equal([
      ['head', metaUrl],
      ['parseJSON', metaUrl],
      [undefined, coreUrl],
      [undefined, pluginUrl],
    ]);
    expect(await read('release_last_modified')).to.equal('new');
  });
});
