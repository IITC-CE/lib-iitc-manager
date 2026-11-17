// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { StorageAPI, UpdateStatus } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const betaHost = 'http://127.0.0.1:31606/beta';
const offlineHost = 'http://127.0.0.1:1/release';
const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
const day = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
/** Lets pending status reads reach the callback: the test storage is in memory, so they finish before a timer fires. */
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('Update status notifications', function () {
  let statuses: UpdateStatus[];

  beforeEach(function () {
    storage.resetStorage();
    statuses = [];
  });

  function createManager(networkHost: string, managerStorage: StorageAPI = storage): Manager {
    return new Manager({
      storage: managerStorage,
      channel: 'release',
      networkHost: { release: networkHost, beta: betaHost, custom: networkHost },
      isDaemon: false,
      onUpdateStatusChanged: status => statuses.push(status),
    });
  }

  /** Holds the next request for `url`: `held` resolves once it starts, `release` lets it finish. */
  function hold(manager: Manager, url: string): { held: Promise<void>; release: () => void } {
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

  /** Values of `internal.checking` in the order they were sent, without repeats. */
  const internalChecking = () =>
    statuses.map(s => s.internal.checking).filter((v, i, all) => i === 0 || v !== all[i - 1]);

  it('sends the start and the end of a check, ending with the current status', async function () {
    const manager = createManager(host);
    const start = now();
    await manager.checkUpdates(true);
    await settle();

    expect(statuses[0].internal.checking).to.be.true;
    expect(internalChecking()).to.deep.equal([true, false]);
    const last = statuses[statuses.length - 1];
    expect(last).to.deep.equal(await manager.getUpdateStatus());
    expect(last.channel).to.equal('release');
    expect(last.internal.lastCheck).to.be.at.least(start);
    expect(last.internal.nextCheck).to.equal(last.internal.lastCheck! + day);
    expect(last.external.checking).to.be.false;
  });

  it('a failed check sends the pause as the next check', async function () {
    const manager = createManager(offlineHost);
    await manager.checkUpdates(false);
    await settle();

    const { internal } = statuses[statuses.length - 1];
    expect(internal.retry!.failures).to.equal(1);
    expect(internal.nextCheck).to.equal(internal.retry!.at);
  });

  it('a failed forced check after a recent one keeps the scheduled check', async function () {
    const lastCheck = now() - 100;
    await storage.set({ release_last_modified: 'previous', last_check_update: lastCheck });
    const manager = createManager(offlineHost);
    await manager.checkUpdates(true);
    await settle();

    const { internal } = statuses[statuses.length - 1];
    expect(internal.retry!.failures).to.equal(1);
    expect(internal.nextCheck).to.equal(lastCheck + day);
  });

  it('a check that is not due sends nothing', async function () {
    const manager = createManager(host);
    await manager.checkUpdates(true);
    await settle();
    statuses = [];

    await manager.checkUpdates(false);
    await settle();
    expect(statuses).to.be.empty;
  });

  it('a check found not due sends the status that changed with the time', async function () {
    const manager = createManager(host);
    await manager.ready;
    const start = now();
    // The clock was moved back: the pause counts only once it ends within 30 min
    await storage.set({
      release_last_modified: 'previous',
      last_check_update: start - 3 * day,
      update_check_retry: { failures: 3, at: start + 30 * 60 + 2 },
      last_check_external_update: start,
    });
    expect((await manager.getUpdateStatus()).internal.nextCheck).to.be.at.most(start);

    const realNow = Date.now;
    Date.now = () => realNow() + 3000;
    try {
      expect((await manager.checkUpdates(false)).internal.status).to.equal('not-due');
      await settle();
      expect(statuses).to.have.lengthOf(1);
      expect(statuses[0].internal.nextCheck).to.be.greaterThan(now());
    } finally {
      Date.now = realNow;
    }
  });

  it('run sends the status even when no check is due', async function () {
    await createManager(host).checkUpdates(true);
    await settle();
    statuses = [];

    const manager = createManager(host);
    await manager.run();
    await settle();
    expect(statuses).to.deep.equal([await manager.getUpdateStatus()]);
  });

  it('a forced check queued behind a scheduled one keeps checking set between them', async function () {
    await createManager(host).checkUpdates(true);
    await storage.set({ last_check_update: now() - 2 * day });
    const manager = createManager(host);
    await manager.ready;
    statuses = [];

    const { held, release } = hold(manager, `${host}/meta.json`);
    const scheduled = manager.checkUpdates(false);
    await held;
    const forced = manager.checkUpdates(true);
    release();
    await Promise.all([scheduled, forced]);
    await settle();

    expect(internalChecking()).to.deep.equal([true, false]);
  });

  it('a check of the previous channel sends no status of it and keeps checking of the new one', async function () {
    const manager = createManager(host);
    await manager.ready;
    const old = hold(manager, `${host}/meta.json`);
    const oldCheck = manager.checkUpdates(true);
    await old.held;

    const beta = hold(manager, `${betaHost}/meta.json`);
    const switching = manager.setChannel('beta');
    await beta.held;
    const sentBefore = statuses.length;
    old.release();
    await oldCheck;
    await settle();

    const after = statuses.slice(sentBefore);
    expect(after.every(s => s.channel === 'beta')).to.be.true;
    expect((await manager.getUpdateStatus()).internal.checking).to.be.true;

    beta.release();
    await switching;
    await settle();
    const last = statuses[statuses.length - 1];
    expect(last.channel).to.equal('beta');
    expect(last.internal.checking).to.be.false;
  });

  it('setUpdateCheckInterval sends the new next check', async function () {
    const manager = createManager(host);
    await manager.checkUpdates(true);
    await settle();
    const { lastCheck } = statuses[statuses.length - 1].internal;
    statuses = [];

    await manager.setUpdateCheckInterval(2 * day);
    await settle();
    expect(statuses).to.have.lengthOf(1);
    expect(statuses[0].internal.nextCheck).to.equal(lastCheck! + 2 * day);
  });

  it('a check that throws sends checking as cleared', async function () {
    let full = false;
    const manager = createManager(host, {
      get: storage.get.bind(storage),
      set: async obj => {
        if (full) throw new Error('quota exceeded');
        await storage.set(obj);
      },
    });
    await manager.ready;
    full = true;
    await manager.checkUpdates(true).catch(() => {});
    await settle();

    const last = statuses[statuses.length - 1];
    expect(last.internal.checking).to.be.false;
    expect(last.external.checking).to.be.false;
  });

  it('a callback that throws is logged and later statuses are still sent', async function () {
    const error = new Error('host failed');
    const manager = new Manager({
      storage,
      channel: 'release',
      networkHost: { release: host, beta: betaHost, custom: host },
      isDaemon: false,
      onUpdateStatusChanged: status => {
        statuses.push(status);
        if (statuses.length === 1) throw error;
      },
    });
    const logged: unknown[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => void logged.push(...args);
    try {
      expect((await manager.checkUpdates(true)).ok).to.be.true;
      await settle();
    } finally {
      console.error = consoleError;
    }
    expect(logged).to.include(error);
    expect(statuses[statuses.length - 1].internal.checking).to.be.false;
  });

  it('enabling a plugin sends no status', async function () {
    const manager = createManager(host);
    await manager.checkUpdates(true);
    await settle();
    statuses = [];

    expect(await manager.managePlugin(pluginAUid, 'on')).to.deep.equal({ ok: true });
    await settle();
    expect(statuses).to.be.empty;
  });
});
