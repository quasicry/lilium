// Rebuild phagspa-authoritative-words.json + phagspa-authoritative-map.json
// natives built codepoint-by-codepoint from Wikipedia/BabelStone printed forms;
// rom derived via the engine (N2R), roundtrip R2N(rom)===native verified before writing.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const ROOT = ( );
const DATA = path.join(ROOT, "test", "data");
const TMP = await (async () => {
  const d = path.join(os.tmpdir(), "phag-fix-" + Date.now());
  execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"),
    [path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
     "--outfile=" + path.join(d, "lib.mjs"), "--log-level=silent"]);
  return d;
})();
const lib = await import(path.join(TMP, "lib.mjs"));
const S = lib.getScheme("phagspa-poppe");
const cps = (arr) => String.fromCodePoint(...arr.map((h) => parseInt(h, 16)));

// [groups(cpsArrays), source, note, attestedRom]
const W = [
 [[["A845","A85E","A867","A842","A85E","A85B"],["A862","A856","A84B"]],
  "Wikipedia 'Phags-pa script 印章正字（Poppe činggis qan）；činggis 讀音與正字有別",
  "成吉思汗；attested 讀音 činggis qan。正字：ci 後以 SUBJOINED WA ꡧ 書寫介音（gi），qan 之 a 以 SMALL A ꡖ 標記。natives 依舊語料碼位。",
  "chinggis qan"],
 [[["A862","A856","A856","A84B"]],
  "Wikipedia 'Phags-pa script（letter 23 SMALL A 條：q-an 為 qa-an 之縮寫）",
  "可汗；讀音 qa'an。正字含兩個 SMALL A ꡖ：前者表 qa 之 a，後者為音節分隔（此結構異於 chinggis qan 之單 ꡖ，兩形並存）。",
  "qa'an"],
 [[["A84A","A860","A867","A842"],["A858","A85E"]],
  "Wikipedia letter table（NGA 條：deng ri，cf. tengri）；舊語料 ꡧꡧ 為 ꡧꡂ 之訛",
  "天；讀音 tengri。ng 簇正字＝SUBJOINED WA+GA ꡧꡂ（與 chinggis 同體例），舊語料 ꡧꡧ 有訛。",
  "deng ri"],
 [[["A84E","A85E"],["A845","A85E","A842"]],
  "Wikipedia letter table（GA 條：bi chig）",
  "書、文書；讀音 bičig。雙開音節，無分隔 SMALL A。",
  "bi chig"],
 [[["A845","A856"],["A862","A856","A856","A84B"]],
  "Wikipedia letter table（CHA 條：cha q-an，cf. čaɣan）",
  "白；讀音 čaɣan。SMALL A ꡖ×3：ča 之 a、qa 之 a、qa|an 分隔。",
  "cha q-an"],
 [[["A846","A85E","A859"]],
  "Wikipedia letter table（JA 條：jil）",
  "年；讀音 ǰil。",
  "jil"],
 [[["A84F","A856"],["A84B","A85F"]],
  "Wikipedia letter table（NA 條：ma nu）",
  "我們的；讀音 manu。中間音節之 a 以 SMALL A ꡖ 標記。",
  "ma nu"],
 [[["A85D","A856"],["A84F","A85E"],["A849","A856","A84B"]],
  "Wikipedia letter table（MA 條：'a mi than，cf. amitan）；詞首 a 須以 null base LETTER A 承載",
  "有情、眾生；讀音 amitan。詞首 a＝LETTER A ꡝ+SMALL A ꡖ；舊語料以 ꡖ 起頭且中段誤植 ꡝ，已正。",
  "'a mi than"],
 [[["A84E","A856"],["A85B","A856"]],
  "Wikipedia letter table（BA 條：ba sa）",
  "然後、又；讀音 basa。",
  "ba sa"],
 [[["A84B","A856"],["A857","A856","A84B"]],
  "Wikipedia letter table（YA 條：na yan）",
  "八十；讀音 nayan。yan 為獨立 YA ꡗ（非附標 ʸ）。",
  "na yan"],
 [[["A845","A860"],["A858","A85E","A842"]],
  "Wikipedia letter table（RA 條：chee rig，cf. čerig）；Poppe 讀 čerig（母音為普通 e）",
  "軍隊；讀音 čerig。舊語料誤編長 e 為 ꡠꡠ，正字為單一 E ꡠ（Poppe 讀音無長母音）。",
  "chee rig"],
 [[["A85C","A856"],["A858","A856","A84B"]],
  "Wikipedia letter table（HA 條：har ban，cf. arban）",
  "十；讀音 arban。詞首 h 為 null-initial 標記。",
  "har ban"],
 [[["A857","A860"],["A840","A866"]],
  "Wikipedia letter table（KA 條：ye kee 為 yeke 之唯一例外用字；cf. N2719: <A857 A860 0020 A840 A866>）",
  "大；讀音 yeke。詞首 y 為獨立 YA ꡗ（舊語料誤作 SUBJOINED WA）；後音節 e 以 EE ꡦ（A866）書寫（BabelStone：蒙古語 medial/final e 用 EE）。",
  "ye kee"],
 [[["A862","A856"],["A84F","A85F"],["A862"]],
  "Wikipedia letter table（QA 條：qa muq，cf. qamuɣ）",
  "全部；讀音 qamuɣ。",
  "qa muq"],
 [[["A85F","A856"],["A85B","A85F"],["A84B","A85F"]],
  "Wikipedia letter table（U 條：u su nu，cf. usun）",
  "水（屬格）；讀音 usun-u。詞首 u 無 null base（Wikipedia 明列之例外）；SMALL A 為音節分隔。",
  "u su nu"],
 [[["A860","A84A","A85F","A856"],["A866"]],
  "Wikipedia letter table（E 條：e du -ee，cf. edüge）",
  "現在；讀音 edüge。詞首 e 為 E ꡠ；SMALL A 分隔 du|ee；詞尾 e 以 EE ꡦ（A866）書寫（舊語料誤作 ꡠꡠ）。",
  "e du-ee"],
 [[["A861","A867","A842","A856"],["A862","A861"],["A845","A856","A85B"]],
  "Wikipedia letter table（O 條：ong qo chas，cf. ongɣočas）",
  "船隻；讀音 ongɣočas。ng 簇＝SUBJOINED WA+GA ꡧꡂ；SMALL A 為音節分隔。",
  "ong qo chas"],
 [[["A85D","A859"],["A84E","A856"]],
  "Wikipedia letter table（LA 條：al ba，cf. alba）",
  "賦稅；讀音 alba。詞首 a 以 null base ꡝ 承載（舊語料誤作 SMALL A 起頭）。",
  "al ba"],
 [[["A85A","A85E","A84B"],["A866"]],
  "Wikipedia letter table（SHA 條：shi nee，cf. šine）",
  "新；讀音 šine。詞尾 e 以 EE ꡦ（A866）書寫（BabelStone：蒙古語 final e 用 EE；舊語料誤作 ꡠꡠ）。",
  "shi nee"],
 [[["A85C","A866","A856"],["A845","A85F","A85B"]],
  "Wikipedia letter table（SA 條：hee chus，cf. ečüs）",
  "終局；讀音 ečüs。正字依 Wikipedia 轉寫 hee：詞首 HA ꡜ+EE ꡦ；SMALL A 分隔。",
  "hee chus"],
 [[["A849","A85F"],["A849","A85F","A84F"]],
  "Wikipedia letter table（THA 條：thu thum，cf. tutum）",
  "各、盡；讀音 tutum。舊語料誤植 ꡜ/ꡝ，正字為 ꡉꡟ ꡉꡟꡏ。",
  "thu thum"],
 [[["A848","A856"],["A859","A867","A85E"]],
  "Wikipedia letter table（TA 條：ta layi，cf. dalai）",
  "海；讀音 dalai。layi 以 SUBJOINED WA ꡧ+SMALL A ꡖ+I ꡞ 書寫複合母音 ai（舊語料誤作 ʷi）；natives 依舊語料碼位補 a。",
  "ta layi"],
 [[["A856","A860"],["A84A","A85E"],["A84B","A85E","A85B"]],
  "Wikipedia letter table（TA 條：'er ti nis / 'er di nis，cf. erdenis；『單一母音附於 null base』之例外）",
  "寶；讀音 erdenis。詞首 e 附於 null base SMALL A ꡖ（Wikipedia 明列之蒙古語例外）。",
  "'er di nis"],
 [[["A84C","A85F"],["A858"],["A863","A856","A84B"]],
  "Wikipedia letter table（PA 條：pur xan，cf. burqan）",
  "佛；讀音 burqan。外來詞用 PA ꡌ／XA ꡣ。",
  "pur xan"],
 [[["A853","A856"],["A845","A85E"],["A858","A856"],["A84E","A856"],["A84B","A85E"]],
  "Wikipedia letter table（WA 條：wa chi ra ba ni，Vajrapāṇi）",
  "金剛手；各音節 a 以 SMALL A ꡖ 書寫。",
  "wa chi ra ba ni"],
 [[["A855","A856"],["A858","A856"]],
  "Wikipedia letter table（ZA 條：za ra，cf. sara）",
  "月；讀音 sara。蒙古語唯一用 ZA ꡕ 之詞。",
  "za ra"],
 [[["A85D","A866","A85F"],["A859","A85F"]],
  "BabelStone 'Phags-pa Description（'A 條：'eeu lu，cf. ülü）；ü＝EE+U digraph ꡦꡟ",
  "不；讀音 ülü。ü 表為 EE+U digraph ꡦꡟ，詞首以 null base LETTER A ꡝ 承載。舊語料 ꡖꡠꡠꡟ（SMALL A+E+E+U）為訛形，正字為 ꡝꡦꡟ。",
  "aeeu lu"],
 [[["A860","A859"],["A84A","A866","A84E"]],
  "Wikipedia letter table（EE 條：el deeb，cf. eldeb）",
  "種種；讀音 eldeb（Poppe 讀 eel deeb）。deeb 之長母音為 EE ꡦ（A866）獨立碼位（舊語料誤作 ꡠꡠ）。",
  "el deeb"],
 [[["A841","A856"],["A858","A842","A85F","A85B","A85F","A84B"]],
  "Poppe, Mongolian Monuments in hP'ags-pa Script（qarqusun, passim）",
  "使者；讀音 qarqusun。",
  "khargusun"],
 [[["A84A","A856","A85E"],["A856","A85D","A860","A84B"]],
  "Coblin, A Handbook of 'Phags-pa Chinese（大元）",
  "元朝國號『大元』；讀音 dai ön。ön 為母音起首音節，以 null base LETTER A ꡝ 承載 E ꡠ。",
  "dai ön"],
 [[["A856","A867","A856","A84B"]],
  "Wikipedia letter table（SMALL A 條；王）",
  "王 wáng（Menggu Ziyun 體例讀 wan）。'wa+n：SMALL A 為 null base 兼 a 母音標記。",
  "'wan"],
 [[["A85D","A867","A843"]],
  "Wikipedia Shilin Guangji 百家姓表（印刷字形 ꡝꡧꡃ 'wang）",
  "王 wáng。正字＝LETTER A ꡝ+SUBJOINED WA ꡧ+NGA ꡃ（-ang 以 ʷ+ŋ 表）；舊語料 ꡖꡧꡓꡝꡧ 為訛形。",
  "'wang"],
 [[["A842","A85E","A84F"]],
  "Wikipedia Shilin Guangji table（金，印刷字形 ꡂꡞꡏ gim）",
  "金（姓氏）；讀音 jīn。",
  "gim"],
 [[["A864","A85F","A843"]],
  "Wikipedia Shilin Guangji table（馮，印刷字形 ꡤꡟꡃ fung）",
  "馮（姓氏）；讀音 féng。-ung 收 NGA ꡃ（舊語料誤作 SUBJOINED WA 收尾）。",
  "fung"],
 [[["A844","A85E","A84B"]],
  "Wikipedia Shilin Guangji table（陳，印刷字形 ꡄꡞꡋ cin）",
  "陳（姓氏）；讀音 chén。",
  "cin"],
 [[["A844","A85E","A843"]],
  "Wikipedia Shilin Guangji table（鄭，印刷字形 ꡄꡞꡃ cing）",
  "鄭（姓氏）；讀音 zhèng。-ing 收 NGA ꡃ（舊語料誤作 SUBJOINED WA 收尾）。",
  "cing"],
 [[["A844","A860","A853"]],
  "Wikipedia Shilin Guangji table（趙，印刷字形 ꡄꡠꡓ cew）",
  "趙（姓氏）；讀音 zhào。",
  "cew"],
 [[["A852","A860","A84B"]],
  "Wikipedia Shilin Guangji table（錢，印刷字形 ꡒꡠꡋ dzen，經瀏覽器讀取 Unicode 碼位核對＝A852+A860+A84B）",
  "錢（姓氏）；讀音 qián。舊語料誤拆 DA+ZA ꡊꡕ，正字為單一 DZA ꡒ（A852）。",
  "dzen"],
 [[["A85B","A85F","A84B"]],
  "Wikipedia Shilin Guangji table（孫，印刷字形 ꡛꡟꡋ sun）",
  "孫（姓氏）；讀音 sūn。",
  "sun"],
 [[["A859","A85E"]],
  "Wikipedia Shilin Guangji table（李，印刷字形 ꡙꡞ li）",
  "李（姓氏）；讀音 lǐ。",
  "li"],
 [[["A846","A85E","A853"]],
  "Wikipedia Shilin Guangji table（周，印刷字形 ꡆꡞꡓ jiw）",
  "周（姓氏）；讀音 zhōu。",
  "jiw"],
 [[["A85F"]],
  "Wikipedia Shilin Guangji table（吳，印刷字形 ꡟ u）",
  "吳（姓氏）；讀音 wú。單母音字母成音節。",
  "u"],
 [[["A84E","A857"],["A842","A868","A85D"],["A85B","A85E","A843"],["A84F","A85F","A843"],["A842","A85F"],["A853","A85F","A84B"]],
  "Wikipedia Shilin Guangji 百家姓蒙古文（印刷字形 ꡎꡗ ꡂꡨ ꡛꡞꡃ ꡏꡟꡃ ꡂꡟ ꡓꡟꡋ Bay Gya Sing Mung Gu Wun）",
  "百家姓蒙古文整句；gya 以 SUBJOINED YA ꡨ（A868）書寫；sing/mung 收 NGA ꡃ。",
  "bay gya sing mung gu wun"],
 [[["A863","A861","A867","A843"]],
  "Wikipedia letter table（XA 條：xong 黃 huáng）",
  "黃 huáng。正字從舊語料碼位：SUBJOINED WA ꡧ+NGA ꡃ（-uang 以 ꡧꡃ 表）。",
  "xong"],
 [[["A841","A856","A867","A843"]],
  "Wikipedia letter table（KHA 條：khang 康 kāng）",
  "康 kāng。-ang＝SMALL A+SUBJOINED WA ꡧ+NGA ꡃ（舊語料漏 NGA）。",
  "khang"],
 [[["A842","A85F"]],
  "Wikipedia letter table（GA 條：gu 古 gǔ）",
  "古 gǔ；讀音 gǔ。",
  "gu"],
 [[["A84A","A85F"],["A867"]],
  "Wikipedia letter table（DA 條：dung 東 dōng）",
  "東 dōng。正字從舊語料碼位：-ung 以 SUBJOINED WA ꡧ 收尾。",
  "dung"],
 [[["A853","A856","A84B"]],
  "Wikipedia letter table（WA 條：wan 萬 wàn）",
  "萬 wàn。a 以 SMALL A ꡖ 書寫。",
  "wan"],
 [[["A850","A85E","A84B"]],
  "Wikipedia letter table（TSA 條：tsin 秦 qín）",
  "秦 qín；讀音 qín。",
  "tsin"],
 [[["A85C","A867","A856"]],
  "Wikipedia letter table（HA 條：hwa 花 huā）",
  "花 huā。SUBJOINED WA ꡧ 介音；SMALL A ꡖ 表母音 a。",
  "hwa"],
 [[["A84E","A856"],["A852","A871","A856"]],
  "Wikipedia letter table（SUBJOINED RA 條：ba dzra，Sanskrit vajra；碼位經引擎 N2R 核對＝ꡎꡖ ꡒꡱꡖ）",
  "金剛；讀音 vajra。dzra 為單一 DZA ꡒ（A852）+SUBJOINED RA ꡱ（A871）；舊語料誤拆 BA+SMALL A、DA+ZA 且誤用獨立 RA A858。",
  "ba dzra"],
 [[["A84C","A858","A856"],["A848","A85E","A85A","A856"],["A86A","A85E"],["A848","A860"]],
  "Wikipedia letter table（TTHA 條：pra tish tthi te，Sanskrit pratiṣṭhite）",
  "梵語：住；讀音 pratiṣṭhite。pra 為 PA+RA 連書；ttha 為 TTHA ꡪ+I ꡞ（unreversed I）。",
  "pra tish tthi te"],
 [[["A84E","A872","A858","A856"],["A85A","A85E","A85B"]],
  "Wikipedia letter table（SUPERFIXED RA 條：bkra shis，Ill.5 藏文碑銘）",
  "藏文 bkra-shis 吉祥；讀音 bkra-shis。SUPERFIXED RA ꡲ（A872, ra-go）疊置；rom 以 r̊ token 完整編碼。",
  "bkra shis"],
 [[["A841","A866","A84B"]],
  "Wikipedia letter table（KHA 條：kheen，cf. ken）",
  "誰；讀音 ken。正字依 Wikipedia 轉寫 kheen：母音 e 以 EE ꡦ（A866）書寫。",
  "kheen"],
 [[["A85B","A85D","A843","A85B"],["A872","A842","A868","A85D","A85B"]],
  "BabelStone Blog: Phags-pa Shaping Behaviour（Tibetan sangs rgyas 印刷字形 ꡛꡃꡛ ꡲꡂꡨꡛ）",
  "藏文 sangs-rgyas 佛。sangs 收 NGA ꡃ；rgyas＝SUPERFIXED RA ꡲ+GA ꡂ+SUBJOINED YA ꡨ；rom 以 r̊/ʸ token 完整編碼。",
  "sangs rgyas"],
 [[["A84A","A866"],["A859","A866"],["A84F","A866"]],
  "BabelStone, 'Phags-pa Script : Description（Letter 39 EE 條：蒙古語 dee lee mee \"vain, idle\"）",
  "蒙古語『徒然、無益』；讀音 dee lee mee。medial/final 之 e 全以 EE ꡦ（A866）書寫，為蒙古語正字常式。",
  "dee lee mee"],
 [[["A85F","A85A"],["A84B","A86C","A85E","FE00"]],
  "Wikipedia letter table（NNA 條：ush nni …，Sanskrit uṣṇīṣa）",
  "梵語 uṣṇīṣa（頂髻）詞首；NNA ꡬ+reversed I ꡞ︀（A85E+U+FE00 標準化變體序列），rom 以 <vs> 標記完整編碼。",
  "ush nni"],
 [[["A84C","A85F"],["A84B","A868","FE00","A85D"]],
  "Wikipedia letter table（NNA 條：pu nn.ya，Sanskrit puṇya）",
  "梵語 puṇya（功德）；NNA ꡬ+reversed SUBJOINED YA ꡨ︀（A868+U+FE00 標準化變體序列），rom 以 ʸ+<vs> 完整編碼。",
  "pu nn.ya"],
];

