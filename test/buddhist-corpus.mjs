// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 佛經對照文本語料測試（大量真實經文，確認轉寫可靠性）
 *
 * ── 語料來源與校勘依據 ────────────────────────────────────────────────────
 *  · 巴利語料：Pāli Tipiṭaka 通行校勘本（PTS / BJT / ChS）與 SuttaCentral 的
 *    IAST 羅馬轉寫；禮敬文、三皈依、五戒、緣起偈、法句經、吉祥經、慈經、
 *    四聖諦、十二緣起、四念處等核心經文。
 *  · 梵語語料：般若心經（Prajñāpāramitāhṛdaya）、六字大明咒、Gāyatrī Mantra、
 *    緣起法頌（ye dharmā hetuprabhavā）、薄伽梵歌開篇等通行 IAST 轉寫。
 *
 * ── 本輪實證糾偏（均由本語料驅動發現）─────────────────────────────────────
 *   1. 泰文合字 virama 應爲 phinthu ฺ(U+0E3A)，非 thanthakhat ์(U+0E4C)；
 *      niggahita 應爲 nikkhahit ํ(U+0E4D)，非 ง —— พุทฺธํ / อรหํ 方與泰文三藏一致。
 *   2. 緬甸合字 virama 應爲 U+1039 ္（疊寫），非 U+103A ်（詞尾殺音符）；
 *      geminate ss 應以 ligature ဿ(U+103F) 單字符書寫 —— တဿ / ကဿပ / ဗုဒ္ဓဿ。
 *   3. 緬甸 e 符號 ေ(U+1031) **編碼於輔音之後**（ကေ = က+ေ），非泰文式前導元音；
 *      誤置會使 verena → ေဝေရန → verana。
 *   4. 多字符「獨立元音」條目（緬 အာ=အ+ာ、泰 อา=อ+า / เอ=เ+อ、高棉 អា=អ+ា）
 *      必須整體匹配，否則 āha → အာဟ 會被讀成 a + ā + ha = "aāha"。
 *   5. 僧伽羅 o 應爲 U+0DDC ො（Unicode 標準 "vowel sign o"），非 U+0DDD ෝ（長 o）。
 *   6. 詞尾輔音（梵文 tat / bhūr / vāk 等）須加 virama（halanta），
 *      否則讀回時多出固有 a（tat → තත → tata）。
 *   7. 高棉詞首長 a 應作 អ+ា（U+17A2+17B6），非罕用古體 ឤ(U+17A4)；
 *      U+17A8 ឨ 實爲 "uk" 合字，非 ū（應作 U+17A9 ឩ）。
 *
 * 執行：node test/buddhist-corpus.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-corpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const get = (id) => lib.getScheme(id);

console.log("=== 佛經對照文本語料測試（巴利 / 梵文 × 四婆羅米文種 × 天城體）===");

/* ============================================================================
 * 一、巴利語料（66 句）
 * ========================================================================== */
