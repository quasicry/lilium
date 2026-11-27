// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * Ali Gali 借音字母（Mongolian / Manchu，U+1885–U+18AA）轉寫映射。
 *
 * Ali Gali 是蒙古文 / 滿文用來轉寫梵文、藏文借詞的專用字母。本插件將其映射到其
 * 「來源文字的羅馬轉寫」——梵文借詞 → IAST，少數藏文來源（AH/ZHA/ZA 等）→ 藏文 Wylie，
 * 與本插件梵文、藏文方案一致，不另立符號。
 *
 * 作用場景：在蒙古文 / 滿文文本中轉寫咒語 / 佛典借詞時，把 Ali Gali 字母標注或轉爲
 * 對應的梵/藏羅馬字，方便閱讀與校對。裝飾性符號（baluda / dagalga）無單一羅馬對應，
 * 採原樣保留，不臆造。
 *
 * 純函數、無 Obsidian 依賴；不拋未捕獲異常。
 */

import { hasAliGali, ALI_GALI_RANGE } from "./manchu";
import { registerScheme, type CharTableEntry, type TransliterationScheme, type TransliterationOptions } from "./translit-common";
import { ALI_GALI_SYLLABLE_TO_ROMAN } from "./aligali-syllables";

const cp = (n: number): string => String.fromCodePoint(n);

/**
 * 音節表 → 最長匹配查詢。Ali Gali 轉寫是音節級：
 * 輔音（Ali Gali 字母或帶 FVS1 的蒙古基字）＋元音組合（ka=ᢉᠠ᠋、kha=ᠻᠠ᠋、i=ᢈ、
 * o=ᠣᠸᠠ……）。純碼位級映射會讓蒙古基字在借詞中原樣透傳（實錘）。
 */
const SYLLABLE_MAP = new Map<string, string>(ALI_GALI_SYLLABLE_TO_ROMAN);

/** 蒙古文數字與 Ali Gali 常見標點 */
const AG_DIGIT_PUNCT: Record<number, string> = {
  0x1810: "0", 0x1811: "1", 0x1812: "2", 0x1813: "3", 0x1814: "4",
  0x1815: "5", 0x1816: "6", 0x1817: "7", 0x1818: "8", 0x1819: "9",
  0x1802: ".", 0x1803: ".",
};

/**
 * 蒙古文基字在 Ali Gali 借詞中的梵音值（語料樣本句逐碼位實錘：anirodham＝
 * ᠠᠨᢈᠷᠣᠸᠠᢑᠾᠠᠮ，輔音基字＝輔音成分、元音基字＝元音值，音節由序列自然組合）。
 * 僅補音節表未覆蓋的裸碼位；帶 FVS1 的音節形由 SYLLABLE_MAP 最長匹配優先命中。
 */
