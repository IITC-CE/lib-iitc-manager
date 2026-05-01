// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { BackupData, ManagerConfig, Plugin, PluginDict, StorageData } from '../src/types.js';

describe('getBackupData and setBackupData', function () {
  let manager: Manager | null = null;
  const firstPluginUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const externalCode = '// ==UserScript==\n// @name IITC plugin\n// ==/UserScript==\nreturn false;';
  const externalIitcCode =
    '// ==UserScript==\n' +
    '// @name IITC: Ingress intel map total conversion\n' +
    '// @namespace https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
    '// ==/UserScript==\n' +
    'return false;';
  const initialBackupData: BackupData = {
    external_plugins: {
      shared: {
        'total-conversion-build.user.js': externalIitcCode,
        'Bookmarks for maps and portals.user.js': externalCode,
      },
    },
    data: {
      iitc_settings: {
        channel: 'release',
        network_host: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        plugins_state: {
          [firstPluginUid]: { status: 'on' },
          'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion':
            { status: 'on' },
        },
      },
      plugins_data: {
        VMin5555: 'test',
      },
      app: 'IITC Button',
    },
  };

  const backupCode2 =
    '// ==UserScript==\n' +
    '// @name Bookmarks2 for maps\n' +
    '// @namespace https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
    '// ==/UserScript==\n' +
    'return false;';
  const backupCode3 =
    '// ==UserScript==\n' +
    '// @name Bookmarks3 for maps\n' +
    '// @namespace https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
    '// ==/UserScript==\n' +
    'return false;';
  const backupData: BackupData = {
    external_plugins: {
      release: {
        'Bookmarks2 for maps.user.js': backupCode2,
      },
      beta: {
        'total-conversion-build.user.js': externalIitcCode,
        'Bookmarks3 for maps.user.js': backupCode3,
      },
    },
    data: {
      iitc_settings: {
        channel: 'beta',
      },
      plugins_data: {
        VMin5555: 'backup1',
        VMin9999: 'backup2',
      },
      app: 'IITC Button',
    },
  };

  before(async function () {
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
      onProgress: (isShow: boolean) => {
        expect(isShow).to.be.oneOf([true, false]);
      },
      isDaemon: false,
    };
    manager = new Manager(params);
  });

  describe('run', function () {
    it('Should not return an error', async function () {
      const run = await manager!.run();
      expect(run).to.be.undefined;
    });
  });

  describe('Enable plugins and add plugin settings data', function () {
    it('Enable first plugin', async function () {
      const run = await manager!.managePlugin(firstPluginUid, 'on');
      expect(run).to.be.undefined;
    });
    it('Add custom IITC core', async function () {
      const scripts = [
        {
          meta: {
            id: 'total-conversion-build',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'IITC: Ingress intel map total conversion',
            filename: 'total-conversion-build.user.js',
          },
          code: externalIitcCode,
        },
      ];
      const installed: PluginDict = {
        'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion':
          {
            uid: 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion',
            id: 'total-conversion-build',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'IITC: Ingress intel map total conversion',
            code: externalIitcCode,
            filename: 'total-conversion-build.user.js',
          },
      };
      const run = await manager!.addUserScripts(scripts);
      expect(run).to.deep.equal(installed);
    });
    it('Add external plugin', async function () {
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
      const pluginUid =
        'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const installed: PluginDict = {};
      installed[pluginUid] = {
        uid: pluginUid,
        id: 'bookmarks1',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'Bookmarks for maps and portals',
        category: 'Controls',
        status: 'on',
        user: true,
        code: externalCode,
      };
      const run = await manager!.addUserScripts(scripts);
      delete (run as PluginDict)[pluginUid]['filename'];
      delete (run as PluginDict)[pluginUid]['addedAt'];
      delete (run as PluginDict)[pluginUid]['statusChangedAt'];
      expect(run).to.deep.equal(installed);
    });
    it('Add plugin settings data', async function () {
      await storage.set({ VMin5555: 'test' });
    });
  });

  describe('getBackupData', function () {
    it('Should return the correct backup data', async function () {
      const backupDataFromManager = await manager!.getBackupData({
        settings: true,
        data: true,
        external: true,
      });
      expect(backupDataFromManager).to.deep.equal(initialBackupData);
    });
  });

  describe('setBackupData', function () {
    it('Should set the backup data correctly', async function () {
      await manager!.setBackupData(
        {
          settings: true,
          data: true,
          external: true,
        },
        backupData
      );

      // Check if the data was set correctly in storage
      expect(manager!.channel).to.equal('beta');

      const pluginsData = await storage.get(['VMin5555', 'VMin9999']);
      expect(pluginsData).to.deep.equal({
        VMin5555: 'backup1',
        VMin9999: 'backup2',
      });

      const externalCore = await storage.get(['iitc_core_user']);
      expect(externalCore['iitc_core_user'] as StorageData).to.deep.equal({
        uid: 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion',
        name: 'IITC: Ingress intel map total conversion',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        code: externalIitcCode,
        filename: 'total-conversion-build.user.js',
      });

      const externalPlugins = await storage.get(['plugins_user']);
      const pluginsUser = externalPlugins['plugins_user'] as StorageData;
      expect(pluginsUser).to.include.all.keys(
        'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
        'Bookmarks2 for maps+https://github.com/IITC-CE/ingress-intel-total-conversion',
        'Bookmarks3 for maps+https://github.com/IITC-CE/ingress-intel-total-conversion'
      );
    });
  });
});
