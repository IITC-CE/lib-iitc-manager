// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

export let wait_timeout_id = null;

const METABLOCK_RE_HEADER = /==UserScript==\s*([\s\S]*)\/\/\s*==\/UserScript==/m; // Note: \s\S to match linebreaks
const METABLOCK_RE_ENTRY = /\/\/\s*@(\S+)\s+(.*)$/gm; // example match: "\\ @name some text"

const META_ARRAY_TYPES = ['include', 'exclude', 'match', 'excludeMatch', 'require', 'grant'];

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
 * This is a wrapper over the fetch() API method with pre-built parameters.
 *
 * @async
 * @param {string} url - URL of the resource you want to fetch.
 * @param {"parseJSON" | "Last-Modified" | null} [variant=null] - Type of request:
 * "parseJSON" - Load the resource and parse it as a JSON response.
 * "Last-Modified" - Requests the last modification date of a file.
 * null - Get resource as text.
 * @return {Promise<string|object|null>}
 */
export async function ajaxGet(url, variant) {
    // Using built-in fetch in browser , otherwise import polyfil
    // eslint-disable-next-line no-undef
    const c_fetch = (...args) => (process.env.NODE_ENV !== 'test' ? fetch(...args) : import('node-fetch').then(({ default: fetch }) => fetch(...args)));

    try {
        const response = await c_fetch(url + '?' + Date.now(), {
            method: variant === 'Last-Modified' ? 'HEAD' : 'GET',
            cache: 'no-cache',
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

/**
 * Generates a unique random string with prefix.
 *
 * @param {string} [prefix="VM"] prefix - Prefix string.
 * @return {string}
 */
export function getUniqId(prefix = 'VM') {
    const now = performance.now();
    return prefix + Math.floor((now - Math.floor(now)) * 1e12).toString(36) + Math.floor(Math.random() * 1e12).toString(36);
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
        (/^(http|https|\*):\/\/(www|\*)\.ingress\.com\/mission*/.test(url) || /^(http|https|\*):\/\/missions\.ingress\.com\/*/.test(url)) &&
        (domain === '<all>' || domain === 'missions.ingress.com')
    ) {
        return true;
    }

    if (
        (/^(http|https|\*):\/\/(www\.|\*\.|\*|)ingress\.com(?!.*\/mission*)/.test(url) || /^(http|https|\*):\/\/intel\.ingress\.com*/.test(url)) &&
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
    return new Promise((resolve) => {
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