const AG_BASE_CHAR_TO_ROMAN: Record<number, string> = {
  // 元音
  0x1820: "a",          // ᠠ A（借詞中恆讀 a 樣本句；表中 ô 為近似音欄，不採）
  0x1822: "i",          // ᠢ I（ᠢᠢ 雙寫＝ī，音節表命中）
  0x1823: "u",          // ᠣ O 的裸形（u+v 複合 o 由音節表 ᠣᠸᠠ 命中）
  0x1824: "u",          // ᠤ U（ᠤᠦ 雙寫＝ū，音節表命中）
  0x1826: "u",          // ᠦ Ü
  0x1827: "e",          // ᠧ E
  // 輔音（蒙古文標準基字在借詞中的梵音成分）
  0x1828: "n", 0x182a: "b", 0x182e: "m", 0x182f: "l", 0x1830: "s",
  0x1831: "ś",          // ᠱ SHA（梵 ś）
  0x1832: "t",          // ᠲ TADA（tha 音節由表命中 ᠲᠠ᠋；裸形 t）
  0x1836: "y", 0x1837: "r", 0x1838: "v", 0x1839: "ph",
  0x183a: "g", 0x183b: "kh", 0x183c: "ch",
  0x1834: "ch",         // ᠴ CHA——Ali Gali 借音欄 ch（L2/17-333 usage 欄＋L2/16-258：
                        // 藏 ཚ tsha；蒙文本文讀 č，AG 借音值 ch，補映射）
  0x183e: "h",          // ᠾ CHIHI（梵 h 變體）
  0x183d: "j",          // ᠽ MONGOLIAN LETTER ZA——蒙文基本區 za 字借作梵 j（借音體例）；
                        // U+183D 低於 ALI_GALI_RANGE，故入本表走步驟 2.6 路徑。
                        // 21244 表2 權威（查證《同文韻統》乾隆刻本）。
                        // aksh 語料舊值 ja=1896 已棄（aksh 自承 not yet verified），
                        // 音節 ja 已改 183D+ᠠ᠋；1896 歸位 za（見下）。
  0x1859: "h",          // ᡙAli Gali HA
};
/** roman → native 音節反查表（同表反向；鍵長降序保證「ka」先於「k」命中） */
const ROMAN_TO_SYLLABLE: Array<[string, string]> = buildR2STable();
/** Todo/專碼位優先反查表（面板 agBackForm='todo' 用；②類殘留收口） */
// Todo 專碼位覆蓋（全方案碼位級往返掃描②類：Todo/AG 專碼位字典形 vs 引擎蒙古基字形）
const TODO_OVERRIDE: Record<string, string> = {
  "e": "\u{1844}", "i": "\u{1845}", "o": "\u{1846}", "u": "\u{1849}",
  "ć": "\u{1852}", "c": "\u{1853}", "j": "\u{185C}", "ḥ": "\u{1882}",
  "ṭ": "\u{188C}", "d": "\u{1898}", "t": "\u{18A0}", "ṣ": "\u{18A2}",
  "zh": "\u{18A4}", "z": "\u{18A5}", "y": "\u{18A7}", "a": "\u{1887}",
};
const ROMAN_TO_SYLLABLE_TODO: Array<[string, string]> = (() => {
  const arr = buildR2STable().map(([rom, nat]) => {
    const ov = TODO_OVERRIDE[rom];
    return ov ? ([rom, ov] as [string, string]) : ([rom, nat] as [string, string]);
  });
  return arr;
})();
function buildR2STable(): Array<[string, string]> {
  const arr = ALI_GALI_SYLLABLE_TO_ROMAN.map(([nat, rom]) => [rom, nat] as [string, string]);
  // ḵ 別名鍵（對 U+1881 裸形的異體標寫；輸出端統一 ḥ，輸入端兩鍵均收）
  const i = arr.findIndex(([rom]) => rom === "ḥ");
  if (i >= 0) arr.push(["ḵ", arr[i][1]]);
  arr.sort((a, b) => b[0].length - a[0].length);
  return arr;
}

