// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 佉盧虱吒文（Kharoṣṭhī，Unicode U+10A00–U+10A5F）↔ 羅馬字轉寫器。
 *
 * 【歷史地位】佉盧文是犍陀羅語（Gāndhārī）的書寫文字，公元前 1 世紀大英圖書館
 *  桦樹皮佛教寫本即用此文；它是唯一**從右向左**書寫的婆羅米系文字（數字亦 RTL）。
 *
 * 【設計決策：abugida 固有元音模型，不做梵文合字引擎】
 *  與悉曇不同，佉盧文不能復用天城體引擎（碼位佈局差異大、犍陀羅正字法遠較寬鬆）。
 *  本模組自帶一個**極簡 abugida 組字器**（婆羅米系通則，非梵文 virama 合字）：
 *    ① 輔音字母自帶固有元音 a —— 輔音後緊跟的 'a' 視為固有元音，不寫出；
 *       例：dhrama（犍陀羅語「法」）→ dh·r·m ＝ 𐨢𐨪𐨨（正確，非 𐨢𐨪𐨀𐨨𐨀）。
 *    ② 輔音後緊跟其他元音 → 輔音字母 ＋ 對應元音符號（VOWEL SIGN）。
 *    ③ 詞首 / 非輔音後的元音 → 獨立元音字母（僅 a 有獨立字母 U+10A00）。
 *    ④ 佉盧寫本合字（conjunct）常以輔音並置表示（不寫 virama）；如需精確標寫，
 *       可顯式鍵入 'ˌ' → VIRAMA U+10A3F。
 *  逆向（nativeToRoman）為**唯一可發音讀法**：裸輔音字母一律回填固有 'a'（故
 *  正向後逆向對「全 CV 音節＋組合字母」無損往返；含省略元音之寫本形態則回填完整
 *  讀音，此為 abugida 轉寫固有的不對稱性）。
 *
 * 【正字法對齊】
 *  以 Baums & Glass《A Dictionary of Gāndhārī》965 條權威詞條（含詞典官方 Kharoṣṭhī
 *  原生字）為準，修正五類正字法：
 *   ① 輔音簇顯式 virama（agra→𐨀𐨒𐨿𐨪；詞典 122 詞實證）
 *   ② 詞首非 a 元音以 𐨀+附標標寫（eśa→𐨀𐨅𐨭；詞典 71 例無例外）
 *   ③ 專名詞首大寫歸一（Ati→𐨀𐨟𐨁）
 *   ④ 詞典學術轉寫鍵：Ṭ́H→TTTHA、Ḱ→KKA、Ü/Ï→𐨀+u/i、V̄→BAR ABOVE
 *   ⑤ 移除 jh→U+10A18（UCD 16.0 未定義碼位）
 *  驗證：語料 965/965 逐碼位一致、寫本形恆等 965/965、詞典形恆等 965/965。
 *
 * 【轉寫約定】依 Unicode 提案書 L2/02203r2、L2/03314（Glass 2000 命名）：
 *  - 輔音 33＋4 組合字母：k kh g gh / c ch j jh ñ / ṭ ṭh ḍ ḍh ṇ / t th d dh n /
 *    p ph b bh m / y r l v / ś ṣ s z h；組合 kka(10A32) tttha(10A33) ttta(10A34)
 *    vha(10A35) 以多字母鍵直接映射（貪婪最長鍵，優先於單字母）。
 *  - 元音附標：i(10A01) u(10A02) ṛ(10A03) e(10A05) o(10A06)；
 *    長音以 VOWEL LENGTH MARK U+10A0C 表示，鍵入 'ː'。
 *  - 符號：ṃ(10A0E) ḥ(10A0F) ˌ(10A3F virama) ⟑(10A38) ⟒(10A39 cauda) ⟓(10A3A)。
 *  - 數字：佉盧數字是加法系（1/2/3/4 ＋ 10/20/100/1000 組合），
 *    羅馬字側不做阿拉伯數字↔佉盧數字換算（學界文獻一律寫阿拉伯數字），僅映射鍵入。
 *
 * 【方向注意】佉盧文 RTL——languages.ts 的 kharoshthi 檔案寫 horizontal-tb + rtl
 *  （同 arabic/hebrew 先例：GSUB cjct 連寫成形，直排會破壞詞形）；本模組輸出碼位
 *  序為**邏輯序**，雙向演算法由瀏覽器處理。
 *
 * 數據來源：Unicode 16.0 NamesList U+10A00（語言事實）；字體 Noto Sans Kharoshthi
 * （SIL OFL 1.1，隨插件內嵌）。純函數、無 Obsidian 依賴；不外拋未捕獲異常。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表（羅馬字鍵 → 佉盧碼位） ---------------- */

