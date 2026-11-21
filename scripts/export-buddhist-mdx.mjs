#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 佛學資料 MDX 導出 —（scripts/export-buddhist-mdx.mjs）
 *
 * 從 src/dict/data/ 四類佛學資料表生成 MDict .mdx 詞典，供 li plus 辭典面板
 * （內建 MDX 查詢）或外部 MDict/GoldenDict/欧路 使用：
 *   1. li-佛典缺字碼.mdx    CB_CODE_MAP 20,259（CB00001…→顯示字元+組字式/碼位）
 *   2. li-佛典異體字.mdx    CB_VARIANT_MAP 17,085（異體→主字）+ VARIANT_COMMON
 *   3. li-巴利梵文對應.mdx  PALI_SANSKRIT_MAP 48,921
 *   4. li-藏文詞根.mdx      TIBETAN_LEMMAS 7,218 + TIBETAN_PARTICLES 67（助詞歸一）
 *
 * 格式：MDX v1（xwang/mdict-analysis readmdict.py 語義）——
 *   header BE u32 len + UTF-16LE XML + adler32；
 *   v1 key header（4×u32）；key block info plain；key blocks/record blocks raw（id=0）；
 *   無加密、UTF-8、詞頭字典序排序。li 的 MdictReader 與主流 MDict 實現均可讀。
 *
 * 用法：node scripts/export-buddhist-mdx.mjs [輸出目錄]（默認 ../mdx-export）
 *
 * ⚠️ 凍結（v2.9.18）：buddhist-chars 兩檔已剝離遷出 → 附录/佛學資料-cbeta-gaiji/data/。
 * ⚠️ 凍結（v2.9.28）：pali-sanskrit 兩檔亦已剝離遷出 → 附录/佛學資料-pali-sanskrit/data/。
 * mdx 成品已備（附录/mdx-export/），本腳本不再隨主體維護；重生成須先按各附錄 README
 * 「恢復方法」放回源檔（tibetan-lemmas/lexicon 亦已於 v2.9.12 遷出）。詳見
 * 附录/佛學資料-cbeta-gaiji/export-buddhist-mdx.md。
 *
 * 授權提示（寫入每本詞典末條目與 NOTICE）：
 *   CBETA/DILA gaiji 資料 © CBETA/DILA，依其釋出條款用於研究/個人使用；
 *   OpenCC (Apache-2.0)；DPD (dpd-db，自由授權，附署名)；botok (Apache-2.0)；
 *   classical-tibetan-corpus (CC BY-SA 4.0，共享同樣方式)。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '附录', 'mdx-export')); // v2.8.85 起導出到附錄（備用存檔，不隨插件分發）
mkdirSync(OUT, { recursive: true });

/* ---------- data 表載入：TS → JS（esbuild 轉譯後 eval，避免裝 loader） ---------- */
async function loadTable(relImport, exportName) {
  // esbuild（devDep 已有）轉譯 .ts → cjs，再 require
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const esbuildBin = join(ROOT, 'node_modules', '.bin', 'esbuild');
  const outJs = join(OUT, `_load_${relImport.replace(/[/.]/g, '_')}.cjs`);
  execFileSync(esbuildBin, [join(ROOT, 'src/dict/data', relImport),
    '--bundle', '--format=cjs', '--platform=node', `--outfile=${outJs}`], { stdio: 'pipe' });
  const mod = req(outJs);
  return mod[exportName];
}

/* ---------- adler32 ---------- */
function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/* ---------- MDX v2 writer（li MdictReader v2 語義 + readmdict.py 相容） ---------- */
const NUM_W = 8; // v2
function writeBE(n) {
  const u = new Uint8Array(NUM_W);
  new DataView(u.buffer).setBigUint64(0, BigInt(n), false);
  return u;
}
function writeBE16(n) {
  const u = new Uint8Array(2);
  new DataView(u.buffer).setUint16(0, n, false);
  return u;
}
function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
function u16leXml(text) {
  const bytes = new TextEncoder().encode(text); // utf-8
  const le = new Uint8Array(bytes.length * 2);
  const dv = new DataView(le.buffer);
  for (let i = 0; i < bytes.length; i++) dv.setUint16(i * 2, bytes[i], true);
  return le;
}
function zlibCompress(data) {
  // 原生 zlib（帶 0x78 header）：用 fflate（devDep）
  const { compressSync } = require(join(ROOT, 'node_modules', 'fflate', 'lib', 'index.cjs'));
  return compressSync(data, { level: 6 });
}