/** Ali Gali 碼位 → IAST（梵文來源羅馬字）；undefined 表示裝飾符號，原樣保留 */
const ALI_GALI_TO_IAST: Record<number, string> = {
  // ── 符號類（U+1880–U+1884，後補入；舊版起於 U+1885 而漏掉這五個）──
  // U+1880 ANUSVARA ONE = 藏文 sna ldan（U+0F83）→ 梵文隨鼻符 ṃ
  0x1880: "ṃ",
  // U+1881 VISARGA ONE = 藏文 rnam bcad（U+0F7F）→ 梵文止韻 ḥ
  0x1881: "ḥ",
  // U+1882 DAMARU（→ 藏 lce tsa can U+0F88）、U+1883 UBADAMA、
  // U+1884 INVERTED UBADAMA（→ 藏 mchu can U+0F89）：visarga（rnam bcad）的
  // 形體變體——L2/17-333 usage 欄「AG ḥ」＋L2/16-258 同源定性，映射 ḥ
  // （與 1881 同值；非無讀音裝飾符，修正舊「原樣保留」定性）。
  0x1882: "ḥ", 0x1883: "ḥ", 0x1884: "ḥ",
  // 輔音字母＝輔音成分（indic 體例；樣本句 ᢑᠾᠠ=dha 實錘：ᢑ=dh、ᠾ=h）；
  // 帶元音的音節形（ka=ᢉᠠ᠋ 等）由 SYLLABLE_MAP 最長匹配優先命中。
  0x1887: "a", 0x1888: "i", 0x1889: "k", 0x188a: "ṅ", 0x188b: "c",
  0x188c: "ṭ", 0x188d: "ṭh", 0x188e: "ḍ", 0x188f: "ṇ", 0x1890: "t",
  0x1891: "d", 0x1892: "p", 0x1893: "ph", 0x1894: "ṣ", 0x1895: "zh",
  // 1893 PHA＝182B PA 的風格變體、「not used in Ali Gali」（L2/17-333 實錘）——
  // AG 借音經 1839 FA=ph；本值為老借詞體例存留（檢字表注解同步）。
  // 1896 za／1898 d／1899 z（裁定，21244 表2/表3 權威）：官名 ZA/TODO TA/TODO ZHA
  // 為「來源字形名」——藏 ཟ za 專碼位／托忒 ta 字借作 d／托忒 zha 字借作 z（借音體例，
  // 同 183C tsa 借作 ć）。aksh 語料舊值 ja/t/zh 自承「not yet verified」；aksh 音節表
  // ja=1896 已同步改 ja=183D 形（見 aligali-syllables.ts）。
  0x1896: "za", 0x1897: "aḥ", 0x1898: "d", 0x1899: "z", 0x189a: "gh",
  0x189b: "ṅ", 0x189c: "c", 0x189d: "jh", 0x189e: "ṭ", 0x189f: "ḍh",
  0x18a0: "t", 0x18a1: "d", 0x18a2: "ṣ", 0x18a3: "cy", 0x18a4: "zh",
  0x18a5: "z", 0x18a6: "u", 0x18a7: "y", 0x18a8: "bh", 0x18aa: "lh",
  // Todo / 蒙古基字借音形單字形補列（21244 表2/表3 逐值實錘）：
  // 0x1843 TODO LONG VOWEL SIGN——21244 表3 標「:」，非字母（16331 §2 側註：
  // 「not a letter, but a diacritic mark」）→ 標記原樣保留。
  0x1843: "",
  // Todo Ali Gali 元音（表3：e=1844、i=1845、o=1846、u=1849）
  0x1844: "e", 0x1845: "i", 0x1846: "o", 0x1849: "u",
  // Hudum 字母表單字形補缺（表2 實錘，此前 n2r 原樣透傳）：
  0x184f: "m",          // M（借音 m 專形）
  0x1850: "ŧ",          // THA
  0x1855: "y",          // YA
  0x185b: "ñ",          // ÑA（《同文韻統》尼音）
  // Todo Ali Gali 輔音（表3：ć=1852、c=1853、j=185C）
  0x1852: "ć", 0x1853: "c", 0x185c: "j",
  // 裝飾符號：無單一羅馬對應，標記爲空（原樣保留）
  0x1885: "", 0x1886: "", 0x18a9: "",
};

/** Ali Gali 碼位 → 藏文 Wylie（藏文來源者；其餘借用梵文 IAST 即可，此表僅補藏文來源） */
const ALI_GALI_TO_WYLIE: Record<number, string> = {
  // 藏文同源符號：sna ldan → Wylie 隨鼻符 M；rnam bcad → Wylie 止韻 H
  0x1880: "M", 0x1881: "H",
  0x1887: "a", 0x1888: "i", 0x188a: "nga", 0x1895: "zha", 0x1896: "za",
  0x1897: "ah", 0x18a6: "u", 0x18a7: "ya", 0x18aa: "lha",
};

export function isAliGaliChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= ALI_GALI_RANGE.first && c <= ALI_GALI_RANGE.last;
}

/**
 * 音節級重構後本方案可轉換的碼位集：Ali Gali 專用區段＋蒙古文基字梵音（音節表
 * 首碼位∪基字表∪數字/標點）——面板通路門禁要求 looksLikeNative 覆蓋「引擎有映射的
 * 全部碼位」（單碼位成詞不得被 skipped）。
 */
const AG_CONVERTIBLE = new Set<number>([
  ...Object.keys(AG_DIGIT_PUNCT).map(Number),
  ...Object.keys(AG_BASE_CHAR_TO_ROMAN).map(Number),
  ...Object.keys(ALI_GALI_TO_IAST).map(Number),
  ...[...SYLLABLE_MAP.keys()].flatMap((k) =>
    [...k].map((c) => c.codePointAt(0) ?? 0).filter((c) => c < 0x1880 || c > 0x18aa),
  ),
]);

export function looksLikeAliGali(text: string): boolean {
  if (hasAliGali(text)) return true;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (AG_CONVERTIBLE.has(c)) return true;
  }
  return false;
}

