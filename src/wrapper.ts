// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { getUID, getPluginHash } from './helpers.js';
import { GM_V3_BINDINGS } from './gm-api.js';
import type { Plugin } from './types.js';

/**
 * Appends a `//# sourceURL=...` comment to code.
 *
 * @param code - JavaScript code string.
 * @param name - Human-readable name (will be URI-encoded).
 * @param suffix - File extension suffix (default: `.user.js`).
 * @param prefix - URL prefix (e.g. `chrome-extension://id/`). Default: empty.
 */
export function appendSourceUrl({
  code,
  name,
  suffix = '.user.js',
  prefix = '',
}: {
  code: string;
  name: string;
  suffix?: string;
  prefix?: string;
}): string {
  return code + `\n//# sourceURL=${prefix}${encodeURIComponent(name)}${suffix}`;
}

/**
 * Wraps plugin code in an IIFE with GM API bindings.
 *
 * The wrapped code calls `window.GM({ data_key, meta })` to obtain a GM API instance,
 * then exposes GM_info, GM_getValue, GM_setValue, GM_xmlhttpRequest, etc. as local variables
 * available to the plugin code.
 *
 * @param plugin - Plugin object from lib-iitc-manager.
 * @returns Wrapped plugin code ready for injection.
 */
export function wrapPluginCode(plugin: Plugin, source_url_prefix: string = ''): string {
  const uid = plugin.uid || getUID(plugin);
  const data_key = getPluginHash(uid!);

  const meta = { ...plugin };
  delete meta.code;

  const code = [
    '((GM)=>{',
    GM_V3_BINDINGS,
    '\n',
    plugin.code,
    plugin.code!.endsWith('\n') ? '' : '\n',
    `})(GM(${JSON.stringify({ data_key, meta })}))`,
  ].join('');

  return appendSourceUrl({ code, name: meta.name || uid || 'plugin', prefix: source_url_prefix });
}
