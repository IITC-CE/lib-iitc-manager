// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { before, describe, it } from 'mocha';
import { migrate, number_of_migrations } from '../src/migrations.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('test migrations', function () {
    before(async function () {
        await storage.set({
            release_plugins_flat: {
                'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion': {
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
            lastversion: '1.7.0',
            storage_version: 0,
        });
        await migrate(storage);
    });

    describe('check migrations', function () {
        it('Should replace undefined with "Misc" (fix https://github.com/IITC-CE/IITC-Button/issues/68)', async function () {
            const db_data = await storage.get(['release_plugins_flat']);
            const ext_plugin = db_data['release_plugins_flat']['External+https://github.com/IITC-CE/ingress-intel-total-conversion'];
            expect(ext_plugin['category']).to.equal('Misc');
        });
        it('Custom plugins should have status and uid', async function () {
            const db_data = await storage.get(['release_plugins_user']);
            const ext_plugin = db_data['release_plugins_user']['ext+https://github.com/IITC-CE/ingress-intel-total-conversion'];
            expect(ext_plugin['uid']).to.equal('ext+https://github.com/IITC-CE/ingress-intel-total-conversion');
            expect(ext_plugin['status']).to.equal('off');
        });
        it('The value of storage_version field has changed', async function () {
            const db_data = await storage.get(['storage_version']);
            expect(db_data['storage_version']).to.equal(number_of_migrations());
        });
    });
});
