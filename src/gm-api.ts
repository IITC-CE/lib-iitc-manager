// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { base64ToStr } from './base64.js';

/**
 * Returns the GM API factory JavaScript code as a string for injection into the page context.
 *
 * The code defines `window.GM({ data_key, meta })` factory that provides
 * Greasemonkey-compatible API (GM_info, GM_getValue, GM_setValue, GM_xmlhttpRequest, etc.).
 *
 * Bridge transport is abstracted via `window.__iitc_gm_bridge__` which is set up
 * by the host app's bridge adapter code concatenated before this factory.
 */
export function getGmApiCode(): string {
  return `(function() {
  document.addEventListener("DOMContentLoaded", function() {
    if (window.location.hostname === "intel.ingress.com") {
      window.onload = function() {};
      document.body.onload = function() {};
    }
  });

  var cache = {};
  var defineProperty = Object.defineProperty;

  var base64ToStr = ${base64ToStr.toString()};

  function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function(c) {
      return (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16);
    });
  }

  function sendToBridge(data) {
    window.__iitc_gm_bridge__.send(data);
  }

  var storageObj = {};
  var storage = new Proxy(storageObj, {
    set: function(target, key, value) {
      sendToBridge({
        task_type: "setValue",
        key: key,
        value: value
      });
      target[key] = value;
      return true;
    },
    deleteProperty: function(target, key) {
      sendToBridge({
        task_type: "delValue",
        key: key
      });
      delete target[key];
    }
  });

  function initialSyncStorage() {
    sendToBridge({
      task_uuid: uuidv4(),
      task_type: "getStorage"
    });
  }

  var makeFunc = function(func, toString) {
    defineProperty(func, "toString", {
      value: toString || "[Unknown property]"
    });
    return func;
  };

  window.GM = function({ data_key, meta }) {
    initialSyncStorage();

    return {
      info: {
        script: meta
      },

      _getValueSync: function(key, default_value) {
        if (!this._access("getValue")) return undefined;
        var items = storage[data_key + "_" + key];
        return items !== undefined ? JSON.parse(items) : default_value;
      },

      _setValueSync: function(key, value) {
        if (!this._access("setValue")) return undefined;
        storage[data_key + "_" + key] = JSON.stringify(value);
      },

      getValue: function(key, default_value) {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (!self._access("getValue"))
            return reject(new Error("Permission denied"));
          resolve(self._getValueSync(key, default_value));
        });
      },

      setValue: function(key, value) {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (!self._access("setValue"))
            return reject(new Error("Permission denied"));
          self._setValueSync(key, value);
          resolve();
        });
      },

      deleteValue: function(key) {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (!self._access("deleteValue"))
            return reject(new Error("Permission denied"));
          delete storage[data_key + "_" + key];
          resolve();
        });
      },

      listValues: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
          if (!self._access("listValues"))
            return reject(new Error("Permission denied"));
          var keys = [];
          var prelen = data_key.length;
          for (var key of Object.keys(storage)) {
            if (key.startsWith(data_key)) {
              keys.push(key.substring(prelen + 1));
            }
          }
          resolve(keys);
        });
      },

      getResourceUrl: function() {
        return new Promise(function(resolve, reject) {
          reject(new Error("Not implemented"));
        });
      },

      openInTab: function() {},
      notification: function() {},
      setClipboard: function() {},

      xmlHttpRequest: function(details) {
        if (!this._access("xmlhttpRequest")) {
          console.warn("GM API: XMLHttpRequest permission denied");
          return;
        }

        var data = Object.assign(
          {
            task_uuid: uuidv4(),
            task_type: "xmlHttpRequest",
            binary: false,
            context: {},
            data: null,
            headers: {},
            method: null,
            overrideMimeType: null,
            url: null,
            user: null,
            password: null,
            timeout: 0,
            onabort: null,
            onerror: null,
            onload: null,
            onprogress: null,
            onreadystatechange: null,
            ontimeout: null
          },
          details
        );

        for (var key in data) {
          if (key.startsWith("on")) {
            data[key] = String(data[key]);
          }
        }

        cache[data.task_uuid] = {
          callback: details.onload
        };

        sendToBridge(data);
      },

      _access: function(key) {
        return (
          meta.grant !== undefined &&
          meta.grant.some(function(permission) {
            return permission === "GM_" + key || permission === "GM." + key;
          })
        );
      },

      exportFunction: makeFunc(function(func, targetScope, opts) {
        opts = opts || {};
        if (opts.defineAs && targetScope) targetScope[opts.defineAs] = func;
        return func;
      }),

      createObjectIn: makeFunc(function(targetScope, opts) {
        opts = opts || {};
        var obj = {};
        if (opts.defineAs && targetScope) targetScope[opts.defineAs] = obj;
        return obj;
      }),

      cloneInto: makeFunc(function(obj) { return obj; })
    };
  };

  window.__iitc_gm_bridge__.onResponse(function(responseData) {
    try {
      var detail = JSON.parse(base64ToStr(responseData));

      if (!detail.task_type) {
        console.warn("GM API: Invalid bridge response format");
        return;
      }

      switch (detail.task_type) {
        case "xmlHttpRequest": {
          var uuid = detail.task_uuid;
          if (!uuid || !cache[uuid]) return;

          var response = JSON.parse(detail.response);
          cache[uuid].callback(response);
          delete cache[uuid];
          break;
        }

        case "getStorage": {
          var storage_data = JSON.parse(detail.response);
          for (var key in storage_data) {
            if (storageObj[key] === undefined) {
              storageObj[key] = storage_data[key];
            }
          }
          break;
        }

        default:
          console.warn("GM API: Unknown response type", detail.task_type);
          break;
      }
    } catch (error) {
      console.error("GM API: Error processing bridge response", error);
    }
  });
})()`;
}