/**
 * entries: [{ key, html }] — key 將被 NFC 歸一並排序
 */
function writeMdx(title, description, entries, outFile) {
  entries = entries
    .map((e) => ({ key: e.key.normalize('NFC'), html: e.html }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const merged = [];
  for (const e of entries) {
    const last = merged[merged.length - 1];
    if (last && last.key === e.key) last.html += '<hr>' + e.html;
    else merged.push(e);
  }
  entries = merged;

  const enc = new TextEncoder();
  const KEY_ENTRIES_PER_BLOCK = 2000;
  const REC_BYTES_PER_BLOCK = 4 * 1024 * 1024;
  const BLOCK_ID = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]); // comp=0 raw（低 4 bit）

  const keyBlocks = []; const recordBlocks = []; const keyInfos = []; const recInfos = [];
    
  let recOffset = 0; // 全域 unpack 累計
  // 第一遍：先算每條 record offset（MDict 語義：key 條目的 offset 必須指向該條 record 開始）
  const recOffsets = [];
  for (const e of entries) {
    recOffsets.push(recOffset);
    recOffset += enc.encode(e.html).length;
  }

  for (const batchStart of chunks(entries.length, KEY_ENTRIES_PER_BLOCK)) {
    const batch = entries.slice(batchStart, batchStart + KEY_ENTRIES_PER_BLOCK);
    const parts = [];
    for (let b = 0; b < batch.length; b++) {
      const k = enc.encode(batch[b].key);
      parts.push(writeBE(recOffsets[batchStart + b]), k, new Uint8Array([0]));
    }
    keyBlocks.push(concat(BLOCK_ID, ...parts));
    keyInfos.push({ numEntries: batch.length, head: batch[0].key, tail: batch[batch.length - 1].key, uSize: parts.reduce((s2, a) => s2 + a.length, 0) });
  }
  // 第二遍：寫 record blocks（按 REC_BYTES_PER_BLOCK 切）
  {
    let buf = []; let size = 0; let blockStart = 0;
    for (let i = 0; i < entries.length; i++) {
      const d = enc.encode(entries[i].html);
      if (size && size + d.length > REC_BYTES_PER_BLOCK) {
        const data = concat(...buf);
        recordBlocks.push(concat(BLOCK_ID, data));
        recInfos.push({ cSize: data.length + 8, uSize: data.length });
        buf = []; size = 0; blockStart = recOffsets[i];
      }
      buf.push(d); size += d.length;
    }
    if (buf.length) {
      const data = concat(...buf);
      recordBlocks.push(concat(BLOCK_ID, data));
      recInfos.push({ cSize: data.length + 8, uSize: data.length });
    }
  }


  // key block info（plain，byte0 != 2 → reader 按 plain 解；v2 textTerm=1 → 讀者對 head/tail 長度 +1 跳 NUL）
  const kiParts = []; // plain v2：無 type 前導字節（reader keyInfo[0]!==2 即按 plain 解）
  for (const ki of keyInfos) {
    const h = enc.encode(ki.head); const t = enc.encode(ki.tail);
    kiParts.push(writeBE(ki.numEntries), writeBE16(h.length), h, new Uint8Array([0]), writeBE16(t.length), t, new Uint8Array([0]), writeBE(ki.uSize + 8), writeBE(ki.uSize));
  }
  // cSize（raw block）= uSize + 8（8-byte id）
  const keyBlockInfo = concat(...kiParts);

  // header
  const headerXml =
    `<Library data-version="2.0" data-engine-version="2.0" ` +
    `encoding="utf-8" ` +
    `title="${escapeXml(title)}" ` +
    `description="${escapeXml(description)}" ` +
    `creationDate="${new Date().toISOString().slice(0, 10)}" ` +
    `GeneratedByEngineVersion="2.0" RequiredEngineVersion="2.0" ` +
    `Encrypted="No" Format="Html" Compact="No" KeyCaseSensitive="No">`;
  const headerBytes = u16leXml(headerXml + '\0');
  const headerLenBE = new Uint8Array([0, 0, 0, 0]);
  new DataView(headerLenBE.buffer).setUint32(0, headerBytes.length, false);
  const adlerBE = writeBE(adler32(headerBytes)).subarray(4); // u32
  const headerOut = concat(headerLenBE, headerBytes, adlerBE);

  // v2 key header: 8×5 + adler32(4)
  const keyBlocksTotalSize = keyBlocks.reduce((s2, b) => s2 + b.length, 0);
  const keyHeader = concat(writeBE(keyBlocks.length), writeBE(entries.length), writeBE(keyBlockInfo.length), writeBE(keyBlockInfo.length), writeBE(keyBlocksTotalSize), writeBE(adler32(concat(writeBE(keyBlocks.length), writeBE(entries.length), writeBE(keyBlockInfo.length), writeBE(keyBlockInfo.length), writeBE(keyBlocksTotalSize)))).subarray(4));

  // record header: 8×4
  const recInfoArr = [];
  for (const ri of recInfos) recInfoArr.push(writeBE(ri.cSize), writeBE(ri.uSize));
  const recordHeader = concat(writeBE(recordBlocks.length), writeBE(entries.length), writeBE(recInfoArr.reduce((s2, a) => s2 + a.length, 0)), writeBE(recordBlocks.reduce((s2, b) => s2 + b.length, 0)));

  const out = concat(headerOut, keyHeader, keyBlockInfo, ...keyBlocks, recordHeader, ...recInfoArr, ...recordBlocks);
  writeFileSync(outFile, out);
  return { file: outFile, entries: entries.length, bytes: out.length };
}