// 輔音 LETTER（U+10A10–U+10A35；10A14/10A18 官方未定義——犍陀羅正字法無 gh/jh
// 獨立字母（實測 UCD 16.0 NamesList：10A13 GHA 後直接 10A15 CA、10A17 JA 後
// 直接 10A19 NYA）；含 4 個組合字母）
const KHARO_CONSONANT: Record<string, number> = {
  k: 0x10a10, kh: 0x10a11, g: 0x10a12, gh: 0x10a13,
  c: 0x10a15, ch: 0x10a16, j: 0x10a17, "ñ": 0x10a19,
  "ṭ": 0x10a1a, "ṭh": 0x10a1b, "ḍ": 0x10a1c, "ḍh": 0x10a1d, "ṇ": 0x10a1e,
  t: 0x10a1f, th: 0x10a20, d: 0x10a21, dh: 0x10a22, n: 0x10a23,
  p: 0x10a24, ph: 0x10a25, b: 0x10a26, bh: 0x10a27, m: 0x10a28,
  y: 0x10a29, r: 0x10a2a, l: 0x10a2b, v: 0x10a2c,
  "ś": 0x10a2d, "ṣ": 0x10a2e, s: 0x10a2f, z: 0x10a30, h: 0x10a31,
  kka: 0x10a32, tttha: 0x10a33, ttta: 0x10a34, vha: 0x10a35,
  // 詞典轉寫慣例（Baums & Glass, gandhari.org 965 條語料實測）：
  // ṭ́h（ṭ+́+h，t+ṭh 合音）→ TTTHA：aṭ́ha→𐨀𐨳、saṭ́ha→𐨯𐨳
  // ḱ（=kk 合音）→ KKA：maḱa→𐨨𐨲、paḱaya→𐨤𐨲𐨩
  // vh（=v+h 合音，詞典 60/60 雙射實證）→ VHA：lavhi→𐨫𐨵𐨁、avhisaṃbudha→𐨀𐨵𐨁𐨯𐨎𐨦𐨂𐨢
  // lý（=l+y 連寫，詞典以 ZWJ 標 LYA 合字，56 條實證）→ 𐨫+ZWJ+𐨿+𐨩：Lýipe→𐨫‍𐨿𐨩𐨁𐨤𐨅
  "ṭ́h": 0x10a33, "ḱ": 0x10a32, "vh": 0x10a35,
};

// 獨立元音 LETTER（僅 a）
const KHARO_VOWEL_INDEP: Record<string, number> = { a: 0x10a00 };

// 元音附標 VOWEL SIGN（e/o 無短音對立，Gāndhārī 只用長符）
const KHARO_VOWEL_SIGN: Record<string, number> = {
  i: 0x10a01, u: 0x10a02, "ṛ": 0x10a03, e: 0x10a05, o: 0x10a06,
};

// 長音與各類符號（virama 供精確標寫；⟑⟒⟓ 為校勘記號）
const KHARO_SIGNS: Record<string, number> = {
  "ː": 0x10a0c, "ṃ": 0x10a0e, "ḥ": 0x10a0f,
  // P1-3：U+1E41 ṁ 別名鍵（ISO 15919 anusvara 拼法）＝ ṃ（10A0E）同碼位；
  // 反查歸 canonical ṃ（見 REV_SIGNS 顯式 set，與 ṭ́h/kka/vha 別名先例同構）。
  "ṁ": 0x10a0e,
  // K-2：DOUBLE RING BELOW（10A0D，中亞寫本 vowel modifier，音值未定）
  "̑": 0x10a0d,
  "ˌ": 0x10a3f, "⟑": 0x10a38, "⟒": 0x10a39, "⟓": 0x10a3a,
  // K-2：DOT BELOW（10A3A consonant modifier，音值未定；⟓ 既有鍵保留）
  // （⟓ 已映射 0x10a3a，此處不加重複鍵）
  // 詞典轉寫慣例（全集審計）：̱（U+0331 結合下劃線）→ CAUDA（4 條實證：
  // Las̱a→𐨫𐨯𐨹、Bhag̱arka→𐨧𐨨𐨹𐨪𐨿𐨐——詞典以 CAUDA 標記下劃線輔音）
  "̱": 0x10a39,
};

