#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""第三輪：模板字串（含 ${...} 插值）接入 i18n。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "src", "i18n.ts")

ENTRIES = [
    ("dict.results", "{n} 條結果 · {d} 部辭典", "{n} results · {d} dictionaries"),
    ("dict.lookup.noneInDict", "在已啟用的辭典中找不到「{word}」", "Not found in enabled dictionaries: \"{word}\""),
    ("dict.share.saved", "已保存分享圖片 {file}", "Saved share image {file}"),
    ("dict.note.saved", "已保存筆記 {file}", "Saved note {file}"),
    ("dict.collate.aria", "與「{name}」的同一詞條内容校勘", "Collate this entry against \"{name}\""),
    ("dict.parallel.titleCount", "⇄ 平行對讀 Parallel reading ({a}/{b})", "⇄ Parallel reading ({a}/{b})"),
    ("dict.parallel.exported", "已匯出 {n} 對到 {file}", "Exported {n} pairs to {file}"),
    ("dict.parallel.matchHint", "與語料匹配的平行段落；{src} ⇄ {tgt} 點詞查辭典。", "Parallel passages matching the corpus; {src} ⇄ {tgt}; click a word to look it up."),
    ("dict.corpus.noMd", "文件夾 {folder} 中沒有 Markdown 文件", "No Markdown files in folder {folder}"),
    ("dict.corpus.reading", "讀取中 {i}/{n}…", "Reading {i}/{n}…"),
    ("dict.corpus.loaded", "已載入 {n} 篇文檔 · {tokens} 詞元", "Loaded {n} documents · {tokens} tokens"),
    ("dict.corpus.readFail", "載入失败: {err}", "Load failed: {err}"),
    ("dict.corpus.pasteLoaded", "已匯入 {n} 段文本 · {tokens} 詞元", "Imported {n} text segments · {tokens} tokens"),
    ("dict.corpus.ready", "語料就绪：{n} 篇文檔 · {tokens} 詞元 · 語言 {lang}", "Corpus ready: {n} documents · {tokens} tokens · language {lang}"),
    ("dict.corpus.dispersion", "散布度 Dispersion: {tok}", "Dispersion: {tok}"),
    ("dict.corpus.buddhistTerms", "🪷 佛典主題詞 Buddhist terms ({n})", "🪷 Buddhist terms ({n})"),
    ("dict.corpus.litDetect", "文言檢測：虛詞密度 {d}（建議以字級統計解讀）", "Literary-classical detection: function-word density {d} (interpret at the character level)"),
    ("dict.corpus.unknown", "🔍 辭典外詞 Unknown ({n})", "🔍 Out-of-dictionary words ({n})"),
    ("dict.corpus.avgSent", "均句長: {v}", "Avg sentence length: {v}"),
    ("dict.corpus.avgSyll", "均音節/詞: {v}", "Avg syllables/word: {v}"),
    ("dict.corpus.collocStrength", "搭配強度 Collocations: {tok} (Log Dice)", "Collocation strength: {tok} (Log Dice)"),
    ("dict.corpus.exportDone", "已导出 {file}", "Exported {file}"),
    ("dict.ft.resultsTotal", "共 {n} 條匹配", "Total {n} matches"),
    ("dict.ft.noMatch", "在當前搜索範圍的辭典中沒有找到「{query}」", "No matches in the current search scope: \"{query}\""),
    ("dict.manage.sampled", "已隨機抽樣 {n} 條", "Randomly sampled {n} entries"),
    ("dict.manage.exportCsv", "已匯出 CSV {file}", "Exported CSV {file}"),
    ("dict.manage.exportMd", "已匯出 Markdown {file}", "Exported Markdown {file}"),
    ("dict.manage.infoTitle", "辭典信息 · {name}", "Dictionary info · {name}"),
    ("dict.manage.assetsExtracted", "已提取資源 ({n})", "Extracted assets ({n})"),
    ("dict.manage.fulltextTitle", "全文搜索: {query}", "Full-text search: {query}"),
    ("dict.unit.entries", "詞条", "entries"),
    ("dict.unit.assets", "資源", "assets"),
    ("dict.unit.dicts", "部", "dicts"),
    ("dict.chip.title", "{format} · {n} 词条\n点击切换选中；长按/右键菜单可管理", "{format} · {n} entries\nClick to toggle selection; long-press/right-click to manage"),
    ("dict.scan.loaded", "已加载 {n} 部词典 · {n} dictionaries loaded", "Loaded {n} dictionaries · {n} dictionaries loaded"),
    ("dict.scan.failed", "匯入失敗 {name}: {err}", "Import failed {name}: {err}"),
    ("dict.scan.missingFiles", "缺少文件：需要 .idx 和 .dict/.dict.dz / missing .idx or .dict files", "Missing files: need .idx and .dict/.dict.dz / missing .idx or .dict files"),
    ("dict.removed", "已移除辭典 {name}", "Removed dictionary {name}"),
    ("dict.collation.done", "校勘完成：{n} 處異文（{ms}ms）", "Collation done: {n} variants ({ms}ms)"),
    ("dict.collation.stats", "底本 {b} 字 · 对校本 {t} 字 · 異文 {n} 处", "Base {b} chars · Witness {t} chars · {n} variants"),
]

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

