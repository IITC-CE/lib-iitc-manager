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



describe('manage.js integration tests', function () {

    let manager = null;
    before(function () {
        const params = {
            storage: storage,
            channel: 'beta',
            network_host: {
                release: 'http://127.0.0.1:31606/release',
                beta: 'http://127.0.0.1:31606/beta',
                custom: 'http://127.0.0.1/',
            },
            inject_user_script: function callBack(data){
                expect(data).to.include('// ==UserScript==');
            },
            progressbar: function callBack(is_show){
                expect(is_show).to.be.oneOf([true, false]);
            },
            is_daemon: false,
        };
        manager = new Manager(params);
    });

    const first_plugin_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const second_plugin_uid = 'Bing maps+https://github.com/IITC-CE/ingress-intel-total-conversion';
    const external_code = '// ==UserScript==\nreturn false;';

    describe('run', function() {
        it('Should not return an error', async function() {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Check channel', function() {
        it('Should return beta', async function() {
            const channel = await storage.get(['channel']).then((data) => data.channel);
            expect(channel).to.equal('beta');
        });
    });

    describe('setChannel', function() {
        it('Should not return an error', async function() {
            const channel = await manager.setChannel('release');
            expect(channel).to.be.undefined;
        });
    });

    describe('setUpdateCheckInterval', function() {
        it('Should not return an error', async function() {
            const fn = await manager.setUpdateCheckInterval(24 * 60 * 60, 'release');
            expect(fn).to.be.undefined;
        });
    });

    describe('inject', function() {
        it('Should not return an error', async function() {
            const inject = await manager.inject();
            expect(inject).to.be.undefined;
        });
    });

    describe('Manage build-in plugins', function() {
        it('Enable first plugin', async function() {
            const run = await manager.managePlugin(first_plugin_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid);

            expect(db_data['release_plugins_local'][first_plugin_uid]['status'],
                'release_plugins_local: '+first_plugin_uid).to.equal('on');
            expect(db_data['release_plugins_flat'][first_plugin_uid]['status'],
                'release_plugins_flat: '+first_plugin_uid).to.equal('on');
            expect(db_data['release_plugins_flat'][second_plugin_uid]['status'],
                'release_plugins_flat: '+second_plugin_uid).to.equal('off');
        });

        it('Enable second plugin', async function() {
            const run = await manager.managePlugin(second_plugin_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid, second_plugin_uid);

            expect(
                db_data['release_plugins_local'][first_plugin_uid]['status'],
                'release_plugins_local: '+first_plugin_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_local'][second_plugin_uid]['status'],
                'release_plugins_local: '+second_plugin_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][first_plugin_uid]['status'],
                'release_plugins_flat: '+first_plugin_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][second_plugin_uid]['status'],
                'release_plugins_flat: '+second_plugin_uid
            ).to.equal('on');
        });

        it('Disable plugin', async function() {
            const run = await manager.managePlugin(first_plugin_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid, second_plugin_uid);

            expect(
                db_data['release_plugins_local'][first_plugin_uid]['status'],
                'release_plugins_local: '+first_plugin_uid
            ).to.equal('off');

            expect(
                db_data['release_plugins_local'][second_plugin_uid]['status'],
                'release_plugins_local: '+second_plugin_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][first_plugin_uid]['status'],
                'release_plugins_flat: '+first_plugin_uid
            ).to.equal('off');

            expect(
                db_data['release_plugins_flat'][second_plugin_uid]['status'],
                'release_plugins_flat: '+second_plugin_uid
            ).to.equal('on');
        });
    });

    describe('Manage external plugins', function() {
        const external_1_uid = 'Bookmarks for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const external_2_uid = 'Bookmarks2 for maps and portals+https://github.com/IITC-CE/ingress-intel-total-conversion';

        it('Add external plugin', async function() {
            const scripts = [
                {
                    meta: {
                        id: 'bookmarks1',
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Bookmarks for maps and portals',
                        category: 'Controls'
                    },
                    code: external_code
                }
            ];
            const run = await manager.addUserScripts(scripts);
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(
                db_data['release_plugins_user'][external_1_uid]['status'],
                "release_plugins_user['status']: "+external_1_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][external_1_uid]['status'],
                "release_plugins_flat['status']: "+external_1_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][external_1_uid]['code'],
                "release_plugins_flat['code']: "+external_1_uid
            ).to.equal(external_code);
        });

        it('Add external plugin without category', async function() {
            const scripts = [
                {
                    meta: {
                        id: 'bookmarks2',
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Bookmarks2 for maps and portals'
                    },
                    code: external_code
                }
            ];
            const run = await manager.addUserScripts(scripts);
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(
                db_data['release_plugins_user'][external_2_uid]['status'],
                "release_plugins_user['status']: "+external_2_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_user'][external_2_uid]['category'],
                "release_plugins_user['category']: "+external_2_uid
            ).to.equal('Misc');

            expect(
                db_data['release_plugins_flat'][external_2_uid]['status'],
                "release_plugins_flat['status']: "+external_2_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_flat'][external_2_uid]['category'],
                "release_plugins_flat['category']: "+external_2_uid
            ).to.equal('Misc');

            expect(
                db_data['release_plugins_flat'][external_2_uid]['code'],
                "release_plugins_flat['code']: "+external_2_uid
            ).to.equal(external_code);
        });

        it('Add external plugin with empty meta', async function() {
            const scripts = [
                {
                    meta: {
                        name: 'Bookmarks3 for maps and portals'
                    },
                    code: external_code
                }
            ];
            await expectThrowsAsync(
                () => manager.addUserScripts(scripts),
                'The plugin has an incorrect ==UserScript== header'
            );

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);
        });

        it('Disable external plugin', async function() {
            const run = await manager.managePlugin(external_2_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(
                db_data['release_plugins_flat'][external_2_uid]['status'],
                "release_plugins_flat['status']: "+external_2_uid
            ).to.equal('off');

            expect(
                db_data['release_plugins_user'][external_2_uid]['status'],
                "release_plugins_user['status']: "+external_2_uid
            ).to.equal('off');
        });

        it('Enable external plugin', async function() {
            const run = await manager.managePlugin(external_2_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid,
                external_2_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid, external_2_uid);

            expect(
                db_data['release_plugins_flat'][external_2_uid]['status'],
                "release_plugins_flat['status']: "+external_2_uid
            ).to.equal('on');

            expect(
                db_data['release_plugins_user'][external_2_uid]['status'],
                "release_plugins_user['status']: "+external_2_uid
            ).to.equal('on');
        });

        it('Remove the first external plugin', async function() {
            const run = await manager.managePlugin(external_2_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid,
                external_1_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);
        });

        it('Remove the second external plugin', async function() {
            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;
        });
    });

    describe('Manage external plugins that replace built-in plugins', function() {
        const external_1_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';

        it('Add external plugin and replace built-in plugin', async function () {
            const scripts = [
                {
                    meta: {
                        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                        name: 'Available AP statistics'
                    },
                    code: external_code
                }
            ];
            const run = await manager.addUserScripts(scripts);
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(
                db_data['release_plugins_user'][external_1_uid]['code'],
                "release_plugins_user['code']: " + external_1_uid
            ).to.equal(external_code);

            expect(
                db_data['release_plugins_flat'][external_1_uid]['code'],
                "release_plugins_flat['code']: " + external_1_uid
            ).to.equal(external_code);

            expect(
                db_data['release_plugins_flat'][external_1_uid]['override'],
                "release_plugins_flat['override']: " + external_1_uid
            ).to.be.true;
        });

        it('Disable external plugin', async function () {
            const run = await manager.managePlugin(external_1_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.have.all.keys(external_1_uid);

            expect(
                db_data['release_plugins_flat'][external_1_uid]['status'],
                "release_plugins_flat['status']: "+external_1_uid
            ).to.equal('off');

            expect(
                db_data['release_plugins_user'][external_1_uid]['status'],
                "release_plugins_user['status']: "+external_1_uid
            ).to.equal('off');
        });

        it('Remove external plugin and replace it with built-in plugin', async function () {
            const run = await manager.managePlugin(external_1_uid, 'delete');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_user']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(
                first_plugin_uid,
                second_plugin_uid
            );
            expect(db_data['release_plugins_user'], 'release_plugins_user').to.be.empty;

            expect(
                db_data['release_plugins_flat'][external_1_uid]['status'],
                "release_plugins_flat['status']: "+external_1_uid
            ).to.equal('off');

            expect(
                db_data['release_plugins_flat'][external_1_uid]['code'],
                "release_plugins_flat['code']: " + external_1_uid
            ).to.have.lengthOf(578);

            expect(
                db_data['release_plugins_flat'][external_1_uid]['override'],
                "release_plugins_flat['override']: " + external_1_uid
            ).to.not.be.true;
        });
    });

    describe('Custom repository', function() {
        const custom_repo = 'http://127.0.0.1:31606/custom';

        it('Setting the URL of the custom repository', async function () {
            const run = await manager.setCustomChannelUrl(custom_repo);
            expect(run).to.be.undefined;
        });

        it('Check the URL of the custom repository', async function () {
            const network_host = await storage.get(['network_host']).then(data => data.network_host);
            expect(network_host.custom).to.equal(custom_repo);
        });

        it('Switching to a custom channel', async function() {
            const channel = await manager.setChannel('custom');
            expect(channel).to.be.undefined;
        });

        it('Check the IITC version', async function() {
            const script = await storage.get(['custom_iitc_code']).then(data => data['custom_iitc_code']);
            expect(script).to.include('@version        0.99.0');
        });

        it('Switching back to the Release channel', async function() {
            const channel = await manager.setChannel('release');
            expect(channel).to.be.undefined;
        });
    });

});