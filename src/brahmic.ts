// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 婆羅米系文字轉寫器：僧伽羅文（Sinhala）。
 *
 * 本模組現僅保留僧伽羅文兩套方案（sinhala-pali / sinhala-iso15919）。
 * 下方設計說明中提及「四種文字」之處
 * 爲原始調研記錄的歷史脈絡，現僅僧伽羅文生效。
 *
 * ── 設計模型（經調研確認，與 src/indic.ts 的 pali-iast 同源）─────────────────────
 * 四種文字皆爲「元音音素文字（abugida）」：輔音自帶固有元音 a，依賴元音符（matra）改寫該元音，
 * 「去元音符」（virama / coeng / thanthakhat）消去固有 a 形成閉音節或合字（conjunct）。
 * 巴利三藏（Pāli Tipiṭaka）即以這四種文字書寫（另有羅馬 / 天城體），故本模組採用與
 * IAST 一致的「輔音基底（不含固有 a）+ 自動 virama」模型，保證 Buddha / dhamma / saṅgha
 * 等閉音節正確書寫。
 *
 * 設計要點：
 *  1. 輔音 token = 基底（不含固有 a）。如 "ka" → ක（開音節，固有 a）；"k" 後接輔音 → ක්（自動 virama）。
 *  2. 依賴元音符（matra）爲獨立 token：ā→ා、i→ි …；詞首獨立元音（a→අ）與 matra 同 token 依上下文消歧。
 *  3. 合字 / 閉音節：roman→native 時，若輔音後緊接另一輔音（無元音符間隔），引擎在二者之間自動插入
 *     該文種的 virama（僧 ් / 緬 ္ / 高棉 ្ / 泰 ฺ）。此即「固有 a 被消去」的標準處理。
 *     （緬甸 U+1039 ္ 爲合字疊寫符、U+103A ် 爲詞尾殺音符；泰文 U+0E3A ฺ 爲 phinthu、
 *       U+0E4C ์ 爲 thanthakhat「不發音字母」標記——二者輸入端皆收，輸出端取合字符。）
 *  4. niggahita（ṃ）映射爲各文種鼻音符（僧 ං / 緬 ံ / 高棉 ំ / 泰 ํ，泰文民間亦作 ง）。
 *  5. 標準依據：ISO 15919:2001 涵蓋僧伽羅文（且「固有 a 即便不發音也寫出；virama 標記固有元音之缺」），
 *     但**明確排除**緬甸、高棉、泰、寮、藏文——故後三者無單一 ISO 標準，本模組採其本族 abugida 慣例。
 *
 * 字型：Noto Sans Sinhala 字型已隨插件內嵌
 * （見 scripts/gen-noto-fonts.mjs 與 src/vendor/noto-fonts.generated.ts）。
 *
 * 純函數、無 Obsidian 依賴；所有函數不拋未捕獲異常（命令 / 即時上屏層守護）。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationScheme,
} from "./translit-common";

export interface BrahmicChar {
  /** 原生字符（可多字符，如泰文獨立元音 อา = อ+า） */
  ch: string;
  /** 羅馬字 token（IAST 風格；同一文種內唯一，除下文同 token 消歧情形） */
  roman: string;
  cat: "consonant" | "ivowel" | "vowel" | "lvowel" | "mark" | "medial" | "anusvara" | "visarga" | "tone" | "digit" | "punct";
  /**
   * 詞尾 / 音節尾時**不**附加 virama（halanta）。
   * 僅用於「本身已含固有 a 的合字 ligature」（如緬甸 ဿ = ssa）：
   * buddhassa → ဗုဒ္ဓဿ 而非 ဗုဒ္ဓဿ်。
   */
  noVirama?: boolean;
}

/* ---------------- 通用引擎 ---------------- */

interface Cand {
  ch: string;
  roman: string;
  cat: BrahmicChar["cat"];
  noVirama?: boolean;
}
interface BrahmicMaps {
  romanToCands: Map<string, Cand[]>;
  charToRoman: Map<string, string>;
  /** 後行覆蓋前的舊值（如 sinhala ē/ō 長式行被 e/o 短式行覆蓋）；xApprox="longvowel" 時優先取用 */
  charToRomanAlt: Map<string, string>;
  charToCat: Map<string, BrahmicChar["cat"]>;
  /**
   * 僅記錄「輔音」分類的 roman。
   * 用途：泰文 ง（ngo ngu）同時是輔音 ṅ 與 niggahita ṃ（巴利傳統以 ง 記 niggahita），
   * 需靠此表在「ง + 去元音符 ์」時判定其爲輔音 ṅ 而非 niggahita。
   */
  charToConsonantRoman: Map<string, string>;
}

/**
 * 巴利 niggahita 的羅馬字別名。
 * 實證（法句經 BJT/PTS/ChS 校勘本、SuttaCentral）：PTS 用 `ṃ`（m 下點 U+1E43），
 * Ānandajoti / SuttaCentral / ISO 15919 簡式用 `ṁ`（m 上點 U+1E41）。
 * 巴利文獻兩者**同義**，故輸入端一併接受；輸出端統一發 `ṃ`（IAST）。
 */
const NIGGAHITA_ALIASES = ["ṃ", "ṁ"];

/** E4 效能：模組級快取——data 爲模組級靜態資料（同參同果），按 data 陣列記憶化建構結果。 */
const mapsCache = new WeakMap<BrahmicChar[], BrahmicMaps>();

