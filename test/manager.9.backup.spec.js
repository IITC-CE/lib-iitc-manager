// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('getBackupData and setBackupData', function () {
    let manager = null;
    const first_plugin_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external_code = '// ==UserScript==\n// @name IITC plugin\n// ==/UserScript==\nreturn false;';
    const initialBackupData = {
        external_plugins: {
            beta: {},
            custom: {},
            release: {
                'bookmarks1.user.js': external_code,
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
            },
            plugins_data: {
                VMin5555: 'test',
            },
            app: 'IITC Button',
        },
    };

    const backupData = {
        external_plugins: {
            release: {
                'bookmarks2.user.js': external_code,
            },
            beta: {
                'bookmarks3.user.js': external_code,
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
        const params = {
            storage: storage,
            channel: 'release',
            network_host: {
                release: 'http://127.0.0.1:31606/release',
                beta: 'http://127.0.0.1:31606/beta',
                custom: 'http://127.0.0.1/',
            },
            inject_user_script: function callBack(data) {
                expect(data).to.include('// ==UserScript==');
            },
            inject_plugin: function callBack(data) {
                expect(data['code']).to.include('// ==UserScript==');
            },
            progressbar: function callBack(is_show) {
                expect(is_show).to.be.oneOf([true, false]);
            },
            is_daemon: false,
        };
        manager = new Manager(params);
    });

    describe('run', function () {
        it('Should not return an error', async function () {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Enable plugins and add plugin settings data', function () {
        it('Enable first plugin', async function () {
            const run = await manager.managePlugin(first_plugin_uid, 'on');
            expect(run).to.be.undefined;
        });
        it('Add external plugin', async function () {
            const scripts = [
                {
                    meta: {
                        id: 'bookmarks1',
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Bookmarks for maps and portals',
                        category: 'Controls',
                        filename: 'bookmarks1.user.js',
                    },
                    code: external_code,
                },
            ];
            const installed = {
                'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion': {
                    uid: 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
                    id: 'bookmarks1',
                    namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                    name: 'Bookmarks for maps and portals',
                    category: 'Controls',
                    status: 'on',
                    user: true,
                    code: external_code,
                    filename: 'bookmarks1.user.js',
                },
            };
            const run = await manager.addUserScripts(scripts);
            expect(run).to.deep.equal(installed);
        });
        it('Add plugin settings data', async function () {
            await storage.set({ VMin5555: 'test' });
        });
    });

    describe('getBackupData', function () {
        it('Should return the correct backup data', async function () {
            const backupDataFromManager = await manager.getBackupData({
                settings: true,
                data: true,
                external: true,
            });
            expect(backupDataFromManager).to.deep.equal(initialBackupData);
        });
    });

    describe('setBackupData', function () {
        it('Should set the backup data correctly', async function () {
            await manager.setBackupData(
                {
                    settings: true,
                    data: true,
                    external: true,
                },
                backupData
            );

            // Check if the data was set correctly in storage
            expect(manager.channel).to.equal('beta');

            const pluginsData = await storage.get(['VMin5555', 'VMin9999']);
            expect(pluginsData).to.deep.equal({
                VMin5555: 'backup1',
                VMin9999: 'backup2',
            });

            const externalPlugins = await storage.get(['release_plugins_user', 'beta_plugins_user']);
            expect(externalPlugins['release_plugins_user']).to.have.all.keys(
                'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
                'bookmarks2.user.js+IITC plugin'
            );
            expect(externalPlugins['beta_plugins_user']).to.have.all.keys('bookmarks3.user.js+IITC plugin');
        });
    });
});
