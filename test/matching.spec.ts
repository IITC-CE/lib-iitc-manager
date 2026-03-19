// Copyright (C) 2023-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it } from 'mocha';
import { check_matching, humanize_match } from '../src/matching.js';
import { expect } from 'chai';
import type { PluginMeta } from '../src/types.js';

describe('scheme', function () {
  it('should match all', function () {
    const script: PluginMeta = {
      match: ['*://*/*'],
    };
    expect(check_matching(script, 'https://intel.ingress.com/'), 'should match').to.be.true;
    expect(check_matching(script, 'http://example.com/'), 'should match').to.be.true;
  });
  it('should match exact', function () {
    const script: PluginMeta = {
      match: ['http://*/*'],
    };
    expect(check_matching(script, 'https://intel.ingress.com/'), 'should not match `https`').to.be
      .false;
    expect(check_matching(script, 'http://example.com/'), 'should match `http`').to.be.true;
    expect(check_matching(script, 'https://example.com/'), 'should not match `https`').to.be.false;
  });
});

describe('host', function () {
  it('should match domain', function () {
    const script: PluginMeta = {
      match: ['*://www.example.com/'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should match').to.be.true;
    expect(check_matching(script, 'http://sub.www.example.com/'), 'should not match subdomains').to
      .be.false;
    expect(check_matching(script, 'http://www.example.net/'), 'should not match another domains').to
      .be.false;
  });
  it('should match subdomains', function () {
    const script: PluginMeta = {
      match: ['*://*.example.com/'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should match subdomains').to.be.true;
    expect(check_matching(script, 'http://a.b.example.com/'), 'should match subdomains').to.be.true;
    expect(check_matching(script, 'http://example.com/'), 'should match specified domain').to.be
      .true;
    expect(check_matching(script, 'http://www.example.net/'), 'should not match another domains').to
      .be.false;
  });
});

describe('path', function () {
  it('should match any', function () {
    const script: PluginMeta = {
      match: ['http://www.example.com/*'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should match `/`').to.be.true;
    expect(check_matching(script, 'http://www.example.com/api/'), 'should match any').to.be.true;
  });
  it('should match exact', function () {
    const script: PluginMeta = {
      match: ['http://www.example.com/a/b/c'],
    };
    expect(check_matching(script, 'http://www.example.com/a/b/c'), 'should match exact').to.be.true;
    expect(check_matching(script, 'http://www.example.com/a/b/c/d'), 'should not match').to.be
      .false;
  });
});

describe('include', function () {
  it('should include any', function () {
    const script: PluginMeta = {
      include: ['*'],
    };
    expect(check_matching(script, 'https://www.example.com/'), 'should match `http | https`').to.be
      .true;
  });
  it('should include by regexp', function () {
    const script: PluginMeta = {
      match: ['http://www.example.com/*', 'http://www.example2.com/*'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should match `/`').to.be.true;
    expect(check_matching(script, 'http://www.example2.com/data/'), 'include by prefix').to.be.true;
    expect(check_matching(script, 'http://www.example3.com/'), 'should not match').to.be.false;
  });
});

describe('exclude', function () {
  it('should exclude any', function () {
    const script: PluginMeta = {
      match: ['*://*/*'],
      exclude: ['*'],
    };
    expect(check_matching(script, 'https://www.example.com/'), 'should exclude `http | https`').to
      .be.false;
  });
  it('should include by regexp', function () {
    const script: PluginMeta = {
      match: ['*://*/*'],
      exclude: ['http://www.example.com/*', 'http://www.example2.com/*'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should exclude `/`').to.be.false;
    expect(check_matching(script, 'http://www.example2.com/data/'), 'exclude by prefix').to.be
      .false;
    expect(check_matching(script, 'http://www.example3.com/'), 'not exclude by prefix').to.be.true;
  });
});

describe('exclude-match', function () {
  it('should exclude any', function () {
    const script: PluginMeta = {
      match: ['*://*/*'],
      excludeMatch: ['*://*/*'],
    };
    expect(check_matching(script, 'https://www.example.com/'), 'should exclude `http | https`').to
      .be.false;
  });
  it('should include by regexp', function () {
    const script: PluginMeta = {
      match: ['*://*/*'],
      excludeMatch: ['http://www.example.com/*', 'http://www.example2.com/*'],
    };
    expect(check_matching(script, 'http://www.example.com/'), 'should exclude `/`').to.be.false;
    expect(check_matching(script, 'http://www.example2.com/data/'), 'exclude by prefix').to.be
      .false;
    expect(check_matching(script, 'http://www.example3.com/'), 'not exclude by prefix').to.be.true;
  });
});

describe('<all_ingress>', function () {
  it('should match all if no @match or @include rule and set url is `<all_ingress>`', function () {
    const script: PluginMeta = {};
    expect(check_matching(script, 'https://intel.ingress.com/'), 'not match real url').to.be.false;
    expect(check_matching(script, '<all_ingress>'), 'should match keyword `<all_ingress>`').to.be
      .true;
  });
});

describe('testing humanize_match() function', function () {
  it('return null if @match and @include are not set', function () {
    const script: PluginMeta = {};
    expect(humanize_match(script), 'should return null').to.be.null;
  });
  it('return <all_urls> if @match or @include are set to <all_urls> or domain contains *', function () {
    const script1: PluginMeta = {
      match: ['*://*/*'],
      include: ['*://*/*'],
    };
    const script2: PluginMeta = {
      include: ['<all_urls>'],
    };
    const script3: PluginMeta = {
      include: ['http://www.example.com/*', '<all_urls>'],
    };
    expect(humanize_match(script1), 'should return <all_urls>').to.be.equal('<all_urls>');
    expect(humanize_match(script2), 'should return <all_urls>').to.be.equal('<all_urls>');
    expect(humanize_match(script3), 'should return <all_urls>').to.be.equal('<all_urls>');
  });
  it('return list of domains', function () {
    const script: PluginMeta = {
      match: ['http://www.example.com/*', 'http://www.example2.com/*'],
    };
    expect(humanize_match(script), 'should return list of domains').deep.equal([
      'www.example.com',
      'www.example2.com',
    ]);
  });
});