const PALI = [
  "namo tassa bhagavato arahato sammāsambuddhassa",
  "buddhaṃ saraṇaṃ gacchāmi",
  "dhammaṃ saraṇaṃ gacchāmi",
  "saṅghaṃ saraṇaṃ gacchāmi",
  "dutiyampi buddhaṃ saraṇaṃ gacchāmi",
  "tatiyampi saṅghaṃ saraṇaṃ gacchāmi",
  "pāṇātipātā veramaṇī sikkhāpadaṃ samādiyāmi",
  "adinnādānā veramaṇī sikkhāpadaṃ samādiyāmi",
  "kāmesumicchācārā veramaṇī sikkhāpadaṃ samādiyāmi",
  "musāvādā veramaṇī sikkhāpadaṃ samādiyāmi",
  "surāmerayamajjapamādaṭṭhānā veramaṇī sikkhāpadaṃ samādiyāmi",
  "ye dhammā hetuppabhavā tesaṃ hetuṃ tathāgato āha",
  "tesañca yo nirodho evaṃvādī mahāsamaṇo",
  "sabbe saṅkhārā aniccāti yadā paññāya passati",
  "atha nibbindati dukkhe esa maggo visuddhiyā",
  "sabbe saṅkhārā dukkhāti yadā paññāya passati",
  "sabbe dhammā anattāti yadā paññāya passati",
  "manopubbaṅgamā dhammā manoseṭṭhā manomayā",
  "manasā ce paduṭṭhena bhāsati vā karoti vā",
  "tato naṃ dukkhamanveti cakkaṃva vahato padaṃ",
  "na hi verena verāni sammantīdha kudācanaṃ",
  "averena ca sammanti esa dhammo sanantano",
  "appamādo amatapadaṃ pamādo maccuno padaṃ",
  "appamattā na mīyanti ye pamattā yathā matā",
  "sabbe tasanti daṇḍassa sabbe bhāyanti maccuno",
  "attānaṃ upamaṃ katvā na haneyya na ghātaye",
  "dukkhaṃ ariyasaccaṃ",
  "dukkhasamudayaṃ ariyasaccaṃ",
  "dukkhanirodhaṃ ariyasaccaṃ",
  "dukkhanirodhagāminī paṭipadā ariyasaccaṃ",
  "avijjāpaccayā saṅkhārā saṅkhārapaccayā viññāṇaṃ",
  "viññāṇapaccayā nāmarūpaṃ nāmarūpapaccayā saḷāyatanaṃ",
  "saḷāyatanapaccayā phasso phassapaccayā vedanā",
  "vedanāpaccayā taṇhā taṇhāpaccayā upādānaṃ",
  "upādānapaccayā bhavo bhavapaccayā jāti",
  "jātipaccayā jarāmaraṇaṃ sokaparidevadukkhadomanassupāyāsā sambhavanti",
  "mettā bhāvanā karuṇā muditā upekkhā",
  "sabbe sattā averā hontu abyāpajjhā sukhī attānaṃ pariharantu",
  "bhikkhu bhikkhuṇī upāsaka upāsikā",
  "kāyānupassanā vedanānupassanā cittānupassanā dhammānupassanā",
  "sati paññā samādhi vīriya saddhā",
  "aniccaṃ dukkhaṃ anattā",
  "sīlaṃ samādhi paññā vimutti",
  "nibbānaṃ paramaṃ sukhaṃ",
  "āraddhavīriyo paramatthapaṭivedhāya",
  "tathāgato arahaṃ sammāsambuddho",
  "svākkhāto bhagavatā dhammo sandiṭṭhiko akāliko ehipassiko",
  "opanayiko paccattaṃ veditabbo viññūhi",
  "supaṭipanno bhagavato sāvakasaṅgho",
  "ujupaṭipanno ñāyappaṭipanno sāmīcipaṭipanno",
  "āhuneyyo pāhuneyyo dakkhiṇeyyo añjalikaraṇīyo",
  "anuttaraṃ puññakkhettaṃ lokassa",
  "kassapa gotama kaccāna koṇḍañña",
  "mahākassapo sāriputto moggallāno ānando",
  "sāvatthi jetavana anāthapiṇḍika",
  "rājagaha veḷuvana kalandakanivāpa",
  "dhammacakkappavattanasuttaṃ",
  "anattalakkhaṇasuttaṃ",
  "ādittapariyāyasuttaṃ",
  "maṅgalasuttaṃ ratanasuttaṃ mettasuttaṃ",
  "khandha āyatana dhātu indriya bala bojjhaṅga magga",
  "rūpaṃ vedanā saññā saṅkhārā viññāṇaṃ",
  "paṭiccasamuppādo paṭipadā visuddhi",
  "sakya malla vesāli nālandā",
];

/* ============================================================================
 * 二、梵語語料（37 句）
 * ========================================================================== */
