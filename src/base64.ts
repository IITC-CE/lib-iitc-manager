// Copyright (C) 2026 IITC-CE - GPL-3.0 with Store Exception - see LICENSE and COPYING.STORE

/**
 * Decodes a base64 string to a UTF-8 string.
 *
 * @param base64 - Base64-encoded string.
 */
export function base64ToStr(base64: string): string {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, m => m.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

/**
 * Encodes a UTF-8 string to base64.
 *
 * @param str - UTF-8 string to encode.
 */
export function strToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(bin);
}
