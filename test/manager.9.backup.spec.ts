// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type {
  BackupData,
  ManagerConfig,
  Plugin,
  PluginDict,
  PluginEventData,
  StorageData,
} from '../src/types.js';

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
      expect(run.ok).to.be.true;
    });
  });

  describe('Enable plugins and add plugin settings data', function () {
    it('Enable first plugin', async function () {
      const run = await manager!.managePlugin(firstPluginUid, 'on');
      expect(run).to.deep.equal({ ok: true });
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

describe('setBackupData preserves the disabled state of restored external plugins', function () {
  // The backup marks an external plugin as "off", but addUserScripts() force-enables
  // every re-installed script. The import order must keep the backup's status.
  const pluginExtCode =
    '// ==UserScript==\n' +
    '// @name PluginExt\n' +
    '// @namespace https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
    '// ==/UserScript==\n' +
    'return false;';
  const pluginExtUid = 'PluginExt+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const restoreBackup: BackupData = {
    external_plugins: {
      shared: {
        'PluginExt.user.js': pluginExtCode,
      },
    },
    data: {
      iitc_settings: {
        channel: 'release',
        plugins_state: {
          [pluginExtUid]: { status: 'off' },
        },
      },
      plugins_data: {},
      app: 'IITC Button',
    },
  };

  it('Keeps the off status from the backup after re-installing the code', async function () {
    storage.resetStorage();
    const manager = new Manager({
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      injectPlugin: () => {},
      onProgress: () => {},
      isDaemon: false,
    });
    await manager.run();

    await manager.setBackupData({ settings: true, data: true, external: true }, restoreBackup);

    const pluginsState = (await storage.get(['plugins_state']))['plugins_state'] as StorageData;
    const entry = pluginsState[pluginExtUid] as StorageData;
    expect(entry['status']).to.equal('off');
  });
});

describe('setBackupData with a backup that has no usable channel', function () {
  // IITC Button imports settings even from a backup exported without them
  const cases: [string, StorageData][] = [
    ['no channel', {}],
    ['an unknown channel', { channel: 'unknown' }],
  ];

  for (const [title, channelSetting] of cases) {
    it(`Keeps the current channel when the backup has ${title}`, async function () {
      storage.resetStorage();
      const manager = new Manager({
        storage: storage,
        channel: 'beta',
        networkHost: {
          release: 'http://127.0.0.1:31606/release',
          beta: 'http://127.0.0.1:31606/beta',
          custom: 'http://127.0.0.1/',
        },
        isDaemon: false,
      });

      await manager.setBackupData(
        { settings: true },
        {
          external_plugins: {},
          data: {
            iitc_settings: { ...channelSetting, release_update_check_interval: 3600 },
            plugins_data: {},
            app: 'IITC Button',
          },
        }
      );

      expect(manager.channel).to.equal('beta');
      const stored = await storage.get(['channel', 'release_update_check_interval']);
      expect(stored).to.deep.equal({ channel: 'beta', release_update_check_interval: 3600 });
    });
  }
});

describe('setBackupData with a backup that changes the custom channel URL', function () {
  it('Downloads IITC from the imported URL when switching to the custom channel', async function () {
    storage.resetStorage();
    const networkHost = {
      release: 'http://127.0.0.1:31606/release',
      beta: 'http://127.0.0.1:31606/beta',
      custom: 'http://127.0.0.1:31606/release',
    };
    const manager = new Manager({
      storage: storage,
      channel: 'release',
      networkHost: networkHost,
      isDaemon: false,
    });

    await manager.setBackupData(
      { settings: true },
      {
        external_plugins: {},
        data: {
          iitc_settings: {
            channel: 'custom',
            network_host: { ...networkHost, custom: 'http://127.0.0.1:31606/beta' },
          },
          plugins_data: {},
          app: 'IITC Button',
        },
      }
    );

    // The release fixture has core 0.32.1, the beta fixture 0.33.0
    const core = (await storage.get(['custom_iitc_core']))['custom_iitc_core'] as StorageData;
    expect(core['version']).to.equal('0.33.0');
  });
});

describe('setBackupData with a backup that changes which plugins are enabled', function () {
  const pluginAUid = 'Plugin A+https://github.com/IITC-CE/ingress-intel-total-conversion';
  const pluginBUid = 'Plugin B+https://github.com/IITC-CE/ingress-intel-total-conversion';
  let manager: Manager;
  let events: PluginEventData[];

  beforeEach(async function () {
    storage.resetStorage();
    events = [];
    manager = new Manager({
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      isDaemon: false,
      onPluginEvent: e => events.push(e),
    });
    await manager.run();
  });

  /** Imports `settings` on the unchanged channel. */
  async function importSettings(settings: StorageData): Promise<void> {
    events = [];
    await manager.setBackupData(
      { settings: true },
      {
        external_plugins: {},
        data: {
          iitc_settings: { channel: 'release', ...settings },
          plugins_data: {},
          app: 'IITC Button',
        },
      }
    );
  }

  /** Code carried by each `add` event for `uid`. */
  function addedCode(uid: string): (string | undefined)[] {
    return events
      .filter(e => e.event === 'add' && uid in e.plugins)
      .map(e => (e.plugins[uid] as Plugin).code);
  }

  it('Sends a remove event for an enabled plugin missing from the backup', async function () {
    await manager.managePlugin(pluginBUid, 'on');

    await importSettings({ plugins_state: {} });

    expect(events.filter(e => e.event === 'remove' && pluginBUid in e.plugins)).to.have.lengthOf(1);
  });

  it('Sends no remove event when the backup has no plugin state', async function () {
    await manager.managePlugin(pluginBUid, 'on');

    await importSettings({});

    expect(events.filter(e => e.event === 'remove')).to.be.empty;
  });

  it('Downloads a built-in plugin enabled by the backup', async function () {
    await importSettings({ plugins_state: { [pluginAUid]: { status: 'on' } } });

    const code = (await manager.getEnabledPlugins())[pluginAUid]?.code;
    expect(code).to.be.a('string').and.include('Plugin A');
    expect(addedCode(pluginAUid)).to.deep.equal([code]);
  });

  it('Sends an add event for a disabled user plugin enabled by the backup', async function () {
    const code =
      '// ==UserScript==\n// @name User plugin\n// @namespace https://example.com\n// ==/UserScript==';
    const uid = 'User plugin+https://example.com';
    await manager.addUserScripts([
      { meta: { name: 'User plugin', namespace: 'https://example.com' }, code },
    ]);
    await manager.managePlugin(uid, 'off');

    await importSettings({ plugins_state: { [uid]: { status: 'on' } } });

    expect(addedCode(uid)).to.deep.equal([code]);
  });
});

describe('setBackupData with external plugins grouped by channel', function () {
  // The format of backups made before user plugins became global
  const userscript = (name: string): string =>
    `// ==UserScript==\n// @name ${name}\n// @namespace https://example.com\n// ==/UserScript==`;
  let manager: Manager;

  beforeEach(function () {
    storage.resetStorage();
    manager = new Manager({
      storage: storage,
      channel: 'release',
      networkHost: {
        release: 'http://127.0.0.1:31606/release',
        beta: 'http://127.0.0.1:31606/beta',
        custom: 'http://127.0.0.1/',
      },
      isDaemon: false,
    });
  });

  function importExternal(externalPlugins: BackupData['external_plugins']): Promise<void> {
    return manager.setBackupData(
      { external: true },
      {
        external_plugins: externalPlugins,
        data: { iitc_settings: {}, plugins_data: {}, app: 'IITC Button' },
      }
    );
  }

  it('Imports the plugins of every channel without switching channels', async function () {
    await manager.run();
    // A channel switch forces an update check
    const requests: string[] = [];
    const getUrl = manager._getUrl.bind(manager);
    manager._getUrl = async (url, variant) => {
      requests.push(url);
      return getUrl(url, variant);
    };

    await importExternal({
      release: { 'a.user.js': userscript('Plugin of release') },
      beta: { 'b.user.js': userscript('Plugin of beta') },
    });

    expect(requests).to.be.empty;
    expect(await manager.getEnabledPlugins()).to.include.all.keys(
      'Plugin of release+https://example.com',
      'Plugin of beta+https://example.com'
    );
  });

  it('Rejects a file without a UserScript header, keeps the channel and saves nothing', async function () {
    const failure = await importExternal({
      shared: { 'a.user.js': userscript('Valid plugin') },
      beta: { 'x.user.js': 'not a userscript' },
    }).catch((e: Error) => e);

    expect(failure).to.be.an('error');
    expect((failure as Error).message).to.equal(
      'The plugin has an incorrect ==UserScript== header'
    );
    expect(manager.channel).to.equal('release');
    expect((await storage.get(['plugins_user'])).plugins_user ?? {}).to.be.empty;
  });
});