function buildMaps(data: BrahmicChar[]): BrahmicMaps {
  const cached = mapsCache.get(data);
  if (cached) return cached;
  const romanToCands = new Map<string, Cand[]>();
  const charToRoman = new Map<string, string>();
  const charToRomanAlt = new Map<string, string>();
  const charToCat = new Map<string, BrahmicChar["cat"]>();
  const charToConsonantRoman = new Map<string, string>();
  const push = (token: string, cand: Cand) => {
    const list = romanToCands.get(token);
    if (list) {
      if (!list.some((c) => c.ch === cand.ch)) list.push(cand);
    } else {
      romanToCands.set(token, [cand]);
    }
  };
  for (const row of data) {
    // virama / coeng 等 mark 不應作爲 roman→native 的輸入 token（其爲隱式），
    // 但仍記入 charToRoman / charToCat 供 native→roman 辨識（其 roman 留空，不進入 romanToCands）。
    if (row.roman.length > 0) {
      const cand: Cand = { ch: row.ch, roman: row.roman, cat: row.cat, noVirama: row.noVirama };
      push(row.roman, cand);
      if (row.cat === "anusvara") {
        for (const alias of NIGGAHITA_ALIASES) if (alias !== row.roman) push(alias, cand);
      }
    }
    // 每個原生串都記其 token 與 cat（允許同 token 多字符，如 ana/anusvara 同 "ṃ"）
    // 後行覆蓋語義：已有值時舊值存 charToRomanAlt（X-近似歧義選項 r45c：xApprox=
    // "longvowel" 時長式 ඒ/ඕ 出 ē/ō 而非短式統一；其餘模式行為完全不變）
    const prev = charToRoman.get(row.ch);
    if (prev !== undefined && prev !== row.roman) charToRomanAlt.set(row.ch, prev);
    charToRoman.set(row.ch, row.roman);
    charToCat.set(row.ch, row.cat);
    if (row.cat === "consonant") charToConsonantRoman.set(row.ch, row.roman);
  }
  const maps = { romanToCands, charToRoman, charToRomanAlt, charToCat, charToConsonantRoman };
  mapsCache.set(data, maps);
  return maps;
}

function allTokens(data: BrahmicChar[]): string[] {
  const { romanToCands } = buildMaps(data);
  return Array.from(romanToCands.keys()).sort((a, b) => b.length - a.length);
}

/**
 * 前一字符是否屬「輔音 / virama 等標記 / 介音」——用於辨析「獨立元音 vs 依賴元音 / 介音」同 token 歧義。
 * 注意：獨立元音（ivowel）表示其音節「無輔音」，故其後爲新音節之首，
 *      後繼輔音應取「全輔音」而非介音（如巴利 arahato 的 a-ra-ha-ta-o，
 *      အ 後的 r 必須是 ရ 而非介音 ွ），故 ivowel 不列入。
 */
function prevIsConsonantLike(prevCat: BrahmicChar["cat"] | null): boolean {
  return prevCat === "consonant" || prevCat === "medial" || prevCat === "mark";
}

/**
 * 選定同 token 的多個候選（獨立元音 / 依賴元音符 / 前導元音 / 介音 / 輔音）。
 * 【糾偏】巴利 `ḷ` 是**捲舌邊音輔音**（僧 ළ / 高棉 ឡ / 緬 ဠ / 泰 ฬ），不是聲化元音；
 * 僧伽羅表另有聲化元音 ඏ（ivowel）與 ළ 同 token，舊邏輯在非依附位置一律選 ivowel，
 * 導致 saḷāyatana「六處」錯成 සඏආයතන。故非依附位置優先取輔音候選。
 */
function disambiguate(cands: Cand[], wantDependent: boolean): Cand {
  const v = cands.find((c) => c.cat === "vowel");
  const iv = cands.find((c) => c.cat === "ivowel");
  const lv = cands.find((c) => c.cat === "lvowel");
  const m = cands.find((c) => c.cat === "medial");
  const cons = cands.find((c) => c.cat === "consonant");
  if (wantDependent) return lv ?? v ?? m ?? cons ?? cands[0];
  return cons ?? iv ?? cands[0];
}

/**
 * ISO 15919「嚴式鼻音化」（strict nasalization）／巴利 niggahita sandhi 的逆向表：
 * anusvara（niggahita）後接某組塞音時，轉寫爲該組鼻音。
 *   ṅ 前 k/kh/g/gh；ñ 前 c/ch/j/jh；ṇ 前 ṭ/ṭh/ḍ/ḍh；n 前 t/th/d/dh；m 前 p/ph/b/bh。
 * 這同時是巴利文（Kaccāyana sandhi / PTS 與 BJT 校勘本慣例）的標準寫法：
 *   saṃgha → saṅgha、saṃcetanā → sañcetanā、saṃbuddha → sambuddha。
 * 半母音（y r l v）、噝音（s）、h 之前與詞尾則保留 niggahita ṃ（saṃsāra、taṃ）。
 */
const CLASS_NASAL: Record<string, string> = {
  k: "ṅ", kh: "ṅ", g: "ṅ", gh: "ṅ",
  c: "ñ", ch: "ñ", j: "ñ", jh: "ñ",
  "ṭ": "ṇ", "ṭh": "ṇ", "ḍ": "ṇ", "ḍh": "ṇ",
  t: "n", th: "n", d: "n", dh: "n",
  p: "m", ph: "m", b: "m", bh: "m",
};

/**
 * 羅馬字 → 原生文字（最長匹配；處理前導元音重排、同 token 消歧、閉音節自動 virama；
 * 未命中字符原樣保留）。
 *  - virama：該文種去元音符（僧 ් / 緬 ္ / 高棉 ្ / 泰 ฺ），輔音 + 輔音時自動插入形成合字。
 *  - anusvara：該文種 niggahita 鼻音符（僧 ං / 緬 ံ / 高棉 ំ / 泰 ํ），僅由 ṃ / ṁ 輸入觸發。
 *
 * 【糾偏】早期版本把「鼻音 + 異輔音」一律改寫成 niggahita，導致
 *   sambuddha → สงพุทฺธ（泰）、සංබුද්ධ（僧）——與實證的巴利三藏寫法
 *   สมฺมาสมฺพุทฺธสฺส / සම්මාසම්බුද්ධස්ස（m 以合字書寫）相違。
 * 故改爲**保留羅馬字的 ṅ/ñ/ṇ/n/m 與 ṃ 之別**（無損往返）：
 *   想得傳統 niggahita 寫法者請輸入 saṃgha / saṁgha（→ සංඝ สงฆ သံဃ សំឃ）；
 *   輸入 PTS 式 saṅgha 則得合字寫法（→ සඞ්ඝ သင်္ဃ សង្ឃ สงฺฆ）。
 */
