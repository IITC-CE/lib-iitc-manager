// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3

const store = {};
export default {
    _one_to_array: function (key) {
        if (typeof key === 'string') {
            key = [key];
        }
        return key;
    },
    _get_one(key) {
        const value = key in store ? store[key] : null;

        if (value === null) return null;

        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    },
    _set_one(key, value) {
        if (typeof value !== 'string') {
            value = JSON.stringify(value);
        }
        store[key] = value;
    },

    async get(keys) {
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
};
