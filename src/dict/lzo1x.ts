// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — LZO1X decompressor (MDict blocks).
 *
 * Faithful TypeScript port of Feng Dihai's minilzo-decompress.js
 * (pure-JS LZO decompress based on the java-compress port of minilzo.c 2.03).
 * Upstream lineage: LZO/minilzo (minilzo.c is dual-licensed under GPL or a
 * special exemption permitting free use in other software); this TS port and
 * the plugin itself are distributed AGPL-3.0-or-later.
 *
 * Input: raw LZO1X stream (MDict block payload AFTER the 8-byte
 * [u32 LE info][u32 BE adler32] prefix). No "f0 + size" wrapper.
 */

const blockSize = 4096;

/** Growable output buffer mirroring FlexBuffer semantics */
class FlexBuffer {
  buf = new Uint8Array(0);
  /** cursor = next write position */
  c = 0;
  /** current allocated length */
  l = 0;
  private grow = blockSize;

  private roundUp(n: number): number {
    const r = n % 4;
    return r === 0 ? n : n + 4 - r;
  }

  alloc(initSize: number, bs?: number): void {
    this.grow = this.roundUp(bs || blockSize);
    this.c = 0;
    let l = this.roundUp(initSize) | 0;
    l += this.grow - (l % this.grow);
    this.l = l;
    this.buf = new Uint8Array(l);
  }

  /** Ensure capacity for n more bytes; returns backing array */
  require(n: number): Uint8Array {
    const r = this.c - this.l + n;
    if (r > 0) {
      const tmp = new Uint8Array((this.l += this.grow * Math.ceil(r / this.grow)));
      tmp.set(this.buf);
      this.buf = tmp;
    }
    this.c += n;
    return this.buf;
  }

  pack(size: number): Uint8Array {
    return this.buf.subarray(0, size);
  }
}

// state machine states
const TOP_LOOP = 1;
const FIRST_LITERAL_RUN = 2;
const MATCH = 3;
const COPY_MATCH = 4;
const MATCH_DONE = 5;
const MATCH_NEXT = 6;

function decompress(inBuf: Uint8Array, outBuf: FlexBuffer): Uint8Array {
  let out: Uint8Array;
  let op = 0;
  let ip = 0;
  let t = inBuf[ip];
  let state = TOP_LOOP;
  let m_pos = 0;
  let if_block: boolean;

  if (t > 17) {
    ip++;
    t -= 17;
    if (t < 4) {
      state = MATCH_NEXT;
    } else {
      out = outBuf.require(t);
      do {
        out[op++] = inBuf[ip++];
      } while (--t > 0);
      state = FIRST_LITERAL_RUN;
    }
  }

  topLoop: do {
    if_block = false; // reset at the start of every top-loop pass (mirrors reference)
    switch (state) {
      case TOP_LOOP: {
        t = inBuf[ip++];
        if (t >= 16) {
          state = MATCH;
          continue topLoop;
        }
        if (t === 0) {
          while (inBuf[ip] === 0) {
            t += 255;
            ip++;
          }
          t += 15 + inBuf[ip++];
        }
        t += 3;
        out = outBuf.require(t);
        do {
          out[op++] = inBuf[ip++];
        } while (--t > 0);
        // fall through to FIRST_LITERAL_RUN
      }
      // falls through
      case FIRST_LITERAL_RUN: {
        t = inBuf[ip++];
        if (t >= 16) {
          state = MATCH;
          continue topLoop;
        }
        m_pos = op - 0x801 - (t >> 2) - (inBuf[ip++] << 2);
        out = outBuf.require(3);
        out[op++] = out[m_pos++];
        out[op++] = out[m_pos++];
        out[op++] = out[m_pos];
        state = MATCH_DONE;
        continue topLoop;
      }
      case MATCH: {
        if (t >= 64) {
          m_pos = op - 1 - ((t >> 2) & 7) - (inBuf[ip++] << 3);
          t = (t >> 5) - 1;
          state = COPY_MATCH;
          continue topLoop;
        } else if (t >= 32) {
          t &= 31;
          if (t === 0) {
            while (inBuf[ip] === 0) {
              t += 255;
              ip++;
            }
            t += 31 + inBuf[ip++];
          }
          m_pos = op - 1 - ((inBuf[ip] + (inBuf[ip + 1] << 8)) >> 2);
          ip += 2;
        } else if (t >= 16) {
          m_pos = op - ((t & 8) << 11);
          t &= 7;
          if (t === 0) {
            while (inBuf[ip] === 0) {
              t += 255;
              ip++;
            }
            t += 7 + inBuf[ip++];
          }
          m_pos -= (inBuf[ip] + (inBuf[ip + 1] << 8)) >> 2;
          ip += 2;
          if (m_pos === op) {
            break topLoop; // EOF
          }
          m_pos -= 0x4000;
        } else {
          m_pos = op - 1 - (t >> 2) - (inBuf[ip++] << 2);
          out = outBuf.require(2);
          out[op++] = out[m_pos++];
          out[op++] = out[m_pos];
          state = MATCH_DONE;
          continue topLoop;
        }
        if (t >= 6 && op - m_pos >= 4) {
          t += 2;
          out = outBuf.require(t);
          do {
            out[op++] = out[m_pos++];
          } while (--t > 0);
          state = MATCH_DONE;
          continue topLoop;
        }
        // fall through to COPY_MATCH
      }
      // falls through
      case COPY_MATCH: {
        if (!if_block) {
          t += 2;
          out = outBuf.require(t);
          do {
            out[op++] = out[m_pos++];
          } while (--t > 0);
        }
        // fall through to MATCH_DONE
      }
      // falls through
      case MATCH_DONE: {
        t = inBuf[ip - 2] & 3;
        if (t === 0) {
          state = TOP_LOOP;
          continue topLoop;
        }
        // fall through to MATCH_NEXT
      }
      // falls through
      case MATCH_NEXT: {
        out = outBuf.require(1);
        out[op++] = inBuf[ip++];
        if (t > 1) {
          out = outBuf.require(1);
          out[op++] = inBuf[ip++];
          if (t > 2) {
            out = outBuf.require(1);
            out[op++] = inBuf[ip++];
          }
        }
        t = inBuf[ip++];
        state = MATCH;
        continue topLoop;
      }
    }
  // eslint-disable-next-line no-constant-condition -- LZO 解壓主循環（內部判定），顯式意圖——審計批次四。
  } while (true);

  return outBuf.pack(op);
}

export const lzo1x = {
  /** Decompress a raw LZO1X stream; returns exact-length decompressed bytes. */
  decompress(input: Uint8Array, maxDecompressedSize?: number): Uint8Array {
    const output = new FlexBuffer();
    // Copy: when `input` is a subarray view of a huge file buffer, FlexBuffer's
    // length-based bookkeeping stays safe, but a copy avoids aliasing surprises.
    const src = new Uint8Array(input);
    output.alloc(maxDecompressedSize || src.length);
    return decompress(src, output);
  },
};
