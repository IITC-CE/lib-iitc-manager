// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { getGmApiCode } from '../src/gm-api.js';
import { getPluginHash } from '../src/helpers.js';

describe('getGmApiCode', function () {
  it('is a valid self-invoking function', function () {
    const code = getGmApiCode();
    expect(code).to.be.a('string');
    expect(code.trimStart()).to.match(/^\(function\(\)/);
    expect(code.trimEnd()).to.match(/\)\(\)$/);
  });

  it('defines window.GM factory with bridge abstraction', function () {
    const code = getGmApiCode();
    expect(code).to.include('window.GM');
    expect(code).to.include('window.__iitc_gm_bridge__.send');
    expect(code).to.include('window.__iitc_gm_bridge__.onResponse');
  });

  it('does not contain hardcoded CustomEvent bridge', function () {
    const code = getGmApiCode();
    expect(code).to.not.include('new CustomEvent("bridgeRequest"');
    expect(code).to.not.include("new CustomEvent('bridgeRequest'");
  });

  it('includes all GM API methods and helpers', function () {
    const code = getGmApiCode();
    for (const method of [
      '_getValueSync',
      '_setValueSync',
      'getValue',
      'setValue',
      'deleteValue',
      'listValues',
      'xmlHttpRequest',
      'exportFunction',
      'createObjectIn',
      'cloneInto',
      '_access',
      'base64ToStr',
    ]) {
      expect(code, `should include ${method}`).to.include(method);
    }
  });

  it('includes intel.ingress.com onload override', function () {
    const code = getGmApiCode();
    expect(code).to.include('intel.ingress.com');
    expect(code).to.include('window.onload');
  });
});

describe('getPluginHash', function () {
  it('returns a deterministic string starting with VMin', function () {
    const hash = getPluginHash('test-uid');
    expect(hash).to.match(/^VMin/);
    expect(getPluginHash('test-uid')).to.equal(hash);
  });

  it('returns different hashes for different UIDs', function () {
    const hash1 = getPluginHash('plugin-a+https://example.com');
    const hash2 = getPluginHash('plugin-b+https://example.com');
    expect(hash1).to.not.equal(hash2);
  });

  it('handles UIDs with special characters', function () {
    const hash = getPluginHash(
      'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion'
    );
    expect(hash).to.match(/^VMin/);
  });
});
