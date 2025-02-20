// Copyright (C) 2023-2025 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

const CACHE = {};
const RE_URL = /(.*?):\/\/([^/]*)\/(.*)/;

/**
 * Checks the URL for match/include plugin.
 *
 * @param {plugin} meta - Object with data from ==UserScript== header.
 * @param {string} url - Page URL.
 * @return {boolean}
 */
export function check_matching(meta, url) {
    const match = meta.match || [];
    const include = meta.include || [];
    const match_exclude = meta['exclude-match'] || [];
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

function str2RE(str) {
    const re = str.replace(/([.?/])/g, '\\$1').replace(/\*/g, '.*?');
    return RegExp(`^${re}$`);
}

/**
 * Test glob rules like `@include` and `@exclude`.
 */
export function testInclude(url, rules) {
    return rules.some((rule) => {
        const key = `re:${rule}`;
        let re = CACHE[key];
        if (!re) {
            re = makeIncludeRegExp(rule);
            CACHE[key] = re;
        }
        return re.test(url);
    });
}

function makeIncludeRegExp(str) {
    if (str.length > 1 && str[0] === '/' && str[str.length - 1] === '/') {
        return RegExp(str.slice(1, -1)); // Regular-expression
    }
    return str2RE(str); // Wildcard
}

/**
 * Test match rules like `@match` and `@exclude_match`.
 */
export function testMatch(url, rules) {
    return rules.some((rule) => {
        const key = `match:${rule}`;
        let matcher = CACHE[key];
        if (!matcher) {
            matcher = makeMatchRegExp(rule);
            CACHE[key] = matcher;
        }
        return matcher.test(url);
    });
}

function makeMatchRegExp(rule) {
    let test;
    if (rule === '<all_urls>') test = () => true;
    else {
        const ruleParts = rule.match(RE_URL);
        test = (url) => {
            const parts = url.match(RE_URL);
            return !!ruleParts && !!parts && matchScheme(ruleParts[1], parts[1]) && matchHost(ruleParts[2], parts[2]) && matchPath(ruleParts[3], parts[3]);
        };
    }
    return { test };
}

function matchScheme(rule, data) {
    // exact match
    if (rule === data) return 1;
    // * = http | https
    if (rule === '*' && /^https?$/i.test(data)) return 1;
    return 0;
}

function matchHost(rule, data) {
    // * matches all
    if (rule === '*') return 1;
    // exact match
    if (rule === data) return 1;
    // *.example.com
    if (/^\*\.[^*]*$/.test(rule)) {
        // matches the specified domain
        if (rule.slice(2) === data) return 1;
        // matches subdomains
        if (str2RE(rule).test(data)) return 1;
    }
    return 0;
}

function matchPath(rule, data) {
    return str2RE(rule).test(data);
}

/**
 * Returns information about the domains for which the script will be enabled.
 * Returns null if @match and @include are not specified
 * Returns <all_urls> if the script will be run for all domains. Additional URL Scheme and Path filters are not taken into account.
 * Otherwise, it returns a list of strings with domains.
 *
 * @param {plugin} meta - Object with data from ==UserScript== header.
 * @return {null|string|Array.<string>}
 */
export function humanize_match(meta) {
    const match = meta.match || [];
    const include = meta.include || [];
    const matches = match.concat(include);

    if (!matches.length) return null;
    if (matches.includes('<all_urls>')) return '<all_urls>';

    const domains = [];
    for (const item of matches) {
        const parts = item.match(RE_URL);
        if (!parts) continue;

        const [, , domain] = parts;
        if (domain === '*') return '<all_urls>';
        if (!domains.includes(domain)) domains.push(domain);
    }
    return domains;
}
