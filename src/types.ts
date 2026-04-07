// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

/**
 * Update channel for IITC and plugins.
 */
export type Channel = 'release' | 'beta' | 'custom';

/**
 * URLs of repositories with IITC and plugins for different release branches.
 *
 * @property release - Release branch. Default: `https://iitc.app/build/release`
 * @property beta - Beta branch. Default: `https://iitc.app/build/beta`
 * @property custom - URL address of a custom repository. Default: `http://localhost:8000`
 */
export type NetworkHost = Record<Channel, string>;

/**
 * Platform-dependent data storage class.
 * For example, when using this library in a browser extension, the
 * [storage.local API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)
 * is compatible.
 * Other platforms may have other ways of dealing with local storage,
 * but it is sufficient to create a small layer for storage to have the specified methods.
 */
export interface StorageAPI {
  /**
   * Retrieves one or more items from the storage area.
   * Accepts an array of string keys to identify the item(s) to be retrieved,
   * or null to return all data.
   * Returns a Promise that resolves to an object containing every matching item.
   */
  get(keys: string[] | null): Promise<StorageData>;

  /**
   * Stores one or more items in the storage area, or updates existing items.
   * Returns a Promise that will be fulfilled with no arguments if the operation succeeded.
   */
  set(data: StorageData): Promise<void>;
}

/**
 * Key-value data in storage.
 */
export type StorageValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StorageObject
  | StorageValue[];

export interface StorageObject {
  [key: string]: StorageValue;
}

export interface StorageData {
  [key: string]: StorageValue;
}

/**
 * Parsed UserScript metadata from ==UserScript== header.
 */
export interface PluginMeta {
  id?: string;
  name?: string;
  author?: string;
  category?: string;
  version?: string;
  description?: string;
  namespace?: string;
  filename?: string;
  homepageURL?: string;
  homepage?: string;
  updateURL?: string;
  downloadURL?: string;
  match?: string[];
  include?: string[];
  exclude?: string[];
  excludeMatch?: string[];
  require?: string[];
  grant?: string[];
  [key: string]: string | string[] | boolean | number | undefined;
}

/**
 * Plugin object with full data including code and status.
 */
export interface Plugin extends PluginMeta {
  /** Unique identifier (UID) of plugin. Created by lib-iitc-manager. */
  uid: string;
  /** Full plugin source code. */
  code?: string;
  /** Plugin status: 'on' (enabled) or 'off' (disabled). */
  status?: 'on' | 'off';
  /** Whether this is a user-installed plugin (vs built-in). */
  user?: boolean;
  /** Whether this user plugin overrides a built-in plugin. */
  override?: boolean;
  /** Unix timestamp of when the external plugin was first added. Only for external plugins. */
  addedAt?: number;
  /** Unix timestamp of when the plugin's status (on/off) was last changed. */
  statusChangedAt?: number;
  /** Unix timestamp of when the plugin's code was last updated. */
  updatedAt?: number;
}

/**
 * Dictionary of plugins keyed by UID.
 */
export interface PluginDict {
  [uid: string]: Plugin;
}

/**
 * Empty object, used to represent removed plugins in events.
 */
export type EmptyObject = Record<string, never>;

/**
 * Plugin event types.
 */
export type PluginEventType = 'add' | 'update' | 'remove';

/**
 * Plugin event object passed to the plugin_event callback.
 * Contains plugin data for 'add'/'update' events, or empty objects for 'remove' events.
 */
export interface PluginEventData {
  /** The type of plugin event. */
  event: PluginEventType;
  /** A mapping of plugin UIDs to plugin data or empty objects. */
  plugins: { [uid: string]: Plugin | EmptyObject };
}

/**
 * GM API configuration. When provided, enables GM API wrapping for injected plugins.
 */
export interface GmApiConfig {
  /**
   * JavaScript code that sets up `window.__iitc_gm_bridge__` in the page context.
   * Must define an object with two methods:
   * - `send(data: object): void` — send a request from page to host environment
   * - `onResponse(callback: (base64Data: string) => void): void` — register response handler
   */
  bridge_adapter_code: string;
}

/**
 * Environment parameters for an instance of Manager class.
 * Specifying only the "storage" parameter is enough to run in lightweight form,
 * but for full functionality you also need to specify callbacks.
 */
export interface ManagerConfig {
  /** Platform-dependent data storage class. For example, "browser.storage.local" in webextensions. */
  storage: StorageAPI;

  /** Update channel for IITC and plugins. */
  channel?: Channel;

  /**
   * URLs of repositories with IITC and plugins for different release branches.
   * If the parameter is not specified, the default values are used.
   */
  network_host?: NetworkHost;

