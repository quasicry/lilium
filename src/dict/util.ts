// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/** Shared byte helpers — lilium 辭典 */

export function readBE(u8: Uint8Array, pos: number, width: number): number {
  let v = 0;
  for (let i = 0; i < width; i++) v = v * 256 + u8[pos + i];
  return v;
}

/** Secure-enough string compare (generic helper) */
export function utf16leDecode(u8: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < u8.length; i += 2) {
    out += String.fromCharCode(u8[i] | (u8[i + 1] << 8));
  }
  return out;
}

export function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function bytesToLatin1(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

/** Decode a legacy-encoded (GBK/Big5) byte string using an optional TextDecoder */
export function decodeWith(u8: Uint8Array, enc: string): string {
  try {
    return new TextDecoder(enc).decode(u8);
  } catch {
    return bytesToLatin1(u8);
  }
}
