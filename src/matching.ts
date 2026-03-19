// Copyright (C) 2023-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import type { PluginMeta } from './types.js';

interface Matcher {
  test(url: string): boolean;
}

const CACHE: { [key: string]: RegExp | Matcher } = {};
const RE_URL = /(.*?):\/\/([^/]*)\/(.*)/;

/**
 * Checks the URL for match/include plugin.
 *
 * @param meta - Object with data from ==UserScript== header.
 * @param url - Page URL.
 */
export function check_matching(meta: PluginMeta, url: string): boolean {
  const match = meta.match || [];
  const include = meta.include || [];
  const match_exclude = meta.excludeMatch || [];
  const exclude = meta.exclude || [];

  // match all if no @match or @include rule and set url === '<all_ingress>'
  let ok = !match.length && !include.length && url === '<all_ingress>';
  // @match
  ok = ok || testMatch(url, match);
  // @include
  ok = ok || testInclude(url, include);
  // @exclude-match
  ok = ok && !testMatch(url, match_exclude);
  // @exclude
  ok = ok && !testInclude(url, exclude);
  return ok;
}

function str2RE(str: string): RegExp {
  const re = str.replace(/([.?/])/g, '\\$1').replace(/\*/g, '.*?');
  return RegExp(`^${re}$`);
}

/**
 * Test glob rules like `@include` and `@exclude`.
 */
export function testInclude(url: string, rules: string[]): boolean {
  return rules.some(rule => {
    const key = `re:${rule}`;
    let re = CACHE[key] as RegExp | undefined;
    if (!re) {
      re = makeIncludeRegExp(rule);
      CACHE[key] = re;
    }
    return re.test(url);
  });
}

function makeIncludeRegExp(str: string): RegExp {
  if (str.length > 1 && str[0] === '/' && str[str.length - 1] === '/') {
    return RegExp(str.slice(1, -1)); // Regular-expression
  }
  return str2RE(str); // Wildcard
}

/**
 * Test match rules like `@match` and `@exclude_match`.
 */
export function testMatch(url: string, rules: string[]): boolean {
  return rules.some(rule => {
    const key = `match:${rule}`;
    let matcher = CACHE[key] as Matcher | undefined;
    if (!matcher) {
      matcher = makeMatchRegExp(rule);
      CACHE[key] = matcher as unknown as RegExp;
    }
    return matcher.test(url);
  });
}

function makeMatchRegExp(rule: string): Matcher {
  let test: (url: string) => boolean;
  if (rule === '<all_urls>') test = () => true;
  else {
    const ruleParts = rule.match(RE_URL);
    test = (url: string) => {
      const parts = url.match(RE_URL);
      return (
        !!ruleParts &&
        !!parts &&
        matchScheme(ruleParts[1], parts[1]) &&
        matchHost(ruleParts[2], parts[2]) &&
        matchPath(ruleParts[3], parts[3])
      );
    };
  }
  return { test };
}

function matchScheme(rule: string, data: string): boolean {
  // exact match
  if (rule === data) return true;
  // * = http | https
  if (rule === '*' && /^https?$/i.test(data)) return true;
  return false;
}

function matchHost(rule: string, data: string): boolean {
  // * matches all
  if (rule === '*') return true;
  // exact match
  if (rule === data) return true;
  // *.example.com
  if (/^\*\.[^*]*$/.test(rule)) {
    // matches the specified domain
    if (rule.slice(2) === data) return true;
    // matches subdomains
    if (str2RE(rule).test(data)) return true;
  }
  return false;
}

function matchPath(rule: string, data: string): boolean {
  return str2RE(rule).test(data);
}

/**
 * Returns information about the domains for which the script will be enabled.
 * Returns null if `@match` and `@include` are not specified.
 * Returns '<all_urls>' if the script will be run for all domains.
 * Otherwise, it returns a list of strings with domains.
 *
 * @param meta - Object with data from ==UserScript== header.
 */
export function humanize_match(meta: PluginMeta): null | string | string[] {
  const match = meta.match || [];
  const include = meta.include || [];
  const matches = match.concat(include);

  if (!matches.length) return null;
  if (matches.includes('<all_urls>')) return '<all_urls>';

  const domains: string[] = [];
  for (const item of matches) {
    const parts = item.match(RE_URL);
    if (!parts) continue;

    const [, , domain] = parts;
    if (domain === '*') return '<all_urls>';
    if (!domains.includes(domain)) domains.push(domain);
  }
  return domains;
}
