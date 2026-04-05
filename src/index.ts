// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { Manager } from './manager.js';
import {
  parseMeta,
  fetchResource,
  ajaxGet,
  getUniqId,
  getUID,
  getPluginHash,
  check_meta_match_pattern,
  wait,
  clearWait,
} from './helpers.js';
import { check_matching, humanize_match } from './matching.js';
import { getGmApiCode } from './gm-api.js';
import { wrapPluginCode } from './wrapper.js';

export {
  Manager,
  parseMeta,
  fetchResource,
  ajaxGet,
  getUniqId,
  getUID,
  getPluginHash,
  check_meta_match_pattern,
  wait,
  clearWait,
  check_matching,
  humanize_match,
  getGmApiCode,
  wrapPluginCode,
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
  CategoryInfo,
  CategoryDict,
  MetaJsonResponse,
  IngressDomain,
} from './types.js';
