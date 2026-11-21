// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 波你尼（Pāṇini）外部連聲規則子集——IAST 合成引擎（教學級，純函數、無 Obsidian 依賴）。
 *
 * 依據：Goldman & Sutherland《Devavāṇīpraveśikā》Ch.1–3 sandhi 表；Whitney §120–141；
 * Pāṇini 經號見《Pāṇini連聲規則子集-調研與設計報告》§三。
 *
 * 設計邊界（誠實聲明）：
 *  - 只做「合成」（join）；逆向拆分多對多不可逆，明確不提供。
 *  - 教學子集：罕見細則（visarga 於 ṭ/ṭh、ḥ 於半母音前的變體、Galik）不在表內。
 *  - 輸入為 IAST 詞/短語；空白視為詞界保留（不變對保持分詞書寫）。
 *
 * 回傳 { joined, rule, sūtra }：joined 為合成結果；rule/sūtra 供教學 UI 標註。
 */

export interface SandhiResult {
  joined: string;
  rule: string;
  sūtra: string;
}

/* ---------------- 示範語料（單一真實來源：UI 示範卡與 test/sandhi.mjs 共用） ---------------- */

/** 一條連聲示範：兩詞輸入＋期望合成結果（test 鎖定；UI 卡逐條展示 rule/sūtra）。 */
export interface SandhiDemo {
  first: string;
  second: string;
  expected: string;
}

/**
 * 示範語料（「檢字表的連聲示範卡」）。
 * 全部取自 Goldman《Devavāṇīpraveśikā》經典教學例＋補表，
 * 每條皆由 test/sandhi.mjs 以 `SANDHI_DEMOS` 斷言鎖定——UI 所見即引擎驗證所證。
 */
export const SANDHI_DEMOS: SandhiDemo[] = [
  { first: "rāmaḥ", second: "asti", expected: "rāmo'sti" },        // avagraha（6.1.109）
  { first: "deva", second: "indraḥ", expected: "devendraḥ" },       // a+i→e（guṇa 6.1.87）
  { first: "devāḥ", second: "āgataḥ", expected: "devo'gataḥ" },   // ā 開頭同屬 6.1.109 avagraha
  { first: "tat", second: "dhanam", expected: "taddhanam" },        // t+dh→d dh（8.4.46）
  { first: "duḥ", second: "labha", expected: "durlabha" },          // 8.2.66 非 a 幹→r
  { first: "duḥ", second: "ṭīkā", expected: "duṣṭīkā" },            // 8.4.40 系 ṭ/ṭh→ṣ
];

/** 送氣叢集（兩字符末段優先判定） */
const ASPIRATES = ["kh", "gh", "ch", "jh", "ṭh", "ḍh", "th", "dh", "ph", "bh"];

/** 濁音（含鼻音、半母音、h）——visarga 於此前變 o（-aḥ/-āḥ）或 r（-s） */
const VOICED = new Set(["g", "gh", "j", "jh", "ḍ", "ḍh", "d", "dh", "b", "bh", "n", "m", "y", "r", "l", "v", "h"]);

const isVowelChar = (c: string): boolean =>
  ["a", "ā", "i", "ī", "u", "ū", "ṛ", "ṝ", "ḷ", "ḹ", "e", "ai", "o", "au"].includes(c);

/** first 的末音段：先試兩字符送氣，再試單字符 */
function finalSegment(word: string): string {
  const last2 = word.slice(-2);
  if (ASPIRATES.includes(last2)) return last2;
  if (last2 === "ai" || last2 === "au") return last2; // v0.1.66：雙元音尾段（tau+eva 型）
  return word.slice(-1);
}

/** 將 first 的末段換為 replacement（保持其餘不動） */
function replaceTail(word: string, replacement: string): string {
  const seg = finalSegment(word);
  return word.slice(0, word.length - seg.length) + replacement;
}

/** second 的首音段（用於分類與剝離） */
function initialSegment(word: string): { seg: string; rest: string } {
  const first2 = word.slice(0, 2);
  if (["āi", "au", "ai", "au"].includes(first2) === false && ASPIRATES.includes(first2)) {
    return { seg: first2, rest: word.slice(2) };
  }
  // 兩字符元音 ai/au
  if (["ai", "au"].includes(first2)) return { seg: first2, rest: word.slice(2) };
  return { seg: word.slice(0, 1), rest: word.slice(1) };
}

