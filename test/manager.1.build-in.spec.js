// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('manage.js build-in plugins integration tests', function () {
    let manager = null;
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

    describe('run', function () {
        it('Should not return an error', async function () {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Manage build-in plugins', function () {
        it('Enable first plugin', async function () {
            const run = await manager.managePlugin(first_plugin_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid);

            expect(db_data['release_plugins_local'][first_plugin_uid]['status'], 'release_plugins_local: ' + first_plugin_uid).to.equal('on');
            expect(db_data['release_plugins_flat'][first_plugin_uid]['status'], 'release_plugins_flat: ' + first_plugin_uid).to.equal('on');
            expect(db_data['release_plugins_flat'][second_plugin_uid]['status'], 'release_plugins_flat: ' + second_plugin_uid).to.equal('off');
        });

        it('Enable second plugin', async function () {
            const run = await manager.managePlugin(second_plugin_uid, 'on');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid, second_plugin_uid);

            expect(db_data['release_plugins_local'][first_plugin_uid]['status'], 'release_plugins_local: ' + first_plugin_uid).to.equal('on');

            expect(db_data['release_plugins_local'][second_plugin_uid]['status'], 'release_plugins_local: ' + second_plugin_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][first_plugin_uid]['status'], 'release_plugins_flat: ' + first_plugin_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][second_plugin_uid]['status'], 'release_plugins_flat: ' + second_plugin_uid).to.equal('on');
        });

        it('Disable plugin', async function () {
            const run = await manager.managePlugin(first_plugin_uid, 'off');
            expect(run).to.be.undefined;

            const db_data = await storage.get(['release_plugins_flat', 'release_plugins_local']);
            expect(db_data['release_plugins_flat'], 'release_plugins_flat').to.have.all.keys(first_plugin_uid, second_plugin_uid, third_plugin_uid);
            expect(db_data['release_plugins_local'], 'release_plugins_local').to.have.all.keys(first_plugin_uid, second_plugin_uid);

            expect(db_data['release_plugins_local'][first_plugin_uid]['status'], 'release_plugins_local: ' + first_plugin_uid).to.equal('off');

            expect(db_data['release_plugins_local'][second_plugin_uid]['status'], 'release_plugins_local: ' + second_plugin_uid).to.equal('on');

            expect(db_data['release_plugins_flat'][first_plugin_uid]['status'], 'release_plugins_flat: ' + first_plugin_uid).to.equal('off');

            expect(db_data['release_plugins_flat'][second_plugin_uid]['status'], 'release_plugins_flat: ' + second_plugin_uid).to.equal('on');
        });

        it('Info about plugin', async function () {
            const info = await manager.getPluginInfo(first_plugin_uid);
            expect(info).to.be.an('object');
            expect(info['uid']).to.be.equal(first_plugin_uid);
            expect(info['status']).to.be.equal('off');
        });
    });
});