export function brahmicRomanToNative(input: string, data: BrahmicChar[], virama?: string, _anusvara?: string): string {
  const { romanToCands } = buildMaps(data);
  const keys = allTokens(data);
  let out = "";
  let prevCat: BrahmicChar["cat"] | null = null;
  let lastConsLen = 0; // 最近發出輔音的字寬（用於前導元音重排）
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);
    let matched = false;
    for (const key of keys) {
      if (rest.startsWith(key)) {
        const cands = romanToCands.get(key) as Cand[];
        let chosen = cands[0];
        if (cands.length > 1) chosen = disambiguate(cands, prevIsConsonantLike(prevCat));

        // 固有 a 的隱式處理：輔音後的 "a" 即固有元音，不發任何字符（並重置 prevCat，
        // 使後續輔音/介音視爲新音節之首，而非前一輔音的從屬）
        if (key === "a" && prevIsConsonantLike(prevCat)) {
          i += key.length;
          prevCat = "vowel";
          lastConsLen = 0;
          matched = true;
          break;
        }

        // 前瞻：下一 token 的 cat 與原生字（若可能是介音 medial，則視爲非輔音，不觸發 virama）
        const after = rest.slice(key.length);
        let nextCat: BrahmicChar["cat"] | null = null;
        for (const k2 of keys) {
          if (after.startsWith(k2)) {
            const c2 = romanToCands.get(k2) as Cand[];
            nextCat = c2.some((c) => c.cat === "medial") ? "medial" : c2[0].cat;
            break;
          }
        }

        // 詞尾 / 音節尾判定：後無任何可識別 token（詞末、空格、標點、異字符）。
        // 梵文（及巴利借詞）大量以輔音收尾（tat / bhūr / bhuvaḥ / vāk / samyak），
        // 按 abugida 慣例須加 virama（halanta）消去固有 a，否則讀回時會多出一個 a。
        const atBoundary = after.length === 0 || !keys.some((k) => after.startsWith(k));
        if (chosen.cat === "consonant") {
          if (nextCat === "consonant") {
            // 合字 / 閉音節：輔音後緊接另一輔音 → 去元音符 virama
            // （含鼻音：dhamma 的 mm、sambuddha 的 mb 皆以合字書寫，符合巴利三藏實證）
            out += chosen.ch + (virama ?? "");
          } else if (atBoundary && !chosen.noVirama) {
            // 詞尾 halanta（緬甸 ligature ဿ 等 noVirama 者除外）
            out += chosen.ch + (virama ?? "");
          } else {
            out += chosen.ch;
          }
          prevCat = "consonant";
          lastConsLen = [...chosen.ch].length;
        } else if (chosen.cat === "medial" && atBoundary) {
          // 詞尾介音（梵文 hy / tvy 等）：介音後無元音 → 加 virama（halanta），
          // 否則 ဟျ 會被讀成 hya。
          out += chosen.ch + (virama ?? "");
          prevCat = chosen.cat;
          lastConsLen = 0;
        } else if (chosen.cat === "lvowel" && lastConsLen > 0) {
          // 前導元音：在泰/緬中存儲於其修飾的輔音「之前」，故插入到剛發出的輔音之前
          const cons = out.slice(out.length - lastConsLen);
          out = out.slice(0, out.length - lastConsLen) + chosen.ch + cons;
          lastConsLen = 0;
          prevCat = "lvowel";
        } else {
          out += chosen.ch;
          prevCat = chosen.cat;
          lastConsLen = 0; // 輔音分支已在上文處理（此處只剩元音 / 符號 / 介音等）
        }
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      prevCat = null;
      lastConsLen = 0;
      i++;
    }
  }
  return out;
}

/**
 * 原生文字 → 羅馬字（逐字映射；前導元音延後發出；virama 隱式不寫出；未收錄字符原樣保留）。
 *
 * niggahita 定向：預設啓用「嚴式鼻音化」（ISO 15919 strict nasalization / 巴利 niggahita sandhi），
 * 即 niggahita 後接同組塞音時還原爲該組鼻音（සංඝ → saṅgha、သံဃ → saṅgha、สงฆ → saṅgha），
 * 與 PTS / BJT / ChS 校勘本及 SuttaCentral 的巴利羅馬轉寫一致；
 * 後接半母音、噝音、h 或位於詞尾則保留 ṃ（saṃsāra、taṃ）。
 * 傳入 `strictNasal: false` 可退回逐字直譯（一律 ṃ）。
 */
