// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { FetchResourceResult, StorageData } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const offline = 'http://127.0.0.1:1';
const now = () => Math.floor(Date.now() / 1000);
const ns = 'https://example.com';

/** User plugin entry whose update URLs point to `base`. */
const userPlugin = (name: string, base: string): StorageData => ({
  uid: `${name}+${ns}`,
  name,
  namespace: ns,
  version: '0.0.1',
  updateURL: `${base}/plugins/plugin-a.meta.js`,
  downloadURL: `${base}/plugins/plugin-a.user.js`,
  code: '// old',
});

async function read(key: string): Promise<StorageData[string]> {
  return (await storage.get([key]))[key];
}

describe('External plugin checks', function () {
  let manager: Manager;
  let urls: string[];
  let beforeFetch: (url: string) => Promise<void>;

  beforeEach(async function () {
    storage.resetStorage();
    manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: host, custom: host },
      isDaemon: false,
    });
    await manager.run();

    urls = [];
    beforeFetch = async () => {};
    const getUrl = manager._getUrl.bind(manager);
    manager._getUrl = async (url, variant): Promise<FetchResourceResult> => {
      if (!url.startsWith(host + '/plugins/') && !url.startsWith(offline)) {
        return getUrl(url, variant);
      }
      urls.push(url);
      await beforeFetch(url);
      return getUrl(url, variant);
    };
  });

  it('one unreachable plugin does not block the others or the timestamp', async function () {
    await storage.set({
      last_check_external_update: null,
      plugins_user: {
        [`A+${ns}`]: userPlugin('A', host),
        [`B+${ns}`]: userPlugin('B', offline),
      },
    });
    await manager.checkUpdates(false);

    expect(await read('last_check_external_update')).to.be.at.least(now() - 5);
    const pluginsUser = (await read('plugins_user')) as StorageData;
    expect((pluginsUser[`A+${ns}`] as StorageData).version).to.equal('0.1.0');
  });

  it('all requests failing with a network error back off', async function () {
    await storage.set({
      last_check_external_update: null,
      plugins_user: {
        [`A+${ns}`]: userPlugin('A', offline),
        [`B+${ns}`]: userPlugin('B', offline),
      },
    });
    await manager.checkUpdates(false);
    expect(await read('last_check_external_update')).to.be.null;
    expect(((await read('external_update_check_retry')) as StorageData).failures).to.equal(1);

    urls = [];
    await manager.checkUpdates(false);
    expect(urls).to.be.empty;
  });

  it('keeps plugins deleted while the check was downloading deleted', async function () {
    await storage.set({
      last_check_external_update: null,
      plugins_user: {
        [`A+${ns}`]: userPlugin('A', host),
        [`B+${ns}`]: { ...userPlugin('B', host), updateURL: undefined },
      },
    });
    beforeFetch = async () => {
      beforeFetch = async () => {};
      await manager.managePlugin(`B+${ns}`, 'delete');
    };
    await manager.checkUpdates(false);

    const pluginsUser = (await read('plugins_user')) as StorageData;
    expect(pluginsUser).to.have.all.keys(`A+${ns}`);
    expect((pluginsUser[`A+${ns}`] as StorageData).version).to.equal('0.1.0');
  });

  it('keeps a plugin replaced while the check was downloading', async function () {
    await storage.set({
      last_check_external_update: null,
      plugins_user: { [`A+${ns}`]: userPlugin('A', host) },
    });
    beforeFetch = async () => {
      beforeFetch = async () => {};
      await manager.addUserScripts([
        {
          meta: { name: 'A', namespace: ns, version: '9.9.9' },
          code: '// ==UserScript==\n// @name A\n// ==/UserScript==',
        },
      ]);
    };
    await manager.checkUpdates(false);

    const pluginsUser = (await read('plugins_user')) as StorageData;
    expect((pluginsUser[`A+${ns}`] as StorageData).version).to.equal('9.9.9');
  });

  it('keeps fields set when the plugin was added and takes metadata from the code', async function () {
    const ext = 'https://plugins.example.com';
    const header = (version: string) =>
      `// ==UserScript==\n// @name X\n// @namespace ${ns}\n// @version ${version}\n// ==/UserScript==`;
    await storage.set({ last_check_external_update: null });
    await manager.addUserScripts([
      {
        meta: {
          name: 'X',
          namespace: ns,
          version: '0.0.1',
          filename: 'custom-x.user.js',
          updateURL: `${ext}/x.meta.js`,
          downloadURL: `${ext}/x.user.js`,
        },
        code: header('0.0.1'),
      },
    ]);
    // The .meta.js lags behind the code
    const responses: Record<string, string> = {
      [`${ext}/x.meta.js`]: header('0.2.0'),
      [`${ext}/x.user.js`]: header('0.3.0'),
    };
    const getUrl = manager._getUrl.bind(manager);
    manager._getUrl = async (url, variant) =>
      url in responses ? { data: responses[url], version: null } : getUrl(url, variant);

    await manager.checkUpdates(false);

    const plugin = ((await read('plugins_user')) as StorageData)[`X+${ns}`] as StorageData;
    expect(plugin).to.include({
      filename: 'custom-x.user.js',
      category: 'Misc',
      version: '0.3.0',
      updateURL: `${ext}/x.meta.js`,
      downloadURL: `${ext}/x.user.js`,
    });

    // Unchanged code is not stored again, though .meta.js still differs from it
    await storage.set({ last_check_external_update: null });
    const { external } = await manager.checkUpdates(false);
    expect(external.updated).to.be.empty;
  });
});