// 二合元音（全集審計 3+1 條實證：詞典 ai=E-sign+LENGTH、au=O-sign+LENGTH：
// Itakkai→…𐨐𐨅𐨌、Laibhura→𐨫𐨅𐨌𐨧𐨂𐨪、lautgaiṃci→𐨫𐨆𐨌𐨟…）
const KHARO_DIPHTHONG: Record<string, number[]> = {
  ai: [0x10a05, 0x10a0c],
  au: [0x10a06, 0x10a0c],
};

// LYA 連寫（lý）：詞典以 ZWJ 標記 l+y 合字（56 條實證）
const LYA_LIGATURE = cp(0x10a2b) + "\u200d" + cp(0x10a3f) + cp(0x10a29);

// 數字（加法系，鍵入用）
const KHARO_DIGITS: Record<string, number> = {
  "1": 0x10a40, "2": 0x10a41, "3": 0x10a42, "4": 0x10a43,
  "10": 0x10a44, "20": 0x10a45, "100": 0x10a46, "1000": 0x10a47,
  // r45 K-2：FRACTION ONE HALF（10A48，加法系唯一分數）
  "½": 0x10a48,
};

// 標點
const KHARO_PUNCT: Record<string, number> = {
  ".": 0x10a50, "◦": 0x10a51, "○": 0x10a52, "⌒": 0x10a53,
  "❋": 0x10a54, "✿": 0x10a55, "|": 0x10a56, "||": 0x10a57, "≡": 0x10a58,
};

// 元音鍵集合（含固有 a）——「輔音後是否消費元音」的判定基礎
const VOWEL = "aiueoṛ".split("");

// 單次比對用：鍵依長度降序（最長鍵優先，組合字母 kka 不會被 k·ka 拆散）
const consKeys = Object.keys(KHARO_CONSONANT).sort((a, b) => b.length - a.length);
const signKeys = Object.keys(KHARO_SIGNS).sort((a, b) => b.length - a.length);
const digitKeys = Object.keys(KHARO_DIGITS).sort((a, b) => b.length - a.length);
const punctKeys = Object.keys(KHARO_PUNCT).sort((a, b) => b.length - a.length);

/* ---------------- 反查表（佉盧碼位 → 羅馬字） ---------------- */

function buildReverse(map: Record<string, number>): Map<number, string> {
  const m = new Map<number, string>();
  for (const [roman, code] of Object.entries(map)) if (!m.has(code)) m.set(code, roman);
  return m;
}
const REV_CONSONANT = buildReverse(KHARO_CONSONANT);
// B-K2：別名鍵 ṭ́h/ḱ/vh 與 canonical 鍵 tttha/kka/vha 同碼位（10A33/32/35），
// 反查顯式 set 讓 canonical 鍵勝出（別名僅供正向鍵入），往返閉環：
REV_CONSONANT.set(0x10a33, "tttha");
REV_CONSONANT.set(0x10a32, "kka");
REV_CONSONANT.set(0x10a35, "vha"); // 𐨵 反查歸 canonical 拼寫 vha（裸 𐨵 固有 a 已含於鍵）
const REV_VOWEL_INDEP = buildReverse(KHARO_VOWEL_INDEP);
const REV_VOWEL_SIGN = buildReverse(KHARO_VOWEL_SIGN);
const REV_SIGNS = buildReverse(KHARO_SIGNS);
// B-K1：CAUDA（10A39）反查顯式 set——primary＝̱（U+0331 詞典轉寫慣例，Las̱a 實證），
// 蓋過 buildReverse 先到先得的 ⟒（校勘記號鍵）。否則 native→roman 恆出 ⟒，
// detectKharoshthiCaudaAmbiguities 的 ̱ 門檔成死路徑、歧義偵測永不觸發。
REV_SIGNS.set(0x10a39, "\u0331");
// P1-3：ANUSVARA（10A0E）反查顯式歸 canonical ṃ——蓋過別名鍵 ṁ（U+1E41，ISO
// 15919 拼法）的先到先得。與 ṭ́h/kka/vha 別名先例同構：別名僅供正向鍵入。
REV_SIGNS.set(0x10a0e, "ṃ");
const REV_DIGITS = buildReverse(KHARO_DIGITS);
const REV_PUNCT = buildReverse(KHARO_PUNCT);