def gen_block() -> str:
    out = []
    for key, zh, en in ENTRIES:
        out.append('  "%s": {\n    "zh": "%s",\n    "en": "%s"\n  },' % (key, esc(zh), esc(en)))
    return "\n".join(out)

def insert_i18n():
    with io.open(I18N, "r", encoding="utf-8") as f:
        src = f.read()
    marker = "};\n\nexport function t("
    assert marker in src
    src = src.replace(marker, gen_block() + "\n};\n\nexport function t(", 1)
    with io.open(I18N, "w", encoding="utf-8") as f:
        f.write(src)
    print("[i18n3] inserted %d entries" % len(ENTRIES))

# (file, old, new) — old/new 為精確子串
REPL = [
    ("src/dict/view.ts", "`书签 (${this.plugin.store.data.bookmarks.length})`",
     "`${this.plugin.T('dict.tab.bookmarks')} (${this.plugin.store.data.bookmarks.length})`"),
    ("src/dict/view.ts", "${d.meta.format.toUpperCase()} · ${d.meta.entryCount} 词条\\n点击切换选中；长按/右键菜单可管理",
     "${this.plugin.T('dict.chip.title', { format: d.meta.format.toUpperCase(), n: d.meta.entryCount })}"),
    ("src/dict/view.ts", "text: `已加载 ${dictCount} 部词典。输入单词查询，或在编辑器中选词后按 Ctrl/Cmd+Shift+D。点击词典 chips 可多选搜索范围。`,",
     "text: this.plugin.T('dict.ready.desc', { n: dictCount }),"),
    ("src/dict/view.ts", "new Notice(`已保存分享图片 ${file}`);", "new Notice(this.plugin.T('dict.share.saved', { file }));"),
    ("src/dict/view.ts", "new Notice(`生成失败: ${e instanceof Error ? e.message : String(e)}`, 6000);",
     "new Notice(this.plugin.T('dict.share.failed', { err: e instanceof Error ? e.message : String(e) }), 6000);"),
    ("src/dict/view.ts", "new Notice(`已保存笔记 ${file}`);", "new Notice(this.plugin.T('dict.note.saved', { file }));"),
    ("src/dict/view.ts", "new Notice(`已复制 ${lines.length} 张闪卡（兼容 Spaced Repetition 插件）`);",
     "new Notice(this.plugin.T('dict.flashcard.done', { n: lines.length }));"),
    ("src/dict/view.ts", "? `${hits.length} 条结果 · ${new Set(hits.map((h) => h.dictName)).size} 部词典`",
     "? this.plugin.T('dict.results', { n: hits.length, d: new Set(hits.map((h) => h.dictName)).size })"),
    ("src/dict/view.ts", "text: `梵文對應：${sk}` ", "text: this.plugin.T('dict.paliSanskrit.map', { sk }) "),
    ("src/dict/view.ts", "text: `在已启用的词典中找不到「${word}」` ", "text: this.plugin.T('dict.lookup.noneInDict', { word }) "),
    ("src/dict/view.ts", "`与「${other.dictName}」的同一词条内容校勘`",
     "`${this.plugin.T('dict.collate.aria', { name: other.dictName })}`"),
    ("src/dict/view.ts", "new Notice(`发现 ${result.stats.diffCount} 处差异，已在校勘面板打开`);",
     "new Notice(this.plugin.T('dict.collateDone', { n: result.stats.diffCount }));"),
    ("src/dict/view.ts", "text: `书签 Bookmarks (${items.length})` ", "text: `${this.plugin.T('dict.bookmarks.title')} (${items.length})` "),
    ("src/dict/view.ts", "text: `查询历史 History (${items.length})` ", "text: `${this.plugin.T('dict.history.title')} (${items.length})` "),
    ("src/dict/view.ts", "text: `⇄ 平行對讀 Parallel reading (${matches.length}/${pairs.length})` ",
     "text: this.plugin.T('dict.parallel.titleCount', { a: matches.length, b: pairs.length }) "),
    ("src/dict/view.ts", "text: `與語料匹配的平行段落；${srcLabel} ⇄ ${tgtLabel} 點詞查詞典。`,",
     "text: this.plugin.T('dict.parallel.matchHint', { src: srcLabel, tgt: tgtLabel }),"),
    ("src/dict/view.ts", "new Notice(`已导出 ${matches.length} 对到 ${file}`);",
     "new Notice(this.plugin.T('dict.parallel.exported', { n: matches.length, file }));"),
    ("src/dict/view.ts", "new Notice(`文件夹 ${this.corpusFolder} 中没有 Markdown 文件`);",
     "new Notice(this.plugin.T('dict.corpus.noMd', { folder: this.corpusFolder }));"),
    ("src/dict/view.ts", "new Notice(`读取中 ${i}/${files.length}…`);", "new Notice(this.plugin.T('dict.corpus.reading', { i, n: files.length }));"),
    ("src/dict/view.ts", "new Notice(`已载入 ${docs.length} 篇文档 · ${docs.reduce((s2, d) => s2 + d.length, 0).toLocaleString()} 词元`);",
     "new Notice(this.plugin.T('dict.corpus.loaded', { n: docs.length, tokens: docs.reduce((s2, d) => s2 + d.length, 0).toLocaleString() }));"),
    ("src/dict/view.ts", "new Notice(`载入失败: ${e instanceof Error ? e.message : String(e)}`, 6000);",
     "new Notice(this.plugin.T('dict.corpus.readFail', { err: e instanceof Error ? e.message : String(e) }), 6000);"),
    ("src/dict/view.ts", "new Notice(`已导入 ${docs.length} 段文本 · ${docs.reduce((s2, d) => s2 + d.length, 0).toLocaleString()} 词元`);",
     "new Notice(this.plugin.T('dict.corpus.pasteLoaded', { n: docs.length, tokens: docs.reduce((s2, d) => s2 + d.length, 0).toLocaleString() }));"),
    ("src/dict/view.ts", "text: `语料就绪：${this.corpusDocs.length} 篇文档 · ${totalTokens.toLocaleString()} 词元 · 语言 ${this.corpusLang}`,",
     "text: this.plugin.T('dict.corpus.ready', { n: this.corpusDocs.length, tokens: totalTokens.toLocaleString(), lang: this.corpusLang }),"),
    ("src/dict/view.ts", "text: `散布度 Dispersion: ${top.token}` ", "text: this.plugin.T('dict.corpus.dispersion', { tok: top.token }) "),
    ("src/dict/view.ts", "text: `🪷 佛典主題詞 Buddhist terms (${terms.length})` ", "text: this.plugin.T('dict.corpus.buddhistTerms', { n: terms.length }) "),
    ("src/dict/view.ts", "hints.push(`文言檢測：虛詞密度 ${lit.particleDensity.toFixed(3)}（建議以字級統計解讀）`);",
     "hints.push(this.plugin.T('dict.corpus.litDetect', { d: lit.particleDensity.toFixed(3) }));"),
    ("src/dict/view.ts", "text: `🔍 词典外词 Unknown (${unknown.length})` ", "text: this.plugin.T('dict.corpus.unknown', { n: unknown.length }) "),
    ("src/dict/view.ts", "text: `均句長: ${rd.avgWordsPerSentence.toFixed(1)}` ", "text: this.plugin.T('dict.corpus.avgSent', { v: rd.avgWordsPerSentence.toFixed(1) }) "),
    ("src/dict/view.ts", "text: `均音節/詞: ${rd.avgSyllablesPerWord.toFixed(2)}` ", "text: this.plugin.T('dict.corpus.avgSyll', { v: rd.avgSyllablesPerWord.toFixed(2) }) "),
    ("src/dict/view.ts", "text: `搭配強度 Collocations: ${nodeTok} (Log Dice)` ", "text: this.plugin.T('dict.corpus.collocStrength', { tok: nodeTok }) "),
    ("src/dict/view.ts", "new Notice(`已导出 ${file}`);", "new Notice(this.plugin.T('dict.corpus.exportDone', { file }));"),
    ("src/dict/view.ts", "        `${d.meta.entryCount.toLocaleString()} 词条`,", "        `${d.meta.entryCount.toLocaleString()} ${this.plugin.T('dict.unit.entries')}`,"),
    ("src/dict/view.ts", "d.meta.assets?.length ? `${d.meta.assets.length} 资源` : '',", "d.meta.assets?.length ? `${d.meta.assets.length} ${this.plugin.T('dict.unit.assets')}` : '',"),
    ("src/dict/view.ts", "text: `词典信息 · ${d.meta.name}` ", "text: this.plugin.T('dict.manage.infoTitle', { name: d.meta.name }) "),
    ("src/dict/view.ts", "text: `已提取资源 (${d.meta.assets.length})` ", "text: this.plugin.T('dict.manage.assetsExtracted', { n: d.meta.assets.length }) "),
    ("src/dict/view.ts", "text: `全文搜索: ${query}` ", "text: this.plugin.T('dict.manage.fulltextTitle', { query }) "),
    ("src/dict/view.ts", "text: `在当前搜索范围的词典中没有找到「${query}」` ", "text: this.plugin.T('dict.ft.noMatch', { query }) "),
    ("src/dict/view.ts", "text: `共 ${total} 条匹配` ", "text: this.plugin.T('dict.ft.resultsTotal', { n: total }) "),
    ("src/dict/view.ts", "new Notice(`已随机抽样 ${sampled.length} 条`);", "new Notice(this.plugin.T('dict.manage.sampled', { n: sampled.length }));"),
    ("src/dict/view.ts", "new Notice(`已导出 CSV ${file}`);", "new Notice(this.plugin.T('dict.manage.exportCsv', { file }));"),
    ("src/dict/view.ts", "new Notice(`已导出 Markdown ${file}`);", "new Notice(this.plugin.T('dict.manage.exportMd', { file }));"),
    ("src/dict/view.ts", "`${scoped}/${total} 部`", "`${scoped}/${total} ${this.plugin.T('dict.unit.dicts')}`"),
    ("src/dict/settings.ts", "text: `${g} (${n} 部词典)` ", "text: `${g} (${n} ${this.plugin.T('dict.unit.dicts')})` "),
    ("src/dict/settings.ts", "        `${d.meta.entryCount.toLocaleString()} 词条`,", "        `${d.meta.entryCount.toLocaleString()} ${this.plugin.T('dict.unit.entries')}`,"),
    ("src/dict/settings.ts", "d.meta.assets?.length ? `${d.meta.assets.length} 资源` : '',", "d.meta.assets?.length ? `${d.meta.assets.length} ${this.plugin.T('dict.unit.assets')}` : '',"),
    ("src/dict/plugin.ts", "popup.setError(`未找到「${word}」`);", "popup.setError(this.T('dict.hover.notFound', { word }));"),
    ("src/dict/plugin.ts", "new Notice(`已導入 ${n} 對平行句對——語料面板「⇄ 平行對讀」區塊顯示`);",
     "new Notice(this.T('dict.modal.imported', { n }));"),
    ("src/dict/plugin.ts", ".setTitle(`li 詞典: 查询「${short}」`)", ".setTitle(this.T('dict.menu.lookup', { short }))"),
    ("src/dict/plugin.ts", "new Notice(`已加载 ${loaded.length} 部词典 · ${loaded.length} dictionaries loaded`);",
     "new Notice(this.T('dict.scan.loaded', { n: loaded.length }));"),
    ("src/dict/plugin.ts", "new Notice(`导入失败 ${f.name}: ${f.error}`, 8000);", "new Notice(this.T('dict.scan.failed', { name: f.name, err: f.error }), 8000);"),
    ("src/dict/plugin.ts", "result.name || base + (result.assets?.length ? ` (+${result.assets.length} 资源)` : ''),",
     "result.name || base + (result.assets?.length ? ` (+${result.assets.length} ${this.plugin.T('dict.unit.assets')})` : ''),"),
    ("src/dict/plugin.ts", "error: `缺少文件：需要 .idx 和 .dict/.dict.dz / missing .idx or .dict files`,",
     "error: this.T('dict.scan.missingFiles'),"),
    ("src/dict/plugin.ts", "new Notice(`已移除词典 ${d.meta.name}`);", "new Notice(this.T('dict.removed', { name: d.meta.name }));"),
    ("src/dict/inline-suggest.ts", "text: `${sugg.count} 条结果` ", "text: this.plugin.T('dict.inline.count', { n: sugg.count }) "),
    ("src/dict/collation-view.ts", "new Notice(`校勘完成：${this.result.stats.diffCount} 处异文（${ms}ms）`);",
     "new Notice(this.plugin.T('dict.collation.done', { n: this.result.stats.diffCount, ms }));"),
    ("src/dict/collation-view.ts", "text: `底本 ${r.stats.baseChars} 字 · 对校本 ${r.stats.targetChars} 字 · 异文 ${r.stats.diffCount} 处` ",
     "text: this.plugin.T('dict.collation.stats', { b: r.stats.baseChars, t: r.stats.targetChars, n: r.stats.diffCount }) "),
    ("src/dict/collation-view.ts", "list.createEl('h4', { text: `校勘记（${r.notes.length}）` });",
     "list.createEl('h4', { text: this.plugin.T('dict.collation.notesTitle', { n: r.notes.length }) });"),
]

def wire():
    for rel, old, new in REPL:
        path = os.path.join(ROOT, rel)
        with io.open(path, "r", encoding="utf-8") as f:
            src = f.read()
        if old not in src:
            print("  !! NOT FOUND in %s: %s" % (rel, old[:40]))
            continue
        src = src.replace(old, new)
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(src)
        print("[wire3] %s ok" % rel)

if __name__ == "__main__":
    insert_i18n()
    wire()
    print("DONE3")
