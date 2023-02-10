// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

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
    before(function () {
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
                },
            };
            const run = await manager.addUserScripts(scripts);
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
            const installed = {
                'Bookmarks2 for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion': {
                    uid: 'Bookmarks2 for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion',
                    id: 'bookmarks2',
                    namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                    name: 'Bookmarks2 for maps and portals',
                    category: 'Misc',
                    status: 'on',
                    user: true,
                    code: external_code,
                },
            };
            const run = await manager.addUserScripts(scripts);
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
            expect(await manager.setChannel('beta')).to.be.undefined;
            expect(await manager.setChannel('release')).to.be.undefined;
        });

        it('Check categories after switching channel', async function () {
            const categories = await storage.get(['release_categories']).then((data) => data['release_categories']);
            expect(categories).to.have.all.keys('Info', 'Map Tiles', 'Obsolete', 'Deleted', 'Controls', 'Misc');
        });

        it('Disable external plugin', async function () {
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
                },
            };
            const run = await manager.addUserScripts(scripts);
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
            const scripts = [
                {
                    meta: {
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Available AP statistics',
                    },
                    code: external_code,
                },
            ];
            const installed = {
                'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion': {
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
                },
            };
            const run = await manager.addUserScripts(scripts);
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
            const run = await manager.managePlugin(external_1_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(db_data['release_plugins_flat'][external_1_uid]['status'], "release_plugins_flat['status']: " + external_1_uid).to.equal('off');

            expect(db_data['release_plugins_user'][external_1_uid]['status'], "release_plugins_user['status']: " + external_1_uid).to.equal('off');
        });

        it('Remove external plugin and replace it with built-in plugin', async function () {
            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;

            expect(db_data['release_plugins_flat'][external_1_uid]['status'], "release_plugins_flat['status']: " + external_1_uid).to.equal('off');

            expect(db_data['release_plugins_flat'][external_1_uid]['code'], "release_plugins_flat['code']: " + external_1_uid).to.have.lengthOf(578);

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
            const installed = {
                'Missions+https://github.com/IITC-CE/ingress-intel-total-conversion': {
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
                },
            };
            const run = await manager.addUserScripts([external_3_plugin]);
            expect(run).to.deep.equal(installed);

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_3_uid);

            expect(db_data['release_plugins_user'][external_3_uid]['code'], "release_plugins_user['code']: " + external_3_uid).to.equal(external_code);
            expect(db_data['release_plugins_flat'][external_3_uid]['code'], "release_plugins_flat['code']: " + external_3_uid).to.equal(external_code);
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.true;
        });

        it('Remove external plugin and replace it with built-in plugin', async function () {
            const run = await manager.managePlugin(external_3_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;

            expect(db_data['release_plugins_flat'][external_3_uid]['status'], "release_plugins_flat['status']: " + external_3_uid).to.equal('off');
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.false;
        });

        it('Enable and disable build-in plugin', async function () {
            const run1 = await manager.managePlugin(external_3_uid, 'on');
            expect(run1).to.be.undefined;

            const run2 = await manager.managePlugin(external_3_uid, 'off');
            expect(run2).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat']);
            expect(db_data['release_plugins_flat'][external_3_uid]['status'], "release_plugins_flat['status']: " + external_3_uid).to.equal('off');
            expect(db_data['release_plugins_flat'][external_3_uid]['code'], "release_plugins_flat['code']: " + external_3_uid).to.have.lengthOf(596);
            expect(db_data['release_plugins_flat'][external_3_uid]['override'], "release_plugins_flat['override']: " + external_3_uid).to.be.false;
        });
    });
});