function* chunks(n, step) { for (let i = 0; i < n; i += step) yield i; }
function escapeXml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- 卡片渲染 ---------- */
const esc = (s) => escapeXml(s);
function style() {
  return `<style>.libd{font-family:serif}.libd dt{font-weight:bold}.libd .m{color:#888}</style>`;
}
function aboutEntry(title, lines) {
  return { key: '關於本詞典', html: style() + `<div class="libd"><h3>${esc(title)}</h3>` + lines.map((l) => `<p>${l}</p>`).join('') + `<p><small>生成：li v2.8.85 export-buddhist-mdx · ${new Date().toISOString().slice(0, 10)}</small></p></div>` };
}

/* ---------- 主流程 ---------- */
console.log('[1/5] 載入資料表…');
const load = async (f, n) => await loadTable(f, n);
const cbCode = await load('buddhist-chars.ts', 'CB_CODE_MAP');
const cbVariant = await load('buddhist-chars.ts', 'CB_VARIANT_MAP');
const cbGaiji = await load('buddhist-chars.ts', 'CB_GAIJI_META');
const variantCommon = await load('collation-chars.ts', 'VARIANT_COMMON');
const paliSk = await load('pali-sanskrit.ts', 'PALI_SANSKRIT_MAP');
const tibLemmas = await load('tibetan-lemmas.ts', 'TIBETAN_LEMMAS');
const tibParticles = await load('tibetan-lexicon.ts', 'TIBETAN_PARTICLES');
const tibWords = await load('tibetan-lexicon.ts', 'TIBETAN_WORDS');
console.log(`   CB_CODE ${Object.keys(cbCode).length} / CB_VARIANT ${Object.keys(cbVariant).length} / GAIJI_META ${Object.keys(cbGaiji).length} / VARIANT_COMMON ${Object.keys(variantCommon).length} / PALI ${Object.keys(paliSk).length} / TIB_LEMMAS ${Object.keys(tibLemmas).length} / TIB_PARTICLES ${Object.keys(tibParticles).length}`);

