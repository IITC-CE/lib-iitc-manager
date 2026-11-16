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
 * Per-plugin enable state stored globally across all channels.
 */
export interface PluginStateEntry extends StorageObject {
  /** Plugin status: 'on' (enabled) or 'off' (disabled). */
  status: 'on' | 'off';
  /** Unix timestamp of when the plugin's status was last changed. */
  statusChangedAt?: number;
}

/**
 * Dictionary of plugin state entries keyed by UID.
 * Stored under the global `plugins_state` storage key (no channel prefix).
 */
export interface PluginStateDict extends StorageObject {
  [uid: string]: PluginStateEntry;
}

/**
 * Computed view of a single plugin category.
 */
export interface CategoryView {
  /** Category name. */
  name: string;
  /** True if this category contains a plugin added within the newPluginThreshold window. */
  isNew: boolean;
}

/**
 * Dictionary of computed category views, sorted alphabetically by name.
 */
export interface CategoryViewDict {
  [name: string]: CategoryView;
}

/**
 * Combined view returned by getPluginsView() and the onPluginsViewChanged callback.
 */
export interface PluginsView {
  /** Merged view of all plugins (catalog + local state + user overrides). */
  plugins: PluginDict;
  /** Non-empty categories derived from the current plugin set, sorted alphabetically. */
  categories: CategoryViewDict;
  /** Current IITC core script, or null if not yet downloaded. */
  core: Plugin | null;
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
 * Plugin event object passed to the onPluginEvent callback.
 * Contains plugin data for 'add'/'update' events, or empty objects for 'remove' events.
 *
 * When `uid === 'gm_api'`, this is a special notification that the GM API scope has changed.
 * The event type is always `'update'` and `plugins['gm_api'].match` contains the current
 * aggregated list of @match patterns from all enabled plugins.
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
   * - `send(data: object): void` - send a request from page to host environment
   * - `onResponse(callback: (base64Data: string) => void): void` - register response handler
   */
  bridgeAdapterCode: string;
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
  networkHost?: NetworkHost;

  /** In daemon mode, the class does not terminate and runs a periodic check for updates. Default: true. */
  isDaemon?: boolean;

  /**
   * Allow HEAD requests for version checking.
   * Some fetch implementations don't support HEAD method, set to false to always use GET.
   * Default: true.
   */
  useFetchHeadMethod?: boolean;

  /**
   * GM API configuration. If provided, enables GM API wrapping for injected plugins.
   * The bridge adapter code is injected before the GM factory, and plugins are
   * automatically wrapped with GM API bindings in `inject()`.
   */
  gmApi?: GmApiConfig;

  /**
   * Name of the host application, written to the `app` field of exported backups
   * to identify which application produced the backup.
   * Default: `'IITC Button'`.
   */
  appName?: string;

  /**
   * URL prefix for `//# sourceURL=` comments added to injected scripts.
   * Used to group scripts under the host application in browser DevTools.
   * Example: `browser.runtime.getURL('')` -> `chrome-extension://abc123/`
   */
  sourceUrlPrefix?: string;

  /**
   * Sends an information message to user.
   * You then need to map the message name to human-readable text in application.
   *
   * @deprecated Never called; update checks and `managePlugin` return their errors instead.
   * @param message - The name of the message sent to user.
   * @param args - A single substitution string, or an array of substitution strings.
   */
  message?: (message: string, args?: string | string[]) => void;

  /**
   * Controls progress bar display.
   *
   * @param isShow - Whether to show the progress bar.
   */
  onProgress?: (isShow: boolean) => void;

  /**
   * Called with the whole status of update checks whenever it differs from the last one sent,
   * including checks run by the daemon timer. `getUpdateStatus()` called from here returns the same.
   *
   * @param status - Current status, the same as `getUpdateStatus()` returns.
   */
  onUpdateStatusChanged?: (status: UpdateStatus) => void;

  /**
   * Calls a function that injects UserScript plugin into the Ingress Intel window.
   *
   * @param plugin - UserScript plugin to run in the Ingress Intel window.
   */
  injectPlugin?: (plugin: Plugin) => void | Promise<void>;

  /**
   * Called to handle changes in plugin status for multiple plugins at once,
   * such as enabling, disabling, or updating.
   *
   * @param event - An object containing the event type and a mapping of plugin data.
   */
  onPluginEvent?: (event: PluginEventData) => void;

  /**
   * Threshold in seconds for the isNew flag on categories.
   * A category is marked as new if it contains a plugin with addedAt within this window.
   * Default: 3600 (1 hour).
   */
  newPluginThreshold?: number;

  /**
   * Called whenever the plugin set changes - after catalog updates, plugin enable/disable,
   * user script additions/removals, or channel switches.
   * Receives the current merged view of all plugins and computed categories.
   *
   * @param view - Current plugins and categories view.
   */
  onPluginsViewChanged?: (view: PluginsView) => void;

