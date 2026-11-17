// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('Update check keeps the host it started with', function () {
  it('custom URL changed mid-check does not leak into the running check', async function () {
    storage.resetStorage();
    const releaseHost = 'http://127.0.0.1:31606/release';
    const betaHost = 'http://127.0.0.1:31606/beta';
    const manager = new Manager({
      storage,
      channel: 'custom',
      networkHost: {
        release: releaseHost,
        beta: 'http://127.0.0.1:31606/beta',
        custom: releaseHost,
      },
      isDaemon: false,
    });
    await manager.run();
    await manager.managePlugin(
      'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion',
      'on'
    );

    const urls: string[] = [];
    const getUrl = manager._getUrl.bind(manager);
    let release!: () => void;
    const oldCheckEnded = new Promise<void>(resolve => (release = resolve));
    let changing: Promise<unknown> | undefined;
    manager._getUrl = async (url, variant) => {
      urls.push(url);
      // The check of the new URL waits until the old one ends
      if (url.startsWith(betaHost)) await oldCheckEnded;
      const result = await getUrl(url, variant);
      if (variant === 'parseJSON' && !changing) changing = manager.setCustomChannelUrl(betaHost);
      return result;
    };
    await manager.checkUpdates(true);
    release();
    await changing;

    expect(urls.filter(url => url.startsWith(releaseHost))).to.deep.equal([
      `${releaseHost}/meta.json`,
      `${releaseHost}/total-conversion-build.user.js`,
      `${releaseHost}/plugins/plugin-a.user.js`,
    ]);
  });
});