export function brahmicNativeToRoman(input: string, data: BrahmicChar[], strictNasal = true, inherentA = true, finalMap?: Record<string, string>, preferAlt = false): string {
  const { charToRoman, charToRomanAlt, charToCat, charToConsonantRoman } = buildMaps(data);
  // preferAlt（X-近似歧義 xApprox="longvowel"）：被後行覆蓋的長式映射優先（sinhala ඒ→ē/ඕ→ō）
  const romanOf = (ch: string): string | undefined =>
    preferAlt ? (charToRomanAlt.get(ch) ?? charToRoman.get(ch)) : charToRoman.get(ch);
  // inherentA：是否爲「輔音自帶固有 a」的 abugida 模型。
  //   多數婆羅米文種（僧/高棉/緬/泰 IAST）爲 true；RTGS 風格泰文無固有元音（音節尾輔音不發 a），
  //   設 false 使音節尾輔音（如 กรุง 的 ง）不補 a，得到 krung 而非 krunga。
  const INH = inherentA ? "a" : "";
  // 鼻音符羅馬字（取資料表 anusvara 條目；IAST=ṃ / ISO15919(Sinhala)=ṅ）
  const anusvaraRoman = data.find((d) => d.cat === "anusvara")?.roman ?? "ṃ";
  // 泰文 ง（ngo ngu）同作輔音與 niggahita：取資料表對應條目，使各方案自定義其值
  const ngConsRoman = data.find((d) => d.ch === "ง" && d.cat === "consonant")?.roman ?? "ṅ";
  const ngAnusRoman = data.find((d) => d.ch === "ง" && d.cat === "anusvara")?.roman ?? ngConsRoman;
  let out = "";
  let pendingLV: string | null = null; // 待延後發出的前導元音羅馬字
  const chars = Array.from(input);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const roman = romanOf(ch);
    const cat = charToCat.get(ch);
    const nxt = i + 1 < chars.length ? chars[i + 1] : "";
    // 【多字符條目優先匹配】部分文種的「獨立元音 / 前導元音」條目由多字符組成：
    //   緬甸 အာ = အ(U+1021) + ာ(U+102C)、泰文 อา/อิ/อุ/เอ = อ + 元音符、เอา = เ+อ+า。
    // 若逐字處理會被拆開（āha → အာဟ 讀成 a + ā + ha = "aāha"；เอวํ → e + vaṃ 讀成 "veṃ"），
    // 故先嘗試 3 字 / 2 字組合；僅對 ivowel / lvowel 條目生效，
    // 以免干擾「輔音 + matra」等需依位置處理的分支。
    const s3 = i + 2 < chars.length ? ch + chars[i + 1] + chars[i + 2] : "";
    const s2 = i + 1 < chars.length ? ch + chars[i + 1] : "";
    const combo = charToRoman.has(s3) ? s3 : charToRoman.has(s2) ? s2 : "";
    if (combo && (charToCat.get(combo) === "ivowel" || charToCat.get(combo) === "lvowel")) {
      out += romanOf(combo) ?? "";
      i += Array.from(combo).length;
      if (pendingLV !== null) { out += pendingLV; pendingLV = null; }
      continue;
    }
    if (cat === "lvowel") {
      // 緬甸 e 符號（ေ U+1031）與 ၗာ（ā 符號 U+102C）連用構成「o」；先行合併，
      // 避免被拆成獨立「e」+「ā」而破壞往返。
      if (ch === "ေ" && nxt === "ာ") {
        out += "o";
        i += 2;
        continue;
      }
      // 泰文 ไ/ใ（sara ai / sara ai mai muan san）標準拼寫中，其後常隨 ย（無聲尾筆，RTGS 不發）：
      //   - ไ/ใ 緊接 ย（如 ใย/ไย）→ 直接發 "ai"，略過 ย；
      //   - ไ/ใ + C + ย（如 ไทย=ไทย、ไป=ไป无ย 不屬此）→ C 爲「ai」音節初始輔音（開音節，不套 finalMap），
      //     發 C 基底 + "ai"，略過 C 與 ย。
      if (ch === "ไ" || ch === "ใ") {
        if (nxt === "ย") {
          out += roman ?? "";
          i += 2; // 略過 ไ/ใ 與 ย
          pendingLV = null;
          continue;
        }
        const nxt2 = i + 2 < chars.length ? chars[i + 2] : "";
        if (nxt2 === "ย") {
          const cRoman = charToRoman.get(nxt) ?? ""; // nxt = C（初始輔音，開音節）
          out += cRoman + (roman ?? "");
          i += 3; // 略過 ไ/ใ、C、ย
          pendingLV = null;
          continue;
        }
      }
      pendingLV = roman ?? null;
      i++;
      continue;
    }
    // 泰文 ง 兼作輔音（合字中，閉音節）與 niggahita（詞尾 / 音節尾），依後接字符辨識；
    // 其值由各方案資料表決定（IAST: ṅ/ṃ；RTGS: ng/ng）
    if (ch === "ง") {
      const nxt2 = i + 1 < chars.length ? chars[i + 1] : "";
      const ncat2 = nxt2 ? charToCat.get(nxt2) : null;
      if (ncat2 === "consonant" || ncat2 === "mark") {
        out += ngConsRoman; // 合字中的輔音 ง（閉，無 a）
      } else {
        out += ngAnusRoman; // 詞尾 / 音節尾 niggahita
      }
      i++;
      if (pendingLV !== null) { out += pendingLV; pendingLV = null; }
      continue;
    }
    if (cat === "consonant") {
      const ncat = nxt ? charToCat.get(nxt) : null;
      // 音節尾輔音判定（RTGS 等「按發音轉寫」方案需套用 finalMap）：
      //   後接另一輔音（新音節之首）/ 前導元音（เ/โ/ไ/ใ 開新音節）/ 去元音符（死音節）/ 詞尾
      //   → 視爲音節尾。注意：依賴/獨立元音（a/i/u…）屬本音節，輔音非尾。
      const isFinal = ncat === "consonant" || ncat === "lvowel" || ncat === "mark" || ncat === null;
      // RTGS 隱含元音 o 與叢首判定：音節首輔音若無顯式元音、且後接輔音鏈「不含元音」
      //   （如 คน khon、กะ ka）→ 補 o、不套 finalMap；若後接輔音鏈「含元音」
      //   （如 พ-ร-ะ → พ 叢首、ก-ร-ุ → ก 叢首）→ 爲叢首，不補 o、不套 finalMap（變體僅用於音節尾）。
      let chainHasVowel = false;
      if (finalMap && !pendingLV && ncat === "consonant") {
        let j = i + 1;
        while (j < chars.length) {
          const ccat = charToCat.get(chars[j]);
          if (ccat === "vowel" || ccat === "ivowel" || ccat === "lvowel" || ccat === "medial") { chainHasVowel = true; break; }
          if (ccat !== "consonant") break;
          j++;
        }
      }
      const clusterInitial = finalMap && !pendingLV && ncat === "consonant" && chainHasVowel;
      // finalMap 僅用於「音節尾且無元音」之輔音：若已有前導元音（pendingLV，如 เ+ท → the）
      // 或爲叢首（如 พ-ร-ะ → ph），本輔音屬開音節，不得套用尾音變體。
      const r = finalMap && isFinal && !clusterInitial && !pendingLV ? (finalMap[roman ?? ""] ?? (roman ?? "")) : (roman ?? "");
      const impliedO = finalMap && !pendingLV && ncat === "consonant" && !chainHasVowel ? "o" : "";
      // 緬甸 e 符號（ေ U+1031）位於其修飾輔音「之後」，且後接 ၗာ（ā U+102C）構成 "o"；
      // 故直接在本輔音上發出 o（泰文前導元音則位於輔音「之前」，走下方通用分支）。
      if (ncat === "lvowel" && nxt === "ေ") {
        const afterLV = i + 2 < chars.length ? chars[i + 2] : "";
        if (afterLV === "ာ") { out += r + "o"; i += 3; }
        else { out += r + "e"; i += 2; }
        pendingLV = null;
        continue;
      }
      let body: string;
      if (ncat === "medial") {
        // 介音（緬 ှ ျ ြ ွ）直接附於本輔音；介音後若還有依賴元音，一併併入本音節
        // （如 taṇhā တဏှာ = ဏ + ှ + ာ → ṇhā，此時介音**不帶**固有 a）。
        // 介音後無元音符時，本音節回歸固有 a（如 ယ+ျ = yya；သကျ = sakya）。
        const mRoman = charToRoman.get(nxt) ?? "";
        const afterM = i + 2 < chars.length ? chars[i + 2] : "";
        const afterCat = afterM ? charToCat.get(afterM) : null;
        if (afterM === "ေ") {
          // 緬甸 e 符號（U+1031）存儲上位於輔音與介音「之後」：ဏ+ွ+ေ → ṇve（manveti မနွေတိ）；
          // 若其後再接 ာ（U+102C）則 ေ+ာ 合爲 o（āhuneyyo အာဟုနေယျော）。
          const afterE = i + 3 < chars.length ? chars[i + 3] : "";
          if (afterE === "ာ") { body = r + mRoman + "o"; i += 4; }
          else { body = r + mRoman + "e"; i += 3; }
        } else if (afterCat === "mark") {
          // 介音 + 去元音符：梵文詞尾 halanta（hy → ဟျ် → hy；tathāgato hy avadat
          // 的 ဟျ 若不加 virama 會被讀成 hya）
          body = r + mRoman;
          i += 3;
        } else if (afterCat === "vowel" || afterCat === "ivowel") {
          body = r + mRoman + (charToRoman.get(afterM) ?? "");
          i += 3;
        } else {
          body = r + mRoman + (pendingLV ?? INH);
          i += 2;
        }
      } else if (ncat === "ivowel") {
        // 【獨立元音另起音節】abugida 中獨立元音（僧 අ / 天城 अ / 悉曇 𑖀）不作 matra 使用，
        // 只出現在音節首（詞首、或前一音節元音之後）。故「輔音 + 獨立元音」應讀作
        // 「本輔音自成一音節（固有 a／前導元音）」+「新音節的獨立元音」，
        // 與 indic.ts 的天城體/悉曇行為一致：නඅ → na + a = "naa"、
        // පච්චුට්ඨානඅඤ්ජලි → paccuṭṭhāna + añjali = "paccuṭṭhānaañjali"。
        // 若把獨立元音當 matra 吞入本音節，則 naa → නඅ → "na"（丟一個 a）而往返失真。
        // 獨立元音本身留待下一輪按「非輔音」分支發出。
        body = r + impliedO + (pendingLV ?? INH);
        i++;
      } else if (ncat === "vowel") {
        // 輔音 + 依賴元音（matra） → 基底 + 元音符。
        // 【多字符 matra 優先】緬甸 ော（ေ+ာ）= o 是單一 token，若逐字讀會拆成 e + ā（teā 而非 to），
        // 故先嘗試 2 字符組合。
        const two = nxt + (i + 2 < chars.length ? chars[i + 2] : "");
        let matra: string;
        let adv = 2;
        if (i + 2 < chars.length && charToCat.get(two) === "vowel" && charToRoman.has(two)) {
          matra = romanOf(two) ?? "";
          adv = 3;
        } else {
          matra = romanOf(nxt) ?? "";
        }
        body = r + (pendingLV ?? "") + matra;
        i += adv;
      } else if (ncat === "lvowel") {
        // 前導元音（泰文 เ/โ）在存儲上「位於其修飾輔音之前」，但屬於「下一個」輔音；
        // 故本輔音按開音節處理（不吞掉 lvowel），lvowel 留待下一輪發出（pendingLV）。
        // 若本輔音本身無元音、且其後前導元音已開啓新音節（如 นโม = น | โม），則補隱含 a。
        const impliedA = finalMap && !pendingLV ? "a" : "";
        body = r + impliedA + (pendingLV ?? INH);
        i++;
      } else if (ncat === "mark") {
        // 合字：virama 消去固有 a，僅寫基底（不寫 a，亦不寫 virama token）；
        // 套用 finalMap（RTGS 死音節尾輔音變體，如 ก์ → k）
        body = r;
        i += 2;
      } else if (ncat === "anusvara") {
        // niggahita：基底 + 固有 a + ṃ（如 saṃ = sa + ṃ）
        // 嚴式鼻音化：後接同組塞音時改寫爲該組鼻音（saṅgha / sañcetanā / sambuddha）
        const nd = i + 2 < chars.length ? chars[i + 2] : "";
        const ndCat = nd ? charToCat.get(nd) : null;
        // 泰文 ง 兼作 ṅ 與 niggahita：後接去元音符 ์ 者爲**輔音 ṅ**（สง์ฆ = saṅgha）
        if (ndCat === "mark" && charToConsonantRoman.has(nxt)) {
          body = r + (pendingLV ?? INH) + (charToConsonantRoman.get(nxt) ?? "");
          i += 3;
        } else {
          let nasal = anusvaraRoman;
          if (strictNasal && ndCat === "consonant") {
            const ndRoman = charToRoman.get(nd);
            if (ndRoman && CLASS_NASAL[ndRoman]) nasal = CLASS_NASAL[ndRoman];
          }
          body = r + (pendingLV ?? INH) + nasal;
          i += 2;
        }
      } else if (ncat === "visarga") {
        body = r + (pendingLV ?? INH) + "ḥ";
        i += 2;
      } else {
        // 開音節（固有 a）/ 叢首（隱含 o）/ 詞尾輔音；若有前導元音（pendingLV）則其取代固有 a
        body = r + impliedO + (pendingLV ?? INH);
        i++;
      }
      out += body;
      pendingLV = null;
      continue;
    }
    // 非輔音、非前導元音：直接映射（獨立元音 / 鼻音符 / 符號 / 數字 / 標點 / 透傳）
    out += roman != null ? roman : ch;
    i++;
  }
  if (pendingLV !== null) out += pendingLV; // 末尾仍有未發出的前導元音（異常情形）
  return out;
}

