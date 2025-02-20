// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before, beforeEach } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('manage.js build-in plugins integration tests', function () {
    let manager = null;
    let plugin_event_callback = (data) => {
        const iitc_main_script_uid = 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
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

    describe('run', function () {
        it('Should not return an error', async function () {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Manage build-in plugins', function () {
        it('Enable first plugin', async function () {
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(first_plugin_uid);
                expect(data['plugins'][first_plugin_uid]['uid']).to.equal(first_plugin_uid);
            };

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
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('add');
                expect(data['plugins']).to.have.all.keys(second_plugin_uid);
                expect(data['plugins'][second_plugin_uid]['uid']).to.equal(second_plugin_uid);
            };

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
            plugin_event_callback = (data) => {
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('remove');
                expect(data['plugins']).to.have.all.keys(first_plugin_uid);
                expect(data['plugins'][first_plugin_uid]).to.be.empty;
            };

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

describe('Delete external plugins - comprehensive tests', function () {
    let manager = null;
    const external_plugin_uid = 'Test Plugin+https://github.com/IITC-CE/ingress-intel-total-conversion';

    // Track plugin events for verification
    let received_plugin_event = null;
    let plugin_event_callback = (data) => {
        received_plugin_event = data;
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

    beforeEach(function () {
        storage.resetStorage();
        received_plugin_event = null;
    });

    // Test deletion of active external plugin
    it('should correctly delete active external plugin', async function () {
        // Setup: Add external plugin with status 'on'
        const plugin_data = {
            meta: {
                id: 'test-plugin',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Test Plugin',
                category: 'Test',
            },
            code: '// ==UserScript==\nreturn false;',
        };

        await manager.addUserScripts([plugin_data]);

        // Delete the plugin
        await manager.managePlugin(external_plugin_uid, 'delete');

        // Verify storage state
        const storage_after = await manager.storage.get(['release_plugins_flat', 'release_plugins_user']);

        // Verify plugin was removed from user plugins
        expect(storage_after['release_plugins_user']).to.be.empty;

        // Verify plugin event was fired (since plugin was active)
        expect(received_plugin_event).to.have.property('event', 'remove');
        expect(received_plugin_event.plugins).to.have.property(external_plugin_uid);
    });

    // Test deletion of inactive external plugin
    it('should correctly delete inactive external plugin without firing event', async function () {
        // Setup: Add external plugin and set it to 'off'
        const plugin_data = {
            meta: {
                id: 'test-plugin',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Test Plugin',
                category: 'Test',
            },
            code: '// ==UserScript==\nreturn false;',
        };

        await manager.addUserScripts([plugin_data]);
        await manager.managePlugin(external_plugin_uid, 'off');

        // Reset event tracking before deletion
        received_plugin_event = null;

        // Delete the plugin
        await manager.managePlugin(external_plugin_uid, 'delete');

        // Verify storage state
        const storage_after = await manager.storage.get(['release_plugins_flat', 'release_plugins_user']);

        // Verify plugin was removed from user plugins
        expect(storage_after['release_plugins_user']).to.be.empty;

        // Verify no plugin event was fired (since plugin was inactive)
        expect(received_plugin_event).to.be.null;
    });

    // Test deletion of external plugin that overrides built-in plugin
    it('should correctly handle deletion of plugin with override flag', async function () {
        // First, load built-in plugins through manager.run()
        const run = await manager.run();
        expect(run).to.be.undefined;

        // Setup: Add external plugin that overrides built-in plugin
        const built_in_uid = 'Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion';
        const override_plugin = {
            meta: {
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
                name: 'Available AP statistics',
            },
            code: '// ==UserScript==\nreturn false;',
        };

        // Add overriding plugin
        await manager.addUserScripts([override_plugin]);

        // Verify override flag is set before deletion
        const storage_before = await manager.storage.get(['release_plugins_flat']);
        expect(storage_before['release_plugins_flat'][built_in_uid].override).to.be.true;
        expect(storage_before['release_plugins_flat'][built_in_uid].user).to.be.true;
        expect(storage_before['release_plugins_flat'][built_in_uid].status).to.equal('on');

        // Delete the plugin
        await manager.managePlugin(built_in_uid, 'delete');

        // Verify storage state after deletion
        const storage_after = await manager.storage.get(['release_plugins_flat', 'release_plugins_user']);

        // Verify plugin was removed from user plugins
        expect(storage_after['release_plugins_user']).to.be.empty;

        // Verify built-in plugin was restored to original state
        expect(storage_after['release_plugins_flat'][built_in_uid].override).to.be.false;
        expect(storage_after['release_plugins_flat'][built_in_uid].user).to.be.false;
        expect(storage_after['release_plugins_flat'][built_in_uid].status).to.equal('off');
    });
});
