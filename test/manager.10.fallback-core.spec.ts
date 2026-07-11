// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { ManagerConfig, PluginsView, StorageData } from '../src/types.js';

const baseConfig: Omit<ManagerConfig, 'channel' | 'onPluginEvent'> = {
  storage,
  networkHost: {
    release: 'http://127.0.0.1:31606/release',
    beta: 'http://127.0.0.1:31606/beta',
    custom: 'http://127.0.0.1/',
  },
  injectPlugin: () => {},
  onProgress: () => {},
  isDaemon: false,
};

const fallbackCoreCode = `// ==UserScript==
// @id             total-conversion-build
// @name           IITC: Ingress intel map total conversion
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @version        0.0.1-fallback
// @match          https://intel.ingress.com/*
// ==/UserScript==

console.log('fallback core');
`;

describe('fallbackCore: offline fallback for IITC core on cold start', function () {
  it('is seeded into storage when storage is empty and channel is release', async function () {
    storage.resetStorage();
    const viewsSeen: PluginsView[] = [];
    const manager = new Manager({
      ...baseConfig,
      channel: 'release',
      fallbackCore: fallbackCoreCode,
      onPluginEvent: () => {},
      onPluginsViewChanged: view => viewsSeen.push(view),
    });
    await manager.ready;

    const db = await storage.get(['release_iitc_core']);
    const seeded = db['release_iitc_core'] as StorageData;
    expect(seeded).to.exist;
    expect(seeded.uid).to.equal(IITC_CORE_UID);
    expect(seeded.code).to.equal(fallbackCoreCode);

    // Visible via getPluginsView() right after construction, before run() is ever called
    const { core } = await manager.getPluginsView();
    expect(core).to.not.be.null;
    expect(core!.uid).to.equal(IITC_CORE_UID);
    expect(core!.code).to.equal(fallbackCoreCode);

    // onPluginsViewChanged must have already fired with the seeded core
    expect(viewsSeen.some(v => v.core?.uid === IITC_CORE_UID)).to.be.true;
  });

  it('is not seeded when the active channel is not release', async function () {
    storage.resetStorage();
    const manager = new Manager({
      ...baseConfig,
      channel: 'beta',
      fallbackCore: fallbackCoreCode,
      onPluginEvent: () => {},
    });
    await manager.ready;

    const db = await storage.get(['release_iitc_core', 'beta_iitc_core']);
    expect(db['release_iitc_core']).to.be.null;
    expect(db['beta_iitc_core']).to.be.null;
  });

  it('is not seeded when release_iitc_core is already present', async function () {
    storage.resetStorage();
    await storage.set({
      release_iitc_core: { uid: 'existing-uid', code: 'existing code' },
    });
    const manager = new Manager({
      ...baseConfig,
      channel: 'release',
      fallbackCore: fallbackCoreCode,
      onPluginEvent: () => {},
    });
    await manager.ready;

    const db = await storage.get(['release_iitc_core']);
    expect((db['release_iitc_core'] as StorageData).uid).to.equal('existing-uid');
  });

  it('is not seeded when a user core override (iitc_core_user) is already present', async function () {
    storage.resetStorage();
    await storage.set({
      iitc_core_user: { uid: 'user-core-uid', code: 'user override code' },
    });
    const manager = new Manager({
      ...baseConfig,
      channel: 'release',
      fallbackCore: fallbackCoreCode,
      onPluginEvent: () => {},
    });
    await manager.ready;

    const db = await storage.get(['release_iitc_core']);
    expect(db['release_iitc_core']).to.be.null;
  });

  it('does not set last_modified/last_check_update, so the next run() still performs a real fetch', async function () {
    storage.resetStorage();
    const manager = new Manager({
      ...baseConfig,
      channel: 'release',
      fallbackCore: fallbackCoreCode,
      onPluginEvent: () => {},
    });
    await manager.ready;

    const before = await storage.get(['release_last_modified', 'last_check_update']);
    expect(before['release_last_modified']).to.be.null;
    expect(before['last_check_update']).to.be.null;

    await manager.run();

    const after = await storage.get([
      'release_last_modified',
      'last_check_update',
      'release_iitc_core',
    ]);
    expect(after['release_last_modified']).to.exist;
    expect(after['last_check_update']).to.exist;

    // The fallback is transparently replaced by the real download from the test server
    const core = after['release_iitc_core'] as StorageData;
    expect(core.code).to.not.equal(fallbackCoreCode);
    expect(core.code as string).to.include('0.32.1');
  });
});