function isInRange(text: string, start: number, end: number): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= start && c <= end) return true;
  }
  return false;
}

function looksLikeBrahmicRoman(text: string, data: BrahmicChar[]): boolean {
  if (isNativeRange(text, data)) return false;
  const { romanToCands } = buildMaps(data);
  for (const key of romanToCands.keys()) {
    if (key.length >= 2 && text.includes(key)) return true;
  }
  return false;
}

function isNativeRange(text: string, data: BrahmicChar[]): boolean {
  const { charToRoman } = buildMaps(data);
  for (const ch of text) if (charToRoman.has(ch)) return true;
  return false;
}

/* ---------------- 檢字表 ---------------- */

const CAT_SECTION: Record<BrahmicChar["cat"], string> = {
  consonant: "輔音（基底，不含固有 a）",
  ivowel: "獨立元音（詞首）",
  vowel: "依賴元音（matra，輔音後）",
  lvowel: "前導元音（儲存於輔音之前）",
  mark: "去元音符 / 合字標記（virama / coeng / thanthakhat，隱式）",
  medial: "介音（medial）",
  anusvara: "鼻音符（niggahita ṃ）",
  visarga: "止聲（visarga ḥ）",
  tone: "聲調",
  digit: "數字",
  punct: "標點",
};

// C-B3：輸入端歸一化的長元音變體——檢字表 note 明示輸出統一短式
const LONG_VARIANT_NOTE: Record<string, string> = {
  "ේ": "長 e（diga kombuva）；輸入端接受，輸出統一短式 ෙ（IAST 無長短 e 之別）",
  "ෝ": "長 o（kombuva haa diga aela-pilla）；輸入端接受，輸出統一短式 ො（IAST 無長短 o 之別）",
  // P2-4：ḷ 兩寫法收斂——引擎面 ළ+lakuna（ළ්）為常規拼寫（巴利文獻主流），表列
  // ඏ 為原子 ivowel 變體：單用反查 'ḷ' 一致、正轉按上下文取輔音候選（saḷāyatana
  // 糾偏先例），二者皆文獻可見，此處僅註明變體關係不改碼。
  "ඏ": "聲化元音 ḷ 之原子寫法（與輔音 ළ+lakuna 同 token 引擎歸一；巴利 ḷ 兩寫法皆文獻可見，本方案常規輸出為 ළ්）",
};

