// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { strToBase64 } from './base64.js';
import type {
  PluginMeta,
  FetchResourceOptions,
  FetchResourceResult,
  IngressDomain,
} from './types.js';

export let waitTimeoutId: ReturnType<typeof setTimeout> | null = null;

const METABLOCK_RE_HEADER = /==UserScript==\s*([\s\S]*)\/\/\s*==\/UserScript==/m; // Note: \s\S to match linebreaks
const METABLOCK_RE_ENTRY = /\/\/\s*@(\S+)\s+(.*)$/gm; // example match: "\\ @name some text"

const META_ARRAY_TYPES = ['include', 'exclude', 'match', 'excludeMatch', 'require', 'grant'];

/**
 * Decodes response as UTF-8 text using TextDecoder API.
 * Forces UTF-8 interpretation regardless of Content-Type header.
 * This fixes issues on Android WebView where response.text() doesn't always
 * correctly interpret charset, causing Unicode characters to display incorrectly.
 */
async function decodeResponseAsUTF8(response: Response): Promise<string> {
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
 * @param code - UserScript plugin with ==UserScript== header.
 */
export function parseMeta(code: string): PluginMeta | null {
  const headerMatch = METABLOCK_RE_HEADER.exec(code);
  if (headerMatch === null) return null;
  const header = headerMatch[1];
  const meta: PluginMeta = {};

  let entry = METABLOCK_RE_ENTRY.exec(header);
  while (entry) {
    const [keyName, locale] = entry[1].split(':');
    const camelKey = keyName.replace(/[-_](\w)/g, (_m, g: string) => g.toUpperCase());
    const key = locale ? `${camelKey}:${locale.toLowerCase()}` : camelKey;
    let value = entry[2];

    if (camelKey === 'name') {
      value = value.replace('IITC plugin: ', '').replace('IITC Plugin: ', '');
    }
    if (META_ARRAY_TYPES.includes(key)) {
      if (typeof meta[key] === 'undefined') {
        meta[key] = [];
      }
      (meta[key] as string[]).push(value);
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
 * @param url - URL of the resource you want to fetch.
 * @param options - Fetch options.
 */
export async function fetchResource(
  url: string,
  options: FetchResourceOptions = {}
): Promise<FetchResourceResult> {
  const {
    parseJSON = false,
    headOnly = false,
    useFetchHeadMethod = true,
    timeout = 30_000,
  } = options;

  // Using built-in fetch in browser, otherwise import polyfill
  const cFetch = (...args: Parameters<typeof fetch>): Promise<Response> =>
    process.env.NODE_ENV !== 'test'
      ? fetch(...args)
      : import('node-fetch').then(({ default: nodeFetch }) =>
          (nodeFetch as unknown as typeof fetch)(...args)
        );

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), timeout);

  try {
    // If headOnly requested but HEAD not allowed, use GET anyway
    const method = headOnly && useFetchHeadMethod ? 'HEAD' : 'GET';

    const fetchPromise = cFetch(url + '?' + Date.now(), {
      method,
      cache: 'no-cache',
      ...(controller ? { signal: controller.signal } : {}),
    });
    const response = await (controller
      ? fetchPromise
      : Promise.race([
          fetchPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('fetch timeout')), timeout)
          ),
        ]));

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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convenience wrapper over {@link fetchResource} that returns only the data, discarding the version header.
 *
 * @param url - URL of the resource you want to fetch.
 * @param options - Fetch options.
 */
export async function fetchData(
  url: string,
  options: FetchResourceOptions = {}
): Promise<string | object | null> {
  const { data } = await fetchResource(url, options);
  return data;
}

/**
 * Checks whether a URL points to a valid IITC channel by fetching its meta.json.
 *
 * @param url - URL of the custom channel repository to validate.
 */
export async function validateCustomChannelUrl(url: string): Promise<boolean> {
  if (!url) return false;
  const metaUrl = url.endsWith('/') ? `${url}meta.json` : `${url}/meta.json`;
  const { data } = await fetchResource(metaUrl, { timeout: 1000 });
  return data !== null;
}

/**
 * Generates a unique random string with prefix.
 *
 * @param prefix - Prefix string.
 */
export function getUniqueId(prefix: string = 'VM'): string {
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
 * @param plugin - Plugin object or metadata.
 */
export function getUID(plugin: PluginMeta): string | null {
  const availableFields: string[] = [];

  if (plugin['id']) {
    availableFields.push(plugin['id']);
  }
  if (plugin['filename']) {
    availableFields.push(plugin['filename']);
  }
  if (plugin['name']) {
    availableFields.push(plugin['name']);
  }
  if (plugin['namespace']) {
    availableFields.push(plugin['namespace']);
  }

  if (availableFields.length < 2) {
    return null;
  }

  return availableFields.slice(-2).join('+');
}

/**
 * Checks if the accepted URL matches one or all domains related to Ingress.
 *
 * @param url - URL address.
 * @param domain - One or all domains related to Ingress.
 */
export function checkUrlMatchPattern(url: string, domain: IngressDomain): boolean {
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
 * @param meta - Object with data from ==UserScript== header.
 * @param domain - One or all domains related to Ingress.
 */
export function checkMetaMatchPattern(meta: PluginMeta, domain: IngressDomain = '<all>'): boolean {
  if (meta.match && meta.match.length) {
    for (const url of meta.match) {
      if (checkUrlMatchPattern(url, domain)) return true;
    }
  }
  if (meta.include && meta.include.length) {
    for (const url of meta.include) {
      if (checkUrlMatchPattern(url, domain)) return true;
    }
  }
  return false;
}

/**
 * Sets a timer with a specified number of seconds to wait.
 *
 * @param seconds - Number of seconds to wait.
 */
export async function wait(seconds: number): Promise<void> {
  return new Promise(resolve => {
    clearTimeout(waitTimeoutId!);
    waitTimeoutId = null;
    waitTimeoutId = setTimeout(resolve, seconds * 1000);
  });
}

/**
 * Stops the timer created in {@link wait}
 */
export function clearWait(): void {
  clearTimeout(waitTimeoutId!);
  waitTimeoutId = null;
}

/**
 * Generates a storage key prefix for a plugin based on its UID.
 * Uses base64 encoding for key isolation between plugins.
 *
 * @param uid - Plugin unique identifier.
 */
export function getPluginHash(uid: string): string {
  return 'VMin' + strToBase64(uid);
}

/**
 * Checks if any value is set.
 *
 * @param value - Any value.
 */
export function isSet(value: unknown): boolean {
  return typeof value !== 'undefined' && value !== null;
}

/**
 * Processes a string by removing invalid characters for the file system and limiting its length.
 *
 * @param input - The original string to be converted into a file name.
 * @param maxLength - The maximum length of the file name (default is 255 characters).
 */
export function sanitizeFileName(input: string, maxLength: number = 255): string {
  const invalidChars = /[/\\:*?"<>|]/g;
  let sanitized = input.replace(invalidChars, '');

  // Truncate the length to maxLength characters
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}
