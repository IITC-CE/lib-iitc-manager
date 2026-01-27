// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

export let wait_timeout_id = null;

const METABLOCK_RE_HEADER = /==UserScript==\s*([\s\S]*)\/\/\s*==\/UserScript==/m; // Note: \s\S to match linebreaks
const METABLOCK_RE_ENTRY = /\/\/\s*@(\S+)\s+(.*)$/gm; // example match: "\\ @name some text"

const META_ARRAY_TYPES = ['include', 'exclude', 'match', 'excludeMatch', 'require', 'grant'];

/**
 * Decodes response as UTF-8 text using TextDecoder API.
 * Forces UTF-8 interpretation regardless of Content-Type header.
 * This fixes issues on Android WebView where response.text() doesn't always
 * correctly interpret charset, causing Unicode characters to display incorrectly.
 *
 * @async
 * @param {Response} response - Fetch API response object
 * @return {Promise<string>}
 * @private
 */
async function decodeResponseAsUTF8(response) {
  try {
    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(arrayBuffer);
  } catch (error) {
    console.warn('TextDecoder failed, falling back to response.text():', error);
    return await response.text();
  }
}

/**
 * Parses code of UserScript and returns an object with data from ==UserScript== header.
 *
 * @param {string} code - UserScript plugin with ==UserScript== header.
 * @return {Object.<string, string>|null}
 */
export function parseMeta(code) {
  let header = METABLOCK_RE_HEADER.exec(code);
  if (header === null) return null;
  header = header[1];
  const meta = {};

  let entry = METABLOCK_RE_ENTRY.exec(header);
  while (entry) {
    const [keyName, locale] = entry[1].split(':');
    const camelKey = keyName.replace(/[-_](\w)/g, (m, g) => g.toUpperCase());
    const key = locale ? `${camelKey}:${locale.toLowerCase()}` : camelKey;
    let value = entry[2];

    if (camelKey === 'name') {
      value = value.replace('IITC plugin: ', '').replace('IITC Plugin: ', '');
    }
    if (META_ARRAY_TYPES.includes(key)) {
      if (typeof meta[key] === 'undefined') {
        meta[key] = [];
      }
      meta[key].push(value);
    } else {
      meta[key] = value;
    }

    entry = METABLOCK_RE_ENTRY.exec(header);
  }
  // @homepageURL: compatible with @homepage
  if (!meta.homepageURL && meta.homepage) meta.homepageURL = meta.homepage;
  return meta;
}

/**
 * Fetches a resource and returns data along with version header (ETag or Last-Modified).
 *
 * @async
 * @param {string} url - URL of the resource you want to fetch.
 * @param {Object} [options={}] - Fetch options.
 * @param {boolean} [options.parseJSON=false] - Parse response as JSON.
 * @param {boolean} [options.headOnly=false] - Only fetch headers (HEAD request).
 * @param {boolean} [options.use_fetch_head_method=true] - Allow HEAD requests (if false, always use GET).
 * @return {Promise<{data: string|object|null, version: string|null}>}
 */
export async function fetchResource(url, options = {}) {
  const { parseJSON = false, headOnly = false, use_fetch_head_method = true } = options;

  // Using built-in fetch in browser, otherwise import polyfill
  // eslint-disable-next-line no-undef
  const c_fetch = (...args) =>
    process.env.NODE_ENV !== 'test'
      ? fetch(...args)
      : import('node-fetch').then(({ default: fetch }) => fetch(...args));

  try {
    // If headOnly requested but HEAD not allowed, use GET anyway
    const method = headOnly && use_fetch_head_method ? 'HEAD' : 'GET';

    const response = await c_fetch(url + '?' + Date.now(), {
      method: method,
      cache: 'no-cache',
    });

    if (!response.ok) {
      return { data: null, version: null };
    }

    const version = response.headers.get('ETag') || response.headers.get('Last-Modified');

    // If we made HEAD request, no data
    if (headOnly && method === 'HEAD') {
      return { data: null, version };
    }

    // Parse data with forced UTF-8 decoding
    const text = await decodeResponseAsUTF8(response);
    const data = parseJSON ? JSON.parse(text) : text;

    return { data, version };
  } catch (error) {
    console.error('Error in fetchResource:', error);
    return { data: null, version: null };
  }
}

/**
 * This is a wrapper over the fetch() API method with pre-built parameters.
 *
 * @deprecated Use {@link fetchResource} instead for better version tracking.
 * @async
 * @param {string} url - URL of the resource you want to fetch.
 * @param {"parseJSON" | "head" | null} [variant=null] - Type of request:
 * "parseJSON" - Load the resource and parse it as a JSON response.
 * "head" - Requests only headers (returns version: ETag or Last-Modified).
 * null - Get resource as text.
 * @return {Promise<string|object|null>}
 */