const results = [];

// ---- 1. 缺字碼 ----
{
  const entries = [];
  // GAIJI_META 有而 CODE_MAP 無顯示字的條目（v2.8.85 補收：卡片顯示組字式＋PUA 碼，
  // 讓 CBETA 讀者對得上 CBETA 補字字型）
  const metaOnly = Object.keys(cbGaiji).filter((c) => !(c in cbCode));
  for (const [code, ch] of Object.entries(cbCode)) {
    const meta = cbGaiji[code] || {};
    const rows = [`<dt>${esc(code)}</dt><dd><span style="font-size:2em">${esc(ch)}</span>　U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}</dd>`];
    if (meta.composition) rows.push(`<dd>組字式：${esc(meta.composition)}</dd>`);
    if (meta.normalized) rows.push(`<dd>歸一字：${esc(meta.normalized)}</dd>`);
    if (meta.unicode && meta.unicode !== ch) rows.push(`<dd>unicode 欄：${esc(meta.unicode)}</dd>`);
    if (meta.pua) rows.push(`<dd>CBETA PUA：${esc(meta.pua)}</dd>`);
    if (meta.moe) rows.push(`<dd>教育部異體字 ID：${esc(meta.moe)}</dd>`);
    entries.push({ key: code, html: style() + `<dl class="libd">${rows.join('')}</dl>` });
  }
  for (const code of metaOnly) {
    const meta = cbGaiji[code] || {};
    const rows = [`<dt>${esc(code)}</dt><dd><span class="m">無 Unicode 顯示字元（CBETA 補字）</span></dd>`];
    if (meta.composition) rows.push(`<dd>組字式：<span style="font-size:1.4em">${esc(meta.composition)}</span></dd>`);
    if (meta.normalized) rows.push(`<dd>歸一字：<b>${esc(meta.normalized)}</b></dd>`);
    if (meta.unicode) rows.push(`<dd>unicode 欄：${esc(meta.unicode)}</dd>`);
    if (meta.pua) rows.push(`<dd>CBETA PUA：<b>${esc(meta.pua)}</b>（安裝 CBETA 補字字型可顯示）</dd>`);
    if (meta.moe) rows.push(`<dd>教育部異體字 ID：${esc(meta.moe)}</dd>`);
    entries.push({ key: code, html: style() + `<dl class="libd">${rows.join('')}</dl>` });
  }
  entries.push(aboutEntry('li 佛典缺字碼詞典', [
    `收錄 CBETA 缺字碼 ${Object.keys(cbCode).length + metaOnly.length} 條：其中 ${Object.keys(cbCode).length} 條有可顯示字元，${metaOnly.length} 條僅有組字式／PUA 碼（安裝 CBETA 補字字型即可對應顯示）。並附 CBETA 官方 cbeta_gaiji 組字式／歸一字／PUA／教育部異體字 ID 多重表示。`,
    `資料來源：DILA gaiji + CBETA cbeta_gaiji。© CBETA / DILA，依其釋出條款供研究與個人使用。`,
  ]));
  results.push(writeMdx('li 佛典缺字碼詞典', 'CBETA 缺字碼 → 顯示字元／組字式／碼位（li v2.8.85）', entries, join(OUT, 'li-佛典缺字碼.mdx')));
}

// ---- 2. 異體歸一 ----
{
  const entries = [];
  for (const [variant, main] of Object.entries(cbVariant)) {
    entries.push({ key: variant, html: style() + `<div class="libd"><dt>${esc(variant)}</dt><dd>異體字 → 主字：<span style="font-size:1.8em">${esc(main)}</span>　<span class="m">U+${main.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}</span></dd><dd><span class="m">來源：CBETA variants 同義組（佛典異體歸一）</span></dd></div>` });
  }
  for (const [variant, main] of Object.entries(variantCommon)) {
    if (cbVariant[variant]) continue;
    entries.push({ key: variant, html: style() + `<div class="libd"><dt>${esc(variant)}</dt><dd>異體字 → 通行字：<span style="font-size:1.8em">${esc(main)}</span></dd><dd><span class="m">來源：OpenCC／校勘異體表（通用異體歸一）</span></dd></div>` });
  }
  entries.push(aboutEntry('li 佛典異體字詞典', [
    `收錄佛典異體字→主字 ${Object.keys(cbVariant).length} 條（CBETA variants 同義組）＋通用異體→通行字補充（OpenCC Apache-2.0／book-proofreading MIT）。`,
    `查得異體字即顯示應歸一到的主字，用於佛典校勘與文本歸一對照。`,
  ]));
  results.push(writeMdx('li 佛典異體字詞典', '異體字 → 主字／通行字（CBETA + OpenCC，li v2.8.85）', entries, join(OUT, 'li-佛典異體字.mdx')));
}

