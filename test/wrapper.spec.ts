// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { wrapPluginCode } from '../src/wrapper.js';
import { getPluginHash } from '../src/helpers.js';
import type { Plugin } from '../src/types.js';

const samplePlugin: Plugin = {
  uid: 'test-plugin+https://example.com',
  name: 'test-plugin',
  namespace: 'https://example.com',
  code: 'console.log("hello");',
  version: '1.0.0',
  description: 'A test plugin',
  grant: ['GM_getValue', 'GM_setValue'],
};

describe('wrapPluginCode', function () {
  it('wraps code in IIFE with GM call', function () {
    const result = wrapPluginCode(samplePlugin);
    expect(result).to.match(/^\(\(GM\)=>\{/);
    expect(result).to.include('})(GM(');
    expect(result).to.include('console.log("hello");');
  });

  it('uses correct data_key from plugin UID', function () {
    const result = wrapPluginCode(samplePlugin);
    const expectedHash = getPluginHash(samplePlugin.uid);
    expect(result).to.include(`"data_key":"${expectedHash}"`);
  });

  it('serializes plugin meta without code', function () {
    const result = wrapPluginCode(samplePlugin);
    expect(result).to.include('"name":"test-plugin"');
    expect(result).to.include('"grant":["GM_getValue","GM_setValue"]');
    expect(result).to.not.include('"code"');
  });

  it('includes GM API v3 compatibility bindings', function () {
    const result = wrapPluginCode(samplePlugin);
    for (const binding of [
      'const GM_info = GM.info',
      'const unsafeWindow = window',
      'const GM_getValue',
      'const GM_setValue',
      'const GM_xmlhttpRequest',
      'const exportFunction',
      'const createObjectIn',
      'const cloneInto',
    ]) {
      expect(result, `should include ${binding}`).to.include(binding);
    }
  });

  it('adds newline before closing only if code does not end with one', function () {
    const withoutNewline: Plugin = { ...samplePlugin, code: 'var x = 1;' };
    const withNewline: Plugin = { ...samplePlugin, code: 'var x = 1;\n' };
    // Both should have exactly one newline before })(GM(
    expect(wrapPluginCode(withoutNewline)).to.include('var x = 1;\n})(GM(');
    expect(wrapPluginCode(withNewline)).to.include('var x = 1;\n})(GM(');
  });

  it('produces different data_keys for different plugins', function () {
    const plugin2: Plugin = {
      ...samplePlugin,
      uid: 'other-plugin+https://example.com',
      name: 'other-plugin',
    };

    const hashRegex = /"data_key":"([^"]+)"/;
    const hash1 = hashRegex.exec(wrapPluginCode(samplePlugin))![1];
    const hash2 = hashRegex.exec(wrapPluginCode(plugin2))![1];
    expect(hash1).to.not.equal(hash2);
  });

  it('falls back to getUID when plugin.uid is empty', function () {
    const plugin: Plugin = {
      uid: '',
      name: 'test-plugin',
      namespace: 'https://example.com',
      code: 'var x = 1;',
    };
    const expectedHash = getPluginHash('test-plugin+https://example.com');
    expect(wrapPluginCode(plugin)).to.include(`"data_key":"${expectedHash}"`);
  });
});