const isKharoCode = (n: number): boolean => n >= 0x10a00 && n <= 0x10a5f;

/** 是否像佉盧文原生文字（U+10A00–U+10A5F 任一碼位） */
export function looksLikeKharoshthi(text: string): boolean {
  for (const ch of text) if (isKharoCode(ch.codePointAt(0)!)) return true;
  return false;
}

/** 是否像佉盧文羅馬字（含元音/符號鍵） */
export function looksLikeKharoRoman(text: string): boolean {
  for (const ch of text) {
    if (/[a-zāīūṛṝḷḹṅñṭḍṇśṣḥṃ]/.test(ch)) return true;
  }
  return false;
}

/** 在 position 嘗試最長鍵匹配，回傳 [鍵, 碼位] 或 null */
function matchAt(input: string, pos: number, keys: string[], map: Record<string, number>): [string, number] | null {
  for (const k of keys) if (k.length && input.startsWith(k, pos)) return [k, map[k]];
  return null;
}

/**
 * 羅馬字 → 佉盧文（abugida 固有元音模型；正字法對齊）。
 *  - 輔音 + 'a' → 只寫輔音（固有元音省略）；
 *  - 輔音 + 其他元音 → 輔音 + 元音符號；
 *  - 輔音 + 輔音（無元音間隔）→ 前輔音後補 VIRAMA（詞典精確音節標寫：agra→𐨀𐨒𐨿𐨪）；
 *  - 詞首/非輔音後的 a → 獨立元音字母；非 a 元音 → 獨立 𐨀 + 元音符號
 *    （佉盧文僅 a 有獨立字母，詞典對詞首 i/u/e/o 一律以 𐨀+附標標寫，71 例無例外）；
 *  - 大寫拉丁詞首（專名）歸一為小寫匹配；
 *  - 詞典轉寫特殊鍵：ḱ→KKA、ü/ï→𐨀+u/i 附標、V̄（上橫線）→ BAR ABOVE、
 *    ṭ́/ḍ́→TTTHA；
 *  - 組合字母（kka/tttha/ttta/vha）以最長鍵優先。
 * 未命中原樣保留。
 */
