// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import { IITC_CORE_UID } from '../src/worker.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type {
  ManagerConfig,
  Plugin,
  PluginDict,
  PluginEventData,
  StorageData,
} from '../src/types.js';

const expectThrowsAsync = async (
  method: () => Promise<unknown>,
  errorMessage?: string
): Promise<void> => {
  let error: Error | null = null;
  try {
    await method();
  } catch (err) {
    error = err as Error;
  }
  expect(error).to.be.an('Error');
  if (errorMessage) {
    expect(error!.message).to.equal(errorMessage);
  }
};

describe('manage.js external plugins integration tests', function () {
  let manager: Manager | null = null;
  let pluginEventCallback = (data: PluginEventData) => {
    expect(data).to.have.all.keys('event', 'plugins');
    expect(data['event']).to.equal('update');
    expect(data['plugins']).to.have.all.keys(IITC_CORE_UID);
    expect(data['plugins'][IITC_CORE_UID]).to.have.property('uid', IITC_CORE_UID);
  };
  before(function () {
    storage.resetStorage();
    const params: ManagerConfig = {
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: (data: Plugin) => {
        expect(data['code']).to.include('// ==UserScript==');
      },
      onPluginEvent: (data: PluginEventData) => {
        pluginEventCallback(data);
      },
      onProgress: (isShow: boolean) => {
        expect(isShow).to.be.oneOf([true, false]);
      },
      isDaemon: false,
    };
    manager = new Manager(params);
  });

  const firstPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const secondPluginUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const thirdPluginUid = 'Plugin C+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const externalCode = '// ==UserScript==\nreturn false;';

  describe('run', function () {
    it('Should not return an error', async function () {
      const run = await manager!.run();
      expect(run).to.be.undefined;
    });
  });

  describe('Manage external plugins', function () {
    const external1Uid =
      'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external2Uid =
      'Bookmarks2 for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';

    it('Add external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.have.property('uid', external1Uid);
      };
      const scripts = [
        {
          meta: {
            id: 'bookmarks1',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Bookmarks for maps and portals',
            category: 'Controls',
          },
          code: externalCode,
        },
      ];
      const installed: PluginDict = {};
      installed[external1Uid] = {
        uid: external1Uid,
        id: 'bookmarks1',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Bookmarks for maps and portals',
        category: 'Controls',
        status: 'on',
        user: true,
        filename: 'Bookmarks for maps and portals.user.js',
        code: externalCode,
      };
      const run = await manager!.addUserScripts(scripts);
      delete (run as PluginDict)[external1Uid]['addedAt'];
      delete (run as PluginDict)[external1Uid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);

      const dbData = await storage.get([
        'release_plugins_catalog',
        'plugins_user',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid);

      expect(
        (pluginsState[external1Uid] as StorageData)['status'],
        "pluginsState['status']: " + external1Uid
      ).to.equal('on');

      expect(
        (pluginsUser[external1Uid] as StorageData)['code'],
        "pluginsUser['code']: " + external1Uid
      ).to.equal(externalCode);
    });

    it('Add external plugin without category', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(external2Uid);
        expect(data['plugins'][external2Uid]).to.have.property('uid', external2Uid);
      };

      const scripts = [
        {
          meta: {
            id: 'bookmarks2',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Bookmarks2 for maps and portals',
          },
          code: externalCode,
        },
      ];
      const installed: PluginDict = {};
      installed[external2Uid] = {
        uid: external2Uid,
        id: 'bookmarks2',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Bookmarks2 for maps and portals',
        category: 'Misc',
        status: 'on',
        user: true,
        filename: 'Bookmarks2 for maps and portals.user.js',
        code: externalCode,
      };
      const run = await manager!.addUserScripts(scripts);
      delete (run as PluginDict)[external2Uid]['addedAt'];
      delete (run as PluginDict)[external2Uid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);

      const dbData = await storage.get([
        'release_plugins_catalog',
        'plugins_user',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid, external2Uid);

      expect(
        (pluginsState[external2Uid] as StorageData)['status'],
        "pluginsState['status']: " + external2Uid
      ).to.equal('on');

      expect(
        (pluginsUser[external2Uid] as StorageData)['category'],
        "pluginsUser['category']: " + external2Uid
      ).to.equal('Misc');

      expect(
        (pluginsUser[external2Uid] as StorageData)['code'],
        "pluginsUser['code']: " + external2Uid
      ).to.equal(externalCode);
    });

    it('Add external plugin with empty meta', async function () {
      const scripts = [
        {
          meta: {
            name: 'Bookmarks3 for maps and portals',
          },
          code: externalCode,
        },
      ];
      await expectThrowsAsync(
        () => manager!.addUserScripts(scripts),
        'The plugin has an incorrect ==UserScript== header'
      );

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.have.all.keys(external1Uid, external2Uid);
    });

    it('Check categories before switching channel', async function () {
      const { categories } = await manager!.getPluginsView();
      expect(categories).to.include.all.keys('Info', 'Map Tiles', 'Controls', 'Misc');
    });

    it('Switching to the Beta channel and back to Release', async function () {
      // Enable a built-in plugin to test cross-channel code hydration
      pluginEventCallback = () => {};
      await manager!.managePlugin(firstPluginUid, 'on');

      const seenEvents: string[] = [];
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        seenEvents.push(data['event']);
        // User plugin UIDs must never appear in channel-switch events
        expect(data['plugins']).to.not.have.any.keys(external1Uid, external2Uid);
      };
      expect(await manager!.setChannel('beta')).to.be.undefined;
      // 'remove' for firstPluginUid (was enabled in release)
      // 'update' for IITC core
      // 'add' for firstPluginUid hydrated with beta-channel code
      expect(seenEvents).to.include('remove');
      expect(seenEvents).to.include('update');
      expect(seenEvents).to.include('add');

      // Verify beta-specific code was downloaded for the enabled built-in plugin
      const betaLocal = await storage.get(['beta_plugins_local']);
      const betaFirstPlugin = (betaLocal['beta_plugins_local'] as StorageData)[
        firstPluginUid
      ] as StorageData;
      expect(betaFirstPlugin).to.have.property('code');
      expect(betaFirstPlugin['code'] as string).to.include('0.2.0');

      // Beta catalog has a 'Beta' category (beta-plugin-a) not present in release
      const { categories: betaCategories, plugins: betaPlugins } = await manager!.getPluginsView();
      expect(betaCategories).to.include.all.keys('Info', 'Map Tiles', 'Beta', 'Controls', 'Misc');
      const drawUid = 'Beta plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
      expect(betaPlugins).to.have.property(drawUid);
      expect(betaPlugins[drawUid]).to.have.property('status', 'off');
      // User plugins are still visible in the view after channel switch
      expect(betaPlugins).to.have.property(external1Uid);
      expect(betaPlugins[external1Uid]).to.have.property('status', 'on');
      // Built-in plugin is still enabled after channel switch
      expect(betaPlugins[firstPluginUid]).to.have.property('status', 'on');

      seenEvents.length = 0;
      expect(await manager!.setChannel('release')).to.be.undefined;
      expect(seenEvents).to.include('update');
    });

    it('Check categories after switching channel back to Release', async function () {
      const { categories, plugins } = await manager!.getPluginsView();
      // Release catalog does not have 'Draw' category
      expect(categories).to.include.all.keys('Info', 'Map Tiles', 'Controls', 'Misc');
      expect(categories).to.not.have.key('Beta');
      const drawUid = 'Beta plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
      expect(plugins).to.not.have.property(drawUid);
    });

    it('Disable external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external2Uid);
        expect(data['plugins'][external2Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external2Uid, 'off');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'plugins_user',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid, external2Uid);

      expect(
        (pluginsState[external2Uid] as StorageData)['status'],
        "pluginsState['status']: " + external2Uid
      ).to.equal('off');
    });

    it('Enable external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(external2Uid);
        expect(data['plugins'][external2Uid]).to.have.property('uid', external2Uid);
      };

      const run = await manager!.managePlugin(external2Uid, 'on');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'plugins_user',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid, external2Uid);

      expect(
        (pluginsState[external2Uid] as StorageData)['status'],
        "pluginsState['status']: " + external2Uid
      ).to.equal('on');
    });

    it('Remove the first external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external2Uid);
        expect(data['plugins'][external2Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external2Uid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.have.all.keys(external1Uid);
    });

    it('Remove the second external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external1Uid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.be.empty;
    });
  });

  describe('Re-adding an external plugin', function () {
    const external1Uid =
      'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';

    it('Double adding an external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.have.property('uid', external1Uid);
      };

      const scripts = [
        {
          meta: {
            id: 'bookmarks1',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Bookmarks for maps and portals',
            category: 'Controls',
          },
          code: externalCode,
        },
        {
          meta: {
            id: 'bookmarks1',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Bookmarks for maps and portals',
            category: 'Controls',
          },
          code: externalCode,
        },
      ];
      const installed: PluginDict = {};
      installed[external1Uid] = {
        uid: 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
        id: 'bookmarks1',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Bookmarks for maps and portals',
        category: 'Controls',
        status: 'on',
        user: true,
        filename: 'Bookmarks for maps and portals.user.js',
        code: externalCode,
      };
      const run = await manager!.addUserScripts(scripts);
      delete (run as PluginDict)[external1Uid]['addedAt'];
      delete (run as PluginDict)[external1Uid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);
    });

    it('Check external plugin', async function () {
      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.have.all.keys(external1Uid);
      const pluginInfo = await manager!.getPluginInfo(external1Uid);
      expect(pluginInfo!.override).to.be.undefined;
    });

    it('Remove the external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external1Uid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.be.empty;
    });
  });

  describe('Manage external plugins that replace built-in plugins', function () {
    const external1Uid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

    it('Add external plugin and replace built-in plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.have.property('uid', external1Uid);
      };

      const scripts = [
        {
          meta: {
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Plugin A',
          },
          code: externalCode,
        },
      ];
      const installed: PluginDict = {};
      installed[external1Uid] = {
        uid: external1Uid,
        id: 'plugin-a',
        author: 'test-author',
        description: 'Plugin A.',
        filename: 'plugin-a.user.js',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Plugin A',
        category: 'Info',
        status: 'on',
        override: true,
        user: true,
        version: '0.1.0',
        code: externalCode,
      };
      const run = await manager!.addUserScripts(scripts);
      delete (run as PluginDict)[external1Uid]['addedAt'];
      delete (run as PluginDict)[external1Uid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid);

      expect(
        (pluginsUser[external1Uid] as StorageData)['code'],
        "pluginsUser['code']: " + external1Uid
      ).to.equal(externalCode);

      const pluginView = await manager!.getPluginInfo(external1Uid);
      expect(pluginView!.override, "getPluginInfo()['override']: " + external1Uid).to.be.true;
    });

    it('Info about plugin', async function () {
      const info = await manager!.getPluginInfo(external1Uid);
      expect(info).to.be.an('object');
      expect(info!['uid']).to.be.equal(external1Uid);
      expect(info!['status']).to.be.equal('on');
      expect(info!['override']).to.be.true;
      expect(info!['user']).to.be.true;
      expect(info!['code']).to.be.equal(externalCode);
    });

    it('Disable external plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external1Uid);
        expect(data['plugins'][external1Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external1Uid, 'off');
      expect(run).to.be.undefined;

      const dbData = await storage.get([
        'release_plugins_catalog',
        'plugins_user',
        'plugins_state',
      ]);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external1Uid);

      expect(
        (pluginsState[external1Uid] as StorageData)['status'],
        "pluginsState['status']: " + external1Uid
      ).to.equal('off');
    });

    it('Remove external plugin and replace it with built-in plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.be.empty;
      };

      const run = await manager!.managePlugin(external1Uid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.be.empty;

      const pluginAfter = await manager!.getPluginInfo(external1Uid);
      expect(pluginAfter!.status, "getPluginInfo()['status']: " + external1Uid).to.not.equal('on');
      expect(pluginAfter!.override, "getPluginInfo()['override']: " + external1Uid).to.not.be.true;
    });
  });

  describe('Adding and removing an external plugin that overwrites a built-in plugin', function () {
    const external3Uid = 'Plugin C+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external3Plugin = {
      meta: {
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Plugin C',
      },
      code: externalCode,
    };

    it('Add external plugin and replace built-in plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(external3Uid);
        expect(data['plugins'][external3Uid]).to.have.property('uid', external3Uid);
      };

      const installed: PluginDict = {};
      installed[external3Uid] = {
        uid: external3Uid,
        id: 'plugin-c',
        author: 'test-author',
        description: 'Plugin C.',
        filename: 'plugin-c.user.js',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Plugin C',
        category: 'Info',
        status: 'on',
        override: true,
        user: true,
        version: '0.1.0',
        code: externalCode,
      };
      const run = await manager!.addUserScripts([external3Plugin]);
      delete (run as PluginDict)[external3Uid]['addedAt'];
      delete (run as PluginDict)[external3Uid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      const pluginsCatalog = dbData['release_plugins_catalog'] as StorageData;
      const pluginsUser = dbData['plugins_user'] as StorageData;
      expect(pluginsCatalog, 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(pluginsUser, 'plugins_user').to.have.all.keys(external3Uid);

      expect(
        (pluginsUser[external3Uid] as StorageData)['code'],
        "pluginsUser['code']: " + external3Uid
      ).to.equal(externalCode);
      const pluginView3 = await manager!.getPluginInfo(external3Uid);
      expect(pluginView3!.override, "getPluginInfo()['override']: " + external3Uid).to.be.true;
    });

    it('Remove external plugin and replace it with built-in plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external3Uid);
        expect(data['plugins'][external3Uid]).to.be.empty;
      };

      const run = await manager!.managePlugin(external3Uid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['release_plugins_catalog', 'plugins_user']);
      expect(dbData['release_plugins_catalog'], 'release_plugins_catalog').to.have.all.keys(
        firstPluginUid,
        secondPluginUid,
        thirdPluginUid
      );
      expect(dbData['plugins_user'], 'plugins_user').to.be.empty;

      const pluginAfter3 = await manager!.getPluginInfo(external3Uid);
      expect(pluginAfter3!.status, "getPluginInfo()['status']: " + external3Uid).to.not.equal('on');
      expect(pluginAfter3!.override, "getPluginInfo()['override']: " + external3Uid).to.not.be.true;
    });

    it('Enable and disable build-in plugin', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('add');
        expect(data['plugins']).to.have.all.keys(external3Uid);
        expect(data['plugins'][external3Uid]).to.have.property('uid', external3Uid);
      };

      const run1 = await manager!.managePlugin(external3Uid, 'on');
      expect(run1).to.be.undefined;

      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('remove');
        expect(data['plugins']).to.have.all.keys(external3Uid);
        expect(data['plugins'][external3Uid]).to.be.empty;
      };

      const run2 = await manager!.managePlugin(external3Uid, 'off');
      expect(run2).to.be.undefined;

      const dbData = await storage.get(['release_plugins_local', 'plugins_state']);
      const pluginsLocal = dbData['release_plugins_local'] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      expect(
        (pluginsState[external3Uid] as StorageData)['status'],
        "pluginsState['status']: " + external3Uid
      ).to.equal('off');
      expect(
        (pluginsLocal[external3Uid] as StorageData)['code'],
        "release_pluginsLocal['code']: " + external3Uid
      ).to.not.equal(externalCode);
      const pluginViewAfter = await manager!.getPluginInfo(external3Uid);
      expect(pluginViewAfter!.override, "getPluginInfo()['override']: " + external3Uid).to.not.be
        .true;
    });
  });

  describe('Adding and removing custom IITC core script', function () {
    const iitcCustomUid =
      'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const iitcCustom = {
      meta: {
        author: 'jonatkins',
        name: 'IITC: Ingress intel map total conversion',
        version: '0.99.0',
        description: 'Total conversion for the ingress intel map.',
        id: 'total-conversion-build',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
      },
      code: externalCode,
    };
    it('Add custom IITC core script', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(iitcCustomUid);
        expect(data['plugins'][iitcCustomUid]).to.have.property('uid', iitcCustomUid);
      };

      const run = await manager!.addUserScripts([iitcCustom]);
      expect(run).to.have.all.keys(iitcCustomUid);

      const dbData = await storage.get(['iitc_core_user']);
      expect((dbData['iitc_core_user'] as StorageData)['code'], "iitc_core_user['code']").to.equal(
        externalCode
      );
    });
    it('Check core in view for custom IITC', async function () {
      const { core } = await manager!.getPluginsView();
      expect(core, 'core').to.have.all.keys(
        'author',
        'code',
        'description',
        'id',
        'name',
        'namespace',
        'override',
        'uid',
        'version'
      );
      expect(core!['override'], "core object must have the 'override' parameter set to true").to.be
        .true;
    });
    it('Remove custom IITC core script', async function () {
      pluginEventCallback = (data: PluginEventData) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(iitcCustomUid);
        expect(data['plugins'][iitcCustomUid]).to.be.empty;
      };

      const run = await manager!.managePlugin(iitcCustomUid, 'delete');
      expect(run).to.be.undefined;

      const dbData = await storage.get(['iitc_core_user']);
      expect(dbData['iitc_core_user'], 'iitc_core_user must be empty object').to.deep.equal({});
    });
    it('Check core in view for standard IITC', async function () {
      const { core: script } = await manager!.getPluginsView();
      expect(script, 'core').to.have.all.keys(
        'uid',
        'author',
        'code',
        'description',
        'downloadURL',
        'grant',
        'id',
        'match',
        'name',
        'namespace',
        'runAt',
        'updateURL',
        'version'
      );
    });
  });

  describe('Timestamps for external plugins', function () {
    let manager: Manager | null = null;
    const currentTime = Math.floor(Date.now() / 1000);

    // External plugin data for testing
    const externalPluginUid =
      'Test Plugin+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const pluginData = {
      meta: {
        id: 'test-plugin',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Test Plugin',
        category: 'Test',
      },
      code: '// ==UserScript==\nreturn false;',
    };

    before(function () {
      storage.resetStorage();
      // Setup manager with standard configuration
      manager = new Manager({
        storage: storage,
        channel: 'release',
        networkHost: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        injectPlugin: (data: Plugin) => {
          expect(data['code']).to.include('// ==UserScript==');
        },
        onPluginEvent: () => {},
        onProgress: (isShow: boolean) => {
          expect(isShow).to.be.oneOf([true, false]);
        },
        isDaemon: false,
      });
    });

    it('should set addedAt and statusChangedAt when adding new plugin', async function () {
      // Add plugin
      await manager!.addUserScripts([pluginData]);

      // Get stored data
      const dbData = await storage.get(['plugins_user', 'plugins_state']);
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const userPlugin = pluginsUser[externalPluginUid] as StorageData;

      // Check addedAt in plugins_user
      expect(userPlugin).to.have.property('addedAt');
      expect(userPlugin.addedAt).to.be.a('number');
      expect(userPlugin.addedAt as number).to.be.closeTo(currentTime, 15);

      // Check statusChangedAt in plugins_state
      const pluginsState = dbData['plugins_state'] as StorageData;
      const stateEntry = pluginsState[externalPluginUid] as StorageData;
      expect(stateEntry).to.have.property('statusChangedAt');
      expect(stateEntry.statusChangedAt as number).to.be.closeTo(currentTime, 15);
    });

    it('should update statusChangedAt when toggling plugin status', async function () {
      const before = await storage.get(['plugins_state', 'plugins_user']);
      const oldStatusChangedAt = (
        (before['plugins_state'] as StorageData)[externalPluginUid] as StorageData
      ).statusChangedAt as number;

      // Wait 1 second to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Toggle plugin off
      await manager!.managePlugin(externalPluginUid, 'off');

      const dbData = await storage.get(['plugins_state', 'plugins_user']);
      const pluginsState = dbData['plugins_state'] as StorageData;
      const stateEntry = pluginsState[externalPluginUid] as StorageData;

      // Check new statusChangedAt
      expect(stateEntry.statusChangedAt as number).to.be.above(oldStatusChangedAt);

      // Original addedAt should remain unchanged in plugins_user
      const pluginsUser = dbData['plugins_user'] as StorageData;
      expect((pluginsUser[externalPluginUid] as StorageData).addedAt).to.equal(
        ((before['plugins_user'] as StorageData)[externalPluginUid] as StorageData).addedAt
      );
    });

    it('should handle timestamps correctly when removing plugin', async function () {
      // Get initial data
      const before = await storage.get(['plugins_user', 'plugins_state']);
      const beforeUser = (before['plugins_user'] as StorageData)[externalPluginUid] as StorageData;
      expect(beforeUser).to.have.property('addedAt');
      const beforeState = (before['plugins_state'] as StorageData)[
        externalPluginUid
      ] as StorageData;
      expect(beforeState).to.have.property('statusChangedAt');

      // Remove plugin
      await manager!.managePlugin(externalPluginUid, 'delete');

      // Check data after removal
      const after = await storage.get(['plugins_user']);

      // Plugin should be removed from plugins_user
      expect(after['plugins_user']).to.not.have.property(externalPluginUid);
    });
  });

  describe('Timestamps for plugins overriding built-in plugins', function () {
    let manager: Manager | null = null;
    const builtInPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';

    before(async function () {
      storage.resetStorage();
      manager = new Manager({
        storage: storage,
        channel: 'release',
        networkHost: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        injectPlugin: (data: Plugin) => {
          expect(data['code']).to.include('// ==UserScript==');
        },
        onPluginEvent: () => {},
        onProgress: (isShow: boolean) => {
          expect(isShow).to.be.oneOf([true, false]);
        },
        isDaemon: false,
      });

      // Initialize built-in plugins
      await manager.run();
    });

    it('should handle timestamps correctly when overriding built-in plugin', async function () {
      const overridePlugin = {
        meta: {
          namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
          name: 'Plugin A',
        },
        code: '// ==UserScript==\nreturn false;',
      };

      // Add overriding plugin
      await manager!.addUserScripts([overridePlugin]);

      const dbData = await storage.get(['plugins_user', 'plugins_state']);
      const pluginsUser = dbData['plugins_user'] as StorageData;
      const userPlugin = pluginsUser[builtInPluginUid] as StorageData;
      const pluginsState = dbData['plugins_state'] as StorageData;
      const stateEntry = pluginsState[builtInPluginUid] as StorageData;

      // Check addedAt in plugins_user
      expect(userPlugin).to.have.property('addedAt');
      // Check statusChangedAt in plugins_state
      expect(stateEntry).to.have.property('statusChangedAt');
    });

    it('should update statusChangedAt when toggling overridden plugin', async function () {
      const before = await storage.get(['plugins_state', 'plugins_user']);
      const beforeState = (before['plugins_state'] as StorageData)[builtInPluginUid] as StorageData;
      const oldStatusChangedAt = beforeState.statusChangedAt as number;
      const beforeUser = (before['plugins_user'] as StorageData)[builtInPluginUid] as StorageData;
      const addedAt = beforeUser.addedAt;

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Toggle plugin off
      await manager!.managePlugin(builtInPluginUid, 'off');

      const after = await storage.get(['plugins_state', 'plugins_user']);
      const afterState = (after['plugins_state'] as StorageData)[builtInPluginUid] as StorageData;

      // Check statusChangedAt updated
      expect(afterState.statusChangedAt as number).to.be.above(oldStatusChangedAt);

      // Check addedAt preserved in plugins_user
      const afterUser = (after['plugins_user'] as StorageData)[builtInPluginUid] as StorageData;
      expect(afterUser.addedAt).to.equal(addedAt);
    });

    it('should handle timestamps correctly when removing override', async function () {
      // Remove override
      await manager!.managePlugin(builtInPluginUid, 'delete');

      const dbData = await storage.get(['plugins_user']);

      // Override should be removed from plugins_user
      expect(dbData['plugins_user']).to.not.have.property(builtInPluginUid);
      // Built-in plugin restored in catalog view should not have addedAt
      const pluginView = await manager!.getPluginInfo(builtInPluginUid);
      expect(pluginView!).to.not.have.property('addedAt');
    });
  });
});
