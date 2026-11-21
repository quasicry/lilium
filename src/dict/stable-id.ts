// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 穩定辭典 id。
 *
 * 背景（缺陷）：service.ts 用 `dict-${Date.now()}-${counter}` 生成 id，
 * 每次重掃都換一批。結果是：分組、啟用／停用、排序、改名、搜尋範圍（activeDictIds）
 * 在每次 rescan 後全部失效——因為這些狀態都以 id 為鍵存在 data.json。
 *
 * 方案（2A：改穩定 id ＋ 舊資料遷移）：
 *  1. id 由「格式 + 詞典基名」衍生，跨重掃穩定；同名衝突時追加資料夾路徑短雜湊。
 *  2. 舊 override 遷移：MDict 舊 id 固定為 `mdx-<基名>`，可直接對應；
 *     其餘格式舊 id 不可還原，改由 `dictIdIndex`（baseKey → id）做跨代遷移。
 *
 * 鐵律五：本檔為純函式，不 import obsidian，Node 可直接測。
 */

/** FNV-1a 32-bit → base36（短、穩定、無需 crypto / Node API）。 */
export function shortHash(input: string, len = 7): string {
  let h = 0x811c9dc5;
  const s = String(input || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 等價於 h *= 16777619（32 位溢出安全寫法）
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  let out = h.toString(36);
  if (out.length < len) out = out.padStart(len, '0');
  return out.slice(0, len);
}

/** 基名 slug：小寫、非英數轉 '-'、去首尾 '-'、上限 48。 */
export function slugBase(name: string, maxLen = 48): string {
  let s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'dict';
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '') || 'dict';
  return s;
}

/**
 * 跨代遷移用的鍵：`"<format>|<小寫基名>"`。
 * 只要辭典沒改名，重掃後仍能對上舊 id。
 */
export function dictBaseKey(format: string, baseName: string): string {
  return `${format}|${String(baseName || '').toLowerCase()}`;
}

export interface StableIdInput {
  format: string;
  /** 辭典基名（不含副檔名） */
  baseName: string;
  /** 該辭典在 vault 中的資料夾相對路徑（用於同名消歧） */
  scopePath?: string;
}

/**
 * 為一批辭典分配穩定 id。
 *
 * - 無衝突：`"<format>-<slug(baseName)>"`
 * - 同名衝突（同格式）：追加 `-<shortHash(scopePath)>`
 * - 仍衝突（極罕見）：再追加 `-2`、`-3`…
 *
 * 回傳陣列與輸入一一對應。
 */
export function assignStableIds(items: readonly StableIdInput[]): string[] {
  const primary = items.map((it) => `${it.format}-${slugBase(it.baseName)}`);
  const buckets = new Map<string, number[]>();
  primary.forEach((p, i) => {
    const arr = buckets.get(p);
    if (arr) arr.push(i);
    else buckets.set(p, [i]);
  });

  const out: string[] = new Array<string>(items.length);
  for (const [p, idxs] of buckets) {
    if (idxs.length === 1) {
      out[idxs[0]] = p;
      continue;
    }
    const used = new Set<string>();
    for (const i of idxs) {
      let candidate = `${p}-${shortHash(items[i].scopePath || '')}`;
      if (used.has(candidate)) {
        let n = 2;
        while (used.has(`${candidate}-${n}`)) n++;
        candidate = `${candidate}-${n}`;
      }
      used.add(candidate);
      out[i] = candidate;
    }
  }
  return out;
}

/** 單一辭典的穩定 id（無消歧需求時用）。 */
export function stableDictId(format: string, baseName: string, scopePath?: string): string {
  return assignStableIds([{ format, baseName, scopePath }])[0];
}

/**
 * 遺留 id 候選（遷移時依序嘗試）。
 * MDict 的資源路徑用 `mdx-<基名>`，故可直接對應；
 * 其餘格式以前就是隨機 id，只能靠 dictIdIndex 兜。
 */
export function legacyIdCandidates(format: string, baseName: string): string[] {
  const out: string[] = [];
  if (format === 'mdict') {
    out.push(`mdx-${baseName}`);
    out.push(`mdx-${slugBase(baseName)}`);
  }
  out.push(`${format}-${slugBase(baseName)}`);
  out.push(String(baseName || ''));
  return [...new Set(out.filter(Boolean))];
}

export interface MigrationInput {
  newId: string;
  baseKey: string;
  legacyIds: string[];
}

export interface MigrationResult<T> {
  overrides: Record<string, T>;
  /** 成功搬遷的舊 id 數 */
  migrated: number;
  /** newId → 來源舊 id */
  from: Record<string, string>;
}

/**
 * 舊 override 遷移：把以舊 id 為鍵的設定搬到新穩定 id 下。
 *
 * 規則（不破壞既有資料 / 鐵律三）：
 *  - 新 id 已存在 → 不動（使用者既有設定優先）
 *  - 依 legacyIds 順序找第一個有資料的舊鍵 → 複製到新 id，並刪除舊鍵
 *  - 找不到 → 由 `getOverride()` 惰性建預設值，行為與舊版一致
 */
export function migrateOverrides<T>(
  overrides: Record<string, T>,
  items: readonly MigrationInput[],
  index: Record<string, string> = {},
): MigrationResult<T> {
  const out: Record<string, T> = { ...(overrides || {}) };
  const from: Record<string, string> = {};
  let migrated = 0;

  for (const it of items) {
    if (!it?.newId) continue;
    if (Object.prototype.hasOwnProperty.call(out, it.newId)) continue;

    const candidates = [...(it.legacyIds || [])];
    const remembered = index[it.baseKey];
    if (remembered && remembered !== it.newId) candidates.unshift(remembered);
    // 索引裡記的舊 id 永遠最優先（上一代實際用過的 id）
    const seen = new Set<string>();
    for (const oldId of candidates) {
      if (!oldId || seen.has(oldId)) continue;
      seen.add(oldId);
      if (oldId === it.newId) continue;
      if (!Object.prototype.hasOwnProperty.call(out, oldId)) continue;
      out[it.newId] = out[oldId];
      delete out[oldId];
      from[it.newId] = oldId;
      migrated++;
      break;
    }
  }

  return { overrides: out, migrated, from };
}