const isAspirate = (s: string): boolean => ASPIRATES.includes(s);
const isKhaPha = (s: string): boolean => ["k", "kh", "p", "ph"].includes(s);
const isCaCha = (s: string): boolean => s === "c" || s === "ch";

/**
 * 正字連寫規範：
 *  - 命中替換/融合規則 → 正字連寫（去空格）。
 *  - 例外白名單（保留空格）：
 *    ① visarga 未變（8.3.36 khaḥ/paḥ 類：形未變，詞界自然在）；
 *    ② noChange（無規則適用，誠實呈現未合成）。
 */
const KEEP_SPACE_RULES = [
  "-as + k/kh/p/ph → aḥ",
  "無適用規則（保留詞界）",
  // saḥ/eṣaḥ 省略 visarga 後母音斷裂（hiatus，sa icchati/nara icchati 型）——規範保留空格
  "saḥ/eṣaḥ + 非 a → 省略 visarga",
];

/** B7：空串守衛——sandhiJoin('','') 不再得出孤兒空格；空 + 實詞＝實詞原樣、
 * 實詞 + 空＝實詞原樣（replaceTail 對空串也會拼出孤兒 replacement，同守衛承擔）。 */
export function sandhiJoin(first: string, second: string): SandhiResult {
  const f0 = typeof first === "string" ? first : "";
  const s0 = typeof second === "string" ? second : "";
  if (!f0.trim() && !s0.trim()) {
    return { joined: "", rule: "無適用規則（保留詞界）", sūtra: "—" };
  }
  if (!f0.trim()) return { joined: s0.trim(), rule: "無適用規則（保留詞界）", sūtra: "—" };
  if (!s0.trim()) return { joined: f0.trim(), rule: "無適用規則（保留詞界）", sūtra: "—" };
  const r = sandhiJoinRaw(f0, s0);
  if (KEEP_SPACE_RULES.includes(r.rule)) return r;
  return { ...r, joined: r.joined.replace(/ +/g, "") };
}