export async function ajaxGet(url, variant) {
  const options = {};

  if (variant === 'parseJSON') {
    options.parseJSON = true;
  } else if (variant === 'head') {
    options.headOnly = true;
  }

  const { data, version } = await fetchResource(url, options);

  // Old behavior: return version for 'head', otherwise return data
  if (variant === 'head') {
    return version;
  }
  return data;
}

/**
 * Generates a unique random string with prefix.
 *
 * @param {string} [prefix="VM"] prefix - Prefix string.
 * @return {string}
 */
export function getUniqId(prefix = 'VM') {
  const now = performance.now();
  return (
    prefix +
    Math.floor((now - Math.floor(now)) * 1e12).toString(36) +
    Math.floor(Math.random() * 1e12).toString(36)
  );
}

/**
 * Returns the unique identifier (UID) of plugin, composed of available plugin fields.
 *
 * @param {plugin} plugin - Plugin object.
 * @return {string|null}
 */
export function getUID(plugin) {
  const available_fields = [];

  if (plugin['id']) {
    available_fields.push(plugin['id']);
  }
  if (plugin['filename']) {
    available_fields.push(plugin['filename']);
  }
  if (plugin['name']) {
    available_fields.push(plugin['name']);
  }
  if (plugin['namespace']) {
    available_fields.push(plugin['namespace']);
  }

  if (available_fields.length < 2) {
    return null;
  }

  return available_fields.slice(-2).join('+');
}

/**
 * Checks if the accepted URL matches one or all domains related to Ingress.
 *
 * @param {string} url - URL address.
 * @param {"<all>" | "intel.ingress.com" | "missions.ingress.com"} [domain="<all>"] domain - One or all domains related to Ingress.
 * @return {boolean}
 */
export function check_url_match_pattern(url, domain) {
  if (url.startsWith('/^')) {
    url = url
      .replace(/\/\^|\?/g, '')
      .replace(/\\\//g, '/')
      .replace(/\.\*/g, '*')
      .replace(/\\\./g, '.');
  }

  if (
    (/^(http|https|\*):\/\/(www|\*)\.ingress\.com\/mission*/.test(url) ||
      /^(http|https|\*):\/\/missions\.ingress\.com\/*/.test(url)) &&
    (domain === '<all>' || domain === 'missions.ingress.com')
  ) {
    return true;
  }

  if (
    (/^(http|https|\*):\/\/(www\.|\*\.|\*|)ingress\.com(?!.*\/mission*)/.test(url) ||
      /^(http|https|\*):\/\/intel\.ingress\.com*/.test(url)) &&
    (domain === '<all>' || domain === 'intel.ingress.com')
  ) {
    return true;
  }

  return false;
}

/**
 * A simple check for a match Ingress sites.
 * Far from implementing all the features of userscripts {@link https://violentmonkey.github.io/api/matching/|@match/@include},
 * but sufficient for our needs.
 *
 * @param {plugin} meta - Object with data from ==UserScript== header.
 * @param {"<all>" | "intel.ingress.com" | "missions.ingress.com"} [domain="<all>"] domain - One or all domains related to Ingress.
 * @return {boolean}
 */
export function check_meta_match_pattern(meta, domain = '<all>') {
  if (meta.match && meta.match.length) {
    for (const url of meta.match) {
      if (check_url_match_pattern(url, domain)) return true;
    }
  }
  if (meta.include && meta.include.length) {
    for (const url of meta.include) {
      if (check_url_match_pattern(url, domain)) return true;
    }
  }
  return false;
}

/**
 * Sets a timer with a specified number of seconds to wait.
 *
 * @async
 * @param {number} seconds
 * @return {Promise<void>}
 */
export async function wait(seconds) {
  return new Promise(resolve => {
    clearTimeout(wait_timeout_id);
    wait_timeout_id = null;
    wait_timeout_id = setTimeout(resolve, seconds * 1000);
  });
}

/**
 * Stops the timer created in {@link wait}
 *
 * @return {void}
 */
export function clearWait() {
  clearTimeout(wait_timeout_id);
  wait_timeout_id = null;
}

/**
 * Checks if any value is set.
 *
 * @param {any} value - Any value.
 * @return {boolean}
 */
export function isSet(value) {
  return typeof value !== 'undefined' && value !== null;
}

/**
 * Processes a string by removing invalid characters for the file system and limiting its length.
 *
 * @param {string} input - The original string to be converted into a file name.
 * @param {number} maxLength - The maximum length of the file name (default is 255 characters).
 * @returns {string} - The processed string.
 */
export function sanitizeFileName(input, maxLength = 255) {
  const invalidChars = /[/\\:*?"<>|]/g;
  let sanitized = input.replace(invalidChars, '');

  // Truncate the length to maxLength characters
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}