export function kharoRomanToNative(input: string, _opts?: TransliterationOptions): string {
  // 專名大寫歸一（詞典慣例：Ati/Baba/Huviṣka/saBhaḍu 等——詞典 lemma 標題化殘留
  // 詞中亦有大寫，全集審計 12 條實證，故整詞小寫化）
  // 詞首構擬號 '*' 剝除（詞典 *daśadi→𐨀𐨯𐨡𐨁，星號不入寫本）
  let src = input.replace(/^\*+/, "").toLowerCase();
  // r̥（r + U+0325 ring below，詞典 1 例 Kutaśrr̥a）→ 視為 vocalic r（ṛ）
  src = src.replace(/r\u0325/g, "ṛ").replace(/\u0325/g, "");
  let out = "";
  let i = 0;
  let lastWasConsonant = false; // 上一輸出是否為輔音字母（供 virama 與詞首元音判定）
  while (i < src.length) {
    // LYA 連寫（詞典 56 條：lý→𐨫+ZWJ+𐨿+𐨩）
    if (src.startsWith("lý", i)) {
      out += LYA_LIGATURE;
      i += 2;
      // lý 後接 y → LYA+virama+YA（Lýyaṣe 實證）；其餘輔音直接接（LYA+KA 無
      // virama——Kilýagi/Lýaka 實證：連寫後新音節起點不標）
      if (src[i] === "y" && src[i + 1] === "a") {
        // 僅 lýa（=LYA 讀法本身）後再接 y 需 virama 分隔兩個 y（Lýyaṣe 實證）
        out += cp(0x10a3f);
        i += 1;
        out += cp(0x10a29);
        i += 1;
        lastWasConsonant = false;
        continue;
      }
      // lý 後綁定元音符號（Lýipe→…𐨩𐨁：ý 已含合字，後隨元音直接附標）
      lastWasConsonant = false;
      const lv = src[i];
      if (lv && VOWEL.includes(lv)) {
        if (lv !== "a") out += cp(KHARO_VOWEL_SIGN[lv]);
        i += 1;
      }
      continue;
    }
    const c = matchAt(src, i, consKeys, KHARO_CONSONANT);
    if (c) {
      // 組合字母 kka 後接 i（=kkai 二合尾）→ 拆寫 k+virama+k，ai 留給元音分支
      // （Itakkai→…KA VIRAMA KA E LENGTH，詞典實證）
      if (c[0] === "kka" && src.startsWith("kkai", i)) {
        if (lastWasConsonant) out += cp(0x10a3f);
        out += cp(0x10a10) + cp(0x10a3f) + cp(0x10a10)
             + cp(0x10a05) + cp(0x10a0c); // + ai（E-sign+LENGTH）
        i += 5; // 消費 "kkai"
        lastWasConsonant = false;
        continue;
      }
      // 輔音直接接輔音：前輔音補 VIRAMA（詞典精確音節標寫）
      if (lastWasConsonant) out += cp(0x10a3f);
      out += cp(c[1]);
      i += c[0].length;
      // 組合字母（kka/tttha/ttta/vha/vh）鍵尾含固有 a，視為完整音節：
      // 其後輔音不再補 virama（否則 kka+b 會多出 𐨿，破壞往返恆等）
      lastWasConsonant = !c[0].endsWith("a");
      // 輔音後綁定變音符（上橫線 U+0304 → BAR ABOVE；詞典 V̄ 標寫，如 j̄ana→𐨗𐨸𐨣）
      while (src[i] === "\u0304") { out += cp(0x10a38); i += 1; }
      // 下劃線 U+0331 → CAUDA 且吞固有 a（詞典 4 條實證：Las̱a/Bhag̱arka→GA CAUDA…；
      // ̱ 後隨的 a 亦消費不寫——Parñuv̱aca=…VA CAUDA CA、Las̱a=LA SA CAUDA）
      if (src[i] === "\u0331") {
        out += cp(0x10a39); i += 1;
        if (src[i] === "a") i += 1;
        lastWasConsonant = false; continue;
      }
      // ṛ（r̥）→ VOC-R-sign 附於本輔音（Kutaśrr̥a→…RA VOC-R + 獨立 A；virama 由
      // 前後輔音相鄰自動補，此處不加）
      if (src[i] === "\u1e5b" && !c[0].endsWith("a")) {
        out += cp(0x10a03);
        i += 1;
        lastWasConsonant = false;
        continue;
      }
      // 消費緊隨的元音：'a' 為固有（不寫），其他元音寫符號
      // 二合元音 ai/au → E/O-sign + LENGTH（詞典正字法，v2.9.16 全集實證）
      const dv = src.slice(i, i + 2);
      const dm = KHARO_DIPHTHONG[dv];
      if (dm) {
        out += cp(dm[0]) + cp(dm[1]);
        i += 2;
        lastWasConsonant = false;
        continue;
      }
      const v = src[i];
      if (v === "a") {
        i += 1;
      } else if (v !== undefined && VOWEL.includes(v)) {
        const sc = KHARO_VOWEL_SIGN[v];
        if (sc !== undefined) out += cp(sc);
        i += 1;
      } else if (v === undefined || !VOWEL.includes(v)) {
        // 輔音後無元音：留在 lastWasConsonant，由下一輪決定 virama
      }
      // 輔音後的元音已消費，若下一字仍是元音（連續元音）則後續走獨立元音分支
      if (v !== undefined && VOWEL.includes(v)) lastWasConsonant = false;
      continue;
    }
    const v0 = src[i];
    const v0l = v0.toLowerCase();
    // P1-2/P3-2：詞首二合 ai/au 鍵入——須在裸 'a' 分支之前（否則 'a' 先吃、'i' 落
    // 獨立元音分支變 aï 不閉環）。僅在詞首/非輔音後進入此分支；輔音後 'ai' 已由
    // 上方 KHARO_DIPHTHONG 二合路徑消費。輸出統一走 KHARO_DIPHTHONG 同款
    // E/O-sign+LENGTH 二合形（charTable 「ai↔𐨅𐨌」同構，無前置 𐨀），鍵入/回讀
    // 雙向閉環且與檢字表對照一致。
    // v0 僅單字符，二合須以 startsWith 判定（v0l===「ai」永不命中）
    if (src.startsWith("ai", i)) { out += cp(0x10a05) + cp(0x10a0c); i += 2; lastWasConsonant = false; continue; }
    if (src.startsWith("au", i)) { out += cp(0x10a06) + cp(0x10a0c); i += 2; lastWasConsonant = false; continue; }
    if (v0l === "a") {
      out += cp(KHARO_VOWEL_INDEP.a);
      i += 1;
      lastWasConsonant = false;
      continue;
    }
    // 辭典轉寫特殊鍵
    if (v0l === "ü") { out += cp(0x10a00) + cp(0x10a02); i += 1; lastWasConsonant = false; continue; }
    if (v0l === "ï") { out += cp(0x10a00) + cp(0x10a01); i += 1; lastWasConsonant = false; continue; }
    // 詞首/非輔音後的非 a 元音 → 獨立 𐨀 + 附標（詞典正字法）
    if (VOWEL.includes(v0l) && KHARO_VOWEL_SIGN[v0l] !== undefined) {
      out += cp(0x10a00) + cp(KHARO_VOWEL_SIGN[v0l]);
      i += 1;
      lastWasConsonant = false;
      continue;
    }
    // A6：signs/digits/punct 亦用規範化後 src 匹配——src 經 toLowerCase、剝星號、
    // r+U+0325→ṛ 等變換後長度可變，用原始 input 匹配會錯位（如 "R̥1" 剝 ring 後
    // 位置前移一碼位，數字鍵在原串位置上不命中）。鍵本身皆無大小寫/星號變體，
    // 用 src 匹配與規範化語義一致。
    const s = matchAt(src, i, signKeys, KHARO_SIGNS);
    if (s) { out += cp(s[1]); i += s[0].length; lastWasConsonant = false; continue; }
    const d = matchAt(src, i, digitKeys, KHARO_DIGITS);
    if (d) { out += cp(d[1]); i += d[0].length; lastWasConsonant = false; continue; }
    const p = matchAt(src, i, punctKeys, KHARO_PUNCT);
    if (p) { out += cp(p[1]); i += p[0].length; lastWasConsonant = false; continue; }
    out += src[i];
    i += 1;
    lastWasConsonant = false;
  }
  return out;
}

