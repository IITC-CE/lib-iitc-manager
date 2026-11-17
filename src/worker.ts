// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import { fetchResource, getUID, isChannelMeta, isSet, parseMeta } from './helpers.js';
import { wrapPluginCode, appendSourceUrl } from './wrapper.js';
import { getGmApiCode } from './gm-api.js';
import { aggregateMatchPatterns } from './matching.js';
import { migrate } from './migrations.js';
import type {
  Channel,
  ManagerConfig,
  GmApiConfig,
  StorageAPI,
  StorageData,
  NetworkHost,
  Plugin,
  PluginDict,
  PluginStateDict,
  PluginsView,
  CategoryViewDict,
  PluginEventType,
  PluginEventData,
  UpdateType,
  RequestVariant,
  UpdateCheckRetry,
  FailedFile,
  InternalCheckResult,
  ExternalCheckResult,
  FetchResourceOptions,
  FetchResourceResult,
  FetchError,
  PluginMeta,
  MetaJsonResponse,
  UpdateStatus,
} from './types.js';

export const IITC_CORE_UID =
  'IITC: Ingress intel map total conversion+https://github.com/IITC-CE/ingress-intel-total-conversion';
export const GM_API_UID = 'gm_api';
export const GM_API_DEFAULT_MATCH = 'https://intel.ingress.com/*';

/** Current Unix time in seconds. */
const unixNow = (): number => Math.floor(Date.now() / 1000);

/** Network errors and 5xx mean the server may answer later; other failures wait for the next check. */
const isTransient = (error: FetchError): boolean =>
  error.kind === 'network' || (error.kind === 'http' && (error.status ?? 0) >= 500);

/** Longest pause after failed update checks, in seconds. */
const MAX_RETRY_PAUSE = 30 * 60;

/** Longest delay `setTimeout` accepts, in milliseconds; a longer one fires at once. */
const MAX_TIMER_DELAY = 2 ** 31 - 1;

/** End of the pause in `retry`; one ending more than 30 min from `now` (clock moved back) counts as none. */
const retryEnd = (retry: UpdateCheckRetry | null | undefined, now: number): number => {
  const at = retry?.at ?? 0;
  return at > now + MAX_RETRY_PAUSE ? 0 : at;
};

/**
 * Unix time in seconds when a non-forced check becomes due: `interval` after `lastCheck`,
 * but not before the pause in `retry` ends. A `lastCheck` from the future (clock moved back) counts as none.
 */
const dueAt = (
  lastCheck: number | null | undefined,
  interval: number,
  retry: UpdateCheckRetry | null | undefined,
  now: number
): number =>
  Math.max(
    typeof lastCheck === 'number' && lastCheck <= now ? lastCheck + interval : 0,
    retryEnd(retry, now)
  );

/**
 * Pause after another failed check: doubles from 1 min up to `maxPause` seconds,
 * but no longer than `interval`, so a failure never makes checks rarer than the interval.
 */
const nextRetry = (
  retry: UpdateCheckRetry | null | undefined,
  error: FetchError | undefined,
  interval: number,
  maxPause: number = MAX_RETRY_PAUSE
): UpdateCheckRetry => {
  const failures = (retry?.failures ?? 0) + 1;
  const at = unixNow() + Math.min(60 * 2 ** (failures - 1), maxPause, interval);
  return error ? { failures, at, error } : { failures, at };
};

/** Keeps one check running per key; a forced check waits for a non-forced one with the same key. */
class CheckSlot<T> {
  private running = new Map<string, { force: boolean; promise: Promise<T> }>();
  /** Number of checks downloading, or forced and waiting to, by key */
  private active = new Map<string, number>();