// ---- 3. 巴利→梵文 ----
{
  const entries = [];
  for (const [pali, sk] of Object.entries(paliSk)) {
    const sks = sk.split(' / ');
    const body = sks.length > 1
      ? `<ol>${sks.map((x) => `<li><b>${esc(x)}</b></li>`).join('')}</ol>`
      : `<b>${esc(sk)}</b>`;
    entries.push({ key: pali, html: style() + `<div class="libd"><dt>${esc(pali)}</dt><dd><span class="m">Pāli</span> ${esc(pali)} → <span class="m">Skt.</span> ${body}</dd></div>` });
  }
  const multiSkt = Object.values(paliSk).filter((v) => v.includes(' / ')).length;
  entries.push(aboutEntry('li 巴利梵文對應詞典', [
    `收錄巴利詞頭→梵文對應 ${Object.keys(paliSk).length} 條（kamma→karman、dhamma→dharma 等），其中 ${multiSkt.toLocaleString()} 條為一詞多對應（全量列出，首個為主對應）。`,
    `來源：Digital Pāḷi Dictionary (dpd-db v0.4.20260926)「Sanskrit:」欄（v2.8.85 全量重建，scripts/gen-pali-sanskrit.py）。DPD 以自由授權（ODbL/CC）發布；本詞典為語言事實映射，使用時請同時遵守 DPD 授權並署名。`,
  ]));
  results.push(writeMdx('li 巴利梵文對應詞典', 'Pāli → Sanskrit equivalence（DPD dpd-db，li v2.8.85）', entries, join(OUT, 'li-巴利梵文對應.mdx')));
}