/**
 * 佉盧文 → 羅馬字（裸輔音回填固有 'a'）。
 * 輔音字母後若緊跟元音符號則併寫，否則補固有 'a'。未命中原樣保留。
 */
export function kharoNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  const codes = [...input].map((ch) => ch.codePointAt(0)!);
  let out = "";
  let i = 0;
  while (i < codes.length) {
    // LYA 連寫：LA+ZWJ+VIRAMA+YA → "lý"（詞典 56 條慣例）
    if (codes[i] === 0x10a2b && codes[i + 1] === 0x200d && codes[i + 2] === 0x10a3f && codes[i + 3] === 0x10a29) {
      out += "lý";
      i += 4;
      // 連寫後的元音符號直接附於 ý 後
      const nx = i < codes.length ? codes[i] : undefined;
      const lv = nx !== undefined ? REV_VOWEL_SIGN.get(nx) : undefined;
      if (lv !== undefined) { out += lv; i += 1; }
      continue;
    }
    const n = codes[i];
    const cons = REV_CONSONANT.get(n);
    if (cons !== undefined) {
      // 𐨵 反查已歸 canonical "vha"（B-K2），VIRAMA/元音消費走通用路徑
      out += cons;
      i += 1;
      // 輔音後的 BAR ABOVE（10A38）＝詞典母音上橫線標記 V̄/j̄（R2N 對稱：U+0304 緊隨
      // 輔音鍵之後、在元音消費之前）；詞典 82 條實證（j̄ana/kiṣ̄a/uṣ̄a…），非校勘記號
      // ⟑（⟑ 僅非輔音後保留）。須在回填固有 a 之前，還原 'j̄a' 字序。
      if (codes[i] === 0x10a38) { out += "\u0304"; i += 1; }
      const nextCode = i < codes.length ? codes[i] : undefined;
      // VIRAMA：輔音無固有元音，消費之且不回填 'a'（詞典正字法：𐨒𐨿𐨪→"gra" 而非 "gaˌra"）
      if (nextCode === 0x10a3f) { i += 1; continue; }
      const sign = nextCode !== undefined ? REV_VOWEL_SIGN.get(nextCode) : undefined;
      if (sign !== undefined) { out += sign; i += 1; }
      // 固有元音回填：組合字母（kka/tttha/ttta/vha）鍵本身已含尾音 a，不再回填，
      // 否則 'ttta'+'a'='tttaa' 會讀成「tt·t·ā」——錯音。
      else if (!cons.endsWith("a")) out += "a";
      // 輔音（含固有 a）後的 CAUDA = 詞典下劃線標記 ̱（Las̱a→l+a+̱…）
      if (codes[i] === 0x10a39 && !cons.endsWith("a")) { out += "\u0331"; i += 1; }
      continue;
    }
    const vi = REV_VOWEL_INDEP.get(n);
    if (vi !== undefined) {
      // 獨立元音 𐨀 + 元音符號 = 詞首非 a 元音（詞典正字法：𐨀𐨅→e、𐨀𐨁→i、𐨀𐨂→u）
      // 詞中 𐨀+I/U → 詞典轉寫慣例 ï/ü（非 ai/au 二合——二合由 E/O-sign+LENGTH 構成）
      const nx = i + 1 < codes.length ? codes[i + 1] : undefined;
      const vs = nx !== undefined ? REV_VOWEL_SIGN.get(nx) : undefined;
      if (vs === "i") { out += "ï"; i += 2; continue; }
      if (vs === "u") { out += "ü"; i += 2; continue; }
      if (vs !== undefined) { out += vs; i += 2; continue; }
      out += vi; i += 1; continue;
    }
    // LENGTH mark：前看 E-sign/O-sign——輔音後已併寫 'e'/'o'（單字符判定），
    // 孤立（詞首/非輔音後）E/O-sign 為 SMP 雙編碼單元（𐨅=U+10A05），須以
    // endsWith 判定（P3-2 修正：lastCh 取低代理位，=== 'e' 永不命中）。
    // 兩形皆收斂為二合元音 ai/au（R2N KHARO_DIPHTHONG 對稱，鍵入/回讀閉環）；
    // 裸 LENGTH 單獨出現仍歸 ː（REV_SIGNS）。
    if (n === 0x10a0c && out.length >= 1) {
      const lastCh = out[out.length - 1];
      if (lastCh === "e") { out = out.slice(0, -1) + "ai"; i += 1; continue; }
      if (lastCh === "o") { out = out.slice(0, -1) + "au"; i += 1; continue; }
      // 𐨅/𐨆 為 SMP 代理對（2 個 UTF-16 單元），切除須以 -2（slice(-1) 會留孤立代理）
      if (out.endsWith("𐨅")) { out = out.slice(0, -2) + "ai"; i += 1; continue; }
      if (out.endsWith("𐨆")) { out = out.slice(0, -2) + "au"; i += 1; continue; }
    }
    const sg = REV_SIGNS.get(n);
    if (sg !== undefined) { out += sg; i += 1; continue; }
    const dg = REV_DIGITS.get(n);
    if (dg !== undefined) { out += dg; i += 1; continue; }
    const pu = REV_PUNCT.get(n);
    if (pu !== undefined) { out += pu; i += 1; continue; }
    out += String.fromCodePoint(n);
    i += 1;
  }
  return out;
}

