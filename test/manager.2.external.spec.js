// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

const expectThrowsAsync = async (method, errorMessage) => {
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error).to.be.an('Error');
    if (errorMessage) {
        expect(error['message']).to.equal(errorMessage);
    }
};

describe('manage.js external plugins integration tests', function () {
    let manager = null;
    const iitc_main_script_uid = 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
    let plugin_event_callback = (data) => {
        expect(data).to.have.all.keys('event', 'plugins');
        expect(data['event']).to.equal('update');
        expect(data['plugins']).to.have.all.keys(iitc_main_script_uid);
        expect(data['plugins'][iitc_main_script_uid]['uid']).to.equal(iitc_main_script_uid);
    };
    before(function () {
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
            plugin_event: (data) => {
                plugin_event_callback(data);
            },
            progressbar: function callBack(is_show) {
                expect(is_show).to.be.oneOf([true, false]);
            },
            is_daemon: false,
        };
        manager = new Manager(params);
    });

    const first_plugin_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const second_plugin_uid = 'Bing maps+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const third_plugin_uid = 'Missions+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external_code = '// ==UserScript==\nreturn false;';

    describe('run', function () {
        it('Should not return an error', async function () {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Manage external plugins', function () {
        const external_1_uid = 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const external_2_uid = 'Bookmarks2 for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';

        it('Add external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]['uid']).to.equal(external_1_uid);
            };
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
            const installed = {};
            installed[external_1_uid] = {
                uid: external_1_uid,
                id: 'bookmarks1',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Bookmarks for maps and portals',
                category: 'Controls',
                status: 'on',
                user: true,
                filename: 'Bookmarks for maps and portals.user.js',
                code: external_code,
            };
            const run = await manager.addUserScripts(scripts);
            delete run[external_1_uid]['addedAt'];
            delete run[external_1_uid]['statusChangedAt'];
            expect(run).to.deep.equal(installed);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(db_data['release_plugins_user'][external_1_uid]['status'], "release_plugins_user['status']: " + external_1_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][external_1_uid]['status'], "release_plugins_flat['status']: " + external_1_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][external_1_uid]['code'], "release_plugins_flat['code']: " + external_1_uid).to.equal(external_code);
        });

        it('Add external plugin without category', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(external_2_uid);
                expect(data['plugins'][external_2_uid]['uid']).to.equal(external_2_uid);
            };

            const scripts = [
                {
                    meta: {
                        id: 'bookmarks2',
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Bookmarks2 for maps and portals',
                    },
                    code: external_code,
                },
            ];
            const installed = {};
            installed[external_2_uid] = {
                uid: external_2_uid,
                id: 'bookmarks2',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Bookmarks2 for maps and portals',
                category: 'Misc',
                status: 'on',
                user: true,
                filename: 'Bookmarks2 for maps and portals.user.js',
                code: external_code,
            };
            const run = await manager.addUserScripts(scripts);
            delete run[external_2_uid]['addedAt'];
            delete run[external_2_uid]['statusChangedAt'];
            expect(run).to.deep.equal(installed);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(db_data['release_plugins_user'][external_2_uid]['status'], "release_plugins_user['status']: " + external_2_uid).to.equal('on');

            expect(db_data['release_plugins_user'][external_2_uid]['category'], "release_plugins_user['category']: " + external_2_uid).to.equal('Misc');

            expect(db_data['release_plugins_flat'][external_2_uid]['status'], "release_plugins_flat['status']: " + external_2_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][external_2_uid]['category'], "release_plugins_flat['category']: " + external_2_uid).to.equal('Misc');

            expect(db_data['release_plugins_flat'][external_2_uid]['code'], "release_plugins_flat['code']: " + external_2_uid).to.equal(external_code);
        });

        it('Add external plugin with empty meta', async function () {
            const scripts = [
                {
                    meta: {
                        name: 'Bookmarks3 for maps and portals',
                    },
                    code: external_code,
                },
            ];
            await expectThrowsAsync(() => manager.addUserScripts(scripts), 'The plugin has an incorrect ==UserScript== header');

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);
        });

        it('Check categories before switching channel', async function () {
            const categories = await storage.get(['release_categories']).then((data) => data['release_categories']);
            expect(categories).to.have.all.keys('Info', 'Map Tiles', 'Obsolete', 'Deleted', 'Controls', 'Misc');
        });

        it('Switching to the Beta channel and back to Release', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_1_uid, external_2_uid);
                expect(data['plugins'][external_1_uid]).to.be.empty;
            };
            expect(await manager.setChannel('beta')).to.be.undefined;

            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.be.oneOf(['add', 'update']);
                if (data['event'] === 'add') {
                    expect(data['plugins']).to.have.all.keys(external_1_uid, external_2_uid);
                    expect(data['plugins'][external_2_uid]['uid']).to.equal(external_2_uid);
                } else {
                    expect(data['plugins']).to.have.all.keys(iitc_main_script_uid);
                    expect(data['plugins'][iitc_main_script_uid]['uid']).to.equal(iitc_main_script_uid);
                }
            };
            expect(await manager.setChannel('release')).to.be.undefined;
        });

        it('Check categories after switching channel', async function () {
            const categories = await storage.get(['release_categories']).then((data) => data['release_categories']);
            expect(categories).to.have.all.keys('Info', 'Map Tiles', 'Obsolete', 'Deleted', 'Controls', 'Misc');
        });

        it('Disable external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_2_uid);
                expect(data['plugins'][external_2_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_2_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(db_data['release_plugins_flat'][external_2_uid]['status'], "release_plugins_flat['status']: " + external_2_uid).to.equal('off');

            expect(db_data['release_plugins_user'][external_2_uid]['status'], "release_plugins_user['status']: " + external_2_uid).to.equal('off');
        });

        it('Enable external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(external_2_uid);
                expect(data['plugins'][external_2_uid]['uid']).to.equal(external_2_uid);
            };

            const run = await manager.managePlugin(external_2_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(db_data['release_plugins_flat'][external_2_uid]['status'], "release_plugins_flat['status']: " + external_2_uid).to.equal('on');

            expect(db_data['release_plugins_user'][external_2_uid]['status'], "release_plugins_user['status']: " + external_2_uid).to.equal('on');
        });

        it('Remove the first external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_2_uid);
                expect(data['plugins'][external_2_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_2_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);
        });

        it('Remove the second external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;
        });
    });

    describe('Re-adding an external plugin', function () {
        const external_1_uid = 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';

        it('Double adding an external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]['uid']).to.equal(external_1_uid);
            };

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
            const installed = {};
            installed[external_1_uid] = {
                uid: 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
                id: 'bookmarks1',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Bookmarks for maps and portals',
                category: 'Controls',
                status: 'on',
                user: true,
                filename: 'Bookmarks for maps and portals.user.js',
                code: external_code,
            };
            const run = await manager.addUserScripts(scripts);
            delete run[external_1_uid]['addedAt'];
            delete run[external_1_uid]['statusChangedAt'];
            expect(run).to.deep.equal(installed);
        });

        it('Check external plugin', async function () {
            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                third_plugin_uid,
                external_1_uid
            );
            expect(db_data['release_plugins_flat'][external_1_uid]['override']).to.be.undefined;
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);
        });

        it('Remove the external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;
        });
    });

    describe('Manage external plugins that replace built-in plugins', function () {
        const external_1_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';

        it('Add external plugin and replace built-in plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('update');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]['uid']).to.equal(external_1_uid);
            };

            const scripts = [
                {
                    meta: {
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Available AP statistics',
                    },
                    code: external_code,
                },
            ];
            const installed = {};
            installed[external_1_uid] = {
                uid: external_1_uid,
                id: 'ap-stats',
                author: 'Hollow011',
                description: 'Displays the per-team AP gains available in the current view.',
                filename: 'ap-stats.user.js',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Available AP statistics',
                category: 'Info',
                status: 'on',
                override: true,
                user: true,
                version: '0.4.2',
                code: external_code,
            };
            const run = await manager.addUserScripts(scripts);
            delete run[external_1_uid]['addedAt'];
            delete run[external_1_uid]['statusChangedAt'];
            expect(run).to.deep.equal(installed);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(db_data['release_plugins_user'][external_1_uid]['code'], "release_plugins_user['code']: " + external_1_uid).to.equal(external_code);

            expect(db_data['release_plugins_flat'][external_1_uid]['code'], "release_plugins_flat['code']: " + external_1_uid).to.equal(external_code);

            expect(db_data['release_plugins_flat'][external_1_uid]['override'], "release_plugins_flat['override']: " + external_1_uid).to.be.true;
        });

        it('Info about plugin', async function () {
            const info = await manager.getPluginInfo(external_1_uid);
            expect(info).to.be.an('object');
            expect(info['uid']).to.be.equal(external_1_uid);
            expect(info['status']).to.be.equal('on');
            expect(info['override']).to.be.true;
            expect(info['user']).to.be.true;
            expect(info['code']).to.be.equal(external_code);
        });

        it('Disable external plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_1_uid);
                expect(data['plugins'][external_1_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_1_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(db_data['release_plugins_flat'][external_1_uid]['status'], "release_plugins_flat['status']: " + external_1_uid).to.equal('off');

            expect(db_data['release_plugins_user'][external_1_uid]['status'], "release_plugins_user['status']: " + external_1_uid).to.equal('off');
        });

        it('Remove external plugin and replace it with built-in plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.be.empty;
            };

            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;

            expect(db_data['release_plugins_flat'][external_1_uid]['status'], "release_plugins_flat['status']: " + external_1_uid).to.equal('off');

            expect(db_data['release_plugins_flat'][external_1_uid]['code'], "release_plugins_flat['code']: " + external_1_uid).to.have.lengthOf(
                external_code.length
            );

            expect(db_data['release_plugins_flat'][external_1_uid]['override'], "release_plugins_flat['override']: " + external_1_uid).to.not.be.true;
        });
    });

    describe('Adding and removing an external plugin that overwrites a built-in plugin', function () {
        const external_3_uid = 'Missions+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const external_3_plugin = {
            meta: {
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Missions',
            },
            code: external_code,
        };

        it('Add external plugin and replace built-in plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('update');
                expect(data['plugins']).to.have.all.keys(external_3_uid);
                expect(data['plugins'][external_3_uid]['uid']).to.equal(external_3_uid);
            };

            const installed = {};
            installed[external_3_uid] = {
                uid: external_3_uid,
                id: 'missions',
                author: 'jonatkins',
                description: 'View missions. Marking progress on waypoints/missions basis. Showing mission paths on the map.',
                filename: 'missions.user.js',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Missions',
                category: 'Info',
                status: 'on',
                override: true,
                user: true,
                version: '0.3.0',
                code: external_code,
            };
            const run = await manager.addUserScripts([external_3_plugin]);
            delete run[external_3_uid]['addedAt'];
            delete run[external_3_uid]['statusChangedAt'];
            expect(run).to.deep.equal(installed);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_3_uid);

            expect(db_data['release_plugins_user'][external_3_uid]['code'], "release_plugins_user['code']: " + external_3_uid).to.equal(external_code);
            expect(db_data['release_plugins_flat'][external_3_uid]['code'], "release_plugins_flat['code']: " + external_3_uid).to.equal(external_code);
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.true;
        });

        it('Remove external plugin and replace it with built-in plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_3_uid);
                expect(data['plugins'][external_3_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(external_3_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;

            expect(db_data['release_plugins_flat'][external_3_uid]['status'], "release_plugins_flat['status']: " + external_3_uid).to.equal('off');
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.false;
        });

        it('Enable and disable build-in plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(external_3_uid);
                expect(data['plugins'][external_3_uid]['uid']).to.equal(external_3_uid);
            };

            const run1 = await manager.managePlugin(external_3_uid, 'on');
            expect(run1).to.be.undefined;

            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(external_3_uid);
                expect(data['plugins'][external_3_uid]).to.be.empty;
            };

            const run2 = await manager.managePlugin(external_3_uid, 'off');
            expect(run2).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat']);
            expect(db_data['release_plugins_flat'][external_3_uid]['status'], "release_plugins_flat['status']: " + external_3_uid).to.equal('off');
            expect(db_data['release_plugins_flat'][external_3_uid]['code'], "release_plugins_flat['code']: " + external_3_uid).to.not.equal(external_code);
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.false;
        });
    });

    describe('Adding and removing custom IITC core script', function () {
        const iitc_custom_uid = 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const iitc_custom = {
            meta: {
                author: 'jonatkins',
                name: 'IITC: Ingress intel map total conversion',
                version: '0.99.0',
                description: 'Total conversion for the ingress intel map.',
                id: 'total-conversion-build',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            },
            code: external_code,
        };
        it('Add custom IITC core script', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('update');
                expect(data['plugins']).to.have.all.keys(iitc_custom_uid);
                expect(data['plugins'][iitc_custom_uid]['uid']).to.equal(iitc_custom_uid);
            };

            const run = await manager.addUserScripts([iitc_custom]);
            expect(run).to.have.all.keys(iitc_custom_uid);

            const db_data = await storage.get(['release_iitc_core_user']);
            expect(db_data['release_iitc_core_user']['code'], "iitc_core_user['code']").to.equal(external_code);
        });
        it('Check getIITCCore() for custom IITC', async function () {
            const script = await manager.getIITCCore();
            expect(script, 'getIITCCore()').to.have.all.keys('author', 'code', 'description', 'id', 'name', 'namespace', 'override', 'uid', 'version');
            expect(script['override'], "getIITCCore() object must have the 'override' parameter set to true").to.be.true;
        });
        it('Remove custom IITC core script', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('update');
                expect(data['plugins']).to.have.all.keys(iitc_custom_uid);
                expect(data['plugins'][iitc_custom_uid]).to.be.empty;
            };

            const run = await manager.managePlugin(iitc_custom_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_iitc_core_user']);
            expect(db_data['release_iitc_core_user'], 'iitc_core_user must be empty object').to.deep.equal({});
        });
        it('Check getIITCCore() for standard IITC', async function () {
            const script = await manager.getIITCCore();
            expect(script, 'getIITCCore()').to.have.all.keys(
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
        let manager = null;
        const currentTime = Math.floor(Date.now() / 1000);

        // External plugin data for testing
        const external_plugin_uid = 'Test Plugin+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const plugin_data = {
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
                network_host: {
                    release: 'http://127.0.0.1:31606/release',
                    beta: 'http://127.0.0.1:31606/beta',
                    custom: 'http://127.0.0.1/',
                },
                inject_user_script: function (data) {
                    expect(data).to.include('// ==UserScript==');
                },
                inject_plugin: function (data) {
                    expect(data['code']).to.include('// ==UserScript==');
                },
                plugin_event: () => {},
                progressbar: function (is_show) {
                    expect(is_show).to.be.oneOf([true, false]);
                },
                is_daemon: false,
            });
        });

        it('should set addedAt and statusChangedAt when adding new plugin', async function () {
            // Add plugin
            await manager.addUserScripts([plugin_data]);

            // Get stored data
            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Check timestamps in plugins_user
            expect(db_data['release_plugins_user'][external_plugin_uid]).to.have.property('addedAt');
            expect(db_data['release_plugins_user'][external_plugin_uid].addedAt).to.be.a('number');
            expect(db_data['release_plugins_user'][external_plugin_uid].addedAt).to.be.closeTo(currentTime, 15);

            expect(db_data['release_plugins_user'][external_plugin_uid]).to.have.property('statusChangedAt');
            expect(db_data['release_plugins_user'][external_plugin_uid].statusChangedAt).to.equal(db_data['release_plugins_user'][external_plugin_uid].addedAt);

            // Check timestamps in plugins_flat
            expect(db_data['release_plugins_flat'][external_plugin_uid]).to.have.property('addedAt');
            expect(db_data['release_plugins_flat'][external_plugin_uid].addedAt).to.equal(db_data['release_plugins_user'][external_plugin_uid].addedAt);

            expect(db_data['release_plugins_flat'][external_plugin_uid]).to.have.property('statusChangedAt');
            expect(db_data['release_plugins_flat'][external_plugin_uid].statusChangedAt).to.equal(
                db_data['release_plugins_user'][external_plugin_uid].statusChangedAt
            );
        });

        it('should update statusChangedAt when toggling plugin status', async function () {
            const before = await storage.get(['release_plugins_user']);
            const oldStatusChangedAt = before['release_plugins_user'][external_plugin_uid].statusChangedAt;

            // Wait 1 second to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Toggle plugin off
            await manager.managePlugin(external_plugin_uid, 'off');

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Check new statusChangedAt
            expect(db_data['release_plugins_user'][external_plugin_uid].statusChangedAt).to.be.above(oldStatusChangedAt);
            expect(db_data['release_plugins_flat'][external_plugin_uid].statusChangedAt).to.equal(
                db_data['release_plugins_user'][external_plugin_uid].statusChangedAt
            );

            // Original addedAt should remain unchanged
            expect(db_data['release_plugins_user'][external_plugin_uid].addedAt).to.equal(before['release_plugins_user'][external_plugin_uid].addedAt);
        });

        it('should handle timestamps correctly when removing plugin', async function () {
            // Get initial data
            const before = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(before['release_plugins_user'][external_plugin_uid]).to.have.property('addedAt');
            expect(before['release_plugins_user'][external_plugin_uid]).to.have.property('statusChangedAt');

            // Remove plugin
            await manager.managePlugin(external_plugin_uid, 'delete');

            // Check data after removal
            const after = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Plugin should be removed from plugins_user
            expect(after['release_plugins_user']).to.not.have.property(external_plugin_uid);

            // Plugin should be removed from plugins_flat
            expect(after['release_plugins_flat']).to.not.have.property(external_plugin_uid);
        });
    });

    describe('Timestamps for plugins overriding built-in plugins', function () {
        let manager = null;
        const built_in_plugin_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';

        before(async function () {
            storage.resetStorage();
            manager = new Manager({
                storage: storage,
                channel: 'release',
                network_host: {
                    release: 'http://127.0.0.1:31606/release',
                    beta: 'http://127.0.0.1:31606/beta',
                    custom: 'http://127.0.0.1/',
                },
                inject_user_script: function (data) {
                    expect(data).to.include('// ==UserScript==');
                },
                inject_plugin: function (data) {
                    expect(data['code']).to.include('// ==UserScript==');
                },
                plugin_event: () => {},
                progressbar: function (is_show) {
                    expect(is_show).to.be.oneOf([true, false]);
                },
                is_daemon: false,
            });

            // Initialize built-in plugins
            await manager.run();
        });

        it('should handle timestamps correctly when overriding built-in plugin', async function () {
            const override_plugin = {
                meta: {
                    namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                    name: 'Available AP statistics',
                },
                code: '// ==UserScript==\nreturn false;',
            };

            // Add overriding plugin
            await manager.addUserScripts([override_plugin]);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Check timestamps in plugins_user
            expect(db_data['release_plugins_user'][built_in_plugin_uid]).to.have.property('addedAt');
            expect(db_data['release_plugins_user'][built_in_plugin_uid]).to.have.property('statusChangedAt');
            expect(db_data['release_plugins_user'][built_in_plugin_uid].statusChangedAt).to.equal(db_data['release_plugins_user'][built_in_plugin_uid].addedAt);

            // Check timestamps copied to plugins_flat
            expect(db_data['release_plugins_flat'][built_in_plugin_uid].addedAt).to.equal(db_data['release_plugins_user'][built_in_plugin_uid].addedAt);
            expect(db_data['release_plugins_flat'][built_in_plugin_uid].statusChangedAt).to.equal(
                db_data['release_plugins_user'][built_in_plugin_uid].statusChangedAt
            );
        });

        it('should update statusChangedAt when toggling overridden plugin', async function () {
            const before = await storage.get(['release_plugins_user']);
            const oldStatusChangedAt = before['release_plugins_user'][built_in_plugin_uid].statusChangedAt;
            const addedAt = before['release_plugins_user'][built_in_plugin_uid].addedAt;

            // Wait 1 second
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Toggle plugin off
            await manager.managePlugin(built_in_plugin_uid, 'off');

            const after = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Check statusChangedAt updated
            expect(after['release_plugins_user'][built_in_plugin_uid].statusChangedAt).to.be.above(oldStatusChangedAt);
            expect(after['release_plugins_flat'][built_in_plugin_uid].statusChangedAt).to.equal(
                after['release_plugins_user'][built_in_plugin_uid].statusChangedAt
            );

            // Check addedAt preserved
            expect(after['release_plugins_user'][built_in_plugin_uid].addedAt).to.equal(addedAt);
            expect(after['release_plugins_flat'][built_in_plugin_uid].addedAt).to.equal(addedAt);
        });

        it('should handle timestamps correctly when removing override', async function () {
            // Remove override
            await manager.managePlugin(built_in_plugin_uid, 'delete');

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);

            // Override should be removed from plugins_user
            expect(db_data['release_plugins_user']).to.not.have.property(built_in_plugin_uid);
            // Built-in plugin should be restored in plugins_flat without override timestamps
            expect(db_data['release_plugins_flat'][built_in_plugin_uid]).to.not.have.property('addedAt');
        });
    });
});
