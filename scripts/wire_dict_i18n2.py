#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""第二輪：補齊語料分析面板 / 詞典管理面板 / 剩餘指令與對話框的硬編碼文案。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "src", "i18n.ts")

ENTRIES = [
    # 書簽 / 歷史 剩餘
    ("dict.bookmark.added", "已加入书签", "Bookmarked"),
    ("dict.bookmark.removed", "已移除书签", "Bookmark removed"),
    ("dict.aria.clear", "清空", "Clear"),
    ("dict.note.tab", "📄 笔记", "📄 Note"),
    ("dict.note.gen", "生成查询笔记", "Generate note"),
    ("dict.aria.sendCorpus", "把该词条内容送入语料分析", "Send this entry to corpus analysis"),
    ("dict.history.filterPlaceholder", "筛选历史…", "Filter history…"),
    ("dict.history.empty", "暂无记录", "No records yet"),
    ("dict.history.clear", "清空历史", "Clear history"),
    # 平行對讀
    ("dict.parallel.title", "⇄ 平行對讀 Parallel reading", "⇄ Parallel reading"),
    ("dict.parallel.empty", "尚無對齊數據。用命令面板「Import parallel alignment」導入 DNX 段級 JSON / MITRA TSV / FoJin JSONL / 兩欄 TSV 後，此處顯示源⇄目標平行句對（點詞可查詞典）。",
     "No alignment data yet. Use the command palette \"Import parallel alignment\" to import DNX segment JSON / MITRA TSV / FoJin JSONL / two-column TSV; this section then shows source⇄target parallel pairs (click a word to look it up)."),
    ("dict.parallel.noMatch", "對齊數據已導入，但當前語料中沒有匹配的段落。嘗試載入與對齊數據對應的文本（如 CBETA 同經文段）。",
     "Alignment data imported, but no matching passage in the current corpus. Try loading the text corresponding to the alignment data (e.g. the same CBETA sutra section)."),
    ("dict.parallel.src", "源", "Source"),
    ("dict.parallel.tgt", "目標", "Target"),
    ("dict.parallel.exportTsv", "⬇ 對讀 TSV", "⬇ Parallel TSV"),
    # 語料分析
    ("dict.corpus.title", "语料库分析 Corpus Analysis", "Corpus analysis"),
    ("dict.corpus.hint", "与词典联动：词表点词可跳查询；分析后自动检出「词典外词」。", "Linked with the dictionary: click a word in the word list to look it up; after analysis, out-of-dictionary words are auto-detected."),
    ("dict.corpus.folderPlaceholder", "文件夹路径（Markdown 文件） Folder of .md files", "Folder path (.md files) Folder of .md files"),
    ("dict.corpus.loadFolder", "📂 载入文件夹", "📂 Load folder"),
    ("dict.corpus.langZh", "中文 (简/繁)", "Chinese (Simp/Trad)"),
    ("dict.corpus.pasteImport", "📋 导入粘贴文本", "📋 Import pasted text"),
    ("dict.corpus.pasteEmpty", "先在下方文本框粘贴内容", "Paste content in the text box below first"),
    ("dict.corpus.pastePlaceholder", "粘贴文本到此处（用 --- 分隔多段文档）… Paste text; separate docs with ---", "Paste text here (separate documents with ---)… Paste text; separate docs with ---"),
    ("dict.corpus.runHint", "载入 vault 文件夹或粘贴文本后，即可运行：词表 / 词汇多样性 / 散布度 / N-元 / KWIC。", "After loading a vault folder or pasting text, you can run: word list / lexical diversity / dispersion / N-grams / KWIC."),
    ("dict.corpus.run", "▶ 运行分析 Analyze", "▶ Run analysis"),
    ("dict.corpus.analyzing", "分析中…", "Analyzing…"),
    ("dict.corpus.summary", "概览 Summary", "Summary"),
    ("dict.corpus.tokens", "词元 Tokens", "Tokens"),
    ("dict.corpus.types", "词型 Types", "Types"),
    ("dict.corpus.wordList", "词表 Word List (Top 30)", "Word List (Top 30)"),
    ("dict.corpus.col.word", "词", "Word"),
    ("dict.corpus.col.freq", "频数", "Freq"),
    ("dict.corpus.col.range", "范围 Range", "Range"),
    ("dict.corpus.ngrams", "2-元词组 N-grams (Top 15)", "2-grams N-grams (Top 15)"),
    ("dict.corpus.buddhistTopicHint", "檢測到佛典主題文本，以下高頻主題詞可點擊查詞典：", "Detected a Buddhist-canon-themed text; the following high-frequency topic words are clickable to look up:"),
    ("dict.corpus.hintPali", "巴利语文本（拉丁转写特征）", "Pali text (Latin transliteration features)"),
    ("dict.corpus.hintTibetan", "藏文文本（tsheg 音节分词）", "Tibetan text (tsheg syllable segmentation)"),
    ("dict.corpus.langHints", "🗣 語言體裁提示 Language hints", "🗣 Language & genre hints"),
    ("dict.corpus.unknownHint", "以下高频词在已启用词典的词头中未找到，点击送回查询验证：", "The following high-frequency words were not found in enabled dictionaries' headwords; click to send back for verification:"),
    ("dict.corpus.readability", "可讀性 Readability", "Readability"),
    ("dict.corpus.readabilityNote", "Flesch RE：分數越高越易讀（0-100）；Grade/ARI/C-L：值為對應美式學制年級。中文以漢字為音節改編。", "Flesch RE: higher score = easier (0-100); Grade/ARI/C-L: US school grade. Chinese uses hanzi as syllables."),
    ("dict.corpus.collocWord", "搭配詞", "Collocate"),
    ("dict.corpus.collocFreq", "頻", "Freq"),
    ("dict.corpus.collocLogDice", "LogDice", "LogDice"),
    ("dict.corpus.collocMI", "MI", "MI"),
    ("dict.corpus.collocDP", "ΔP", "ΔP"),
    ("dict.corpus.exportWordCsv", "⬇ 词表 CSV", "⬇ Word-list CSV"),
    ("dict.corpus.exportCollocCsv", "⬇ 搭配 CSV", "⬇ Collocation CSV"),
    ("dict.corpus.exportAdjCsv", "⬇ 頻次調整 CSV", "⬇ Frequency-adjust CSV"),
    # 詞典管理
    ("dict.manage.title", "词典管理 Manage dictionaries", "Manage dictionaries"),
    ("dict.manage.rescan", "重新扫描 Rescan", "Rescan"),
    ("dict.manage.scanning", "扫描中…", "Scanning…"),
    ("dict.manage.setFolders", "设置文件夹", "Set folders"),
    ("dict.manage.empty", "尚未加载词典。将文件放入词典文件夹后点击「重新扫描」。", "No dictionaries loaded. Put files in the dictionary folder, then click \"Rescan\"."),
    ("dict.manage.ungrouped", "（未分组）", "(ungrouped)"),
    ("dict.manage.renameGroup", "重命名组 Rename group", "Rename group"),
    ("dict.manage.renameGroupHint", "在词典信息编辑器中修改分组名", "Edit the group name in the dictionary-info editor"),
    ("dict.manage.deleteGroup", "删除组 Remove group", "Delete group"),
    ("dict.manage.selected", "✓ 已选", "✓ Selected"),
    ("dict.manage.select", "选择", "Select"),
    ("dict.manage.moveDown", "下移 Move down", "Move down"),
    ("dict.manage.deleteDict", "删除词典 Delete…", "Delete dictionary…"),
    ("dict.manage.displayName", "显示名 Display name", "Display name"),
    ("dict.manage.group", "分组 Group", "Group"),
    ("dict.manage.groupPlaceholder", "输入或选择分组", "Type or pick a group"),
    ("dict.manage.savedGroup", "已保存分组", "Group saved"),
    ("dict.manage.info.id", "内部 ID", "Internal ID"),
    ("dict.manage.info.format", "格式", "Format"),
    ("dict.manage.info.entries", "词条数", "Entries"),
    ("dict.manage.info.mdd", "MDD 资源条目", "MDD assets"),
    ("dict.manage.info.source", "源文件", "Source files"),
    ("dict.manage.info.desc", "描述 Description", "Description"),
    ("dict.manage.mdxHeader", "MDX 头信息（只读）", "MDX header (read-only)"),
    ("dict.manage.back", "← 返回管理", "← Back to manage"),
    ("dict.manage.searching", "搜索中…", "Searching…"),
    ("dict.manage.cancel", "取消 Cancel", "Cancel"),
    ("dict.manage.sample50", "🎲 抽样 50", "🎲 Sample 50"),
    ("dict.ft.tag.match", "词条匹配", "Entry match"),
    # 指令/對話框 剩餘
    ("dict.notice.noActiveNote", "当前没有活动笔记", "No active note"),
    ("dict.notice.inserted", "已插入查询结果", "Lookup result inserted"),
    ("dict.modal.parallelPlaceholder", "src\ttgt 每行一对；或 JSONL；DNX 两段 JSON 用 --- 分隔", "src\ttgt one pair per line; or JSONL; DNX two JSON segments separated by ---"),
]

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

