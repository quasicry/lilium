// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 像素級字距測量：
 * 1) 找文本列（直排：X 方向分帶）
 * 2) 每列內沿 Y 找字形段（連續墨水行），計算相鄰字形間隙 / 字形高度
 * 輸出每張圖的中位數間距比、平均間距比。 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

function analyze(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width, height, data } = png;
  const ink = (x, y) => {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    return a > 40 && (r < 160 || g < 160 || b < 160); // 非白即墨（容差）
  };
  // 列投影：每個 X 的墨水行數
  const colInk = new Array(width).fill(0);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++) if (ink(x, y)) colInk[x]++;
  // 找列帶（連續 colInk>2 的 X 區間）
  const bands = [];
  let s = -1;
  for (let x = 0; x < width; x++) {
    if (colInk[x] > 2 && s < 0) s = x;
    if (colInk[x] <= 2 && s >= 0) { if (x - s > 8) bands.push([s, x]); s = -1; }
  }
  if (s >= 0 && width - s > 8) bands.push([s, width]);
  // 取最寬的 3 個列帶（正文列）
  bands.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const cols = bands.slice(0, 3).sort((a, b) => a[0] - b[0]);
  const ratios = [];
  const heights = [];
  for (const [x0, x1] of cols) {
    // 列內行投影
    const rowInk = new Array(height).fill(0);
    for (let y = 0; y < height; y++)
      for (let x = x0; x < x1; x++) if (ink(x, y)) rowInk[y]++;
    // 字形段（連續 rowInk>1）
    const segs = [];
    let st = -1;
    for (let y = 0; y < height; y++) {
      if (rowInk[y] > 1 && st < 0) st = y;
      if (rowInk[y] <= 1 && st >= 0) { if (y - st > 6) segs.push([st, y]); st = -1; }
    }
    if (st >= 0) segs.push([st, height]);
    for (let i = 1; i < segs.length; i++) {
      const gap = segs[i][0] - segs[i - 1][1];
      const h = segs[i - 1][1] - segs[i - 1][0];
      if (h > 12 && gap >= 0) { ratios.push(gap / h); heights.push(h); }
    }
  }
  ratios.sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  const mean = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  const medH = heights.length ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : null;
  return { file: path.basename(file), columns: cols.length, glyphSamples: ratios.length, medianGapRatio: median, meanGapRatio: mean, medianGlyphHeight: medH };
}

const files = process.argv.slice(2);
for (const f of files) {
  const r = analyze(f);
  console.log(JSON.stringify(r));
}