  /**
   * Raw source text of a pre-downloaded `total-conversion-build.user.js`,
   * bundled by the consumer at build time. Seeds IITC core on a cold start,
   * but only for the `release` channel and only if no core is cached yet -
   * the next update check still runs for real and transparently replaces it.
   */
  fallbackCore?: string;
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
  useFetchHeadMethod?: boolean;
  /** Request timeout in milliseconds. Default: 30000. */
  timeout?: number;
}

/**
 * Reason a fetch failed. A plain object so it survives JSON serialization.
 */
export type FetchError = {
  /**
   * `network` - request failed or timed out, or the body could not be read;
   * `http` - server answered with a non-2xx status;
   * `invalid` - `parseJSON` was set and the body is not valid JSON,
   * or a downloaded userscript has no ==UserScript== header.
   */
  kind: 'network' | 'http' | 'invalid';
  /** HTTP status code, set for `http`. */
  status?: number;
};

/**
 * A file that could not be updated. IITC core is reported as `IITC_CORE_UID`.
 */
export interface FailedFile {
  /** Plugin UID. */
  uid: string;
  /** Why the file was not updated. */
  error: FetchError;
}

/**
 * Result of the check for IITC and built-in plugins.
 */
export interface InternalCheckResult {
  /**
   * `not-due` - skipped, the check is not due yet;
   * `not-modified` - nothing was downloaded;
   * `updated` - IITC or plugins were downloaded, or plugins dropped out of the catalog;
   * `failed` - meta.json was not received, or a file failed with a network error or 5xx.
   */
  status: 'not-due' | 'not-modified' | 'updated' | 'failed';
  /** Why meta.json was not received. */
  error?: FetchError;
  /** Files that failed in this check; they are retried on the next one. */
  failed: FailedFile[];
}

/**
 * Result of the check for external (user) plugins.
 */
export interface ExternalCheckResult {
  /**
   * `not-due` - skipped, the check is not due yet;
   * `checked` - plugins were checked, some may have failed;
   * `failed` - every plugin failed with a network error.
   */
  status: 'not-due' | 'checked' | 'failed';
  /** UIDs of updated plugins. */
  updated: string[];
  /** Plugins that could not be checked or downloaded. */
  failed: FailedFile[];
}

/**
 * Result of `Manager.managePlugin()`. Enabling fails if the plugin code could not be downloaded,
 * or the plugin is neither installed nor in the catalog of the current channel (`not-in-catalog`).
 */
export type ManagePluginResult =
  | { ok: true }
  | { ok: false; error: FetchError | { kind: 'not-in-catalog' } };

/**
 * Result of an update check.
 */
export interface UpdateCheckResult {
  /** False if the check for IITC and built-in plugins failed. */
  ok: boolean;
  internal: InternalCheckResult;
  external: ExternalCheckResult;
}

/**
 * Result of fetchResource function.
 */
export interface FetchResourceResult {
  /** Response data: parsed JSON object, text string, or null for HEAD requests and on error. */
  data: string | object | null;
  /** Resource version from ETag or Last-Modified header, or null if unavailable. */
  version: string | null;
  /** Set only when the request failed. */
  error?: FetchError;
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  external_plugins: { [channel: string]: { [filename: string]: string } };
  /** Application data including settings and plugin data. */
  data: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    iitc_settings: StorageData;
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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

// A type alias, not an interface, so it is assignable to StorageValue
/**
 * Pause after failed update checks.
 */
export type UpdateCheckRetry = {
  /** Consecutive failed checks. */
  failures: number;
  /** Unix time in seconds before which no scheduled check runs. */
  at: number;
  /** Error of the last failed check. */
  error?: FetchError;
};

/**
 * State of one kind of update check, read without network requests.
 */
export interface CheckStatus {
  /** A check of this kind is downloading, or a forced one is waiting for it. */
  checking: boolean;
  /** Unix time in seconds of the last check that did not fail, or null. */
  lastCheck: number | null;
  /** Unix time in seconds when `checkUpdates(false)` goes to the network; at or before now if it is due. */
  nextCheck: number;
  /** Pause after failed checks, or null. */
  retry: UpdateCheckRetry | null;
}

/**
 * State of update checks, returned by `Manager.getUpdateStatus()` and sent to `onUpdateStatusChanged`.
 */
export interface UpdateStatus {
  /** Channel the internal status belongs to. */
  channel: Channel;
  internal: CheckStatus;
  external: CheckStatus;
}

/**
 * Ingress domain types.
 */
export type IngressDomain = '<all>' | 'intel.ingress.com' | 'missions.ingress.com';
