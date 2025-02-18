// Copyright (C) 2022-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('manage.js base integration tests', function () {
    let manager = null;
    before(function () {
        storage.resetStorage();
        const params = {
            storage: storage,
            channel: 'beta',
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
                const iitc_main_script_uid = 'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
                expect(data).to.have.all.keys('event', 'plugins');
                expect(data['event']).to.equal('update');
                expect(data['plugins']).to.have.all.keys(iitc_main_script_uid);
                expect(data['plugins'][iitc_main_script_uid]['uid']).to.equal(iitc_main_script_uid);
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

    describe('Check channel', function () {
        it('Should return beta', async function () {
            const channel = await storage.get(['channel']).then((data) => data.channel);
            expect(channel).to.equal('beta');
        });
    });

    describe('setChannel', function () {
        it('Should not return an error', async function () {
            const channel = await manager.setChannel('release');
            expect(channel).to.be.undefined;
        });
    });

    describe('setUpdateCheckInterval', function () {
        it('Should not return an error', async function () {
            const fn = await manager.setUpdateCheckInterval(24 * 60 * 60, 'release');
            expect(fn).to.be.undefined;
        });
        it('Should set correct interval in seconds', async function () {
            const interval = await storage.get(['release_update_check_interval']).then((data) => data.release_update_check_interval);
            expect(interval).to.equal(24 * 60 * 60);
        });
    });

    describe('inject', function () {
        it('Should not return an error', async function () {
            const inject = await manager.inject();
            expect(inject).to.be.undefined;
        });
    });
});