/** Ali Gali → IAST；裝飾符號原樣保留。
 *  注意：映射值 "" 代表「無單一羅馬對應、原樣保留」，**不是**「刪掉該字符」；
 *  早期版本誤寫成 out += mapped，把 DAMARU / BALUDA / DAGALGA 等裝飾符號
 *  靜默吞掉（違反數據完整性） */
export function aliGaliToIast(input: string): string {
  let out = "";
  let i = 0;
  const chars = Array.from(input);
  while (i < chars.length) {
    // 1) 音節表最長匹配（起點試探：長鍵在前）
    let matched = false;
    for (let L = Math.min(6, chars.length - i); L >= 1 && !matched; L--) {
      const slice = chars.slice(i, i + L).join("");
      const rom = SYLLABLE_MAP.get(slice);
      if (rom !== undefined) {
        out += rom;
        i += L;
        matched = true;
      }
    }
    if (matched) continue;
    // 2) 數字／標點
    const c = chars[i].codePointAt(0) ?? 0;
    const dp = AG_DIGIT_PUNCT[c];
    if (dp !== undefined) {
      out += dp;
      i += 1;
      continue;
    }
    // 2.5) 蒙古文基字梵音補全（借詞體例：輔音基字＝輔音成分）
    // ᠾ（U+183E）組合修飾：X+ᠾ 把送氣/濁化升一級（aksh 語料：ᠺᠾ=gh、ᢑᠾ=dh、
    // ᢖᠾ=jh、ᠪᠾ=bh——dha=ᢑᠾᠠ 樣本句實錘）。輔音來源＝基字表＋Ali Gali 字母表。
    const next = i + 1 < chars.length ? (chars[i + 1].codePointAt(0) ?? 0) : 0;
    if (next === 0x183e) {
      const asp = AG_BASE_CHAR_TO_ROMAN[c] ?? ALI_GALI_TO_IAST[c];
      if (asp !== undefined && asp !== "a" && asp !== "i" && asp !== "u" && asp !== "e" && asp !== "aḥ") {
        out += `${asp}h`;
        i += 2;
        continue;
      }
    }
    const base = AG_BASE_CHAR_TO_ROMAN[c];
    if (base !== undefined) {
      out += base;
      i += 1;
      continue;
    }
    // 3) 碼位級 fallback（Ali Gali 字母表＋Todo 段；未收錄的原樣保留）
    // Todo Ali Gali 段（U+1840–U+185F，21244 表3／16331 主題）：官方屬 Ali Gali
    // Extensions for Sanskrit and Tibetan 同區，但低於 ALI_GALI_RANGE.first(0x1880)
    // ——hasAliGali 方案檢測範圍刻意不動（避免普通 Todo 文本被誤判入方案），
    // 僅轉寫 fallback 擴及此段。
    const agFallback =
      (c >= ALI_GALI_RANGE.first && c <= ALI_GALI_RANGE.last) ||
      (c >= 0x1840 && c <= 0x185f);
    if (agFallback) {
      const mapped = ALI_GALI_TO_IAST[c];
      out += mapped === undefined || mapped === "" ? chars[i] : mapped;
    } else {
      out += chars[i];
    }
    i += 1;
  }
  return out;
}

