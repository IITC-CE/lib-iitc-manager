// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

const host = 'http://127.0.0.1:31606/release';
const pluginAUrl = `${host}/plugins/plugin-a.user.js`;
const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
const pluginBUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';

describe('Concurrent plugin changes', function () {
  let manager: Manager;

  beforeEach(async function () {
    storage.resetStorage();
    manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: host, custom: host },
      isDaemon: false,
    });
    await manager.run();
  });

  /** Holds the next download of `url`: `held` resolves once it starts, `release` lets it finish. */
  function holdDownload(url: string): { held: Promise<void>; release: () => void } {
    let reached!: () => void;
    let release!: () => void;
    const held = new Promise<void>(resolve => (reached = resolve));
    const gate = new Promise<void>(resolve => (release = resolve));
    const getUrl = manager._getUrl.bind(manager);
    let pending = true;
    manager._getUrl = async (u, variant) => {
      if (pending && u.split('?')[0] === url) {
        pending = false;
        reached();
        await gate;
      }
      return getUrl(u, variant);
    };
    return { held, release };
  }

  async function expectEnabled(uid: string): Promise<void> {
    const enabled = await manager.getEnabledPlugins();
    expect(enabled, 'enabled plugins').to.have.property(uid);
    expect(enabled[uid].code, 'code').to.be.a('string').and.not.empty;
    const { plugins } = await manager.getPluginsView();
    expect(plugins[uid].status, 'status').to.equal('on');
  }

  it('keeps a plugin enabled while an update check is downloading', async function () {
    await manager.managePlugin(pluginAUid, 'on');
    const { held, release } = holdDownload(pluginAUrl);
    const check = manager.checkUpdates(true);
    await held;

    expect(await manager.managePlugin(pluginBUid, 'on')).to.deep.equal({ ok: true });
    release();
    await check;

    await expectEnabled(pluginAUid);
    await expectEnabled(pluginBUid);
  });

  it('keeps both plugins enabled at the same time', async function () {
    const { held, release } = holdDownload(pluginAUrl);
    const first = manager.managePlugin(pluginAUid, 'on');
    await held;

    expect(await manager.managePlugin(pluginBUid, 'on')).to.deep.equal({ ok: true });
    release();
    expect(await first).to.deep.equal({ ok: true });

    await expectEnabled(pluginAUid);
    await expectEnabled(pluginBUid);
  });
});
