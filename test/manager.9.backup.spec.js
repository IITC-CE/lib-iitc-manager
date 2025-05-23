// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('getBackupData and setBackupData', function () {
    let manager = null;
    const first_plugin_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external_code = '// ==UserScript==\n// @name IITC plugin\n// ==/UserScript==\nreturn false;';
    const external_iitc_code =
        '// ==UserScript==\n' +
        '// @name IITC: Ingress intel map total conversion\n' +
        '// @namespace https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
        '// ==/UserScript==\n' +
        'return false;';
    const initialBackupData = {
        external_plugins: {
            beta: {},
            custom: {},
            release: {
                'total-conversion-build.user.js': external_iitc_code,
                'Bookmarks for maps and portals.user.js': external_code,
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
                'total-conversion-build.user.js': external_iitc_code,
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
        it('Add custom IITC core', async function () {
            const scripts = [
                {
                    meta: {
                        id: 'total-conversion-build',
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'IITC: Ingress intel map total conversion',
                        filename: 'total-conversion-build.user.js',
                    },
                    code: external_iitc_code,
                },
            ];
            const installed = {
                'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion': {
                    uid: 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion',
                    id: 'total-conversion-build',
                    namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                    name: 'IITC: Ingress intel map total conversion',
                    code: external_iitc_code,
                    filename: 'total-conversion-build.user.js',
                },
            };
            const run = await manager.addUserScripts(scripts);
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
                    code: external_code,
                },
            ];
            const plugin_uid = 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
            const installed = {};
            installed[plugin_uid] = {
                uid: plugin_uid,
                id: 'bookmarks1',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Bookmarks for maps and portals',
                category: 'Controls',
                status: 'on',
                user: true,
                code: external_code,
            };
            const run = await manager.addUserScripts(scripts);
            delete run[plugin_uid]['filename'];
            delete run[plugin_uid]['addedAt'];
            delete run[plugin_uid]['statusChangedAt'];
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

            const externalCore = await storage.get(['beta_iitc_core_user']);
            expect(externalCore['beta_iitc_core_user']).to.deep.equal({
                uid: 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'IITC: Ingress intel map total conversion',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                code: external_iitc_code,
                filename: 'total-conversion-build.user.js',
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
