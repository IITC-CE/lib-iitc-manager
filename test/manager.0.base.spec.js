// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('manage.js base integration tests', function () {
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
    });

    describe('inject', function () {
        it('Should not return an error', async function () {
            const inject = await manager.inject();
            expect(inject).to.be.undefined;
        });
    });
});
