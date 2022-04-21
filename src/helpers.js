// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

export let wait_timeout_id = null;

const METABLOCK_RE_HEADER = /==UserScript==\s*([\s\S]*)\/\/\s*==\/UserScript==/m; // Note: \s\S to match linebreaks
const METABLOCK_RE_ENTRY = /\/\/\s*@(\S+)\s+(.*)$/gm; // example match: "\\ @name some text"

const META_ARRAY_TYPES = [
    'include',
    'exclude',
    'match',
    'excludeMatch',
    'require',
    'grant'
];

export function parseMeta(code) {
    let header = METABLOCK_RE_HEADER.exec(code);
    if (header === null) return;
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

export async function ajaxGet(url, variant) {
    // Using built-in fetch in browser and nodejs >= 18, otherwise import polyfil
    // eslint-disable-next-line no-undef
    const c_fetch = (...args) => (typeof fetch !== 'undefined') ?  fetch(...args) : import('node-fetch').then(({default: fetch}) => fetch(...args));

    try {
        const response = await c_fetch(url + '?' + Date.now(), {
            method: variant === 'Last-Modified' ? 'HEAD' : 'GET',
            cache: 'no-cache'
        });
        if (response.ok) {
            switch (variant) {
            case 'Last-Modified':
                return response.headers.get('Last-Modified');
            case 'parseJSON':
                return await response.json();
            default:
                return await response.text();
            }
        }
    } catch (error) {
        console.error('Error in ajaxGet: ', error);
    }
    return null;
}

export function getUniqId(prefix = 'VM') {
    const now = performance.now();
    return (
        prefix +
        Math.floor((now - Math.floor(now)) * 1e12).toString(36) +
        Math.floor(Math.random() * 1e12).toString(36)
    );
}

/* exported getUID */
export function getUID(plugin) {
    const available_fields = [];

    if (plugin['id']) {available_fields.push(plugin['id']);}
    if (plugin['filename']) {available_fields.push(plugin['filename']);}
    if (plugin['name']) {available_fields.push(plugin['name']);}
    if (plugin['namespace']) {available_fields.push(plugin['namespace']);}

    if (available_fields.length < 2) {return null;}

    return available_fields.slice(-2).join('+');
}

function check_url_match_pattern(url, domain) {
    if (
        (/^(http|https|\*):\/\/intel\.ingress\.com\//.test(url) ||
            /^(http|https|\*):\/\/(www\.|)ingress\.com\/intel/.test(url)) &&
        (domain === '<all>' || domain === 'intel.ingress.com')
    ) {return true;}

    if (
        /^(http|https|\*):\/\/missions\.ingress\.com\//.test(url) &&
        (domain === '<all>' || domain === 'missions.ingress.com')
    ) {return true;}

    return false;
}

// A simple check for a match Ingress sites.
// Far from implementing all the features of userscripts @match/@include ( https://violentmonkey.github.io/api/matching/ ),
// but sufficient for our needs.
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

export async function wait(seconds) {
    return new Promise(resolve => {
        clearTimeout(wait_timeout_id);
        wait_timeout_id = null;
        wait_timeout_id = setTimeout(resolve, seconds * 1000);
    });
}

export function clearWait() {
    clearTimeout(wait_timeout_id);
    wait_timeout_id = null;
}

export const _check_url_match_pattern = check_url_match_pattern;