/** Ali Gali（藏文來源）→ 藏文 Wylie；其餘回退 IAST；裝飾符號原樣保留 */
export function aliGaliToWylie(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= ALI_GALI_RANGE.first && c <= ALI_GALI_RANGE.last) {
      // 空串代表「原樣保留」，故用 || 而非 ??（?? 只擋 null/undefined）
      out += ALI_GALI_TO_WYLIE[c] || ALI_GALI_TO_IAST[c] || ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/** 標注：在蒙古/滿文文本的每個 Ali Gali 字母後插入其 IAST 讀音（⟨…⟩），便於校對 */
export function annotateAliGali(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= ALI_GALI_RANGE.first && c <= ALI_GALI_RANGE.last) {
      const iast = ALI_GALI_TO_IAST[c];
      // 裝飾符號無讀音，不加空括號 ⟨⟩，原樣保留
      out += iast === undefined || iast === "" ? ch : `${ch}⟨${iast}⟩`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 羅馬字 → Ali Gali 音節反查（aksh 語料表反向）。最長匹配（「kai」先於「ka」先於「k」）；
 * 未命中的字符原樣保留（拉丁正文不攔截——與方案「僅出向攔截」描述對稱更新為雙向）。
 * 反查表同形異碼（同 IAST 值多碼位）取**表中第一項**（aksh 正字序：ka→ᢉᠠ᠋ 而非滿文變體）。
 */
export function romanToAliGali(input: string, opts?: TransliterationOptions): string {
  // agBackForm='todo'＝Todo/專碼位優先（面板同音異碼取樣選項；auto/canonical＝正字序第一）
  const table =
    (opts as { agBackForm?: string } | undefined)?.agBackForm === "todo"
      ? ROMAN_TO_SYLLABLE_TODO
      : ROMAN_TO_SYLLABLE;
  let out = "";
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const [rom, nat] of table) {
      if (rom && input.startsWith(rom, i)) {
        // vocalic 拼接去 FVS1——「Xa＋vocalic」相鄰時，Xa 段的
        // 借音標記 ᠠ᠋ 改裸形 ᠠ（kaḷ→ᢉᠠᠯᠢ 而非 ᢉᠠ᠋ᠯᠢ；aḷ→ᠠᠯᠢ 裸形），與
        // aksh/21244 語料拼寫一致，往返碼位級亦恒等（n2r(ᠠᠯᠢ)=aḷ 裸形回讀不變）。
        const rest = input.slice(i + rom.length);
        if (nat.endsWith("\u1820\u180B") && /^[ḷḹṛṝ]/.test(rest)) {
          out += nat.slice(0, -1);
        } else {
          out += nat;
        }
        i += rom.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 數字反向（0-9 ↔ 蒙古文數字 U+1810–1819，與出向 AG_DIGIT_PUNCT 對稱）
      const c = input[i];
      if (c >= "0" && c <= "9") {
        out += cp(0x1810 + (c.charCodeAt(0) - 0x30));
        i += 1;
        continue;
      }
      if (c === ".") {
        out += cp(0x1802);
        i += 1;
        continue;
      }
      out += c;
      i += 1;
    }
  }
  return out;
}

/* ---------------- 檢字表 ---------------- */
function buildCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  // C-S2：同音碼位反向不可區分——計數每個 IAST 值出現次數，>1 者於 note 標明
  const homophoneCount: Record<string, number> = {};
  for (const iast of Object.values(ALI_GALI_TO_IAST)) {
    if (iast) homophoneCount[iast] = (homophoneCount[iast] ?? 0) + 1;
  }
  for (const [c, iast] of Object.entries(ALI_GALI_TO_IAST)) {
    const cpn = Number(c);
    const homophone =
      iast && (homophoneCount[iast] ?? 0) > 1
        ? `；同音碼位（${iast} 共 ${homophoneCount[iast]} 個，反向不可區分）`
        : "";
    rows.push({
      native: cp(cpn),
      roman: iast === "" ? "（裝飾符）" : iast,
      note: (ALI_GALI_TO_WYLIE[cpn] ? `梵 IAST / 藏 Wylie ${ALI_GALI_TO_WYLIE[cpn]}` : "梵文借詞 → IAST") + homophone,
      section: cpn <= 0x1886 ? "Ali Gali 符號（藏文同源）" : "Ali Gali 借音字母",
    });
  }
  // 覆蓋率補列：音節反查的蒙古基字基底形（引擎真實輸出形）—— 語料的
  // Ali Gali 音節以「蒙古基字＋FVS1」表示借音（如 a→ᠠ᠋、u→ᠦ），非 Ali Gali 專碼位；
  // romanToNative/nativeToRoman 皆以這些形往返（ᠠ᠋↔a、ᠦ↔u 實測閉環）。顯式列出
  // 使「引擎能轉出的字檢字表都列得出」（all-schemes-corpus 覆蓋率 gate）。
  rows.push({
    native: "\u1820\u180B",
    roman: "a（音節基底）",
    note: "蒙古基字 A＋FVS1：Ali Gali 借音 a 的音節基底形（外部語料形；引擎 a↔ᠠ᠋ 閉環），Ali Gali 專碼位 1887 為字典形",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  // 覆蓋率補列：Todo 元音條目（e/i/o/u roman）的反向撞 Hudum 基字路徑
  // （r2n('e')→ᠧ、r2n('o')→ᠣᠸᠠ u+v 複合）——引擎真實能吐出的借音形，依
  // 「引擎能轉出的字檢字表都列得出」政策補列（非臆造：AG_BASE_CHAR_TO_ROMAN 實錘）。
  rows.push({
    native: "\u1827",
    roman: "e（蒙古基字借音）",
    note: "蒙古基字 E：Ali Gali 借音 e 的 Hudum 基字形（r2n('e') 實際輸出；Todo 專碼位 1844 為字典形）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u1823\u1838\u1820",
    roman: "o（蒙古基字借音）",
    note: "蒙古基字 O＋V＋A 複合：Ali Gali 借音 o 的 Hudum 基字形（r2n('o') 實際輸出；Todo 專碼位 1846 為字典形）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u1826",
    roman: "u（音節基底）",
    note: "蒙古基字 U：Ali Gali 借音 u 的音節基底形（引擎 u↔ᠦ 閉環）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  // Vocalic 元音行（音節映射，檢字表可查）：ᠯᠢ=ḷ、ᠯᠢᠢ=ḹ、ᠷᠢ=ṛ、ᠷᠢᠢ=ṝ——
  // 引擎 SYLLABLE_MAP 真實映射（aksh 語料 VowelMap 同源）；ᠯᠢ 兼有 la+i 過渡讀法，
  // 依 Ali Gali 拼寫體例 vocalic 拼寫優先（ᠯᠢᠢ 雙寫＝ḹ 實錘無歧義）。
  rows.push({
    native: "\u183d",
    roman: "j",
    note: "JA（蒙古基本區借音形，走基字路徑；r49u 裁定 21244 權威）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u18aa",
    roman: "lh",
    note: "LHA（Todo Ali Gali 專碼位；反向組合鍵 lh→18AA 對稱出向）",
    section: "Ali Gali 借音字母",
  });
  rows.push({
    native: "\u182f\u1822",
    roman: "ḷ",
    note: "vocalic L（音節映射 ᠯᠢ；La+i 過渡亦可讀 li）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u182f\u1822\u1822",
    roman: "ḹ",
    note: "vocalic L 長音（音節映射 ᠯᠢᠢ）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u1837\u1822",
    roman: "ṛ",
    note: "vocalic R（音節映射 ᠷᠢ；Ra+i 過渡亦可讀 ri）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u1837\u1822\u1822",
    roman: "ṝ",
    note: "vocalic R 長音（音節映射 ᠷᠢᠢ）",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  rows.push({
    native: "\u180B",
    roman: "（FVS1 說明）",
    note: "MONGOLIAN FREE VARIATION SELECTOR ONE：標記基字為 Ali Gali 借音形，附於蒙古基字後（ᠠ᠋、ᢠ᠋ 等）；隨基字出向，不單獨輸入",
    section: "音節基底（蒙古基字＋FVS1）",
  });
  return rows;
}

const aliGaliScheme: TransliterationScheme = {
  id: "aligali-iast",
  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: { zh: "蒙/滿 Ali Gali 借音字母", "zh-TW": "蒙/滿 Ali Gali 借音字母", ja: "アリ・ガリ文字（モンゴル/満州）", ko: "알리 갈리 문자(몽골/만주)", en: "Ali Gali (Mongolian/Manchu)", bo: "Ali Gali", ug: "Ali Gali", fr: "Ali Gali (mongol/mandchou)", de: "Ali Gali (Mongolisch/Mandschu)", },
  group: "aligali",
  primary: true,
  description: "蒙古文 Ali Gali 借詞 → 梵文 IAST（音節級：語料 88 音節＋長音泛化最長匹配；少數藏文來源 → Wylie）。反向由音節表反查（ka→ᢉᠠ᠋）＋數字對稱還原；未命中羅馬字原樣保留。蒙古文句號 ᠂（U+1802）與其排版變體 U+1803 出向同為「.」，反向歸 U+1802 正字（同八思巴 ᠃→꡶ 政策）。同音異碼反向取正字序第一項。",
  // opts.agBackForm 透傳（面板「同音異碼取樣」select：canonical＝正字序第一 / todo＝專碼位優先）
  romanToNative: (input: string, opts?: TransliterationOptions) => romanToAliGali(input, opts),
  nativeToRoman: aliGaliToIast,
  looksLikeNative: looksLikeAliGali,
  looksLikeRoman: (_t) => false, // 不主動攔截羅馬字（避免與其它文種衝突）
  convert: aliGaliToIast,
  charTable: buildCharTable(),
};

registerScheme(aliGaliScheme);