// ---- 5. 藏文分詞詞典（POS 標籤版，v2.8.85 新增） ----
{
  const POS_ZH = { NOUN: '名詞', VERB: '動詞', ADJ: '形容詞', ADV: '副詞', DET: '限定詞',
    PRON: '代詞', PROPN: '專有名詞', ADP: '介詞', NUM: '數詞', PART: '助詞', INTJ: '感嘆詞',
    CCONJ: '連接詞', SCONJ: '從屬連詞', AUX: '助動詞', OTHER: '其他' };
  const entries = [];
  for (const [form, pos, lemma, freq] of tibWords) {
    if (!form || /[#\u0000-\u001F]/.test(form[0]) || form.length > 40) continue; // 防髒行
    const rows = [`<dt>${esc(form)}</dt>`];
    if (pos) rows.push(`<dd>詞類：<b>${esc(POS_ZH[pos] || pos)}</b>　<span class="m">${esc(pos)}</span></dd>`);
    if (lemma) rows.push(`<dd>詞根／原形：<b>${esc(lemma)}</b></dd>`);
    if (typeof freq === 'number') rows.push(`<dd><span class="m">語料頻次：${freq.toLocaleString()}</span></dd>`);
    if (rows.length === 1) rows.push('<dd><span class="m">（botok general 詞表收錄；無附加標註）</span></dd>');
    entries.push({ key: form, html: style() + `<div class="libd">${rows.join('')}</div>` });
  }
  entries.push(aboutEntry('li 藏文分詞詞典', [
    `收錄藏文詞形 ${tibWords.length.toLocaleString()} 條（帶 UPOS 詞類 ${tibWords.filter((w) => w[1]).length.toLocaleString()} 條、語料頻次 ${tibWords.filter((w) => typeof w[3] === 'number').length.toLocaleString()} 條），供藏文分詞後逐詞查詢。`,
    `來源：botok（OpenPecha/Esukhia）general dialect pack tsikchen.tsv（Apache-2.0）。與《li 藏文詞根詞典》互補：本典管「這個詞形是什麼」，詞根典管「還原成原形是什麼」。`,
  ]));
  results.push(writeMdx('li 藏文分詞詞典', 'Tibetan word forms + UPOS + frequency（botok tsikchen，li v2.8.85）', entries, join(OUT, 'li-藏文分詞詞典.mdx')));
}

// ---- 4. 藏文詞根/助詞 ----
{
  const entries = [];
  for (const [token, [lemma, pos]] of Object.entries(tibLemmas)) {
    entries.push({ key: token, html: style() + `<div class="libd"><dt>${esc(token)}</dt><dd>詞根／原形：<b>${esc(lemma)}</b>${pos ? `　<span class="m">${esc(pos)}</span>` : ''}</dd><dd><span class="m">來源：classical-tibetan-corpus 樹庫（CC BY-SA 4.0）</span></dd></div>` });
  }
  for (const [form, info] of Object.entries(tibParticles)) {
    const [pos, lemma] = Array.isArray(info) ? info : [null, info];
    entries.push({ key: form, html: style() + `<div class="libd"><dt>${esc(form)}</dt><dd>助詞 → 歸一形：<b>${esc(lemma)}</b>${pos ? `　<span class="m">${esc(pos)}</span>` : ''}</dd><dd><span class="m">來源：botok particles（Apache-2.0）</span></dd></div>` });
  }
  entries.push(aboutEntry('li 藏文詞根詞典', [
    `收錄藏文詞形→詞根 ${Object.keys(tibLemmas).length} 條（classical-tibetan-corpus，CC BY-SA 4.0——共享同樣方式）＋助詞歸一 ${Object.keys(tibParticles).length} 條（botok，Apache-2.0）。`,
    `查詢藏文詞形得詞根／原形與詞類；助詞（གི/ཀྱི/འི/ཡི 等）顯示歸一形，用於 lemma folding。`,
  ]));
  results.push(writeMdx('li 藏文詞根詞典', 'Tibetan token → lemma / particles（CC BY-SA + Apache-2.0，li v2.8.85）', entries, join(OUT, 'li-藏文詞根.mdx')));
}

// NOTICE
writeFileSync(join(OUT, 'README-授權.md'), `# li 佛學資料 MDX 詞典（li v2.8.85 導出）

| 檔案 | 條目 | 來源／授權 |
|---|---|---|
| li-佛典缺字碼.mdx | ${Object.keys(cbCode).length} | DILA gaiji + CBETA cbeta_gaiji（© CBETA/DILA，研究與個人使用） |
| li-佛典異體字.mdx | ${Object.keys(cbVariant).length}+ | CBETA variants + OpenCC (Apache-2.0) + book-proofreading (MIT) |
| li-巴利梵文對應.mdx | ${Object.keys(paliSk).length} | dpd-db (Digital Pāḷi Dictionary，自由授權，須署名) |
| li-藏文詞根.mdx | ${Object.keys(tibLemmas).length}+${Object.keys(tibParticles).length} | classical-tibetan-corpus (CC BY-SA 4.0) + botok (Apache-2.0) |
| li-藏文分詞詞典.mdx | ${tibWords.length} | botok tsikchen.tsv (Apache-2.0) |

格式：MDX v1（utf-8、無加密、無壓縮），li plus 辭典面板 / MDict / GoldenDict / 欧路均可載入。
${results.map((r) => `- ${r.file} → ${r.entries} 條, ${(r.bytes / 1e6).toFixed(1)} MB`).join('\n')}
`);

for (const r of results) console.log(`  ✓ ${r.file}  ${r.entries} 條  ${(r.bytes / 1e6).toFixed(1)} MB`);
console.log('[5/5] 完成。');
