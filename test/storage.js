// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

const store = {};

export default {
    /**
     * Converts the input key to an array if it is a string.
     * @param {string|Array} key - The key or keys to be converted to an array.
     * @returns {Array} An array containing the keys.
     */
    _one_to_array: function (key) {
        if (typeof key === 'string') {
            key = [key];
        }
        return key;
    },

    /**
     * Retrieves the value associated with the given key from the store.
     * @param {string} key - The key for the value to be retrieved.
     * @returns {any} The value associated with the key, or null if the key is not found.
     */
    _get_one(key) {
        const value = key in store ? store[key] : null;

        if (value === null) return null;

        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    },

    /**
     * Sets the value associated with the given key in the store.
     * @param {string} key - The key for the value to be set.
     * @param {any} value - The value to be stored.
     */
    _set_one(key, value) {
        if (typeof value !== 'string') {
            value = JSON.stringify(value);
        }
        store[key] = value;
    },

    /**
     * Retrieves data from the store for the specified keys.
     * If 'keys' is null, returns a copy of all data in the store.
     * @param {null|string|Array} keys - The key or keys for the data to be retrieved.
     * @returns {Object} An object containing the data associated with the keys.
     */
    async get(keys) {
        if (keys === null) {
            const data = {};
            for (const key in store) {
                data[key] = this._get_one(key);
            }
            return data;
        }
        keys = this._one_to_array(keys);
        if (Array.isArray(keys)) {
            const data = {};
            keys.forEach((key) => {
                data[key] = this._get_one(key);
            });
            return data;
        } else {
            console.error('Unexpected type of key when trying to get storage value: ' + typeof keys);
        }
    },

    /**
     * Sets data in the store for the specified keys and values.
     * @param {Object} obj - An object containing the keys and values to be stored.
     */
    async set(obj) {
        if (typeof obj === 'object') {
            Object.entries(obj).forEach((entry) => {
                const [key, value] = entry;
                this._set_one(key, value);
            });
        } else {
            console.error('Unexpected type of key when trying to set storage value: ' + typeof obj);
        }
    },

    /**
     * Resets the storage by removing all data from the store.
     */
    resetStorage() {
        for (const key in store) {
            delete store[key];
        }
    },
};