def gen_block() -> str:
    out = []
    for row in ENTRIES:
        key, zh, en = row[0], row[1], row[2]
        langs = ['    "zh": "%s"' % esc(zh), '    "en": "%s"' % esc(en)]
        out.append('  "%s": {\n%s\n  },' % (key, ",\n".join(langs)))
    return "\n".join(out)

def insert_i18n():
    with io.open(I18N, "r", encoding="utf-8") as f:
        src = f.read()
    marker = "};\n\nexport function t("
    assert marker in src, "DICT closing marker missing"
    src = src.replace(marker, gen_block() + "\n};\n\nexport function t(", 1)
    with io.open(I18N, "w", encoding="utf-8") as f:
        f.write(src)
    print("[i18n2] inserted %d entries" % len(ENTRIES))

MAP = {
    "src/dict/settings.ts": ("this.plugin.T", [
        ("li 詞典", "dict.panel.title"),
    ]),
    "src/dict/view.ts": ("this.plugin.T", [
        ("清空", "dict.aria.clear"),
        ("已加入书签 ★", "dict.bookmark.added"),
        ("已移除书签", "dict.bookmark.removed"),
        ("📄 笔记", "dict.note.tab"),
        ("生成查询笔记 Generate note", "dict.note.gen"),
        ("把该词条内容送入语料分析", "dict.aria.sendCorpus"),
        ("筛选历史… Filter", "dict.history.filterPlaceholder"),
        ("暂无记录", "dict.history.empty"),
        ("清空历史", "dict.history.clear"),
        ("⇄ 平行對讀 Parallel reading", "dict.parallel.title"),
        ("尚無對齊數據。用命令面板「Import parallel alignment」導入 DNX 段級 JSON / MITRA TSV / FoJin JSONL / 兩欄 TSV 後，此處顯示源⇄目標平行句對（點詞可查詞典）。", "dict.parallel.empty"),
        ("對齊數據已導入，但當前語料中沒有匹配的段落。嘗試載入與對齊數據對應的文本（如 CBETA 同經文段）。", "dict.parallel.noMatch"),
        ("源", "dict.parallel.src"),
        ("目標", "dict.parallel.tgt"),
        ("⬇ 對讀 TSV", "dict.parallel.exportTsv"),
        ("语料库分析 Corpus Analysis", "dict.corpus.title"),
        ("与词典联动：词表点词可跳查询；分析后自动检出「词典外词」。", "dict.corpus.hint"),
        ("文件夹路径（Markdown 文件） Folder of .md files", "dict.corpus.folderPlaceholder"),
        ("📂 载入文件夹", "dict.corpus.loadFolder"),
        ("中文 (简/繁)", "dict.corpus.langZh"),
        ("📋 导入粘贴文本", "dict.corpus.pasteImport"),
        ("先在下方文本框粘贴内容", "dict.corpus.pasteEmpty"),
        ("粘贴文本到此处（用 --- 分隔多段文档）… Paste text; separate docs with ---", "dict.corpus.pastePlaceholder"),
        ("载入 vault 文件夹或粘贴文本后，即可运行：词表 / 词汇多样性 / 散布度 / N-元 / KWIC。", "dict.corpus.runHint"),
        ("▶ 运行分析 Analyze", "dict.corpus.run"),
        ("分析中…", "dict.corpus.analyzing"),
        ("概览 Summary", "dict.corpus.summary"),
        ("词元 Tokens", "dict.corpus.tokens"),
        ("词型 Types", "dict.corpus.types"),
        ("词表 Word List (Top 30)", "dict.corpus.wordList"),
        ("词", "dict.corpus.col.word"),
        ("频数", "dict.corpus.col.freq"),
        ("范围 Range", "dict.corpus.col.range"),
        ("2-元词组 N-grams (Top 15)", "dict.corpus.ngrams"),
        ("檢測到佛典主題文本，以下高頻主題詞可點擊查詞典：", "dict.corpus.buddhistTopicHint"),
        ("巴利语文本（拉丁转写特征）", "dict.corpus.hintPali"),
        ("藏文文本（tsheg 音节分词）", "dict.corpus.hintTibetan"),
        ("🗣 語言體裁提示 Language hints", "dict.corpus.langHints"),
        ("以下高频词在已启用词典的词头中未找到，点击送回查询验证：", "dict.corpus.unknownHint"),
        ("可讀性 Readability", "dict.corpus.readability"),
        ("Flesch RE：分數越高越易讀（0-100）；Grade/ARI/C-L：值為對應美式學制年級。中文以漢字為音節改編。", "dict.corpus.readabilityNote"),
        ("搭配詞", "dict.corpus.collocWord"),
        ("頻", "dict.corpus.collocFreq"),
        ("LogDice", "dict.corpus.collocLogDice"),
        ("MI", "dict.corpus.collocMI"),
        ("ΔP", "dict.corpus.collocDP"),
        ("⬇ 词表 CSV", "dict.corpus.exportWordCsv"),
        ("⬇ 搭配 CSV", "dict.corpus.exportCollocCsv"),
        ("⬇ 頻次調整 CSV", "dict.corpus.exportAdjCsv"),
        ("词典管理 Manage dictionaries", "dict.manage.title"),
        ("重新扫描 Rescan", "dict.manage.rescan"),
        ("扫描中…", "dict.manage.scanning"),
        ("设置文件夹", "dict.manage.setFolders"),
        ("尚未加载词典。将文件放入词典文件夹后点击「重新扫描」。", "dict.manage.empty"),
        ("（未分组）", "dict.manage.ungrouped"),
        ("重命名组 Rename group", "dict.manage.renameGroup"),
        ("在词典信息编辑器中修改分组名", "dict.manage.renameGroupHint"),
        ("删除组 Remove group", "dict.manage.deleteGroup"),
        ("✓ 已选", "dict.manage.selected"),
        ("选择", "dict.manage.select"),
        ("下移 Move down", "dict.manage.moveDown"),
        ("删除词典 Delete…", "dict.manage.deleteDict"),
        ("显示名 Display name", "dict.manage.displayName"),
        ("分组 Group", "dict.manage.group"),
        ("输入或选择分组", "dict.manage.groupPlaceholder"),
        ("已保存分组", "dict.manage.savedGroup"),
        ("内部 ID", "dict.manage.info.id"),
        ("格式", "dict.manage.info.format"),
        ("词条数", "dict.manage.info.entries"),
        ("MDD 资源条目", "dict.manage.info.mdd"),
        ("源文件", "dict.manage.info.source"),
        ("描述 Description", "dict.manage.info.desc"),
        ("MDX 头信息（只读）", "dict.manage.mdxHeader"),
        ("← 返回管理", "dict.manage.back"),
        ("搜索中…", "dict.manage.searching"),
        ("取消 Cancel", "dict.manage.cancel"),
        ("🎲 抽样 50", "dict.manage.sample50"),
        ("词条匹配", "dict.ft.tag.match"),
    ]),
    "src/dict/plugin.ts": ("this.T", [
        ("li 詞典", "dict.panel.title"),
        ("当前没有活动笔记 / No active markdown note", "dict.notice.noActiveNote"),
        ("已插入查询结果", "dict.notice.inserted"),
        ("src\ttgt 每行一對；或 JSONL；DNX 兩段 JSON 用 --- 分隔", "dict.modal.parallelPlaceholder"),
    ]),
}

def wire():
    for rel, (prefix, pairs) in MAP.items():
        path = os.path.join(ROOT, rel)
        with io.open(path, "r", encoding="utf-8") as f:
            src = f.read()
        pairs = sorted(pairs, key=lambda p: -len(p[0]))
        n = 0
        for literal, key in pairs:
            repl = "%s('%s')" % (prefix, key)
            for q in ("'", '"'):
                tok = q + literal + q
                if tok in src:
                    src = src.replace(tok, repl)
                    n += 1
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(src)
        print("[wire2] %s: %d" % (rel, n))

if __name__ == "__main__":
    insert_i18n()
    wire()
    print("DONE2")
