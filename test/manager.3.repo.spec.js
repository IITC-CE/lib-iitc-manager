// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it, before } from 'mocha';
import { Manager } from '../src/manager.js';
import storage from '../test/storage.js';
import { expect } from 'chai';

describe('manage.js custom repo integration tests', function () {
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

    describe('run', function () {
        it('Should not return an error', async function () {
            const run = await manager.run();
            expect(run).to.be.undefined;
        });
    });

    describe('Custom repository', function () {
        const custom_repo = 'http://127.0.0.1:31606/custom';

        it('Setting the URL of the custom repository', async function () {
            const run = await manager.setCustomChannelUrl(custom_repo);
            expect(run).to.be.undefined;
        });

        it('Check the URL of the custom repository', async function () {
            const network_host = await storage.get(['network_host']).then((data) => data.network_host);
            expect(network_host.custom).to.equal(custom_repo);
        });

        it('Switching to a custom channel', async function () {
            const channel = await manager.setChannel('custom');
            expect(channel).to.be.undefined;
        });

        it('Check the IITC version', async function () {
            const script = await storage.get(['custom_iitc_code']).then((data) => data['custom_iitc_code']);
            expect(script).to.include('@version        0.99.0');
        });

        it('Switching back to the Release channel', async function () {
            const channel = await manager.setChannel('release');
            expect(channel).to.be.undefined;
        });
    });
});
