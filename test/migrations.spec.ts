// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { before, describe, it } from 'mocha';
import { migrate, number_of_migrations } from '../src/migrations.js';
import storage from '../test/storage.js';
import { expect } from 'chai';
import type { StorageData } from '../src/types.js';

const iitc_code = '// ==UserScript==\n// @author jonatkins\n// ==/UserScript==';

describe('test migrations', function () {
  before(async function () {
    await storage.set({
      release_iitc_code: iitc_code,
      release_plugins_flat: {
        'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion':
          {
            id: 'bookmarks',
            namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            name: 'Bookmarks for maps and portals',
            category: 'Controls',
          },
        'External+https://github.com/IITC-CE/ingress-intel-total-conversion': {
          id: 'ext',
          namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
          name: 'External plugin with bug https://github.com/IITC-CE/IITC-Button/issues/68',
          user: true,
          category: undefined,
        },
      },
      release_plugins_user: {
        'ext+https://github.com/IITC-CE/ingress-intel-total-conversion': {
          id: 'bookmarks',
          namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
          name: 'ext',
          category: 'Controls',
        },
      },
      release_update_check_interval: 6,
      lastversion: '1.7.0',
      storage_version: 0,
    });
    await migrate(storage);
  });

  describe('check migrations', function () {
    it('Should replace undefined with "Misc" (fix https://github.com/IITC-CE/IITC-Button/issues/68)', async function () {
      const db_data = await storage.get(['release_plugins_catalog']);
      const ext_plugin = (db_data['release_plugins_catalog'] as StorageData)[
        'External+https://github.com/IITC-CE/ingress-intel-total-conversion'
      ] as StorageData;
      expect(ext_plugin['category']).to.equal('Misc');
    });
    it('Custom plugins should have uid and status in plugins_state', async function () {
      const db_data = await storage.get(['plugins_user', 'plugins_state']);
      const ext_uid = 'ext+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const ext_plugin = (db_data['plugins_user'] as StorageData)[ext_uid] as StorageData;
      expect(ext_plugin['uid']).to.equal(ext_uid);
      const ext_state = (db_data['plugins_state'] as StorageData)[ext_uid] as StorageData;
      expect(ext_state['status']).to.equal('off');
    });
    it('The value of storage_version field has changed', async function () {
      const db_data = await storage.get(['storage_version']);
      expect(db_data['storage_version']).to.equal(number_of_migrations());
    });
    it('Should create `iitc_core` object', async function () {
      const db_data = await storage.get(['release_iitc_core']);
      const iitc_core = db_data['release_iitc_core'] as StorageData;
      expect(iitc_core).to.be.an('object');
      expect(iitc_core['author']).to.equal('jonatkins');
      expect(iitc_core['code']).to.to.include('jonatkins');
    });
    it('Should change _update_check_interval from hours to seconds', async function () {
      const db_data = await storage.get(['release_update_check_interval']);
      expect(db_data['release_update_check_interval']).to.be.equal(6 * 60 * 60);
    });
    it('Should populate plugins_catalog from plugins_flat without runtime fields', async function () {
      const db_data = await storage.get(['release_plugins_catalog']);
      const catalog = db_data['release_plugins_catalog'] as StorageData;
      expect(catalog).to.be.an('object');

      const bookmarkUid =
        'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
      const plugin = catalog[bookmarkUid] as StorageData;
      expect(plugin).to.be.an('object');
      expect(plugin['id']).to.equal('bookmarks');
      expect(plugin['category']).to.equal('Controls');

      // Runtime fields must not be present in catalog
      expect(plugin).to.not.have.property('code');
      expect(plugin).to.not.have.property('status');
      expect(plugin).to.not.have.property('user');
      expect(plugin).to.not.have.property('override');
      expect(plugin).to.not.have.property('addedAt');
      expect(plugin).to.not.have.property('statusChangedAt');
      expect(plugin).to.not.have.property('updatedAt');
    });
  });
});