function buildCharTable(data: BrahmicChar[]): CharTableEntry[] {
  return data
    .filter((row) => row.roman.length > 0)
    .map((row) => ({
      native: row.ch,
      roman: row.roman,
      note: LONG_VARIANT_NOTE[row.ch] ?? CAT_SECTION[row.cat],
      section: CAT_SECTION[row.cat],
    }));
}

function createBrahmicScheme(opts: {
  id: string;
  label: Record<string, string>;
  group: string;
  description: string;
  data: BrahmicChar[];
  virama: string;
  anusvara: string;
  looksLikeNative: (t: string) => boolean;
  /** 是否為主方案（備選方案設 false） */
  primary?: boolean;
  /** 備選方案指向的主方案 id（與 altOf 隔離，避免自動互轉撞名） */
  altOf?: string;
  /** 像該文種羅馬字（用於自動方向判定；預設按資料表推斷） */
  looksLikeRoman?: (t: string) => boolean;
  /** 是否「輔音自帶固有 a」的 abugida 模型（預設 true）。RTGS 風格泰文設 false：
   *  泰文無固有元音，音節尾輔音（如 กรุง 的 ง）不補 a，得 krung 而非 krunga。 */
  inherentA?: boolean;
  /** 音節尾輔音映射（RTGS 等「按發音轉寫」方案用）：當輔音處於音節尾（後接另一輔音 /
   *  去元音符 / 詞尾）時，以其值取代原羅馬字。如 RTGS：ส/ศ/ษ 尾→t、ท/ธ 尾→t、ผ/พ/ภ/ฝ 尾→p、
   *  ย/ร/ล 尾→n。 */
  finalMap?: Record<string, string>;
  /** 旗標制：從選擇面隱藏（功能保留） */
  hiddenFromPicker?: boolean;
  /** f2-A：全方案通用 esc 標註 token（\uXXXX）原子化（透傳到 TransliterationScheme） */
  escAnnotationToken?: boolean;
}): TransliterationScheme {
  return {
    id: opts.id,
    label: opts.label,
    group: opts.group,
    hiddenFromPicker: opts.hiddenFromPicker,
    escAnnotationToken: opts.escAnnotationToken,
    primary: opts.primary ?? true,
    altOf: opts.altOf,
    description: opts.description,
    romanToNative: (input, _o) => brahmicRomanToNative(input, opts.data, opts.virama, opts.anusvara),
    nativeToRoman: (input, o) => brahmicNativeToRoman(input, opts.data, o?.strictNasal !== false, opts.inherentA ?? true, opts.finalMap, o?.xApprox === "longvowel"),
    looksLikeNative: opts.looksLikeNative,
    looksLikeRoman: opts.looksLikeRoman ?? ((t) => looksLikeBrahmicRoman(t, opts.data)),
    convert: (input, o) =>
      opts.looksLikeNative(input)
        ? brahmicNativeToRoman(input, opts.data, true, opts.inherentA ?? true, opts.finalMap, o?.xApprox === "longvowel")
        : brahmicRomanToNative(input, opts.data, opts.virama),
    charTable: buildCharTable(opts.data),
  };
}

const DIGITS_SIN = ["෦", "෧", "෨", "෩", "෪", "෫", "෬", "෭", "෮", "෯"];
function digitRows(digits: string[]): BrahmicChar[] {
  return digits.map((ch, idx) => ({ ch, roman: String(idx), cat: "digit" }));
}

/* ============================================================================
 * 一、僧伽羅文（Sinhala，U+0D80–U+0DFF）：ISO 15919 涵蓋；輔音基底 + 固有 a + virama ్
 * ========================================================================== */