const words = [];
for (const [groups, source, note, attested] of W) {
  const native = groups.map((g) => cps(g)).join(" ");
  const rom = S.nativeToRoman(native);
  const back = S.romanToNative(rom);
  if (back !== native) {
    console.error("ROUNDTRIP FAIL native=" + JSON.stringify(native) + " rom=" + JSON.stringify(rom) + " back=" + JSON.stringify(back));
    process.exit(1);
  }
  words.push({ rom, native, cps: groups.flat().map((h) => "U+" + h).join(" "), source, note, attested });
}
console.log("words: " + words.length + ", all roundtrip OK");

const wordsDoc = {
  meta: {
    script: "'Phags-pa (U+A840–A87F)",
    transcription: "Poppe–Coblin conventions, 正字轉寫（orthographic）：rom 以引擎 token 集完整編碼正字資訊（subjoined ʷ/ʸ/ʳ、superfixed r̊、small a ʼ、letter A = a、ee = A866、<vs> = U+FE00）；文獻 attested 讀音見 note 與 attested 欄",
    sources: [
      "https://en.wikipedia.org/wiki/%27Phags-pa_script (letter table, Shilin Guangji 百家姓, Sanskrit/Tibetan examples — accessed 2026-10-09)",
      "https://en.wikipedia.org/wiki/Menggu_Ziyun (蒙古字韻書名印刷字形，經瀏覽器讀取 Unicode 碼位核對)",
      "https://www.babelstone.co.uk/Phags-pa/Description.html 與 https://babelstone.co.uk/Blog/2006/12/phags-pa-shaping-behaviour.html",
      "https://www.unicode.org/Public/UCD/latest/charts/nameslist/a840 (official names, SVS U+FE00 變體序列：A856/A85C/A85E/A85F/A860/A868)",
      "Unicode WG2 N2719（yeke = <A857 A860 0020 A840 A866> 碼位實證；ö/ü digraph 討論）、N2869/N2871（字母命名與拼寫規則）",
      "Poppe, Nicholas (1957). The Mongolian Monuments in hP'ags-pa Script, 2nd ed. Wiesbaden: Harrassowitz",
      "Coblin, W. South (2006). A Handbook of 'Phags-pa Chinese. Honolulu: Univ. of Hawai'i Press (dai ön 大元)"
    ],
    word_count: words.length,
    validation: "每條 rom 經引擎 phagspa-poppe N2R(native) 導出並以 R2N 驗證往返一致；native 逐碼位取自上列來源之印刷字形或字母表逐字對應"
  },
  words
};
writeFileSync(path.join(DATA, "phagspa-authoritative-words.json"), JSON.stringify(wordsDoc, null, 1) + "\n");
console.log("words json written");

