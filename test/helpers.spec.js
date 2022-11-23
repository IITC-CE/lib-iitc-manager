// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

import { describe, it } from 'mocha';
import * as helpers from '../src/helpers.js';
import { expect } from 'chai';

describe('parseMeta', function () {
    it('without arguments', function () {
        expect(helpers.parseMeta()).to.be.null;
    });

    const data1 =
        '// ==UserScript==\n' +
        '// @author         Hollow011\n' +
        '// @name           IITC plugin: Available AP statistics\n' +
        '// @category       Info\n' +
        '// @version        0.4.1\n' +
        '// @description    Displays the per-team AP gains available in the current view.\n' +
        '// @id             ap-stats\n' +
        '// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion\n' +
        '// @match          https://intel.ingress.com/*\n' +
        '// @grant          none\n' +
        '// ==/UserScript==';

    const expected1 = {
        author: 'Hollow011',
        name: 'Available AP statistics',
        category: 'Info',
        version: '0.4.1',
        description: 'Displays the per-team AP gains available in the current view.',
        id: 'ap-stats',
        namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
        match: ['https://intel.ingress.com/*'],
        grant: ['none'],
    };

    describe('test data1', function () {
        it('has expected number of keys', function () {
            expect(Object.keys(helpers.parseMeta(data1)).length).to.equal(Object.keys(expected1).length);
        });
        it('has expected keys and values', function () {
            expect(helpers.parseMeta(data1)).to.deep.equal(expected1);
        });
    });
});

describe('ajaxGet', function () {
    it('test plaint', async function () {
        expect(await helpers.ajaxGet('http://127.0.0.1:31606/release/total-conversion-build.meta.js')).to.include('==UserScript==');
    });

    it('test json', async function () {
        const response = await helpers.ajaxGet('http://127.0.0.1:31606/release/meta.json', 'parseJSON');
        expect(response, 'is object').to.be.an.instanceof(Object);
        expect(response, 'have keys').to.have.all.keys('categories', 'iitc_version');
    });

    it('test Last-Modified', async function () {
        const response = await helpers.ajaxGet('http://127.0.0.1:31606/release/meta.json', 'Last-Modified');
        expect(response, 'matches the pattern').to.match(/^(\w+), (\d+) (\w+) (\d+) (\d+):(\d+):(\d+) (\w+)/);
    });
});

describe('getUniqId', function () {
    it('without arguments', function () {
        expect(helpers.getUniqId()).to.include('VM');
    });

    describe('with argument tmp', function () {
        it('has expected text "tmp"', function () {
            expect(helpers.getUniqId('tmp')).to.include('tmp');
        });
        it('is random value', function () {
            expect(helpers.getUniqId('tmp')).to.not.equal(helpers.getUniqId('tmp'));
        });
    });
});

describe('getUID', function () {
    it('empty object', function () {
        expect(helpers.getUID({})).to.be.null;
    });

    it('simply plugin', function () {
        expect(
            helpers.getUID({
                name: 'Available AP statistics',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            })
        ).to.equal('Available AP statistics+https://github.com/IITC-CE/ingress-intel-total-conversion');
    });

    it('another plugin', function () {
        expect(
            helpers.getUID({
                id: 'ap-stats',
                namespace: 'https://github.com/IITC-CE/ingress-intel-total-conversion',
            })
        ).to.equal('ap-stats+https://github.com/IITC-CE/ingress-intel-total-conversion');
    });

    it('Plugin with incorrect meta header', function () {
        expect(
            helpers.getUID({
                id: 'ap-stats',
            })
        ).to.be.null;
    });
});

describe('check_url_match_pattern', function () {
    const missions_links = [
        '*://*.ingress.com/mission/*',

        'http://*.ingress.com/mission/*',
        'http://www.ingress.com/mission/*',

        'https://*.ingress.com/mission/*',
        'https://missions.ingress.com/*',
        'https://www.ingress.com/mission/*',
    ];

    const intel_links = [
        '*://*.ingress.com/*',
        '*://*.ingress.com/intel*',
        '*://intel.ingress.com/*',

        'http://*.ingress.com/*',
        'http://*.ingress.com/intel*',
        'http://*ingress.com/intel*',
        'http://ingress.com/intel*',
        'http://www.ingress.com/intel*',

        'https://*.ingress.com/*',
        'https://*.ingress.com/intel*',
        'https://ingress.com/intel',
        'https://ingress.com/intel*',
        'https://intel.ingress.com',
        'https://intel.ingress.com/*',
        'https://intel.ingress.com/intel',
        'https://www.ingress.com/intel*',

        '/^https://ingress.com/intel.*/',
        '/^https://www.ingress.com/intel.*/',
        '/^https:\\/\\/.*ingress\\.com\\/intel.*/',
        '/^https:\\/\\/ingress\\.com\\/intel.*/',
        '/^https?:\\/\\/.*ingress\\.com\\/intel.*/',
        '/^https?:\\/\\/intel.ingress\\.com.*/',
    ];

    describe('match missions.ingress.com - valid', function () {
        for (const url of missions_links) {
            it(url, function () {
                expect(helpers.check_url_match_pattern(url, 'missions.ingress.com')).to.be.true;
            });
        }
    });

    describe('match missions.ingress.com - not valid', function () {
        for (const url of intel_links) {
            it(url, function () {
                expect(helpers.check_url_match_pattern(url, 'missions.ingress.com')).to.be.false;
            });
        }
    });

    describe('match intel.ingress.com - valid', function () {
        for (const url of intel_links) {
            it(url, function () {
                expect(helpers.check_url_match_pattern(url, 'intel.ingress.com')).to.be.true;
            });
        }
    });

    describe('match intel.ingress.com - not valid', function () {
        for (const url of missions_links) {
            it(url, function () {
                expect(helpers.check_url_match_pattern(url, 'intel.ingress.com')).to.be.false;
            });
        }
    });
});

describe('check_meta_match_pattern', function () {
    describe('domain = <all>', function () {
        it('variant 1', function () {
            expect(helpers.check_meta_match_pattern({ match: ['http://ingress.com'] }, '<all>')).to.be.true;
        });

        it('variant 2', function () {
            expect(helpers.check_meta_match_pattern({ match: ['http://ingress.com', 'https://ingress.com/intel'] }, '<all>')).to.be.true;
        });
    });

    describe('domain = intel.ingress.com', function () {
        it('variant 1', function () {
            expect(helpers.check_meta_match_pattern({ match: ['https://missions.ingress.com'] }, 'intel.ingress.com')).to.be.false;
        });

        it('variant 2', function () {
            expect(helpers.check_meta_match_pattern({ match: ['http://ingress.com', 'https://ingress.com/intel'] }, 'intel.ingress.com')).to.be.true;
        });
    });
});

describe('wait', function () {
    it('timer works', async function () {
        let time = performance.now();

        await helpers.wait(0.1);

        time = performance.now() - time;
        expect(time).to.be.closeTo(100, 15);
    });
});
