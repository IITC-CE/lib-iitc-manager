// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { getUID, getPluginHash } from './helpers.js';
import type { Plugin } from './types.js';

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
export function wrapPluginCode(plugin: Plugin): string {
  const uid = plugin.uid || getUID(plugin);
  const data_key = getPluginHash(uid!);

  const meta = { ...plugin };
  delete meta.code;

  return [
    '((GM)=>{',
    'const GM_info = GM.info;',
    'const unsafeWindow = window;',
    'const exportFunction = GM.exportFunction;',
    'const createObjectIn = GM.createObjectIn;',
    'const cloneInto = GM.cloneInto;',
    'const GM_getValue = (key, value) => GM._getValueSync(key, value);',
    'const GM_setValue = (key, value) => GM._setValueSync(key, value);',
    'const GM_xmlhttpRequest = (details) => GM.xmlHttpRequest(details);',
    '',
    plugin.code,
    plugin.code!.endsWith('\n') ? '' : '\n',
    `})(GM(${JSON.stringify({ data_key, meta })}))`,
  ].join('');
}
