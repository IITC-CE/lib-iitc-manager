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
  return code + `\nvoid 0\n//# sourceURL=${prefix}${encodeURIComponent(name)}${suffix}`;
}

/**
 * Wraps plugin code in an IIFE with GM API bindings.
 *
 * The wrapped code calls `window.__iitc_gm__({ data_key, meta })` to obtain a GM API instance,
 * then exposes GM_info, GM_getValue, GM_setValue, GM_xmlhttpRequest, etc. as local variables
 * available to the plugin code.
 *
 * `__iitc_gm__` is only the internal page-level name (chosen to avoid colliding with
 * third-party globals). Plugins still use the familiar `GM` / `GM_*` names, since the
 * factory result is passed into the IIFE as the `GM` argument.
 *
 * @param plugin - Plugin object from lib-iitc-manager.
 * @returns Wrapped plugin code ready for injection.
 */
export function wrapPluginCode(plugin: Plugin, sourceUrlPrefix: string = ''): string {
  const uid = plugin.uid || getUID(plugin);
  const dataKey = getPluginHash(uid!);

  const meta = { ...plugin };
  delete meta.code;

  // Strip NUL bytes and ensure trailing newline
  const stripped = plugin.code!.replaceAll('\x00', '');
  const pluginCode = stripped.endsWith('\n') ? stripped : `${stripped}\n`;

  const code = [
    '((GM)=>{',
    GM_V3_BINDINGS,
    '\n',
    pluginCode,
    `})(__iitc_gm__(${JSON.stringify({ data_key: dataKey, meta })}))`,
  ].join('');

  return appendSourceUrl({ code, name: meta.name || uid || 'plugin', prefix: sourceUrlPrefix });
}
