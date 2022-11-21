// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it } from 'mocha';
import {migrate, number_of_migrations} from '../src/migrations.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('test migrations', function () {
    storage.set({
        release_plugins_flat: {
            'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion': {
                id: 'bookmarks',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Bookmarks for maps and portals',
                category: 'Controls'
            },
            'External+https://github.com/IITC-CE/ingress-intel-total-conversion': {
                id: 'ext',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'External plugin with bug https://github.com/IITC-CE/IITC-Button/issues/68',
                user: true,
                category: undefined
            }
        },
        lastversion: '1.7.0'
    });

    describe('migrate from v1.7.0', async function() {
        await migrate(storage);

        it('Should replace undefined with "Misc" (fix https://github.com/IITC-CE/IITC-Button/issues/68)', async function() {
            const db_data = await storage.get(['release_plugins_flat']);
            const ext_plugin = db_data['release_plugins_flat']['External+https://github.com/IITC-CE/ingress-intel-total-conversion'];
            expect(ext_plugin['category']).to.equal('Misc');
        });
        it('The value of storage_version field has changed', async function() {
            const db_data = await storage.get(['storage_version']);
            expect(db_data['storage_version']).to.equal(number_of_migrations());
        });
    });

});