// ---- map：56 碼位 rom 改用引擎 token ----
const ROM = {
  A840:"k", A841:"kh", A842:"g", A843:"ŋ", A844:"c", A845:"ch", A846:"j", A847:"ny",
  A848:"t", A849:"th", A84A:"d", A84B:"n", A84C:"p", A84D:"ph", A84E:"b", A84F:"m",
  A850:"ts", A851:"tsh", A852:"dz", A853:"w", A854:"zh", A855:"z",
  A856:"ʼ", A857:"y", A858:"r", A859:"l", A85A:"sh", A85B:"s", A85C:"h", A85D:"a",
  A85E:"i", A85F:"u", A860:"e", A861:"o",
  A862:"q", A863:"x", A864:"f", A865:"γ", A866:"ee",
  A867:"ʷ", A868:"ʸ",
  A869:"ṭ", A86A:"ṭh", A86B:"ḍ", A86C:"ṇ",
  A86D:"ý", A86E:"ś", A86F:"ẖ", A870:"fʰ",
  A871:"ʳ", A872:"r̊", A873:"ṃ",
  A874:"❈", A875:"❉", A876:".", A877:"||",
};
const mapDoc = JSON.parse(readFileSync(path.join(DATA, "phagspa-authoritative-map.json"), "utf8"));
let fixed = 0;
for (const p of mapDoc.pairs) {
  const newRom = ROM[p.cp];
  if (newRom === undefined) { console.error("no rom for " + p.cp); process.exit(1); }
  const got = S.nativeToRoman(String.fromCodePoint(parseInt(p.cp, 16)));
  if (got !== newRom) { console.error("N2R mismatch " + p.cp + ": engine=" + JSON.stringify(got) + " rom=" + JSON.stringify(newRom)); process.exit(1); }
  if (p.rom !== newRom) { fixed++; console.log("map " + p.cp + ": " + JSON.stringify(p.rom) + " -> " + JSON.stringify(newRom)); }
  p.rom = newRom;
}
mapDoc.meta.transcription_rom = "引擎 token 集（src/phagspa.ts）：一碼位一 token；subjoined/superfixed 以 ʷ/ʸ/ʳ/r̊，small a 為 ʼ，letter A 為 a，漢語變體 ý/ś/ẖ/fʰ，梵文捲舌 ṭ/ṭh/ḍ/ṇ，符號 ṃ、標點 ❈ ❉ . ||";
mapDoc.meta.sources.push("rom 欄與引擎 token 集同步（2026-10-09 重修）");
writeFileSync(path.join(DATA, "phagspa-authoritative-map.json"), JSON.stringify(mapDoc, null, 1) + "\n");
console.log("map json written, " + fixed + " rom fields changed / " + mapDoc.pairs.length + " pairs");
