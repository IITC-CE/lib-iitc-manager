// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { RequestVariant, StorageData } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const metaUrl = `${host}/meta.json`;
const coreUrl = `${host}/total-conversion-build.user.js`;
const now = () => Math.floor(Date.now() / 1000);

/** Creates a manager and records every requested URL with its variant. */
function createManager(
  managerHost: string,
  betaHost: string = managerHost
): {
  manager: Manager;
  calls: [RequestVariant | undefined, string][];
} {
  const manager = new Manager({
    storage,
    channel: 'release',
    networkHost: { release: managerHost, beta: betaHost, custom: managerHost },
    isDaemon: false,
  });
  const calls: [RequestVariant | undefined, string][] = [];
  const getUrl = manager._getUrl.bind(manager);
  manager._getUrl = async (url, variant) => {
    calls.push([variant, url.split('?')[0]]);
    return getUrl(url, variant);
  };
  return { manager, calls };
}

describe('Update check result and status', function () {
  beforeEach(function () {
    storage.resetStorage();
  });

  it('reports updated, then not-due', async function () {
    const { manager } = createManager(host);
    expect(await manager.checkUpdates(false)).to.deep.equal({
      ok: true,
      internal: { status: 'updated', failed: [] },
      external: { status: 'checked', updated: [], failed: [] },
    });
    expect(await manager.checkUpdates(false)).to.deep.equal({
      ok: true,
      internal: { status: 'not-due', failed: [] },
      external: { status: 'not-due', updated: [], failed: [] },
    });
  });

  it('reports an offline check in the result and in getUpdateStatus', async function () {
    const { manager } = createManager('http://127.0.0.1:1/release');
    const result = await manager.checkUpdates(false);
    expect(result.ok).to.be.false;
    expect(result.internal).to.deep.equal({
      status: 'failed',
      error: { kind: 'network' },
      failed: [],
    });

    const status = await manager.getUpdateStatus();
    expect(status.internal.lastCheck).to.be.null;
    expect(status.internal.retry!.failures).to.equal(1);
    expect(status.internal.retry!.error).to.deep.equal({ kind: 'network' });
  });

  it('reports a meta.json without plugin categories as invalid', async function () {
    const { manager } = createManager('http://127.0.0.1:31606/other-json');
    const result = await manager.checkUpdates(true);
    expect(result.ok).to.be.false;
    expect(result.internal).to.deep.equal({
      status: 'failed',
      error: { kind: 'invalid' },
      failed: [],
    });
  });
});

describe('One update check at a time', function () {
  beforeEach(function () {
    storage.resetStorage();
  });

  it('concurrent checks share one request', async function () {
    const { manager, calls } = createManager(host);
    const [first, second] = await Promise.all([
      manager.checkUpdates(false),
      manager.checkUpdates(false),
    ]);
    expect(calls.filter(([, url]) => url === metaUrl)).to.have.lengthOf(1);
    expect(second).to.deep.equal(first);
  });

  it('a forced check waits for the running one', async function () {
    const { manager, calls } = createManager(host);
    await Promise.all([manager.checkUpdates(false), manager.checkUpdates(true)]);
    expect(calls).to.deep.equal([
      ['parseJSON', metaUrl],
      [undefined, coreUrl],
      ['parseJSON', metaUrl],
      [undefined, coreUrl],
    ]);
  });

  it('a queued forced check joins the check of a newly selected channel', async function () {
    const betaHost = 'http://127.0.0.1:31606/beta';
    const { manager, calls } = createManager(host, betaHost);
    // Order the checks: release finishes while the beta check is still running
    let betaStarted!: () => void;
    let releaseDone!: () => void;
    const betaStartedP = new Promise<void>(resolve => (betaStarted = resolve));
    const releaseDoneP = new Promise<void>(resolve => (releaseDone = resolve));
    const getUrl = manager._getUrl;
    manager._getUrl = async (url, variant) => {
      if (url.startsWith(`${betaHost}/meta.json`)) {
        betaStarted();
        await releaseDoneP;
      } else if (url.startsWith(metaUrl)) {
        await betaStartedP;
      }
      return getUrl(url, variant);
    };

    await Promise.all([
      manager.checkUpdates(false).then(releaseDone),
      manager.checkUpdates(true),
      manager.setChannel('beta'),
    ]);
    expect(calls.filter(([, url]) => url === `${betaHost}/meta.json`)).to.have.lengthOf(1);
  });
});

describe('setUpdateCheckInterval', function () {
  it('reschedules without downloading', async function () {
    storage.resetStorage();
    const { manager, calls } = createManager(host);
    await manager.run();
    await storage.set({ last_check_external_update: now() - 100 });
    calls.length = 0;

    await manager.setUpdateCheckInterval(60 * 60);
    expect(calls).to.be.empty;

    await manager.setUpdateCheckInterval(60, 'external');
    const data: StorageData = await storage.get(['last_check_external_update']);
    expect(data.last_check_external_update).to.be.at.least(now() - 5);
  });
});
