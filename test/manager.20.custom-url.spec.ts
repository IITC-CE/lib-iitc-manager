// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { Channel, Plugin } from '../src/types.js';

const host = 'http://127.0.0.1:31606/release';
const betaHost = 'http://127.0.0.1:31606/beta';
const offlineHost = 'http://127.0.0.1:1/release';

describe('Changing the custom channel URL', function () {
  beforeEach(function () {
    storage.resetStorage();
  });

  /** Creates a manager that has checked `host` and records every URL requested after that. */
  async function createManager(channel: Channel): Promise<{ manager: Manager; urls: string[] }> {
    const manager = new Manager({
      storage,
      channel,
      networkHost: { release: host, beta: betaHost, custom: host },
      isDaemon: false,
    });
    await manager.run();
    const urls: string[] = [];
    const getUrl = manager._getUrl.bind(manager);
    manager._getUrl = async (url, variant) => {
      urls.push(url);
      return getUrl(url, variant);
    };
    return { manager, urls };
  }

  it('checks the new URL of the active custom channel', async function () {
    const { manager } = await createManager('custom');
    const result = await manager.setCustomChannelUrl(betaHost);

    expect(result.internal.status).to.equal('updated');
    const { custom_iitc_core: core } = await storage.get(['custom_iitc_core']);
    // IITC core on the beta fixture
    expect((core as Plugin).version).to.equal('0.33.0');
  });

  it('retries a new URL that failed after the pause, not after the interval', async function () {
    const { manager } = await createManager('custom');
    const result = await manager.setCustomChannelUrl(offlineHost);

    expect(result.ok).to.be.false;
    const { internal } = await manager.getUpdateStatus();
    expect(internal.lastCheck).to.be.null;
    expect(internal.retry!.failures).to.equal(1);
    expect(internal.nextCheck).to.equal(internal.retry!.at);
  });

  it('does not check the URL while another channel is active', async function () {
    const { manager, urls } = await createManager('release');
    await manager.setCustomChannelUrl(betaHost);
    expect(urls).to.be.empty;
  });

  it('does not check again when the URL is saved unchanged', async function () {
    const { manager, urls } = await createManager('custom');
    await manager.setCustomChannelUrl(host);
    expect(urls).to.be.empty;
  });
});
