// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 蒙古文輸入法引擎——對外主入口。
 *
 * 完整資料流：
 *
 *   拉丁輸入 "monggol"
 *      ↓ zcode-engine.latinToKeyColSeqs（上下文規則：元音和諧 / 詞尾音變 / debisger）
 *   [鍵, 欄] 序列
 *      ↓ glyph-map.keyColSeqToStandard（欄位 → 標準字母 + FVS）
 *   標準蒙古文 Unicode 候選（Noto Sans Mongolian 可正確渲染）
 *      ↓ 排序（辭典優先 + 元音和諧 + FVS 最少）
 *   上屏候選清單
 *
 * **完全依賴 Noto Sans Mongolian（OFL-1.1）。**
 *
 * 純函數模組，無 Obsidian 依賴。
 */

import { latinToKeyColSeqs, lookupDict, isZCodeKey, type KeyColUnit } from "./zcode-engine";
import {
  keyColSeqToStandard,
  glyphToStandardUnicode,
  isZCodeGlyph,
  isStandardMongolian,
  stripFvs,
} from "./glyph-map";
import { applyOrthography, countFvs } from "./orthography";

/** 一個輸入法候選 */
export interface ImeCandidate {
  /** 標準蒙古文 Unicode 字串 */
  text: string;
  /** 來源：dict（整詞字典）/ rule（規則生成） */
  source: "dict" | "rule";
  /** 排序分數（越高越前） */
  score: number;
  /** 是否含 FVS（用於 UI 標示） */
  hasFvs: boolean;
  /** 對應的 [鍵, 欄] 序列（供偵錯與精確重現） */
  units: ReadonlyArray<KeyColUnit>;
}

/** 元音：陽性 / 陰性 / 中性（i） */
const VOWEL_POSITIVE = new Set([0x1820, 0x1823, 0x1825]); // a o ö
const VOWEL_NEGATIVE = new Set([0x1821, 0x1824, 0x1826]); // e u ü

/** 檢驗元音和諧：一個詞內不應混用陽性與陰性元音（i 中性，可兩屬） */
export function checkVowelHarmony(text: string): boolean {
  let sawPositive = false;
  let sawNegative = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (VOWEL_POSITIVE.has(cp)) sawPositive = true;
    else if (VOWEL_NEGATIVE.has(cp)) sawNegative = true;
  }
  return !(sawPositive && sawNegative);
}

/**
 * 核心轉換：拉丁輸入 → 標準蒙古文 Unicode 候選清單。
 *
 * @param latin 拉丁輸入（如 "monggol"）
 * @returns 去重並排序後的候選清單（輸入非法時返回空陣列）
 */
