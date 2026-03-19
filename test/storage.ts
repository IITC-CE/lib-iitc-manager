// Copyright (C) 2022-2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

import type { StorageAPI, StorageData, StorageValue } from '../src/types.js';

const store: Record<string, string> = {};

interface TestStorage extends StorageAPI {
  _one_to_array(key: string | string[]): string[];
  _get_one(key: string): StorageValue;
  _set_one(key: string, value: StorageValue): void;
  resetStorage(): void;
}

const storage: TestStorage = {
  /**
   * Converts the input key to an array if it is a string.
   * @param key - The key or keys to be converted to an array.
   * @returns An array containing the keys.
   */
  _one_to_array(key: string | string[]): string[] {
    if (typeof key === 'string') {
      return [key];
    }
    return key;
  },

  /**
   * Retrieves the value associated with the given key from the store.
   * @param key - The key for the value to be retrieved.
   * @returns The value associated with the key, or null if the key is not found.
   */
  _get_one(key: string): StorageValue {
    const value = key in store ? store[key] : null;

    if (value === null) return null;

    try {
      return JSON.parse(value) as StorageValue;
    } catch {
      return value;
    }
  },

  /**
   * Sets the value associated with the given key in the store.
   * @param key - The key for the value to be set.
   * @param value - The value to be stored.
   */
  _set_one(key: string, value: StorageValue): void {
    if (typeof value !== 'string') {
      store[key] = JSON.stringify(value);
    } else {
      store[key] = value;
    }
  },

  /**
   * Retrieves data from the store for the specified keys.
   * If 'keys' is null, returns a copy of all data in the store.
   * @param keys - The key or keys for the data to be retrieved.
   * @returns An object containing the data associated with the keys.
   */
  async get(keys: string[] | null): Promise<StorageData> {
    if (keys === null) {
      const data: StorageData = {};
      for (const key in store) {
        data[key] = this._get_one(key);
      }
      return data;
    }
    const keyArray = this._one_to_array(keys);
    const data: StorageData = {};
    keyArray.forEach(key => {
      data[key] = this._get_one(key);
    });
    return data;
  },

  /**
   * Sets data in the store for the specified keys and values.
   * @param obj - An object containing the keys and values to be stored.
   */
  async set(obj: StorageData): Promise<void> {
    if (typeof obj === 'object') {
      Object.entries(obj).forEach(entry => {
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
  resetStorage(): void {
    for (const key in store) {
      delete store[key];
    }
  },
};

export default storage;