/** 原始合成（規範化前）。任何未命中規則的組合 → 保守拼接（保留詞界或不變直連）。 */
function sandhiJoinRaw(first: string, second: string): SandhiResult {
  const f = first.trimEnd();
  const sec = initialSegment(second.trimStart());
  const seg = finalSegment(f);
  const noChange = (): SandhiResult => ({
    joined: f + " " + second.trimStart(),
    rule: "無適用規則（保留詞界）",
    sūtra: "—",
  });

  /* ---- 元音結尾 ---- */
  if (isVowelChar(seg) && ["a", "ā"].includes(seg)) {
    const v0 = sec.seg;
    if (isVowelChar(v0)) {
      if (v0 === "a" || v0 === "ā") {
        return { joined: replaceTail(f, "ā") + sec.rest, rule: "a/ā + a/ā → ā", sūtra: "6.1.101" };
      }
      if (v0 === "i" || v0 === "ī") {
        return { joined: replaceTail(f, "e") + sec.rest, rule: "a/ā + i/ī → e（guṇa）", sūtra: "6.1.87" };
      }
      if (v0 === "u" || v0 === "ū") {
        return { joined: replaceTail(f, "o") + sec.rest, rule: "a/ā + u/ū → o（guṇa）", sūtra: "6.1.87" };
      }
      if (v0 === "ṛ" || v0 === "ṝ") {
        return { joined: replaceTail(f, "ār") + sec.rest, rule: "a/ā + ṛ/ṝ → ār", sūtra: "6.1.113" };
      }
      if (v0 === "ḷ") {
        return { joined: replaceTail(f, "āl") + sec.rest, rule: "a/ā + ḷ → āl", sūtra: "6.1.113" };
      }
      if (v0 === "e" || v0 === "ai") {
        return { joined: replaceTail(f, "ai") + sec.rest, rule: "a/ā + e/ai → ai（vṛddhi）", sūtra: "6.1.88" };
      }
      if (v0 === "o" || v0 === "au") {
        return { joined: replaceTail(f, "au") + sec.rest, rule: "a/ā + o/au → au（vṛddhi）", sūtra: "6.1.88" };
      }
    }
    return noChange();
  }

  if (seg === "e" || seg === "o") {
    if (isVowelChar(sec.seg)) {
      if (sec.seg === "a" || sec.seg === "ā") {
        // e/o + a → e ' / o '（avagraha）
        return {
          joined: f + " '" + sec.rest,
          rule: "e/o + a → e '/o '（avagraha）",
          sūtra: "6.1.109",
        };
      }
      // 6.1.78 eco'yavāyāvaḥ（連聲章 64 句）：e/o + 異元音 → ay/av；
      // ai/au + 元音 → āy/āv（6.1.79/78 ād gitvarau）。
      if (seg === "e") {
        return { joined: replaceTail(f, "ay") + second.trimStart(), rule: "e + 異元音 → ay（yaṇ）", sūtra: "6.1.78" };
      }
      return { joined: replaceTail(f, "av") + second.trimStart(), rule: "o + 異元音 → av（yaṇ）", sūtra: "6.1.78" };
    }
    return noChange();
  }
  if (seg === "ai" || seg === "au") {
    if (isVowelChar(sec.seg)) {
      // 6.1.78（連聲章 64 句 tau + eva = tāveva）：ai/au + 元音 → āy/āv
      return {
        joined: replaceTail(f, seg === "ai" ? "āy" : "āv") + second.trimStart(),
        rule: "ai/au + 元音 → āy/āv（yaṇ 長形）",
        sūtra: "6.1.78",
      };
    }
    return noChange();
  }

  if (seg === "i" || seg === "ī") {
    if (isVowelChar(sec.seg)) {
      if (sec.seg === "i" || sec.seg === "ī") {
        return { joined: replaceTail(f, "ī") + sec.rest, rule: "i/ī + i/ī → ī（savarṇadīrgha）", sūtra: "6.1.101" };
      }
      // yaṇ：i → y（次元音保留）
      return { joined: replaceTail(f, "y") + second.trimStart(), rule: "i/ī + 異元音 → y（yaṇ）", sūtra: "6.1.77" };
    }
    return noChange();
  }
  if (seg === "u" || seg === "ū") {
    if (isVowelChar(sec.seg)) {
      if (sec.seg === "u" || sec.seg === "ū") {
        return { joined: replaceTail(f, "ū") + sec.rest, rule: "u/ū + u/ū → ū（savarṇadīrgha）", sūtra: "6.1.101" };
      }
      return { joined: replaceTail(f, "v") + second.trimStart(), rule: "u/ū + 異元音 → v（yaṇ）", sūtra: "6.1.77" };
    }
    return noChange();
  }
  if (seg === "ṛ" || seg === "ṝ") {
    if (isVowelChar(sec.seg)) {
      return { joined: replaceTail(f, "r") + second.trimStart(), rule: "ṛ/ṝ + 異元音 → r（yaṇ）", sūtra: "6.1.77" };
    }
    return noChange();
  }

  /* ---- visarga / -s 結尾 ---- */
  if (seg === "ḥ" || seg === "s") {
    const endsInA = /aḥ$|āḥ$/.test(f) && seg === "ḥ";
    const aStem = /a$|ā$/.test(f.slice(0, -1)); // a/ā 幹（ḥ 或 s 結尾皆判）
    const v0 = sec.seg;
    // saḥ/eṣaḥ 例外（Whitney §176；trikashaivism 第 10 規）：這兩個代詞在
    // 非 a 的一切音前省略 visarga（sa icchati、eṣa paśyati、sa āgataḥ）；
    // +a 仍走下方 endsInA → o ' 常規路徑（so 'sti）。
    if (seg === "ḥ" && v0 !== "a" && /^(sa|eṣa)ḥ$/.test(f)) {
      return {
        joined: f.slice(0, -1) + " " + second.trimStart(),
        rule: "saḥ/eṣaḥ + 非 a → 省略 visarga",
        sūtra: "Whitney §176",
      };
    }
    // 後接元音
    if (isVowelChar(v0)) {
      if (seg === "ḥ" && endsInA && (v0 === "a" || v0 === "ā")) {
        // （devo āgataḥ 訂正）：ā 開頭與 a 開頭同屬 6.1.109
        // eṅḥ padāntādati——o（devaḥ 的元音前變體）+ a/ā 開頭一律 avagraha
        // 黏合（devaḥ + āgataḥ → devo 'gataḥ），不分寫。此前僅收 a、ā 走
        // 8.2.66 分寫，不合正字。
        return {
          joined: f.slice(0, -2) + "o '" + sec.rest,
          rule: v0 === "a" ? "-aḥ/-āḥ + a → o '（avagraha）" : "-aḥ/-āḥ + ā → o '（avagraha）",
          sūtra: "6.1.109",
        };
      }
      if (v0 === "a") {
        if (seg === "ḥ" && endsInA) {
          return {
            joined: f.slice(0, -2) + "o '" + sec.rest,
            rule: "-aḥ/-āḥ + a → o '（avagraha）",
            sūtra: "6.1.109",
          };
        }
        if (seg === "s") {
          return {
            joined: f.slice(0, -2) + "o '" + sec.rest,
            rule: "-as + a → o '（avagraha）",
            sūtra: "8.2.66＋6.1.109",
          };
        }
        return noChange(); // iḥ/uḥ/eḥ… + a：教學子集不變
      }
      if (seg === "ḥ" && endsInA) {
        return {
          joined: f.slice(0, -2) + "o " + second.trimStart(),
          rule: "-aḥ/-āḥ + 濁元音 → o",
          sūtra: "8.2.66",
        };
      }
      if (seg === "s" && v0 === "h") {
        // 6.1.114 haśi ca（連聲章 90 句）：-as + h 開頭（haś 對攝）
        // → u 替 ru → o（devas + vandyaḥ → devo vandyaḥ、manas + haram → manoharam）。
        // 非 a 幹的 -ḥ + h 仍走下方 r 路徑（8.2.66）。
        return {
          joined: replaceTail(f, "o") + " " + second.trimStart(),
          rule: "-as + h → o（haśi ca）",
          sūtra: "6.1.114",
        };
      }
      if (seg === "s") {
        return {
          joined: replaceTail(f, "r") + " " + second.trimStart(),
          rule: "-as + 濁元音 → r",
          sūtra: "8.2.66",
        };
      }
      return noChange();
    }
    // 後接輔音
    if (isCaCha(v0)) {
      return {
        joined: replaceTail(f, "ś") + " " + second.trimStart(),
        rule: "-s/-ḥ + c/ch → ś",
        sūtra: "8.4.40",
      };
    }
    if (v0 === "ṭ" || v0 === "ṭh") {
      // Whitney §175／learnsanskrit.org visarga 全表：visarga 於 ṭ/ṭh 前
      // 回歸同部位噝音 ṣ（duḥ + ṭīkā → duṣṭīkā；saṣṭha 型）。
      return {
        joined: replaceTail(f, "ṣ") + " " + second.trimStart(),
        rule: "-s/-ḥ + ṭ/ṭh → ṣ",
        sūtra: "8.4.40 系",
      };
    }
    if (v0 === "t" || v0 === "th") {
      // Whitney §175：visarga 於 t/th（自身類的清塞音）前回歸 s。
      // 【糾偏】舊實作誤把 t/th 當「保留 ḥ」情境（8.3.36 khasoḥ 只涵蓋
      // k/kh/p/ph），t/th 前實爲同類回歸 s（tat + tasya → sat tasya 型）。
      return {
        joined: replaceTail(f, "s") + " " + second.trimStart(),
        rule: "-s/-ḥ + t/th → s",
        sūtra: "8.4.40 系",
      };
    }
    if (isKhaPha(v0)) {
      if (seg === "s") {
        return {
          joined: replaceTail(f, "ḥ") + " " + second.trimStart(),
          rule: "-as + k/kh/p/ph → aḥ",
          sūtra: "8.3.36",
        };
      }
      return noChange(); // ḥ 於 k/kh/p/ph 前保留（8.3.36 khasoḥ）
    }
    if (VOICED.has(v0) || (isAspirate(v0) && ["gh", "jh", "ḍh", "dh", "bh"].includes(v0))) {
      if (seg === "ḥ" && endsInA) {
        return {
          joined: f.slice(0, -2) + "o " + second.trimStart(),
          rule: "-aḥ/-āḥ + 濁輔音 → o",
          sūtra: "8.2.66",
        };
      }
      if (seg === "ḥ") {
        // 【補表】非 a 幹的 visarga 於濁音前 → r（8.2.66；duḥ + labha → dur labha、
        // duḥ + jana → dur jana 型，Wikipedia「duḥ-labha > durlabha」引證）。
        return {
          joined: replaceTail(f, "r") + " " + second.trimStart(),
          rule: "-ḥ（非 a 幹）+ 濁輔音 → r",
          sūtra: "8.2.66",
        };
      }
      if (seg === "s" && aStem) {
        // 6.1.113/114（連聲章 89/90 句）：a/ā 幹 -as + 濁輔音，
        // 短 a 前 ru→u → o（devas + vandyaḥ → devo vandyaḥ、jyotis? 非例外）。
        return {
          joined: f.slice(0, -2) + "o " + second.trimStart(),
          rule: "-as + 濁輔音 → o（a 幹，6.1.113/114）",
          sūtra: "6.1.113",
        };
      }
      if (seg === "s") {
        return {
          joined: replaceTail(f, "r") + " " + second.trimStart(),
          rule: "-as + 濁輔音 → r",
          sūtra: "8.2.66",
        };
      }
    }
    return noChange(); // ḥ 於濁輔音前（非 -aḥ/-āḥ）保留；t/th 前不變
  }

  /* ---- m 結尾 ---- */
  if (seg === "m" && !isVowelChar(sec.seg)) {
    return {
      joined: replaceTail(f, "ṃ") + " " + second.trimStart(),
      rule: "m + 輔音 → anusvāra",
      sūtra: "8.3.23",
    };
  }

  /* ---- n + l ---- */
  if (seg === "n" && sec.seg === "l") {
    return {
      joined: replaceTail(f, "l") + " " + second.trimStart(),
      rule: "n + l → l l",
      sūtra: "8.4.45",
    };
  }

  /* ---- t/d 結尾（含 th/dh 末段的單字符情境）---- */
  if ((seg === "t" || seg === "d") && !isVowelChar(sec.seg)) {
    if (sec.seg === "dh") {
      return {
        joined: replaceTail(f, "d") + " " + second.trimStart(),
        rule: "t/d + dh → d dh",
        sūtra: "8.4.46",
      };
    }
    if (sec.seg === "ś") {
      // 查證（sanskrit-trikashaivism 連聲表）：t + ś = cch → tacchīlam
      return {
        joined: replaceTail(f, "c") + "ch" + sec.rest,
        rule: "t/d + ś → cch",
        sūtra: "8.4.54 系",
      };
    }
    if (sec.seg === "j" || sec.seg === "jh") {
      // 8.4.53 jhalāṃ jaś jhaśi（連聲章 110 句）：jhal + jhaś → jaś，
      // d→j 連寫（tad + jñānam → tajjñānam）。
      return {
        joined: replaceTail(f, "j") + second.trimStart(),
        rule: "t/d + j/jh → j 連寫（8.4.53）",
        sūtra: "8.4.53",
      };
    }
    if (isCaCha(sec.seg)) {
      // 8.4.40/8.4.53（連聲章 102/110 句）＋ 8.4.55 連寫：t/d + c/ch →
      // 替換後同化連寫 cc（sat + cit → saccit、tad + citraṃ → taccitraṃ）。
      // 正字一律連寫（saccit/taccitraṃ），不走教學分寫。
      return {
        joined: replaceTail(f, "c") + second.trimStart(),
        rule: "t/d + c/ch → c 連寫（8.4.40→8.4.53→8.4.55）",
        sūtra: "8.4.40",
      };
    }
  }

  /* ---- 預設：塞音 + 元音 等直接連寫（如 tat + asti → tatasti）---- */
  if (!isVowelChar(seg) && isVowelChar(sec.seg)) {
    return {
      joined: f + second.trimStart(),
      rule: "詞尾輔音 + 元音 → 直連（連聲不變）",
      sūtra: "—",
    };
  }

  return noChange();
}
