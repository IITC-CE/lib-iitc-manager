// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { Plugin, PluginEventData } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const betaHost = 'http://127.0.0.1:31606/beta';
const pluginAUrl = `${host}/plugins/plugin-a.user.js`;
const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
const pluginBUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';

describe('Concurrent plugin changes', function () {
  let manager: Manager;
  let events: PluginEventData[];

  beforeEach(async function () {
    storage.resetStorage();
    events = [];
    manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: betaHost, custom: host },
      isDaemon: false,
      onPluginEvent: e => events.push(e),
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

  /** `@version` of the code in each received plugin event. */
  function versions(): string[] {
    return events.flatMap(e =>
      Object.values(e.plugins).flatMap(p => {
        const version = /@version\s+(\S+)/.exec((p as Plugin).code ?? '')?.[1];
        return version ? [version] : [];
      })
    );
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

  it('sends no events of the old channel after switching channels', async function () {
    await manager.managePlugin(pluginAUid, 'on');
    const { held, release } = holdDownload(`${host}/total-conversion-build.user.js`);
    const check = manager.checkUpdates(true);
    await held;

    await manager.setChannel('beta');
    events = [];
    release();
    await check;

    expect(events).to.deep.equal([]);
  });

  it('enables a plugin on the new channel if the channel changes while downloading it', async function () {
    const { held, release } = holdDownload(pluginAUrl);
    const enabling = manager.managePlugin(pluginAUid, 'on');
    await held;

    await manager.setChannel('beta');
    events = [];
    release();
    expect(await enabling).to.deep.equal({ ok: true });

    // Plugin A on the beta fixture
    expect(versions()).to.deep.equal(['0.2.0']);
    await expectEnabled(pluginAUid);
  });

  it('still disables a user plugin while switching channels', async function () {
    const meta = {
      name: 'User plugin',
      namespace: 'https://example.com',
      match: ['https://intel.ingress.com/*'],
    };
    const code =
      '// ==UserScript==\n// @name User plugin\n// @namespace https://example.com\n// ==/UserScript==';
    await manager.addUserScripts([{ meta, code }]);
    const uid = 'User plugin+https://example.com';
    events = [];

    await Promise.all([manager.managePlugin(uid, 'off'), manager.setChannel('beta')]);

    expect(events.filter(e => e.event === 'remove' && uid in e.plugins)).to.have.lengthOf(1);
  });

  describe('custom URL changed while downloading', function () {
    beforeEach(async function () {
      await manager.setChannel('custom');
    });

    it('keeps the data of the new host when the old-host check ends', async function () {
      const { held, release } = holdDownload(`${host}/total-conversion-build.user.js`);
      const oldCheck = manager.checkUpdates(true);
      await held;

      await manager.setCustomChannelUrl(betaHost);
      await manager.checkUpdates(true);
      events = [];
      release();
      await oldCheck;

      const { custom_iitc_core: core } = await storage.get(['custom_iitc_core']);
      // IITC core on the beta fixture
      expect((core as Plugin).version).to.equal('0.33.0');
      expect(events).to.deep.equal([]);
    });

    it('does not count the old-host check as a check of the new host', async function () {
      await storage.set({ last_check_update: 1 });
      const { held, release } = holdDownload(`${host}/meta.json`);
      const oldCheck = manager.checkUpdates();
      await held;

      await manager.setCustomChannelUrl(betaHost);
      release();
      await oldCheck;

      expect((await manager.getUpdateStatus()).internal.lastCheck).to.equal(1);
    });

    it('enables a plugin with the code of the new host', async function () {
      const { held, release } = holdDownload(pluginAUrl);
      const enabling = manager.managePlugin(pluginAUid, 'on');
      await held;

      await manager.setCustomChannelUrl(betaHost);
      await manager.checkUpdates(true);
      events = [];
      release();
      expect(await enabling).to.deep.equal({ ok: true });

      // Plugin A on the beta fixture
      expect(versions()).to.deep.equal(['0.2.0']);
      await expectEnabled(pluginAUid);
    });
  });
});