export function latinToMongolian(latin: string): ImeCandidate[] {
  const input = latin.trim();
  if (!input) return [];

  const candidates: ImeCandidate[] = [];
  const seen = new Set<string>();

  // ① 整詞字典優先（專有名詞／縮寫）
  //
  // ⚠️ 字典值為 ZCode 字形碼位（含構形段），無法直接套用路徑 B 完整還原。
  //    策略：字典命中時**仍走規則引擎**產生正確的標準 Unicode，但給予最高分，
  //    確保字典詞排在首位。若規則引擎無輸出，才退回字形就近還原。
  const dictHit = lookupDict(input);
  if (dictHit) {
    const seqs = latinToKeyColSeqs(input);
    if (seqs.length > 0) {
      const raw = keyColSeqToStandard(seqs[0].map((u) => [u.key, u.col] as const));
      const text = applyOrthography(raw);
      if (text) {
        seen.add(text);
        candidates.push({ text, source: "dict", score: 1000, hasFvs: countFvs(text) > 0, units: seqs[0] });
      }
    }
    if (candidates.length === 0) {
      const text = glyphToStandardUnicode(dictHit);
      if (text) {
        seen.add(text);
        candidates.push({ text, source: "dict", score: 1000, hasFvs: countFvs(text) > 0, units: [] });
      }
    }
  }

  // ② 規則生成
  for (const seq of latinToKeyColSeqs(input)) {
    const raw = keyColSeqToStandard(seq.map((u) => [u.key, u.col] as const));
    // 正字法校正：ng 連寫合流 + 冗餘 FVS 清理
    const text = applyOrthography(raw);
    if (!text || seen.has(text)) continue;
    seen.add(text);

    let score = 100;
    if (checkVowelHarmony(text)) score += 50;
    score -= countFvs(text) * 2;

    candidates.push({ text, source: "rule", score, hasFvs: countFvs(text) > 0, units: seq });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/** 只取首選（自動上屏用） */
export function latinToMongolianBest(latin: string): string {
  const list = latinToMongolian(latin);
  return list.length > 0 ? list[0].text : latin;
}

/**
 * 判斷輸入是否為「可轉換的蒙古文拉丁輸入」。
 * 條件：全部字元都是 ZCode 定義的鍵，且含至少一個字母。
 *
 * ⚠️ 這只是「鍵位合法性」——`the`、`hello` 同樣通過。
 *    供**用戶主動觸發的命令**使用（用戶已表明意圖）。
 *    即時上屏必須改用 looksLikeMongolianSyllable()。
 */
export function looksLikeMongolianLatin(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  for (const ch of t) if (!isZCodeKey(ch)) return false;
  return /[a-zA-Z]/.test(t);
}

/** 蒙古文拉丁輸入中的元音鍵（a e i o u 及 ZCode 對應的 ö ü） */
const IME_VOWEL_KEYS = new Set(["a", "e", "i", "o", "u", "v", "w"]);

/** 蒙古文音節允許的輔音叢（音節首）。非此列的連續輔音視為非蒙古文。 */
const ONSET_CLUSTERS = new Set([
  "b", "d", "g", "k", "l", "m", "n", "r", "s", "t", "y", "c", "j", "z",
  "ng", "ch", "sh", "zh", "kh", "gh", "ts", "dz", "hw",
]);

/**
 * 判斷羅馬字是否「像蒙古文詞」（即時上屏專用門禁，比 looksLikeMongolianLatin 嚴格）。
 *
 * 只檢查鍵位會讓英文誤觸（the / hello / test 皆通過）。本函式追加
 * **音節結構**與**元音和音**兩道判準，把英文常用詞擋在門外：
 *   1. 必須含元音鍵（英文中的 the/hello 含 e/o，本條不足，需配合 2、3）。
 *   2. 不得出現「非蒙古文音節首叢」——蒙古文音節首輔音叢受限（如 ng/ch/sh/kh）。
 *      `-tst`（test）、`-ll`（hello 首）等非法叢直接拒絕。
 *   3. 詞尾必須是合法收尾（元音、或蒙古文允許的單輔音 / 複輔音尾）。
 *      `hello` 的 `-llo` 合法，故再以 4 兜底。
 *   4. 轉寫結果必須通過元音和（checkVowelHarmony）——同詞不得陰陽元音混雜。
 *      `hello`（e 陰 + o 陽）在此被拒；`the`（e + 無後續元音）由 2/3 拒。
 *
 * 保守取向：寧可漏轉（用戶改按命令），不可誤轉（靜默毀掉英文正文）。
 */
export function looksLikeMongolianSyllable(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return false;      // 單字母不觸發即時轉換
  if (t.length > 24) return false;     // 蒙古文詞罕有超長
  if (!/^[a-z]+$/.test(t)) return false;

  // 1. 必含元音
  let vowelCount = 0;
  for (const ch of t) if (IME_VOWEL_KEYS.has(ch)) vowelCount++;
  if (vowelCount === 0) return false;

  // 2. 元音不得佔比過低（英文長輔音串的典型特徵）
  if (vowelCount / t.length < 0.28) return false;

  // 3. 音節首 / 音節間輔音叢必須可解析：逐段掃描連續輔音串
  let run = "";
  for (const ch of t) {
    if (IME_VOWEL_KEYS.has(ch)) {
      if (run.length >= 4) return false;          // 四連輔音：非蒙古文
      if (run.length === 3) {
        // 三連輔音僅在含 ng/ch/sh 這類二合字母時可接受
        let ok = false;
        for (const c of ONSET_CLUSTERS) {
          if (c.length === 2 && run.includes(c)) { ok = true; break; }
        }
        if (!ok) return false;
      }
      if (run.length === 2 && !ONSET_CLUSTERS.has(run)) {
        // 二連輔音若不在允許表內，僅在蒙古文常見的「鼻音+同部位」組合下放行
        if (!/^(mb|mp|nd|nt|ng|nk|rg|lg|lb|ld|rd|rs|ns|ms|bs|gs|ds|js|ys|wl|wr)$/.test(run)) {
          return false;
        }
      }
      run = "";
    } else {
      run += ch;
    }
  }
  // 4. 詞尾輔音：只允許蒙古文常見單輔音或 ng/l/r/s/d/g/n/m/b
  if (run.length >= 3) return false;
  if (run.length === 2 && !/^(ng|gs|ds|bs|ns|ms|ls|rs|ys)$/.test(run)) return false;
  if (run.length === 1 && !/[bdgklmnrstyz]/.test(run)) return false;

  // 5. 元音和：轉寫結果不得陰陽混雜
  const converted = latinToMongolianBest(t);
  if (!converted || converted === t) return false;
  if (!containsStandardMongolian(converted)) return false;
  if (!checkVowelHarmony(converted)) return false;

  return true;
}

/**
 * 即時上屏最終門禁：**首字母大寫哨兵** + 音節合法性。
 *
 * 為何需要哨兵：`when`、`like`、`time`、`data`、`file`、`user` 等短英文詞
 * 在音節結構上與蒙古文完全同構（CV-CV），純拼寫規則無法區分——
 * 這是語言的客觀重疊，不是實作缺陷。因此改以「用戶顯式意圖」為判準。
 *
 * 使用方式（在編輯器中）：
 *   Monggol␣   → ᠮᠣᠩᠭᠣᠯ      （首字母大寫 = 我要蒙文）
 *   monggol␣   → monggol     （全小寫 = 保持原樣，不轉）
 *   The file   → The file    （英文正文完全不受影響）
 *
 * 蒙古文本身無大小寫，故大寫字母不承載語義，作為觸發哨兵零成本。
 * 句首英文詞（如 "Time is..."）仍可能誤觸——此為哨兵法固有代價，
 * 用戶可用 Esc 撤銷，或在設定中關閉即時上屏。
 */
export function looksLikeMongolianSyllableTriggered(text: string): boolean {
  const raw = text.trim();
  if (raw.length < 2) return false;
  // 首字母必須為大寫 ASCII（哨兵）；其餘必須為小寫字母
  if (!/^[A-Z][a-z]+$/.test(raw)) return false;
  return looksLikeMongolianSyllable(raw.toLowerCase());
}

/** 文字中是否含 ZCode 字形碼位（用於提示「這是舊編碼」） */
export function containsZCodeGlyphs(text: string): boolean {
  for (const ch of text) if (isZCodeGlyph(ch)) return true;
  return false;
}

/** 文字中是否含標準蒙古文 Unicode */
export function containsStandardMongolian(text: string): boolean {
  for (const ch of text) if (isStandardMongolian(ch)) return true;
  return false;
}

/**
 * 將「ZCode 字形編碼」文字就地升級為「標準蒙古文 Unicode」。
 *
 * 用途：把舊資料（或自 ZCode 輸入法複製的內容）轉為標準編碼，
 *       使其能在 Noto Sans Mongolian 下正確渲染。
 *
 * ⚠️ 無原始拉丁輸入時只能「就近還原」（見 glyph-map §路徑 B）；
 *    構形段無法單獨還原，可能造成個別字母缺失。精確轉換請重打一次。
 */
export function zcodeGlyphsToStandardUnicode(text: string): string {
  let out = "";
  let buf = "";
  for (const ch of text) {
    if (isZCodeGlyph(ch)) {
      buf += ch;
    } else {
      if (buf) {
        out += glyphToStandardUnicode(buf);
        buf = "";
      }
      out += ch;
    }
  }
  if (buf) out += glyphToStandardUnicode(buf);
  return out;
}

/** 輸出「無 FVS 的乾淨文字」（用於搜尋、比對、索引） */
export function toCleanMongolian(text: string): string {
  return stripFvs(text);
}
