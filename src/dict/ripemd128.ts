// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — RIPEMD-128 (MDict key derivation)
 * Algorithm per Dobbertin, Bosselaers, Preneel (rmd128.txt).
 * Test vector: ripemd128("The quick brown fox jumps over the lazy dog")
 *   == 3fa9b57f053c053fbe2735b2380db596
 */

const ZL = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
];

const ZR = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
];

const SL = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
];

const SR = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
];

const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc];
const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x00000000];

function ROL(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** j: step index 0..63 for the left line; pass 79-j for the right line */
function f(j: number, x: number, y: number, z: number): number {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0; // j in 64..79 (right line, first 16 steps)
}

function add(...args: number[]): number {
  let s = 0;
  for (const a of args) s = (s + (a >>> 0)) >>> 0;
  return s >>> 0;
}

export function ripemd128(input: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  const msgLen = input.length;
  const padded = new Uint8Array((((msgLen + 8) >> 6) + 1) * 64);
  padded.set(input);
  padded[msgLen] = 0x80;
  const bitLen = msgLen * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  const X = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) X[i] = dv.getUint32(off + i * 4, true);

    let a = h[0], b = h[1], c = h[2], d = h[3];
    let aa = h[0], bb = h[1], cc = h[2], dd = h[3];
    const round = (j: number) => j >>> 4;

    for (let j = 0; j < 64; j++) {
      const t = ROL(add(a, f(j, b, c, d), X[ZL[j]], KL[round(j)]), SL[j]);
      a = d; d = c; c = b; b = t;
      const tt = ROL(add(aa, f(63 - j, bb, cc, dd), X[ZR[j]], KR[round(j)]), SR[j]);
      aa = dd; dd = cc; cc = bb; bb = tt;
    }
    const t2 = add(h[1], c, dd);
    h[1] = add(h[2], d, aa);
    h[2] = add(h[3], a, bb);
    h[3] = add(h[0], b, cc);
    h[0] = t2;
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) odv.setUint32(i * 4, h[i], true);
  return out;
}

export function ripemd128Str(s: string): Uint8Array {
  return ripemd128(new TextEncoder().encode(s));
}

export function hex(u8: Uint8Array): string {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