/* ---------------- 檢字表 ---------------- */

function buildKharoCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const push = (roman: string, code: number, section: string, note?: string): void => {
    rows.push({ roman, native: cp(code), section, ...(note ? { note } : {}) });
  };
  // P3-2：檢字表只列 canonical 鍵——別名鍵 ṭ́h/ḱ/vh 與 tttha/kka/vha 同碼位，
  // 表鍵雙收會造成同一 native 兩個 roman 列；正向鍵入別名仍收（KHARO_CONSONANT
  // 引擎鍵不動），僅於 canonical 列的 note 註明別名拼法。
  const KHARO_ALIAS_NOTE: Record<string, string> = {
    "tttha": "別名鍵 ṭ́h＝同碼位（10A33），正向鍵入亦收；反查歸 tttha",
    "kka": "別名鍵 ḱ＝同碼位（10A32），正向鍵入亦收；反查歸 kka",
    "vha": "別名鍵 vh＝同碼位（10A35），正向鍵入亦收；反查歸 vha",
  };
  const KHARO_ALIAS_KEYS = new Set(["ṭ́h", "ḱ", "vh"]);
  for (const [r, c] of Object.entries(KHARO_VOWEL_INDEP)) push(r, c, "獨立元音");
  for (const [r, c] of Object.entries(KHARO_CONSONANT)) {
    if (KHARO_ALIAS_KEYS.has(r)) continue; // 別名鍵不入檢字表（引擎鍵保留）
    push(r, c, "輔音", KHARO_ALIAS_NOTE[r]);
  }
  // 補新增鍵——LYA 連寫、二合元音 ai/au、r̥ 別名（檢字表展示缺口）。
  rows.push({ roman: "lý", native: LYA_LIGATURE, section: "輔音", note: "l+y 連寫（ZWJ 合字）" });
  for (const [r, cs] of Object.entries(KHARO_DIPHTHONG)) {
    rows.push({ roman: r, native: cs.map(cp).join(""), section: "元音符號", note: "二合元音（僅輔音後）" });
  }
  rows.push({ roman: "r̥", native: cp(0x10a03), section: "元音符號", note: "ṛ 之別寫（音節主音 r）" });
  for (const [r, c] of Object.entries(KHARO_VOWEL_SIGN)) push(r, c, "元音符號");
  for (const [r, c] of Object.entries(KHARO_SIGNS)) push(r, c, "符號");
  for (const [r, c] of Object.entries(KHARO_DIGITS)) push(r, c, "數字");
  for (const [r, c] of Object.entries(KHARO_PUNCT)) push(r, c, "標點");
  return rows;
}