const SINHALA: BrahmicChar[] = [
  // 輔音（IAST 基底）
  { ch: "ක", roman: "k", cat: "consonant" },
  { ch: "ඛ", roman: "kh", cat: "consonant" },
  { ch: "ග", roman: "g", cat: "consonant" },
  { ch: "ඝ", roman: "gh", cat: "consonant" },
  { ch: "ඞ", roman: "ṅ", cat: "consonant" },
  { ch: "ච", roman: "c", cat: "consonant" },
  { ch: "ඡ", roman: "ch", cat: "consonant" },
  { ch: "ජ", roman: "j", cat: "consonant" },
  { ch: "ඣ", roman: "jh", cat: "consonant" },
  { ch: "ඤ", roman: "ñ", cat: "consonant" },
  { ch: "ට", roman: "ṭ", cat: "consonant" },
  { ch: "ඨ", roman: "ṭh", cat: "consonant" },
  { ch: "ඩ", roman: "ḍ", cat: "consonant" },
  { ch: "ඪ", roman: "ḍh", cat: "consonant" },
  { ch: "ණ", roman: "ṇ", cat: "consonant" },
  { ch: "ත", roman: "t", cat: "consonant" },
  { ch: "ථ", roman: "th", cat: "consonant" },
  { ch: "ද", roman: "d", cat: "consonant" },
  { ch: "ධ", roman: "dh", cat: "consonant" },
  { ch: "න", roman: "n", cat: "consonant" },
  { ch: "ප", roman: "p", cat: "consonant" },
  { ch: "ඵ", roman: "ph", cat: "consonant" },
  { ch: "බ", roman: "b", cat: "consonant" },
  { ch: "භ", roman: "bh", cat: "consonant" },
  { ch: "ම", roman: "m", cat: "consonant" },
  { ch: "ය", roman: "y", cat: "consonant" },
  { ch: "ර", roman: "r", cat: "consonant" },
  { ch: "ල", roman: "l", cat: "consonant" },
  { ch: "ව", roman: "v", cat: "consonant" },
  { ch: "ශ", roman: "ś", cat: "consonant" },
  { ch: "ෂ", roman: "ṣ", cat: "consonant" },
  { ch: "ස", roman: "s", cat: "consonant" },
  { ch: "හ", roman: "h", cat: "consonant" },
  { ch: "ළ", roman: "ḷ", cat: "consonant" },
  // 獨立元音（詞首）
  { ch: "අ", roman: "a", cat: "ivowel" },
  { ch: "ආ", roman: "ā", cat: "ivowel" },
  { ch: "ඉ", roman: "i", cat: "ivowel" },
  { ch: "ඊ", roman: "ī", cat: "ivowel" },
  { ch: "උ", roman: "u", cat: "ivowel" },
  { ch: "ඌ", roman: "ū", cat: "ivowel" },
  { ch: "එ", roman: "e", cat: "ivowel" },
  { ch: "ඔ", roman: "o", cat: "ivowel" },
  // 獨立長母音字母（r44s 收編）：ඒ=ē（U+0D92）、ඕ=ō（U+0D95）。IAST 有
  // 長音位 ē/ō（梵文長 e/o 獨立詞首形）；輸入端 ē→ඒ、ō→ඕ；輸出端 e/o 仍統一
  // 短式 එ/ඔ（C-B3 慣例不變——新增僅擴表達力，現有映射零行為變化）。
  { ch: "ඒ", roman: "ē", cat: "ivowel" },
  { ch: "ඕ", roman: "ō", cat: "ivowel" },
  { ch: "ඓ", roman: "ai", cat: "ivowel" },
  { ch: "ඖ", roman: "au", cat: "ivowel" },
  { ch: "ඍ", roman: "ṛ", cat: "ivowel" },
  { ch: "ඎ", roman: "ṝ", cat: "ivowel" },
  { ch: "ඏ", roman: "ḷ", cat: "ivowel" },
  { ch: "ඐ", roman: "ḹ", cat: "ivowel" },
  // 依賴元音符（matra）
  { ch: "ා", roman: "ā", cat: "vowel" },
  { ch: "ි", roman: "i", cat: "vowel" },
  { ch: "ී", roman: "ī", cat: "vowel" },
  { ch: "ු", roman: "u", cat: "vowel" },
  { ch: "ූ", roman: "ū", cat: "vowel" },
  // 長式組合符 ē/ō 變體（r44s 收編）：輸入端 kē→කේ、kō→කෝ。列於 e/o 行
  // 之前：charToRoman 後行覆蓋，e/o 短式行殿後＝輸出端 n2r 仍統一短式 ෙ/ො（C-B3，
  // 與 ē/ō 收編前行為不變）；ē/ō 僅進輸入端 romanToCands。
  { ch: "ේ", roman: "ē", cat: "vowel" },
  { ch: "ෝ", roman: "ō", cat: "vowel" },
  { ch: "ෙ", roman: "e", cat: "vowel" },
  // 長 e（diga kombuva ේ，U+0DDA ≡ 0DD9+0DCA）：巴利/梵 IAST 無長短 e 之別，
  // 與 ෙ 同 token「e」；輸入端接受，輸出端統一用短式 ෙ（故列於其後）。
  { ch: "ේ", roman: "e", cat: "vowel" },
  // 【糾偏】舊表把「o」誤配到 ෝ（U+0DDD kombuva haa diga aela-pilla = 長 o / oo）。
  // Unicode 標準名為「SINHALA VOWEL SIGN O」者是 U+0DDC ො（kombuva haa aela-pilla，短 o）；
  // 巴利三藏禮敬文實證寫作 නමො / භගවතො / අරහතො（皆 U+0DDC），
  // 故以 ො 為輸出形，ෝ 保留為輸入變體（長短 o 在 IAST 同作 o）。
  { ch: "ො", roman: "o", cat: "vowel" },
  { ch: "ෝ", roman: "o", cat: "vowel" },
  { ch: "ෛ", roman: "ai", cat: "vowel" },
  { ch: "ෞ", roman: "au", cat: "vowel" },
  { ch: "ෘ", roman: "ṛ", cat: "vowel" },
  { ch: "ෲ", roman: "ṝ", cat: "vowel" },
  // virama（去除固有 a；隱式，token 留空不進入 roman→native；native→roman 由其 mark cat 辨識）
  { ch: "්", roman: "", cat: "mark" },
  // niggahita（鼻音符 ṃ）
  { ch: "ං", roman: "ṃ", cat: "anusvara" },
  // 止聲（visarga ḥ；U+0D83 SINHALA SIGN VISARGAYA）——梵文 bhuvaḥ / svaḥ / naḥ 等
  { ch: "ඃ", roman: "ḥ", cat: "visarga" },
  // 僧伽羅語專有字母（n2737 SLS 1134 §3.1/3.2：出向官方記法）——
  // · æ 元音 ඇ/ඈ（ae/aee）及其 matra ැ/ෑ：僧語獨有短/長 ae 音。
  //   出向 n2737 官方記法 ae/aee；語義安全：abugida 詞內元音全由 matra 表達，
  //   羅馬 ae/aee 直串不承載其他語義。
  // · 五個 prenasalized stops 中 ඟ/ඦ/ඬ/ඥ 收錄（nng/ndj/nnd/jnya）；
  //   ඳ/ඹ（nd/mb）不收——nd/mb 與巴利常用序列（sandi/canda/ambaya
  //   實證 nda→න්ද）爭同一輸入 token，收錄必破壞既有往返；
  //   序列形由 n්+g 等自動組合轉，單字母輸入走 \uXXXX esc 標註。
  // · ඁ candrabindu（U18 chart 新收錄，n2737 表無）、෴ kundaliya（§4.2）。
  // · ෟ/ෳ vocalic l/ll matra（獨立母音 ඏ/ඐ 已收，補齊對應 matra）。
  { ch: "ඇ", roman: "ae", cat: "ivowel" },
  { ch: "ඈ", roman: "aee", cat: "ivowel" },
  { ch: "ැ", roman: "ae", cat: "vowel" },
  { ch: "ෑ", roman: "aee", cat: "vowel" },
  { ch: "ඟ", roman: "nng", cat: "consonant" },
  { ch: "ඦ", roman: "ndj", cat: "consonant" },
  { ch: "ඬ", roman: "nnd", cat: "consonant" },
  { ch: "ඥ", roman: "jnya", cat: "consonant" },
  { ch: "ඁ", roman: "\u02ee", cat: "mark" },
  { ch: "෴", roman: ".", cat: "mark" },
  { ch: "ෟ", roman: "ḹ", cat: "vowel" },
  { ch: "ෳ", roman: "ḹ\u0304", cat: "vowel" },
  // 數字
  ...digitRows(DIGITS_SIN),
];

