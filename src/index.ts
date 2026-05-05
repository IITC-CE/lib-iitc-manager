// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { Manager } from './manager.js';
import { IITC_CORE_UID, GM_API_UID } from './worker.js';
import {
  parseMeta,
  fetchResource,
  fetchData,
  validateCustomChannelUrl,
  getUniqueId,
  getUID,
  getPluginHash,
  sanitizeFileName,
  checkMetaMatchPattern,
  wait,
  clearWait,
} from './helpers.js';
import { checkMatching, humanizeMatch } from './matching.js';
import { base64ToStr, strToBase64 } from './base64.js';
import { getGmApiCode } from './gm-api.js';
import { wrapPluginCode, appendSourceUrl } from './wrapper.js';

export {
  Manager,
  IITC_CORE_UID,
  GM_API_UID,
  parseMeta,
  fetchResource,
  fetchData,
  validateCustomChannelUrl,
  getUniqueId,
  getUID,
  getPluginHash,
  sanitizeFileName,
  checkMetaMatchPattern,
  wait,
  clearWait,
  checkMatching,
  humanizeMatch,
  base64ToStr,
  strToBase64,
  getGmApiCode,
  wrapPluginCode,
  appendSourceUrl,
};

export type {
  Channel,
  NetworkHost,
  StorageAPI,
  StorageValue,
  StorageObject,
  StorageData,
  PluginMeta,
  Plugin,
  PluginDict,
  PluginStateEntry,
  PluginStateDict,
  CategoryView,
  CategoryViewDict,
  PluginsView,
  EmptyObject,
  PluginEventType,
  PluginEventData,
  GmApiConfig,
  ManagerConfig,
  BackupParams,
  FetchResourceOptions,
  FetchResourceResult,
  UserScript,
  BackupData,
  MetaJsonResponse,
  IngressDomain,
} from './types.js';
