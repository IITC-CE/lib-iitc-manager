// ==UserScript==
// @author         jonatkins
// @name           IITC: Ingress intel map total conversion
// @version        0.99.0
// @description    Total conversion for the ingress intel map.
// @run-at         document-end
// @id             total-conversion-build
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://iitc.app/build/release/total-conversion-build.meta.js
// @downloadURL    https://iitc.app/build/release/total-conversion-build.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);