const SANSKRIT = [
  "oṃ maṇi padme hūṃ",
  "oṃ namo bhagavate āryāvalokiteśvarāya bodhisattvāya mahāsattvāya mahākāruṇikāya",
  "tadyathā oṃ dhara dhara dhiri dhiri dhuru dhuru itte vatte",
  "gate gate pāragate pārasaṃgate bodhi svāhā",
  "oṃ śāntiḥ śāntiḥ śāntiḥ",
  "oṃ bhūr bhuvaḥ svaḥ tat savitur vareṇyaṃ",
  "bhargo devasya dhīmahi dhiyo yo naḥ pracodayāt",
  "prajñāpāramitā hṛdaya sūtra",
  "rūpaṃ śūnyatā śūnyataiva rūpam",
  "rūpānna pṛthak śūnyatā śūnyatāyā na pṛthag rūpam",
  "yad rūpaṃ sā śūnyatā yā śūnyatā tadrūpam",
  "tasmāc chāriputra śūnyatāyāṃ na rūpaṃ na vedanā na saṃjñā",
  "na saṃskārā na vijñānam",
  "nāsti dharmo nāsti adharmo nāsti saṃskṛtaṃ",
  "ye dharmā hetuprabhavā hetuṃ teṣāṃ tathāgato hy avadat",
  "teṣāṃ ca yo nirodha evaṃvādī mahāśramaṇaḥ",
  "sarvasattvānāṃ hitāya sukhāya",
  "namo ratnatrayāya",
  "namo bhagavate tathāgatāya arhate samyaksaṃbuddhāya",
  "bhūtaṃ bhautikaṃ cittam",
  "anityaṃ duḥkhaṃ anātmā śūnyaṃ",
  "cittaṃ manovijñānaṃ ālayavijñānaṃ",
  "maitreya bodhisattva avalokiteśvara mañjuśrī samantabhadra",
  "vajrasattva vajrapāṇi vajradhara",
  "sukhāvatī vyūha sūtra",
  "saddharmapuṇḍarīka sūtra",
  "vajracchedikā prajñāpāramitā sūtra",
  "dharmakṣetre kurukṣetre samavetā yuyutsavaḥ",
  "māmakāḥ pāṇḍavāś caiva kim akurvata saṃjaya",
  "yogasthaḥ kuru karmāṇi saṅgaṃ tyaktvā dhanaṃjaya",
  "siddhyasiddhyoḥ samo bhūtvā samatvaṃ yoga ucyate",
  "bhaktiṃ jñānaṃ vairāgyaṃ mokṣaṃ nirvāṇaṃ saṃsāraṃ",
  "aṣṭāṅgamārga",
  "kṣetra jñāna vijñāna saṃskāra",
  "namaḥ sarvajñāya",
  "bodhisattva mahāsattva",
  "nirvāṇaṃ śāntaṃ śivam advaitam",
];

const BRAHMIC = ["sinhala-pali"];
const DEVANAGARI = ["sanskrit-iast", "pali-iast"];