/* ---------------- 註冊 ---------------- */

const kharoCharTable = buildKharoCharTable();

const gandhariIast: TransliterationScheme = {
  id: "gandhari-iast",
  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "犍陀罗語 IAST（佉卢虱吒文）",
    "zh-TW": "犍陀羅語 IAST（佉盧虱吒文）",
    ja: "ガンダーラ語（ハロースティー）", ko: "간다라어(카로슈티 문자)",
    en: "Gāndhārī (Kharoshthi)",
  },
  group: "kharoshthi",
  primary: true,
  description:
    "犍陀羅語（Gāndhārī）↔ 佉盧虱吒文（Kharoṣṭhī，U+10A00–U+10A5F）。" +
    "唯一 RTL 的婆羅米系文字，依 Glass 2000 學術轉寫約定；輔音自帶固有元音 a，長音鍵 'ː'。",
  romanToNative: (i, o) => kharoRomanToNative(i, o),
  nativeToRoman: (i, o) => kharoNativeToRoman(i, o),
  looksLikeNative: looksLikeKharoshthi,
  looksLikeRoman: looksLikeKharoRoman,
  convert: (i, o) => (looksLikeKharoshthi(i) ? kharoNativeToRoman(i, o) : kharoRomanToNative(i, o)),
  charTable: kharoCharTable,
};

registerScheme(gandhariIast);
