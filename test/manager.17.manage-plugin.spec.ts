// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { FetchResourceResult, PluginEventData, StorageData } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const pluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

describe('managePlugin enabling a plugin that is not cached', function () {
  let manager: Manager;
  let urls: string[] = [];
  let response: FetchResourceResult;
  const events: PluginEventData[] = [];

  before(async function () {
    storage.resetStorage();
    manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: host, custom: host },
      isDaemon: false,
      onPluginEvent: event => events.push(event),
    });
    await manager.run();
    manager._getUrl = async url => {
      urls.push(url);
      return response;
    };
  });

  for (const [name, result, error] of [
    [
      'network error',
      { data: null, version: null, error: { kind: 'network' } },
      { kind: 'network' },
    ],
    ['non-userscript', { data: '<html>Wi-Fi login</html>', version: null }, { kind: 'invalid' }],
  ] as const) {
    it(`reports a ${name} and leaves the plugin off`, async function () {
      response = result as FetchResourceResult;
      events.length = 0;
      const before = await storage.get(['release_plugins_local']);
      expect(await manager.managePlugin(pluginUid, 'on')).to.deep.equal({ ok: false, error });
      const after = await storage.get(['plugins_state', 'release_plugins_local']);
      expect((after.plugins_state as StorageData)?.[pluginUid]).to.be.undefined;
      expect(after.release_plugins_local).to.deep.equal(before.release_plugins_local);
      expect(events).to.be.empty;
    });
  }

  it('reports a plugin missing from the catalog without requests', async function () {
    urls = [];
    expect(await manager.managePlugin('Unknown+https://example.com', 'on')).to.deep.equal({
      ok: false,
      error: { kind: 'not-in-catalog' },
    });
    expect(urls).to.be.empty;
  });
});