  run(key: string, force: boolean, check: () => Promise<T>): Promise<T> {
    const running = this.running.get(key);
    if (running && (running.force || !force)) return running.promise;
    const promise = running ? running.promise.then(check, check) : check();
    const entry = { force, promise };
    this.running.set(key, entry);
    const clear = () => {
      if (this.running.get(key) === entry) this.running.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  /** Whether a check of `key` is downloading, or forced and waiting to. */
  isActive(key: string): boolean {
    return this.active.has(key);
  }

  /** Counts `work` as an active check of `key`, calling `onChange` when it starts and when it ends. */
  async track<R>(key: string, onChange: () => void, work: () => Promise<R>): Promise<R> {
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    onChange();
    try {
      return await work();
    } finally {
      const left = this.active.get(key)! - 1;
      if (left) this.active.set(key, left);
      else this.active.delete(key);
      onChange();
    }
  }
}

/**
 * This class contains methods for managing IITC and plugins.
 */
export class Worker {
  config: ManagerConfig;
  storage: StorageAPI;
  channel!: Channel;
  networkHost!: NetworkHost;
  isDaemon!: boolean;
  useFetchHeadMethod!: boolean;
  isInitialized: boolean;
  /** Resolves once _init has migrated storage and loaded channel, networkHost and other settings */
  ready: Promise<void>;
  /** @internal Set by _init, consumed by the first run() */
  _isMigrated: boolean;
  gmApi?: GmApiConfig;
  sourceUrlPrefix: string;
  appName: string;
  progressIntervalId: ReturnType<typeof setInterval> | null;
  /** Number of requests in flight; progress is shown while it is above zero */
  activeRequests: number;
  updateTimeoutId: ReturnType<typeof setTimeout> | null;
  externalUpdateTimeoutId: ReturnType<typeof setTimeout> | null;
  /** @internal */
  _internalChecks = new CheckSlot<InternalCheckResult>();
  /** @internal */
  _externalChecks = new CheckSlot<ExternalCheckResult>();
  /** @internal */
  _pluginsQueue: Promise<unknown> = Promise.resolve();
  /** @internal A status is being read and sent */
  _statusSending = false;
  /** @internal The status may have changed while it was being read */
  _statusDirty = false;
  /** @internal JSON of the last status sent */
  _lastStatus?: string;

  /** @deprecated Never called. */
  message?: (message: string, args?: string | string[]) => void;
  /** @deprecated Use `onUpdateStatusChanged` and the `managePlugin` promise. */
  onProgress?: (isShow: boolean) => void;
  onUpdateStatusChanged?: (status: UpdateStatus) => void;
  injectPlugin: (plugin: Plugin) => void | Promise<void>;
  onPluginEvent: (event: PluginEventData) => void;
  onPluginsViewChanged?: (view: PluginsView) => void;
  newPluginThreshold: number;
  _gmApiMatches: string[];

  /**
   * Creates an instance of Manager class with the specified parameters
   *
   * @param config - Environment parameters for an instance of Manager class.
   */
  constructor(config: ManagerConfig) {
    this.config = config;
    this.progressIntervalId = null;
    this.activeRequests = 0;
    this.updateTimeoutId = null;
    this.externalUpdateTimeoutId = null;
    this.storage =
      typeof this.config.storage !== 'undefined'
        ? this.config.storage
        : (console.error("config key 'storage' is not set") as unknown as StorageAPI);
    this.message = this.config.message;
    this.onProgress = this.config.onProgress;
    this.onUpdateStatusChanged = this.config.onUpdateStatusChanged;
    this.injectPlugin =
      this.config.injectPlugin ||
      function () {
        return Promise.resolve();
      };
    this.onPluginEvent = this.config.onPluginEvent || function () {};
    this.gmApi = this.config.gmApi;
    this.sourceUrlPrefix = this.config.sourceUrlPrefix || '';
    this.appName = this.config.appName || 'IITC Button';
    this.onPluginsViewChanged = this.config.onPluginsViewChanged;
    this.newPluginThreshold = this.config.newPluginThreshold ?? 3600;

    this._gmApiMatches = [GM_API_DEFAULT_MATCH];
    this.isInitialized = false;
    this._isMigrated = false;
    this.ready = this._init();
  }

  /**
   * Set values for the class properties.
   * @internal
   */
  async _init(): Promise<void> {
    // Migrate first: settings below expect the current schema
    try {
      this._isMigrated = await migrate(this.storage);
    } catch (error) {
      console.error('Storage migration failed:', error);
    }
    this.channel = await this._syncStorage('channel', 'release', this.config.channel);
    this.networkHost = await this._syncStorage(
      'network_host',
      {
        release: 'https://iitc.app/build/release',
        beta: 'https://iitc.app/build/beta',
        custom: 'http://localhost:8000',
      },
      this.config.networkHost
    );
    this.isDaemon = await this._syncStorage('is_daemon', true, this.config.isDaemon);
    this.useFetchHeadMethod = await this._syncStorage(
      'use_fetch_head_method',
      true,
      this.config.useFetchHeadMethod
    );

    if (this.config.fallbackCore && this.channel === 'release') {
      await this._seedFallbackCore(this.config.fallbackCore);
    }

    this.isInitialized = true;
  }

  /**
   * Seeds `release_iitc_core` from a consumer-bundled snapshot.
   * Only fills an empty slot - skipped if `iitc_core` or `iitc_core_user` is already set,
   * or if `rawCode` doesn't parse into a valid plugin.
   *
   * @param rawCode - Raw source text of total-conversion-build.user.js.
   * @internal
   */
  async _seedFallbackCore(rawCode: string): Promise<void> {
    const existing = await this.storage.get(['release_iitc_core', 'iitc_core_user']);
    if (isSet(existing['release_iitc_core']) || isSet(existing['iitc_core_user'])) return;

    const meta = parseMeta(rawCode);
    if (!meta) return;
    const uid = getUID(meta);
    if (!uid) return;

    const iitcCore = { ...meta, uid, code: rawCode } as Plugin;
    await this._save('release', { iitc_core: iitcCore });
  }

  /**
   * Overwrites the values in the storage and returns the new value.
   * If the value is not set, the default value is returned.
   *
   * @param key - Storage entry key.
   * @param defaults - Default value.
   * @param override - Value to override the default value.
   * @internal
   */
  async _syncStorage<T>(key: string, defaults: T, override?: T): Promise<T> {
    let data: T | undefined;
    if (typeof override !== 'undefined') {
      data = override;
    } else {
      data = await this.storage.get([key]).then(result => result[key] as T);
    }
    if (!isSet(data)) data = defaults;

    (this as unknown as Record<string, unknown>)[key] = data;
    await this._save(this.channel, { [key]: data } as StorageData);
    return data!;
  }

  /**
   * Interval in seconds; strings are coerced, unset or invalid values fall back to 24 h.
   *
   * @param channel - Update channel, or `external` for external plugins.
   * @internal
   */
  async _readUpdateCheckInterval(channel: string): Promise<number> {
    const key = `${channel}_update_check_interval`;
    const data = await this.storage.get([key]);
    const interval = Number(data[key]);
    return interval > 0 ? interval : 24 * 60 * 60;
  }

  /**
   * Saves passed data to local storage.
   * Adds the name of release branch before key, if necessary.
   *
   * @param channel - Current channel.
   * @param options - Key-value data to be saved.
   * @internal
   */
  async _save(channel: Channel, options: StorageData): Promise<void> {
    const data: StorageData = {};
    Object.keys(options).forEach(key => {
      if (
        [
          'iitc_version',
          'last_modified',
          'iitc_core',
          'plugins_catalog',
          'plugins_local',
          'pending_files',
        ].indexOf(key) !== -1
      ) {
        data[`${channel}_${key}`] = options[key];
      } else {
        data[key] = options[key];
      }
    });
    await this.storage.set(data);

    // Channel-scoped changes only affect the view when they belong to the active channel
    const channelScopedKeys = ['plugins_catalog', 'plugins_local', 'iitc_core'];
    const globalPluginsKeys = ['plugins_user', 'plugins_state', 'channel', 'iitc_core_user'];
    const affectsView =
      (Object.keys(options).some(k => channelScopedKeys.includes(k)) && channel === this.channel) ||
      Object.keys(options).some(k => globalPluginsKeys.includes(k));
    if (affectsView) {
      this._emitPluginsChanged();
    }
  }

  /**
   * Runs read-modify-save sections over plugin storage keys one at a time.
   * `fn` must not wait for network requests or host callbacks.
   *
   * @param fn - Section that re-reads the keys it changes and saves them.
   * @internal
   */
  _mutatePlugins<T>(fn: () => Promise<T>): Promise<T> {
    const result = this._pluginsQueue.then(fn);
    this._pluginsQueue = result.catch(() => {});
    return result;
  }

  /**
   * Builds the gm_api pseudo-plugin with the given aggregated match patterns.
   * @internal
   */
  _buildGmApiPlugin(matches: string[]): Plugin {
    return {
      uid: GM_API_UID,
      name: 'GM API',
      match: matches,
      code: appendSourceUrl({
        code: this.gmApi!.bridgeAdapterCode + '\n' + getGmApiCode(),
        name: 'GM_api',
        prefix: this.sourceUrlPrefix,
        suffix: '.js',
      }),
    };
  }

  /**
   * Reads storage and computes the aggregated set of @match patterns
   * from IITC core and all currently enabled plugins.
   * @internal
   */
  async _computeGmApiMatches(): Promise<string[]> {
    const channel = this.channel;
    const data = await this.storage.get([
      `${channel}_iitc_core`,
      'iitc_core_user',
      `${channel}_plugins_catalog`,
      `${channel}_plugins_local`,
      'plugins_user',
      'plugins_state',
    ]);

    const pluginsCatalog = (data[`${channel}_plugins_catalog`] || {}) as PluginDict;
    const pluginsLocal = (data[`${channel}_plugins_local`] || {}) as PluginDict;
    const pluginsUser = (data['plugins_user'] || {}) as PluginDict;
    const pluginsState = (data['plugins_state'] || {}) as PluginStateDict;
    const iitcCore = data[`${channel}_iitc_core`] as Plugin | undefined;
    const iitcCoreUser = data['iitc_core_user'] as Plugin | undefined;

    // Catalog-gated merged view so `@match` comes from the catalog; a plugin absent
    // from the catalog (kept in local as a transient fallback) contributes nothing.
    const allPlugins = this._computePlugins(
      pluginsCatalog,
      pluginsLocal,
      pluginsUser,
      pluginsState
    );

    const candidates: PluginDict = {};

    const core = this._computeCore(iitcCore, iitcCoreUser);
    if (core) candidates[IITC_CORE_UID] = core;

    for (const uid in allPlugins) {
      if (allPlugins[uid]?.status === 'on') candidates[uid] = allPlugins[uid];
    }

    return Array.from(
      new Set([GM_API_DEFAULT_MATCH, ...aggregateMatchPatterns(candidates)])
    ).sort();
  }

  /**
   * Fires the onPluginsViewChanged callback with the current merged plugin view.
   * Overridden in Manager where getPlugins() is available.
   * @internal
   */
  _emitPluginsChanged(): void {}

  /**
   * Sends the update status to `onUpdateStatusChanged` if it differs from the last one sent.
   * Called wherever the status may have changed; a call during a send reads the status again after it.
   *
   * @internal
   */
  _notifyUpdateStatus(): void {
    if (!this.onUpdateStatusChanged) return;
    if (this._statusSending) {
      this._statusDirty = true;
      return;
    }
    this._statusSending = true;
    void (async () => {
      try {
        do {
          this._statusDirty = false;
          try {
            const status = await this._readUpdateStatus();
            const json = JSON.stringify(status);
            if (json !== this._lastStatus) {
              this._lastStatus = json;
              this.onUpdateStatusChanged?.(status);
            }
          } catch (error) {
            console.error('Failed to send update status:', error);
          }
        } while (this._statusDirty);
      } finally {
        this._statusSending = false;
      }
    })();
  }

  /**
   * Reads the update status: `checking` at the moment of the call, the rest from storage.
   *
   * @internal
   */
  async _readUpdateStatus(): Promise<UpdateStatus> {
    const channel = this.channel;
    const internalChecking = this._internalChecks.isActive(this._internalKey());
    const externalChecking = this._externalChecks.isActive('external');
    const data = await this.storage.get([
      'last_check_update',
      'update_check_retry',
      'last_check_external_update',
      'external_update_check_retry',
      `${channel}_last_modified`,
    ]);
    const [internalInterval, externalInterval] = await Promise.all([
      this._readUpdateCheckInterval(channel),
      this._readUpdateCheckInterval('external'),
    ]);
    const now = unixNow();
    const internalLastCheck = (data.last_check_update as number) ?? null;
    const internalRetry = (data.update_check_retry as UpdateCheckRetry) ?? null;
    const externalLastCheck = (data.last_check_external_update as number) ?? null;
    const externalRetry = (data.external_update_check_retry as UpdateCheckRetry) ?? null;
    return {
      channel,
      internal: {
        checking: internalChecking,
        lastCheck: internalLastCheck,
        nextCheck: dueAt(
          isSet(data[`${channel}_last_modified`]) ? internalLastCheck : null,
          internalInterval,
          internalRetry,
          now
        ),
        retry: internalRetry,
      },
      external: {
        checking: externalChecking,
        lastCheck: externalLastCheck,
        nextCheck: dueAt(externalLastCheck, externalInterval, externalRetry, now),
        retry: externalRetry,
      },
    };
  }

  /**
   * Wraps {@link fetchResource}, calling `onProgress(true)` while any request is in flight and `onProgress(false)` when the last one ends.
   *
   * @param url - URL of the resource you want to fetch.
   * @param variant - Type of request.
   * @internal
   */
  async _getUrl(url: string, variant?: RequestVariant): Promise<FetchResourceResult> {
    if (this.activeRequests++ === 0) {
      // Repeated so that a UI opened mid-request also learns about it
      this.progressIntervalId = setInterval(() => this.onProgress?.(true), 300);
    }
    try {
      const options: FetchResourceOptions = {
        useFetchHeadMethod: this.useFetchHeadMethod,
      };

      if (variant === 'parseJSON') {
        options.parseJSON = true;
      } else if (variant === 'head') {
        options.headOnly = true;
      }

      return await fetchResource(url, options);
    } finally {
      if (--this.activeRequests === 0) {
        clearInterval(this.progressIntervalId!);
        this.progressIntervalId = null;
        this.onProgress?.(false);
      }
    }
  }

  /**
   * Runs `_runInternalCheck`, or returns the running check for the same channel and host.
   * A forced check waits for a running non-forced one.
   *
   * @param force - Forced to run the update right now.
   * @internal
   */
  _checkInternalUpdates(force: boolean = false): Promise<InternalCheckResult> {
    const key = this._internalKey();
    // A queued check whose channel or host changed meanwhile joins the check for the new one
    const run = () =>
      this._internalChecks.run(key, force, () =>
        key === this._internalKey()
          ? this._runInternalCheck(force)
          : this._checkInternalUpdates(force)
      );
    // A forced check downloads, so it counts as active while it waits for a running one
    return force ? this._internalChecks.track(key, () => this._notifyUpdateStatus(), run) : run();
  }

  /** @internal */
  _internalKey(): string {
    return `${this.channel} ${this.networkHost[this.channel]}`;
  }

  /**
   * Runs periodic checks and installs updates for IITC and plugins.
   * A failed check sets a growing pause, which `force` ignores.
   *
   * @param force - Forced to run the update right now.
   * @internal
   */
  async _runInternalCheck(force: boolean): Promise<InternalCheckResult> {
    const channel = this.channel;
    const host = this.networkHost[channel];
    const key = this._internalKey();
    const storage = await this.storage.get([
      'last_check_update',
      'update_check_retry',
      `${channel}_last_modified`,
      `${channel}_plugins_local`,
      `${channel}_pending_files`,
    ]);
    let updateCheckInterval = await this._readUpdateCheckInterval(channel);
    const lastModified = storage[`${channel}_last_modified`];
    // A channel without a catalog is due, whenever it was last checked
    const lastCheck = isSet(lastModified) ? (storage.last_check_update as number) : null;
    const retry = storage.update_check_retry as UpdateCheckRetry | null | undefined;
    const pendingFiles = (storage[`${channel}_pending_files`] || []) as string[];

    const start = unixNow();
    let nextCheck = dueAt(lastCheck, updateCheckInterval, retry, start);

    // A channel that was never fetched has no catalog yet, so retry it sooner
    const maxPause = isSet(lastModified) ? MAX_RETRY_PAUSE : 60;
    /** Moves the next check past the pause after a failed check and records the pause. */
    const pause = (error?: FetchError): Promise<void> => {
      const next = nextRetry(retry, error, updateCheckInterval, maxPause);
      nextCheck = dueAt(lastCheck, updateCheckInterval, next, unixNow());
      return this._save(channel, { update_check_retry: next });
    };
    const check = async (): Promise<InternalCheckResult> => {
      let checked: InternalCheckResult;
      if (force || !isSet(lastModified)) {
        checked = await this._updateInternalIITC(channel, storage, host);
      } else {
        // Without HEAD support this is a full GET, so its body is reused below
        const head = await this._getUrl(
          host + '/meta.json',
          this.useFetchHeadMethod ? 'head' : 'parseJSON'
        );
        const meta = this.useFetchHeadMethod ? undefined : head;
        if (head.error?.kind === 'network') {
          checked = { status: 'failed', error: head.error, failed: [] };
        } else if (head.version === lastModified && !pendingFiles.length) {
          checked = { status: 'not-modified', failed: [] };
        } else {
          checked = await this._updateInternalIITC(channel, storage, host, pendingFiles, meta);
        }
      }

      // The interval may have been changed while the check was running
      updateCheckInterval = await this._readUpdateCheckInterval(channel);
      // Channel changed mid-check: setChannel reset the state and reschedules.
      // Host changed mid-check: the new host was not checked, so record nothing.
      if (this.channel !== channel || this.networkHost[channel] !== host) return checked;
      if (checked.status !== 'failed') {
        nextCheck = start + updateCheckInterval;
        await this._save(channel, { last_check_update: start, update_check_retry: null });
      } else {
        await pause(checked.error ?? checked.failed.find(f => isTransient(f.error))?.error);
      }
      return checked;
    };

    let result: InternalCheckResult = { status: 'not-due', failed: [] };
    try {
      if (force || start >= nextCheck) {
        result = await this._internalChecks.track(
          key,
          () => this._notifyUpdateStatus(),
          () =>
            check().catch(async error => {
              // A rejected check pauses too, so neither the daemon nor the host repeats it at once.
              // The daemon keeps the pause even if storage fails to record it.
              if (this.channel === channel && this.networkHost[channel] === host) {
                await pause().catch(() => {});
              }
              throw error;
            })
        );
      }
    } finally {
      if (this.channel === channel) {
        this._scheduleCheck('updateTimeoutId', nextCheck, updateCheckInterval, () =>
          this._checkInternalUpdates()
        );
      }
    }
    return result;
  }

  /**
   * Re-arms a daemon timer to fire at `nextCheck`, but no later than `interval` from now.
   * A check rejected before it re-arms the timer is retried after a pause.
   *
   * @param timer - Timer field to re-arm.
   * @param nextCheck - Unix time in seconds when the check is due.
   * @param interval - Update check interval in seconds.
   * @param check - Check to run.
   * @internal
   */
  _scheduleCheck(
    timer: 'updateTimeoutId' | 'externalUpdateTimeoutId',
    nextCheck: number,
    interval: number,
    check: () => Promise<unknown>
  ): void {
    clearTimeout(this[timer]!);
    this[timer] = null;
    if (!this.isDaemon) return;
    const delay = Math.min(Math.max(0, nextCheck - unixNow()), interval);
    const id = setTimeout(() => {
      check().catch(error => {
        console.error('Update check failed:', error);
        // Another check may have re-armed the timer meanwhile
        if (this[timer] === id) {
          this._scheduleCheck(timer, unixNow() + MAX_RETRY_PAUSE, interval, check);
        }
      });
    }, Math.min(delay * 1000, MAX_TIMER_DELAY));
    this[timer] = id;
  }

  /**
   * Updates IITC, passes control to {@link _updateLocalPlugins} function to update plugins.
   *
   * @param channel - Current channel.
   * @param local - Data from storage.
   * @param host - Repository URL captured when the check started.
   * @param pendingFiles - UIDs (IITC_CORE_UID for the core) that failed in the last check;
   * if meta.json is unchanged since then, only these are downloaded.
   * @param meta - Already received meta.json response.
   * @internal
   */
  async _updateInternalIITC(
    channel: Channel,
    local: StorageData,
    host: string,
    pendingFiles?: string[],
    meta?: FetchResourceResult
  ): Promise<InternalCheckResult> {
    const result = meta ?? (await this._getUrl(host + '/meta.json', 'parseJSON'));
    if (!result.data) return { status: 'failed', error: result.error, failed: [] };
    if (!isChannelMeta(result.data)) {
      return { status: 'failed', error: { kind: 'invalid' }, failed: [] };
    }

    const response = result.data;
    const lastModified = result.version;
    const only =
      pendingFiles && lastModified === local[`${channel}_last_modified`]
        ? new Set(pendingFiles)
        : undefined;

    const pluginsCatalog = this._getPluginsCatalog(response);
    const pluginsLocal = (local[`${channel}_plugins_local`] || {}) as PluginDict;

    const [core, res] = await Promise.all([
      !only || only.has(IITC_CORE_UID)
        ? this._fetchUserscript(host + '/total-conversion-build.user.js')
        : null,
      this._updateLocalPlugins(channel, pluginsCatalog, pluginsLocal, host, only),
    ]);
    const failed = [...res.failed];
    let iitcCore: Plugin | undefined;
    if (core && 'error' in core) {
      failed.push({ uid: IITC_CORE_UID, error: core.error });
    } else if (core) {
      iitcCore = { ...core.meta, uid: getUID(core.meta)!, code: core.code } as Plugin;
    }

    const saved = await this._mutatePlugins(async () => {
      // Plugins may have been enabled while downloading: apply only this check's changes
      const current = await this.storage.get([`${channel}_plugins_local`, 'plugins_state']);
      // Host changed while downloading: the files are from the old one
      if (this.networkHost[channel] !== host) return false;
      const pluginsLocal = (current[`${channel}_plugins_local`] || {}) as PluginDict;
      const pluginsState = (current['plugins_state'] || {}) as PluginStateDict;
      for (const uid of [...res.updatedUids, ...res.addedUids]) {
        pluginsLocal[uid] = res.pluginsLocal[uid];
      }
      for (const uid of res.removedUids) {
        // removedUids also lists enabled plugins that keep their cached code
        if (!(uid in res.pluginsLocal) && pluginsState[uid]?.status !== 'on') {
          delete pluginsLocal[uid];
        }
      }
      await this._save(channel, {
        ...(iitcCore ? { iitc_core: iitcCore } : {}),
        iitc_version: response['iitc_version'],
        last_modified: lastModified,
        plugins_catalog: pluginsCatalog,
        plugins_local: pluginsLocal,
        pending_files: failed.map(f => f.uid),
      });
      return true;
    });
    if (!saved) return { status: 'not-modified', failed: [] };
    if (iitcCore) await this._sendPluginsEvent(channel, [iitcCore['uid']], 'update', 'local');
    if (res.updatedUids.length)
      await this._sendPluginsEvent(channel, res.updatedUids, 'update', 'local');
    if (res.removedUids.length)
      await this._sendPluginsEvent(channel, res.removedUids, 'remove', 'local');
    if (res.addedUids.length) await this._sendPluginsEvent(channel, res.addedUids, 'add', 'local');

    if (failed.some(f => isTransient(f.error))) return { status: 'failed', failed };
    const updated =
      iitcCore || res.updatedUids.length || res.addedUids.length || res.removedUids.length;
    return { status: updated ? 'updated' : 'not-modified', failed };
  }

  /**
   * Fetches a userscript; a response without a ==UserScript== header counts as `invalid`.
   *
   * @param url - URL of the userscript.
   * @internal
   */
  async _fetchUserscript(
    url: string
  ): Promise<{ code: string; meta: PluginMeta } | { error: FetchError }> {
    const res = await this._getUrl(url);
    if (res.error) return { error: res.error };
    const meta = parseMeta(res.data as string);
    if (!meta) return { error: { kind: 'invalid' } };
    return { code: res.data as string, meta };
  }

  /**
   * Converts a list of categories with plugins into a flat catalog dictionary.
   * Contains only server-side metadata fields - no runtime state (status, code, user, etc.).
   *
   * @param data - Data from received meta.json file.
   * @internal
   */
  _getPluginsCatalog(data: MetaJsonResponse): PluginDict {
    if (!('categories' in data)) return {};
    const plugins: PluginDict = {};
    const categories = data['categories'];

    Object.keys(categories).forEach(cat => {
      if (cat === 'Obsolete' || cat === 'Deleted') return;

      if (categories[cat]?.plugins) {
        Object.keys(categories[cat].plugins!).forEach(id => {
          const plugin = { ...(categories[cat].plugins![id] as unknown as Plugin) };
          plugin['uid'] = getUID(plugin)!;
          plugin['category'] = cat;
          plugin['match'] = [GM_API_DEFAULT_MATCH];
          plugins[plugin['uid']] = plugin;
        });
      }
    });
    return plugins;
  }

  /**
   * Runs `_runExternalCheck`, or returns the running check.
   * A forced check waits for a running non-forced one.
   *
   * @param force - Forced to run the update right now.
   * @internal
   */
  _checkExternalUpdates(force: boolean = false): Promise<ExternalCheckResult> {
    const run = () =>
      this._externalChecks.run('external', force, () => this._runExternalCheck(force));
    // A forced check downloads, so it counts as active while it waits for a running one
    return force
      ? this._externalChecks.track('external', () => this._notifyUpdateStatus(), run)
      : run();
  }

  /**
   * Runs periodic checks and installs updates for external plugins.
   * If every request fails with a network error, a growing pause is set, which `force` ignores.
   *
   * @param force - Forced to run the update right now.
   * @internal
   */
  async _runExternalCheck(force: boolean): Promise<ExternalCheckResult> {
    const channel = this.channel;
    const local = await this.storage.get([
      'last_check_external_update',
      'external_update_check_retry',
      'plugins_user',
    ]);
    let updateCheckInterval = await this._readUpdateCheckInterval('external');
    const lastCheck = local.last_check_external_update as number | null | undefined;
    const retry = local.external_update_check_retry as UpdateCheckRetry | null | undefined;

    const start = unixNow();
    let nextCheck = dueAt(lastCheck, updateCheckInterval, retry, start);
    /** Moves the next check past the pause after a failed check and records the pause. */
    const pause = (error?: FetchError): Promise<void> => {
      const next = nextRetry(retry, error, updateCheckInterval);
      nextCheck = dueAt(lastCheck, updateCheckInterval, next, unixNow());
      return this._save(channel, { external_update_check_retry: next });
    };
    const check = async (): Promise<ExternalCheckResult> => {
      const { reached, updated, failed } = await this._updateExternalPlugins(channel, local);
      const offline =
        !reached && failed.length > 0 && failed.every(f => f.error.kind === 'network');
      // The interval may have been changed while the check was running
      updateCheckInterval = await this._readUpdateCheckInterval('external');
      if (offline) {
        await pause(failed[0].error);
      } else {
        nextCheck = start + updateCheckInterval;
        await this._save(channel, {
          last_check_external_update: start,
          external_update_check_retry: null,
        });
      }
      return { status: offline ? 'failed' : 'checked', updated, failed };
    };

    let result: ExternalCheckResult = { status: 'not-due', updated: [], failed: [] };
    try {
      if (force || start >= nextCheck) {
        result = await this._externalChecks.track(
          'external',
          () => this._notifyUpdateStatus(),
          () =>
            check().catch(async error => {
              // A rejected check pauses too, so neither the daemon nor the host repeats it at once.
              // The daemon keeps the pause even if storage fails to record it.
              await pause().catch(() => {});
              throw error;
            })
        );
      }
    } finally {
      this._scheduleCheck('externalUpdateTimeoutId', nextCheck, updateCheckInterval, () =>
        this._checkExternalUpdates()
      );
    }
    return result;
  }

  /**
   * Updates external plugins.
   *
   * @param channel - Current channel.
   * @param local - Data from storage.
   * @returns Whether any update description was received, updated and failed plugins.
   * @internal
   */
  async _updateExternalPlugins(
    channel: Channel,
    local: StorageData
  ): Promise<{ reached: boolean; updated: string[]; failed: FailedFile[] }> {
    const pluginsUser = (local['plugins_user'] || {}) as PluginDict;
    const uids = Object.keys(pluginsUser).filter(
      uid => pluginsUser[uid]?.['updateURL'] && pluginsUser[uid]?.['downloadURL']
    );
    const updates: PluginDict = {};
    const failed: FailedFile[] = [];
    let reached = false;
    const currentTime = unixNow();

    const checkPlugin = async (uid: string) => {
      const plugin = pluginsUser[uid];
      const head = await this._fetchUserscript(plugin['updateURL'] as string);
      if ('error' in head) {
        failed.push({ uid, error: head.error });
        return;
      }
      reached = true;
      if (!head.meta['version'] || head.meta['version'] === plugin['version']) return;
      const code = await this._fetchUserscript(plugin['downloadURL'] as string);
      if ('error' in code) {
        failed.push({ uid, error: code.error });
        return;
      }
      if (code.code === plugin.code) return;
      updates[uid] = {
        ...code.meta,
        uid,
        code: code.code,
        // Set when the plugin was added; the downloaded header may lack them
        filename: plugin.filename ?? code.meta.filename,
        category: code.meta.category ?? plugin.category,
        updateURL: code.meta.updateURL ?? plugin.updateURL,
        downloadURL: code.meta.downloadURL ?? plugin.downloadURL,
        addedAt: plugin.addedAt,
        updatedAt: currentTime,
      } as Plugin;
    };

    // A few at a time: requests queued by the browser would run into the fetch timeout
    const queue = [...uids];
    const worker = async () => {
      while (queue.length) await checkPlugin(queue.shift()!);
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));

    let updatedUids: string[] = [];
    if (Object.keys(updates).length) {
      updatedUids = await this._mutatePlugins(async () => {
        // Re-read: plugins may have been added, replaced or deleted while downloading
        const current = await this.storage.get(['plugins_user']);
        const currentUser = (current['plugins_user'] || {}) as PluginDict;
        const changed = uids.filter(
          uid => updates[uid] && currentUser[uid] && currentUser[uid].code === pluginsUser[uid].code
        );
        for (const uid of changed) currentUser[uid] = updates[uid];
        if (changed.length) await this._save(channel, { plugins_user: currentUser });
        return changed;
      });
      if (updatedUids.length) {
        await this._sendPluginsEvent(channel, updatedUids, 'update', 'user');
      }
    }
    return { reached, updated: updatedUids, failed };
  }

  /**
   * Updates plugins.
   *
   * @param channel - Current channel.
   * @param pluginsCatalog - Data from storage, key "[channel]_plugins_catalog".
   * @param pluginsLocal - Data from storage, key "[channel]_plugins_local".
   * @param host - Repository URL captured when the check started.
   * @param only - Download only these UIDs; others keep their cached code.
   * @internal
   */
  async _updateLocalPlugins(
    channel: Channel,
    pluginsCatalog: PluginDict,
    pluginsLocal: PluginDict,
    host: string,
    only?: Set<string>
  ): Promise<{
    pluginsLocal: PluginDict;
    addedUids: string[];
    updatedUids: string[];
    removedUids: string[];
    failed: FailedFile[];
  }> {
    const updatedUids: string[] = [];
    const removedUids: string[] = [];
    const addedUids: string[] = [];
    const failed: FailedFile[] = [];
    const currentTime = unixNow();

    const download = async (uid: string, filename: string, done: string[]) => {
      const result = await this._fetchUserscript(`${host}/plugins/${filename}`);
      if ('error' in result) {
        failed.push({ uid, error: result.error });
        return;
      }
      // `plugins_local` is a pure code cache; metadata lives in the catalog
      pluginsLocal[uid] = { code: result.code, filename, updatedAt: currentTime } as Plugin;
      done.push(uid);
    };

    // The stored catalog is still the previous one here (saved after this method
    // returns), so it lets us detect the exact run a plugin drops out of the catalog.
    const globalData = await this.storage.get([
      'plugins_state',
      'plugins_user',
      `${channel}_plugins_catalog`,
    ]);
    const pluginsState = (globalData['plugins_state'] || {}) as PluginStateDict;
    const pluginsUser = (globalData['plugins_user'] || {}) as PluginDict;
    const prevCatalog = (globalData[`${channel}_plugins_catalog`] || {}) as PluginDict;

    // For each uid in local cache or catalog:
    // cached + in catalog -> re-download (update)
    // cached + gone from catalog + disabled -> drop the cached copy (remove)
    // cached + gone from catalog + enabled -> keep the cached copy; emit a one-time
    //   remove on the run it disappears so event-driven hosts disable it too
    // not cached + in catalog + enabled -> download (add)
    const allUids = new Set([...Object.keys(pluginsLocal), ...Object.keys(pluginsCatalog)]);
    for (const uid of allUids) {
      if (uid in pluginsLocal) {
        // Fall back to the catalog filename to heal an entry that lost its own
        const filename =
          ((pluginsCatalog[uid] as Plugin)?.['filename'] as string) ||
          (pluginsLocal[uid]['filename'] as string);
        if (filename && pluginsCatalog[uid]) {
          if (!only || only.has(uid)) await download(uid, filename, updatedUids);
        } else if (pluginsState[uid]?.status !== 'on') {
          delete pluginsLocal[uid];
          removedUids.push(uid);
        } else if (!pluginsCatalog[uid] && uid in prevCatalog && !(uid in pluginsUser)) {
          // Just gone from the catalog: keep the cached code, emit remove once.
          // A user override keeps the plugin active, so it is left untouched.
          removedUids.push(uid);
        }
      } else if (pluginsState[uid]?.status === 'on' && (!only || only.has(uid))) {
        const filename = (pluginsCatalog[uid] as Plugin)['filename'] as string;
        if (filename) await download(uid, filename, addedUids);
      }
    }

    return { pluginsLocal, addedUids, updatedUids, removedUids, failed };
  }

  /** @internal */
  _computePlugins(
    rawPlugins: PluginDict,
    pluginsLocal: PluginDict,
    pluginsUser: PluginDict,
    pluginsState: PluginStateDict
  ): PluginDict {
    if (!isSet(pluginsLocal)) pluginsLocal = {};
    if (!isSet(pluginsUser)) pluginsUser = {};

    const data: PluginDict = {};
    for (const [uid, plugin] of Object.entries(rawPlugins)) {
      data[uid] = { ...plugin, status: 'off' };
    }

    // Build a set of catalog UIDs to skip stale local entries removed from the server catalog
    const currentChannelPluginUids = new Set(Object.keys(data));

    Object.keys(pluginsLocal).forEach(pluginUid => {
      if (currentChannelPluginUids.has(pluginUid)) {
        const localPlugin = pluginsLocal[pluginUid];
        const state = pluginsState[pluginUid];
        data[pluginUid].status = state?.status ?? 'off';
        data[pluginUid].statusChangedAt = state?.statusChangedAt;
        data[pluginUid].code = localPlugin.code;
        data[pluginUid].updatedAt = localPlugin.updatedAt;
      }
    });

    Object.keys(pluginsUser).forEach(pluginUid => {
      const userPlugin = pluginsUser[pluginUid];
      const state = pluginsState[pluginUid];
      const pluginStatus = state?.status ?? 'off';
      if (pluginUid in data) {
        const userMeta = parseMeta(userPlugin.code ?? '');
        if (userMeta) Object.assign(data[pluginUid], userMeta);
        data[pluginUid].status = pluginStatus;
        data[pluginUid].statusChangedAt = state?.statusChangedAt;
        data[pluginUid].code = userPlugin.code;
        data[pluginUid].user = true;
        data[pluginUid].override = true;
        data[pluginUid].addedAt = userPlugin.addedAt;
        data[pluginUid].updatedAt = userPlugin.updatedAt;
        // Use the override's own `match`, not the catalog's
        delete data[pluginUid].match;
        if (userPlugin.match !== undefined) data[pluginUid].match = userPlugin.match;
      } else {
        data[pluginUid] = {
          ...userPlugin,
          status: pluginStatus,
          statusChangedAt: state?.statusChangedAt,
        };
      }
      data[pluginUid].user = true;
    });

    return data;
  }

  /** @internal */
  _computeCategories(plugins: PluginDict): CategoryViewDict {
    const now = unixNow();
    const threshold = this.newPluginThreshold;
    const rawCategories: CategoryViewDict = {};
    for (const plugin of Object.values(plugins)) {
      const cat = plugin.category || 'Misc';
      if (!(cat in rawCategories)) {
        rawCategories[cat] = { name: cat, isNew: false };
      }
      if (plugin.addedAt && now - plugin.addedAt <= threshold) {
        rawCategories[cat].isNew = true;
      }
    }
    return Object.fromEntries(Object.entries(rawCategories).sort(([a], [b]) => a.localeCompare(b)));
  }

  /** @internal */
  _computeCore(iitcCore: Plugin | undefined, iitcCoreUser: Plugin | undefined): Plugin | null {
    if (isSet(iitcCoreUser) && isSet(iitcCoreUser!['code'])) {
      iitcCoreUser!['override'] = true;
      return iitcCoreUser!;
    }
    if (isSet(iitcCore) && isSet(iitcCore!['code'])) {
      return iitcCore!;
    }
    return null;
  }

  /**
   * Computes a merged view of all plugins, categories and IITC core.
   *
   * @param rawPlugins - Dictionary of plugins downloaded from the server.
   * @param pluginsLocal - Dictionary of installed plugins from IITC-CE distribution.
   * @param pluginsUser - Dictionary of external UserScripts.
   * @param pluginsState - Dictionary of plugin state entries.
   * @param iitcCore - Channel core plugin from storage.
   * @param iitcCoreUser - User-installed core override from storage.
   * @internal
   */
  _computePluginsView(
    rawPlugins: PluginDict,
    pluginsLocal: PluginDict,
    pluginsUser: PluginDict,
    pluginsState: PluginStateDict,
    iitcCore?: Plugin,
    iitcCoreUser?: Plugin
  ): PluginsView {
    const plugins = this._computePlugins(rawPlugins, pluginsLocal, pluginsUser, pluginsState);
    const categories = this._computeCategories(plugins);
    const core = this._computeCore(iitcCore, iitcCoreUser);
    return { plugins, categories, core };
  }

  /**
   * Asynchronously sends an event for a list of plugins based on the given parameters.
   * It calls `onPluginEvent` once with the event type and a map of the selected plugins.
   * If the action is "remove", the plugins are represented by empty objects.
   *
   * @param channel - Current channel.
   * @param uids - Array of unique identifiers (UID) of plugins.
   * @param event - The type of event to handle.
   * @param updateType - Specifies the update type to determine which plugin versions to use.
   * When set to 'local', actions with plugins marked as "user" are ignored, and vice versa.
   * This parameter is intended to ignore updates from 'local' plugins when a 'user' plugin is used, and vice versa.
   * If not specified, no ignoring logic is applied, and the function attempts to process the plugin event
   * based on available data.
   * @internal
   */
  async _sendPluginsEvent(
    channel: Channel,
    uids: string[],
    event: PluginEventType,
    updateType?: UpdateType
  ): Promise<void> {
    const validEvents: PluginEventType[] = ['add', 'update', 'remove'];
    if (!validEvents.includes(event)) return;

    // Read global state once for status checks across all uids
    const globalData = await this.storage.get(['plugins_user', 'plugins_state']);
    const allPluginsUser = (globalData['plugins_user'] || {}) as PluginDict;
    const allPluginsState = (globalData['plugins_state'] || {}) as PluginStateDict;

    const plugins: PluginEventData['plugins'] = {};
    // Entries that only hold for `channel`: its cached code and the removals its check found
    const channelScoped: string[] = [];

    for (const uid of uids) {
      if (uid === GM_API_UID) continue;

      const isCore = uid === IITC_CORE_UID;
      if (isCore && event !== 'update') continue;

      const storageKeys = isCore
        ? [`${channel}_iitc_core`, 'iitc_core_user']
        : [`${channel}_plugins_catalog`, `${channel}_plugins_local`];
      const storage = await this.storage.get(storageKeys);

      let pluginLocal: Plugin | undefined;
      let catalogGap = false;
      if (isCore) {
        pluginLocal = storage[`${channel}_iitc_core`] as Plugin | undefined;
      } else {
        const catalogEntry = (storage[`${channel}_plugins_catalog`] as PluginDict)?.[uid];
        const localEntry = (storage[`${channel}_plugins_local`] as PluginDict)?.[uid];
        // Emit the merged catalog view (metadata + `match`) with the cached local code.
        // A plugin cached without a catalog entry has no metadata to emit.
        pluginLocal =
          catalogEntry && localEntry
            ? ({
                ...catalogEntry,
                code: localEntry.code,
                updatedAt: localEntry.updatedAt,
              } as Plugin)
            : undefined;
        catalogGap = !catalogEntry && isSet(localEntry);
      }
      const pluginUser = isCore
        ? (storage['iitc_core_user'] as Plugin | undefined)
        : allPluginsUser[uid];

      // Add/update for a catalog-absent cached plugin stays silent; its removal is
      // driven once from _updateLocalPlugins (a `remove` event still passes through).
      if (catalogGap && !isSet(pluginUser) && event !== 'remove') continue;

      if (event === 'remove' || (!isSet(pluginLocal) && !isSet(pluginUser))) {
        if (updateType === 'local') channelScoped.push(uid);
        plugins[uid] = {};
        continue;
      }

      const useLocal = !isSet(pluginUser) && (updateType === undefined || updateType === 'local');
      const useUser = isSet(pluginUser) && (updateType === undefined || updateType === 'user');

      if (useLocal) {
        channelScoped.push(uid);
        plugins[uid] = pluginLocal || {};
      } else if (useUser) {
        plugins[uid] = pluginUser || {};
      }

      // Updating a disabled plugin should not trigger the event
      if (!isCore && allPluginsState[uid]?.status !== 'on') {
        delete plugins[uid];
      }
    }

    if (channel !== this.channel) for (const uid of channelScoped) delete plugins[uid];
    if (Object.keys(plugins).length) {
      // Wrap plugin code with GM API bindings when gm_api is configured
      if (this.gmApi && (event === 'add' || event === 'update')) {
        for (const uid in plugins) {
          const plugin = plugins[uid] as Plugin;
          if (plugin?.code) {
            const wrapped = { ...plugin };
            wrapped.code = wrapPluginCode(wrapped, this.sourceUrlPrefix);
            plugins[uid] = wrapped;
          }
        }
      }

      this.onPluginEvent({
        event,
        plugins,
      });
    }

    if (this.gmApi) {
      const newMatches = await this._computeGmApiMatches();
      if (newMatches.join('\0') !== this._gmApiMatches.join('\0')) {
        this._gmApiMatches = newMatches;
        this.onPluginEvent({
          event: 'update',
          plugins: { [GM_API_UID]: this._buildGmApiPlugin(newMatches) },
        });
      }
    }
  }

  /**
   * Injects a plugin, optionally wrapping its code with GM API bindings
   * when `gmApi` config is provided.
   *
   * @param plugin - Plugin to inject.
   * @internal
   */
  _injectWithGmApi(plugin: Plugin): void | Promise<void> {
    if (this.gmApi && plugin.code) {
      plugin = { ...plugin, code: wrapPluginCode(plugin, this.sourceUrlPrefix) };
    }
    return this.injectPlugin(plugin);
  }
}