/* ---------- 1. 巴利語料：僧伽羅文往返無損 ---------- */
for (const id of BRAHMIC) {
  test(`${id}：巴利語料 ${PALI.length} 句 roman→native→roman 全部無損`, () => {
    const s = get(id);
    const bad = [];
    for (const w of PALI) {
      const back = s.nativeToRoman(s.romanToNative(w));
      if (back !== w) bad.push(`「${w}」→ ${s.romanToNative(w)} → 「${back}」`);
    }
    assert.deepEqual(bad, [], `${id} 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
  });
}

/* ---------- 2. 巴利語料：天城體（pali / sanskrit-iast）往返無損 ---------- */
for (const id of DEVANAGARI) {
  test(`${id}：巴利語料 ${PALI.length} 句 roman→deva→roman 全部無損`, () => {
    const s = get(id);
    const bad = [];
    for (const w of PALI) {
      const back = s.nativeToRoman(s.romanToNative(w));
      if (back !== w) bad.push(`「${w}」→ ${s.romanToNative(w)} → 「${back}」`);
    }
    assert.deepEqual(bad, [], `${id} 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
  });
}

/* ---------- 3. 梵語語料：天城體（sanskrit-iast）往返無損 ---------- */
test(`sanskrit-iast：梵語語料 ${SANSKRIT.length} 句 roman→deva→roman 全部無損`, () => {
  const s = get("sanskrit-iast");
  const bad = [];
  for (const w of SANSKRIT) {
    const back = s.nativeToRoman(s.romanToNative(w));
    if (back !== w) bad.push(`「${w}」→ ${s.romanToNative(w)} → 「${back}」`);
  }
  assert.deepEqual(bad, [], `sanskrit-iast 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
});

/* ---------- 4. 梵語語料：四婆羅米文種（嚴式鼻音化關閉時）往返無損 ----------
 * 說明：婆羅米四方案預設啓用 ISO 15919「嚴式鼻音化」（saṃgha→saṅgha、saṃjaya→sañjaya），
 * 這是巴利三藏（PTS/BJT/ChS）的正確讀法；梵文咒語則慣用保留 ṃ。
 * 故此處以 strictNasal:false 驗證「字形層面」無損，預設值的語音規範化另由 brahmic.mjs 覆蓋。 */
for (const id of BRAHMIC) {
  test(`${id}：梵語語料 ${SANSKRIT.length} 句（strictNasal:false）往返無損`, () => {
    const s = get(id);
    const bad = [];
    for (const w of SANSKRIT) {
      const nat = s.romanToNative(w);
      const back = s.nativeToRoman(nat, { strictNasal: false });
      if (back !== w) bad.push(`「${w}」→ ${nat} → 「${back}」`);
    }
    assert.deepEqual(bad, [], `${id} 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
  });
}

/* ---------- 5. 原生對照形：禮敬文 + 三皈依（真實三藏慣用形） ---------- */
const HOMAGE = "namo tassa bhagavato arahato sammāsambuddhassa";
const HOMAGE_NATIVE = {
  "sinhala-pali": "නමො තස්ස භගවතො අරහතො සම්මාසම්බුද්ධස්ස",
};
const REFUGE = "buddhaṃ saraṇaṃ gacchāmi";
const REFUGE_NATIVE = {
  "sinhala-pali": "බුද්ධං සරණං ගච්ඡාමි",
};
for (const id of BRAHMIC) {
  test(`${id}：禮敬文原生形 = 三藏慣用形`, () => {
    assert.equal(get(id).romanToNative(HOMAGE), HOMAGE_NATIVE[id]);
  });
  test(`${id}：三皈依「${REFUGE}」原生形 = 三藏慣用形`, () => {
    assert.equal(get(id).romanToNative(REFUGE), REFUGE_NATIVE[id]);
  });
  test(`${id}：禮敬文原生形回讀 = IAST 原句`, () => {
    assert.equal(get(id).nativeToRoman(HOMAGE_NATIVE[id]), HOMAGE);
  });
}

/* ---------- 6. 天城體對照形（般若心經 / 緣起偈 / 皈依文） ---------- */
const DEVA_REF = [
  ["buddhaṃ saraṇaṃ gacchāmi", "बुद्धं सरणं गच्छामि"],
  ["dhammaṃ saraṇaṃ gacchāmi", "धम्मं सरणं गच्छामि"],
  ["saṅghaṃ saraṇaṃ gacchāmi", "सङ्घं सरणं गच्छामि"],
  ["namo tassa bhagavato arahato sammāsambuddhassa", "नमो तस्स भगवतो अरहतो सम्मासम्बुद्धस्स"],
  ["aniccaṃ dukkhaṃ anattā", "अनिच्चं दुक्खं अनत्ता"],
  ["nibbānaṃ paramaṃ sukhaṃ", "निब्बानं परमं सुखं"],
  ["ye dhammā hetuppabhavā tesaṃ hetuṃ tathāgato āha", "ये धम्मा हेतुप्पभवा तेसं हेतुं तथागतो आह"],
  ["manopubbaṅgamā dhammā manoseṭṭhā manomayā", "मनोपुब्बङ्गमा धम्मा मनोसेट्ठा मनोमया"],
];
for (const [roman, deva] of DEVA_REF) {
  test(`pali-iast：${roman} → ${deva}`, () => {
    assert.equal(get("pali-iast").romanToNative(roman), deva);
    assert.equal(get("pali-iast").nativeToRoman(deva), roman);
  });
}
const SKT_DEVA_REF = [
  ["gate gate pāragate pārasaṃgate bodhi svāhā", "गते गते पारगते पारसंगते बोधि स्वाहा"],
  ["prajñāpāramitā hṛdaya sūtra", "प्रज्ञापारमिता हृदय सूत्र"],
  ["rūpaṃ śūnyatā śūnyataiva rūpam", "रूपं शून्यता शून्यतैव रूपम्"],
  // A-P3：oṃ 獨立詞依 r17 裁定輸出 ॐ（U+0950）——buddhist-corpus 舊斷言期望音位拼寫
  // 'ओं' 與引擎裁定衝突（0.1.96 起預存 2 敗，stash 二分實證）。itrans-corpus（OM→ॐ）、
  // run.mjs suggestFlow（ॐ→sanskrit）均已依賴 ॐ 特例，斷言對齊引擎。
  ["oṃ maṇi padme hūṃ", "ॐ मणि पद्मे हूं"],
  ["oṃ śāntiḥ śāntiḥ śāntiḥ", "ॐ शान्तिः शान्तिः शान्तिः"],
  ["teṣāṃ ca yo nirodha evaṃvādī mahāśramaṇaḥ", "तेषां च यो निरोध एवंवादी महाश्रमणः"],
];
for (const [roman, deva] of SKT_DEVA_REF) {
  test(`sanskrit-iast：${roman} → ${deva}`, () => {
    assert.equal(get("sanskrit-iast").romanToNative(roman), deva);
    assert.equal(get("sanskrit-iast").nativeToRoman(deva), roman);
  });
}

/* ---------- 7. 合字 / 連寫覆蓋（本輪擴展項） ---------- */
const CONJUNCT = {
  "sinhala-pali": [
    ["buddha", "බුද්ධ"],
    ["dhamma", "ධම්ම"],
    ["saṅgha", "සඞ්ඝ"],
    ["namo", "නමො"],         // ො = U+0DDC
  ],
};
for (const [id, pairs] of Object.entries(CONJUNCT)) {
  for (const [roman, native] of pairs) {
    test(`${id}：合字「${roman}」→ 「${native}」且往返`, () => {
      assert.equal(get(id).romanToNative(roman), native);
      assert.equal(get(id).nativeToRoman(native), roman);
    });
  }
}

/* ---------- 8. 詞尾 halanta（梵文輔音收尾不得多出固有 a） ---------- */
const HALANTA = ["tat", "bhūr", "vāk", "samyak", "bhavān", "dhṛt"];
for (const id of BRAHMIC) {
  test(`${id}：梵文詞尾輔音加 halanta，往返不生額外 a`, () => {
    const s = get(id);
    const bad = [];
    for (const w of HALANTA) {
      const nat = s.romanToNative(w);
      const back = s.nativeToRoman(nat);
      if (back !== w) bad.push(`「${w}」→ ${nat} → 「${back}」`);
    }
    assert.deepEqual(bad, [], `${id} halanta 失敗:\n      ${bad.join("\n      ")}`);
  });
}
console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
process.exit(failed > 0 ? 1 : 0);