  /** In daemon mode, the class does not terminate and runs a periodic check for updates. Default: true. */
  is_daemon?: boolean;

  /**
   * Allow HEAD requests for version checking.
   * Some fetch implementations don't support HEAD method, set to false to always use GET.
   * Default: true.
   */
  use_fetch_head_method?: boolean;

  /**
   * GM API configuration. If provided, enables GM API wrapping for injected plugins.
   * The bridge adapter code is injected before the GM factory, and plugins are
   * automatically wrapped with GM API bindings in `inject()`.
   */
  gm_api?: GmApiConfig;

  /**
   * URL prefix for `//# sourceURL=` comments added to injected scripts.
   * Used to group scripts under the host application in browser DevTools.
   * Example: `browser.runtime.getURL('')` -> `chrome-extension://abc123/`
   */
  source_url_prefix?: string;

  /**
   * Sends an information message to user.
   * You then need to map the message name to human-readable text in application.
   *
   * @param message - The name of the message sent to user.
   * @param args - A single substitution string, or an array of substitution strings.
   */
  message?: (message: string, args?: string | string[]) => void;

  /**
   * Controls progress bar display.
   *
   * @param is_show - Whether to show the progress bar.
   */
  progressbar?: (is_show: boolean) => void;

  /**
   * Calls a function that injects UserScript code into the Ingress Intel window.
   *
   * @deprecated since version 1.5.0. Use {@link ManagerConfig.inject_plugin} instead.
   * @param code - UserScript code to run in the Ingress Intel window.
   */
  inject_user_script?: (code: string) => void;

  /**
   * Calls a function that injects UserScript plugin into the Ingress Intel window.
   *
   * @param plugin - UserScript plugin to run in the Ingress Intel window.
   */
  inject_plugin?: (plugin: Plugin) => void;

  /**
   * Called to handle changes in plugin status for multiple plugins at once,
   * such as enabling, disabling, or updating.
   *
   * @param event - An object containing the event type and a mapping of plugin data.
   */
  plugin_event?: (event: PluginEventData) => void;
}

/**
 * Parameters for backup data retrieval/setting.
 */
export interface BackupParams {
  /** Whether to import/export IITC settings. */
  settings: boolean;
  /** Whether to import/export plugins' data. */
  data: boolean;
  /** Whether to import/export external plugins. */
  external: boolean;
}

/**
 * Options for fetchResource function.
 */
export interface FetchResourceOptions {
  /** Parse response as JSON. */
  parseJSON?: boolean;
  /** Only fetch headers (HEAD request). */
  headOnly?: boolean;
  /** Allow HEAD requests (if false, always use GET). */
  use_fetch_head_method?: boolean;
}

/**
 * Result of fetchResource function.
 */
export interface FetchResourceResult {
  /** Response data: parsed JSON object, text string, or null for HEAD requests. */
  data: string | object | null;
  /** Resource version from Last-Modified header, or null if unavailable. */
  version: string | null;
}

/**
 * Script object passed to addUserScripts.
 */
export interface UserScript {
  /** Parsed "meta" object of UserScript. */
  meta: PluginMeta;
  /** UserScript code. */
  code: string;
}

/**
 * Backup data structure.
 */
export interface BackupData {
  /** External plugins keyed by channel and filename. */
  external_plugins: { [channel: string]: { [filename: string]: string } };
  /** Application data including settings and plugin data. */
  data: {
    iitc_settings: StorageData;
    plugins_data: StorageData;
    app: string;
  };
}

/**
 * Category info from meta.json.
 */
export interface CategoryInfo extends StorageObject {
  /** Category name. */
  name: string;
  /** Category description. */
  description: string;
  /** Plugins in this category, keyed by plugin ID. */
  plugins?: { [id: string]: PluginMeta };
}

/**
 * Dictionary of categories.
 */
export interface CategoryDict extends StorageObject {
  [name: string]: CategoryInfo;
}

/**
 * Response data from meta.json.
 */
export interface MetaJsonResponse {
  /** IITC core version string. */
  iitc_version?: string;
  /** Categories with their plugins. */
  categories: { [name: string]: CategoryInfo };
}

/**
 * Update type for _sendPluginsEvent.
 * @internal
 */
export type UpdateType = 'local' | 'user';

/**
 * Request variant for _getUrl.
 * @internal
 */
export type RequestVariant = 'parseJSON' | 'head' | null;

/**
 * Ingress domain types.
 */
export type IngressDomain = '<all>' | 'intel.ingress.com' | 'missions.ingress.com';