/* ============================================================================
 * 二·六、僧伽羅文 ISO 15919 備選（altOf sinhala-pali）
 * ── 與 sinhala-pali（IAST）之別 ────────────────────────────────────────────
 *  兩者皆 abugida（固有 a 寫出：ක=ka），差異僅在專用字母：
 *   1. ISO 15919 另有專用字母 f（ෆ U+0DC6，僧伽羅借詞用）；
 *   2. 鼻音符 ං 一律取 ṃ（與 IAST 及其他 ISO 15919 方案一致）。
 *
 * 【糾偏】舊版曾把 ISO 方案的鼻音符設爲 ṅ（依斯里蘭卡本地習慣：Śrī Laṅkā、Siṅhala），
 *  但這與輔音 ඞ（U+0D9E，ṅ）撞車：兩者爭奪同一 roman token「ṅ」，
 *  使 nativeToRoman(ං) 只能輸出 ṅ，導致 dhammaṃ → ධම්මං → dhammaṅ、
 *  paraṃ → පරං → paraṅ 等大量巴利詞往返失真（ṃ 與 ං 無法互相對應）。
 *  斯里蘭卡習慣的 ṅ 寫法無需另設條目——它本就由嚴式鼻音化在同組塞音前自動產生
 *  （සංඝ → saṅgha、සඤ්ච → sañca），故本方案回歸標準 ṃ。
 * ========================================================================== */
const SINHALA_ISO: BrahmicChar[] = SINHALA.concat([
  { ch: "ෆ", roman: "f", cat: "consonant" },
]);

/* ---------------- 文種檢測 ---------------- */

export const isSinhalaUnicode = (t: string) => isInRange(t, 0x0d80, 0x0dff);

/* ---------------- 註冊 ---------------- */

const sinhalaScheme = createBrahmicScheme({
  id: "sinhala-pali",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "僧伽罗文 IAST",
    "zh-TW": "僧伽羅文 IAST",
    ja: "シンハラ文字 IAST", ko: "신할라 문자 IAST",
    en: "Sinhala (IAST)",
    bo: "Sinhala (IAST)",
    ug: "Sinhala (IAST)",
  fr: "Sinhala (IAST)", de: "Singhalesisch (IAST)", },
  group: "sinhala",
  description: "僧伽羅文（abugida + virama ්，ISO 15919 涵蓋）↔ IAST 羅馬字；巴利/梵無損轉寫。長 e ේ／長 o ෝ 輸入端接受並歸一，輸出統一短式 ෙ/ො（C-B3）",
  data: SINHALA,
  virama: "්",
  anusvara: "ං",
  looksLikeNative: isSinhalaUnicode,
});

registerScheme(sinhalaScheme);

const sinhalaIsoScheme = createBrahmicScheme({
  id: "sinhala-iso15919",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "僧伽罗文（ISO 15919 轉寫）",
    "zh-TW": "僧伽羅文（ISO 15919 轉寫）",
    ja: "シンハラ文字（ISO 15919）", ko: "신할라 문자(ISO 15919)",
    en: "Sinhala (ISO 15919)",
    bo: "Sinhala (ISO 15919)",
    ug: "Sinhala (ISO 15919)",
  fr: "Sinhala (ISO 15919)", de: "Singhalesisch (ISO 15919)", },
  group: "sinhala",
  hiddenFromPicker: true, // 只收選擇面不收引擎（功能保留）
  description: "僧伽羅文 ↔ ISO 15919（專用字母 f=ෆ；鼻音符 ං=ṃ，斯里蘭卡習慣 ṅ 由嚴式鼻音化自動產生）；備選於 sinhala-pali（IAST）",
  data: SINHALA_ISO,
  virama: "්",
  anusvara: "ං",
  looksLikeNative: isSinhalaUnicode,
  primary: false,
  altOf: "sinhala-pali",
});

registerScheme(sinhalaIsoScheme);
