#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""
把 lilium 辭典模組介面文案接入 lilium 多語 i18n。

1) 在 i18n.ts 的 DICT 物件內插入 dict.* 命名空間（zh + en，bo/ug/mn 用於關鍵項）。
2) 把各 dict 視圖/設定/指令裡的硬編碼使用者文案（靜態引號字串）改為 T() 呼叫。
   模板字串（含 ${...} 插值）與註解不在此腳本處理，另行手動編輯。
"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "src", "i18n.ts")

# ---- 1) i18n 條目： (key, zh, en, bo?, ug?, mn?) ----
# 慣例：至少補 zh 與 en；其餘 18 語回退 en（i18n.ts t() 的 fallback 鏈）。
ENTRIES = [
    # 面板 / 分頁
    ("dict.panel.title", "li 詞典", "li Dictionary", "ཚིག་མཛོད", "لۇغەت", "Толь"),
    ("dict.tab.lookup", "查询", "Lookup", "འཚོལ་ཞིབ", "ئىزدە", "Хайлт"),
    ("dict.tab.bookmarks", "书签", "Bookmarks", "ཞིག་བྲམ", "خەتكە", "Тэмдэглэл"),
    ("dict.tab.history", "历史", "History", "ལོ་རྒྱུས", "تارىخ", "Түүх"),
    ("dict.tab.corpus", "语料", "Corpus", "ཡིག་ཆ", "تېكىست", "Корпус"),
    ("dict.tab.manage", "管理", "Manage", "བཅོས་སྒྱུར", "باشقۇر", "Удирдах"),
    # 搜索
    ("dict.search.placeholder", "输入单词查询…", "Type a word to look up…"),
    ("dict.ft.placeholder", "全文/内容搜索…", "Full-text / content search…"),
    ("dict.ft.matchCase", "Aa 大小写", "Aa Case"),
    ("dict.ft.wholeWords", "⌐ 整词", "⌐ Whole words"),
    ("dict.ft.regex", ".* 正则", ".* Regex"),
    ("dict.ft.sep", "多词用 | 分隔", "Separate words with |"),
    ("dict.ft.search", "搜索", "Search"),
    ("dict.all", "全部", "All"),
    # chip 選單
    ("dict.chip.onlyThis", "仅查此词典", "Only this dictionary"),
    ("dict.chip.info", "词典信息", "Dictionary info"),
    ("dict.chip.moveUp", "上移", "Move up"),
    ("dict.chip.disable", "禁用", "Disable"),
    ("dict.chip.enable", "启用", "Enable"),
    ("dict.chip.delete", "删除", "Delete"),
    # 空狀態 / 準備
    ("dict.empty.title", "还没有导入词典", "No dictionaries imported yet"),
    ("dict.empty.desc", "支持 MDict (.mdx/.mdd)、StarDict (.ifo/.idx/.dict[.dz])、XDXF (.xdxf) 与 dictd (.index/.dict[.dz])。",
     "Supports MDict (.mdx/.mdd), StarDict (.ifo+.idx+.dict[.dz]), XDXF (.xdxf) and dictd (.index+.dict[.dz])."),
    ("dict.empty.hint", "将词典文件放入仓库任意文件夹（建议 dictionaries/），然后在管理页扫描导入。",
     "Put dictionary files in any vault folder (dictionaries/ recommended), then scan and import from the Manage page."),
    ("dict.empty.btn", "打开管理面板", "Open manage panel"),
    ("dict.ready", "准备就绪", "Ready"),
    ("dict.ready.desc", "已加载 {n} 部词典。输入单词查询，或在编辑器中选词后按 Ctrl/Cmd+Shift+D。点击词典 chips 可多选搜索范围。",
     "Loaded {n} dictionaries. Type a word to look up, or select text in the editor and press Ctrl/Cmd+Shift+D. Click dictionary chips to multi-select the search scope."),
    # 結果 / 動作
    ("dict.recent", "最近查询", "Recent lookups"),
    ("dict.addBookmark", "加入书签", "Add bookmark"),
    ("dict.removeBookmark", "移除书签", "Remove bookmark"),
    ("dict.share.png", "分享为图片", "Share as PNG"),
    ("dict.share.generating", "正在生成分享图片…", "Generating share image…"),
    ("dict.share.failed", "生成失败: {err}", "Generation failed: {err}"),
    ("dict.note", "笔记", "Note"),
    ("dict.flashcard", "闪卡", "Flashcards"),
    ("dict.flashcard.none", "没有可生成的闪卡内容", "No flashcard content to generate"),
    ("dict.flashcard.done", "已复制 {n} 张闪卡（兼容 Spaced Repetition 插件）", "Copied {n} flashcards (Spaced Repetition plugin compatible)"),
    ("dict.noResults", "未找到", "Not found"),
    ("dict.extlinks", "在线来源:", "Online sources:"),
    ("dict.paliSanskrit", "巴利/梵文:", "Pali/Sanskrit:"),
    ("dict.paliSanskrit.map", "梵文对应：{sk}", "Sanskrit equivalent: {sk}"),
    ("dict.etymology", "词源", "Etymology"),
    ("dict.etym.loading", "抓取 etymonline 中…", "Fetching etymonline…"),
    ("dict.etym.src", "来源 etymonline.com ↗", "Source etymonline.com ↗"),
    ("dict.etym.none", "未找到词源（或网络不可用）", "No etymology found (or network unavailable)"),
    ("dict.didYouMean", "你是不是要找：", "Did you mean:"),
    ("dict.tryFulltext", "试试全文搜索（管理页）或更短的形式。", "Try full-text search (Manage page) or a shorter form."),
    ("dict.expandAll", "全部展开", "Expand all"),
    ("dict.collapseAll", "全部收起", "Collapse all"),
    ("dict.copy", "复制", "Copy"),
    ("dict.insert", "插入", "Insert"),
    ("dict.copyDone", "已复制 HTML 到剪贴板", "Copied HTML to clipboard"),
    ("dict.sendCorpus", "语料", "Corpus"),
    ("dict.sendCorpusDone", "词条已送入语料面板，切到「语料」页运行分析", "Entry sent to Corpus panel; switch to the Corpus tab to run analysis"),
    ("dict.sendCorpusEmpty", "词条内容为空，无法分析", "Entry is empty; cannot analyze"),
    ("dict.collate", "互校", "Collate"),
    ("dict.collateSame", "两个词条内容一致，无差异", "The two entries are identical; no differences"),
    ("dict.collateDone", "发现 {n} 处差异，已在校勘面板打开", "Found {n} differences; opened in Collation panel"),
    ("dict.bookmarks.hint", "查询结果页点击 ★ 收藏词条。", "Click ★ on a result page to bookmark an entry."),
    ("dict.bookmarks.clear", "清空书签", "Clear bookmarks"),
    ("dict.history.title", "查询历史", "Lookup history"),
    ("dict.manage.savedName", "已保存显示名", "Display name saved"),
    # 設定頁
    ("dict.set.folders", "词典文件夹", "Dictionary folders"),
    ("dict.set.foldersDesc", "逗号分隔的仓库内文件夹路径。插件会递归扫描 .mdx/.mdd、StarDict (.ifo+.idx+.dict[.dz][+.syn])、.xdxf、dictd (.index+.dict[.dz])，以及同名配套的 .css/.js/字体文件。",
     "Comma-separated vault folder paths. The plugin recursively scans .mdx/.mdd, StarDict (.ifo+.idx+.dict[.dz][+.syn]), .xdxf, dictd (.index+.dict[.dz]), plus same-named companion .css/.js/font files."),
    ("dict.set.scan", "立即扫描", "Scan now", None, "سكان", "Скан"),
    ("dict.set.scanDesc", "扫描上述文件夹并加载词典（插件启动时也会自动扫描）。", "Scan the folders above and load dictionaries (also scanned automatically on plugin startup)."),
    ("dict.set.scanBtn", "扫描并加载", "Scan & load"),
    ("dict.set.extractMdd", "提取 MDD 资源", "Extract .mdd assets"),
    ("dict.set.extractMddDesc", "导入 MDict 词典时把 .mdd 中的图片/音频/字体/CSS 提取到仓库（.li-assets/），供词条内显示。",
     "When importing MDict dictionaries, extract images/audio/fonts/CSS from .mdd into the vault (.li-assets/) for in-entry display."),
    ("dict.set.mddBudget", "MDD 资源预算 (MB)", "MDD asset budget (MB)"),
    ("dict.set.mddBudgetDesc", "每部词典最多提取的资源总大小，防止仓库膨胀。", "Maximum total size of extracted assets per dictionary, to prevent vault bloat."),
    ("dict.set.fullTextLimit", "全文搜索结果上限", "Full-text result limit"),
    ("dict.set.fullTextLimitDesc", "每部词典的全文/内容搜索最多返回条数。", "Maximum results returned per dictionary for full-text/content search."),
    ("dict.set.inlineSuggest", "行内编辑器建议", "Inline editor suggest"),
    ("dict.set.inlineSuggestDesc", "在编辑器中输入 \"li <query>\" 触发行内词典建议（借鉴 WordNet 插件交互）。",
     "Type \"li <query>\" in the editor to trigger inline dictionary suggestions (inspired by the WordNet plugin)."),
    ("dict.set.externalLinks", "外部来源链接", "External source links"),
    ("dict.set.externalLinksDesc", "结果页显示 Wiktionary / Etymonline 等在线词典深链。", "Show deep links to online dictionaries such as Wiktionary / Etymonline on result pages."),
    ("dict.set.lemmaFallback", "词形还原回退", "Lemma fallback"),
    ("dict.set.lemmaFallbackDesc", "查询失败时自动尝试词形还原候选（ran→run、studies→study 等，英语）。", "On lookup failure, automatically try lemmatized candidates (ran→run, studies→study, etc., English)."),
    ("dict.set.zhConvert", "中文转换", "Chinese conversion"),
    ("dict.set.zhConvertDesc", "词条显示时在繁/简之间转换（MDict “Chinese Conversion” 菜单同款；OpenCC 单字表，Apache-2.0）。",
     "Convert between Traditional/Simplified when displaying entries (same as MDict's \"Chinese Conversion\" menu; OpenCC glyph table, Apache-2.0)."),
    ("dict.set.zhConvert.none", "不转换", "No conversion"),
    ("dict.set.zhConvert.t2s", "繁→简", "Traditional → Simplified"),
    ("dict.set.zhConvert.s2t", "简→繁", "Simplified → Traditional"),
    ("dict.set.fixZhWrap", "修复中文断行", "Fix Chinese line wrap"),
    ("dict.set.fixZhWrapDesc", "合并词条内被硬换行切断的中文句子（句号/冒号后不断行）。源自 MDict 同名功能。",
     "Merge Chinese sentences broken by hard line breaks inside entries (no break after period/colon). From MDict's same-named feature."),
    ("dict.set.collapsible", "词典块可折叠", "Collapsible blocks"),
    ("dict.set.collapsibleDesc", "多词典结果按 MDict 联合查询样式渲染：每部词典一个可折叠块，仅第一条展开，可一键全部展开/收起。",
     "Render multi-dictionary results in MDict union-view style: one collapsible block per dictionary, only the first expanded, expand/collapse all with one click."),
    ("dict.set.buddhist", "佛學模式", "Buddhist canon mode"),
    ("dict.set.buddhistDesc", "啟用漢文佛典處理：CBETA 異體字歸一化（17,085 組）、缺字碼還原、文言/佛典功能詞過濾、佛典主題詞檢測。",
     "Enable Classical Chinese Buddhist canon processing: CBETA variant normalization (17,085 groups), missing-glyph restoration, literary/Buddhist stopword filtering, and Buddhist topic detection."),
    ("dict.set.hover", "悬停查询", "Hover lookup", None, "چىراق", "Ховер"),
    ("dict.set.hoverDesc", "按住修饰键（默认 Ctrl）悬停在单词上弹出释义浮窗，点击浮窗可固定。支持中日韩文（Intl.Segmenter）。",
     "Hold a modifier key (default Ctrl) and hover over a word to pop up a definition; click to pin. Supports CJK (Intl.Segmenter)."),
    ("dict.set.hoverTrigger", "悬停触发键", "Hover trigger key"),
    ("dict.set.hoverTriggerDesc", "悬浮查词的修饰键。", "Modifier key for hover lookup."),
    ("dict.set.hoverTrigger.ctrl", "Ctrl / ⌘", "Ctrl / ⌘"),
    ("dict.set.hoverTrigger.alt", "Alt / Option", "Alt / Option"),
    ("dict.set.hoverTrigger.shift", "Shift", "Shift"),
    ("dict.set.hoverTrigger.meta", "Meta / Win", "Meta / Win"),
    ("dict.set.selectionClean", "选区清洗", "Selection cleaning"),
    ("dict.set.selectionCleanDesc", "清理来自 PDF/高亮的选区：软连字符跨行去连字、合字归一（ﬁ→fi）、零宽字符移除。",
     "Clean selections from PDF/highlights: soft-hyphen de-ligature across lines, ligature normalization (ﬁ→fi), zero-width removal."),
    ("dict.set.remember", "记录查询历史", "Remember lookups"),
    ("dict.set.rememberDesc", "在词典面板的「历史」页显示查询记录。", "Show lookup history on the dictionary panel's History tab."),
    ("dict.set.fuzzy", "模糊回退", "Fuzzy fallback"),
    ("dict.set.fuzzyDesc", "精确匹配失败时，尝试忽略大小写与标点的模糊匹配（MDict 词典）。", "On exact-match failure, try case/punctuation-insensitive fuzzy matching (MDict dictionaries)."),
    ("dict.set.groups", "分组", "Groups"),
    ("dict.set.newGroupPlaceholder", "新分组名，如：英语 / 医学 / 计算机", "New group name, e.g. English / Medicine / Computer"),
    ("dict.set.addGroup", "添加分组", "Add group"),
    ("dict.set.delGroup", "删除", "Delete"),
    ("dict.set.loaded", "已加载词典", "Loaded dictionaries"),
    ("dict.set.noDicts", "尚未加载词典。请将词典文件放入上面的文件夹后点击「扫描并加载」。", "No dictionaries loaded yet. Put dictionary files in the folder above, then click \"Scan & load\"."),
    ("dict.set.formats", "支持的格式", "Supported formats"),
    ("dict.set.moveUp", "↑ 上移", "Move up"),
    ("dict.set.remove", "移除", "Remove"),
    ("dict.set.fmt.mdict", "MDict", "MDict"),
    ("dict.set.fmt.mdictFiles", ".mdx + .mdd（可选）+ 同名 .css/.js/字体（可选）", ".mdx + .mdd (optional) + same-named .css/.js/font (optional)"),
    ("dict.set.fmt.mdictNote", "v1.2 / v2.0，zlib 与 LZO 压缩；MDD 资源自动提取；加密词典不支持", "v1.2 / v2.0, zlib and LZO compression; MDD assets auto-extracted; encrypted dictionaries unsupported"),
    ("dict.set.fmt.stardict", "StarDict", "StarDict"),
    ("dict.set.fmt.stardictFiles", ".ifo + .idx + .dict 或 .dict.dz（可选 .syn）", ".ifo + .idx + .dict or .dict.dz (optional .syn)"),
    ("dict.set.fmt.stardictNote", "idxoffsetbits=32/64、sametypesequence、dictzip 随机访问", "idxoffsetbits=32/64, sametypesequence, dictzip random access"),
    ("dict.set.fmt.xdxf", "XDXF", "XDXF"),
    ("dict.set.fmt.xdxfFiles", ".xdxf 或 .xdxf.gz", ".xdxf or .xdxf.gz"),
    ("dict.set.fmt.xdxfNote", "logical 与 visual 两种格式", "logical and visual formats"),
    ("dict.set.fmt.dictd", "dictd", "dictd"),
    ("dict.set.fmt.dictdFiles", ".index + .dict 或 .dict.dz", ".index + .dict or .dict.dz"),
    ("dict.set.fmt.dictdNote", "DICT 协议服务器数据库格式", "DICT protocol server database format"),
    # 校勘視圖
    ("dict.collation.title", "校勘", "Collation", None, "ساللاتسىيە", "Зүүлт"),
    ("dict.collation.steps", "三步校勘：① 选底本 → ② 选对校本 → ③ 点「开始校勘」。异文自动分类，底本原貌不改动。",
     "Three-step collation: ① pick base → ② pick witness → ③ click \"Start collation\". Variants are auto-classified; the base text is never altered."),
    ("dict.collation.vaultDoc", "— 从 vault 选择文档 —", "— Select a document from vault —"),
    ("dict.collation.paste", "或直接粘贴文本到此处…", "Or paste text here…"),
    ("dict.collation.base", "底本 Base", "Base text"),
    ("dict.collation.baseDesc", "校勘基准（保持原貌）", "Collation base (kept as-is)"),
    ("dict.collation.target", "对校本 Collation", "Witness"),
    ("dict.collation.targetDesc", "与之比对的另一版本", "The other version to compare against"),
    ("dict.collation.options", "校勘选项（默认已适合古籍）", "Collation options (defaults suit classical texts)"),
    ("dict.collation.opt.ignorePunct", "忽略标点", "Ignore punctuation"),
    ("dict.collation.opt.ignoreTrad", "忽略繁简", "Ignore Traditional/Simplified"),
    ("dict.collation.opt.ignoreVar", "忽略异体", "Ignore variants"),
    ("dict.collation.opt.buddhist", "佛典異體 (CBETA)", "Buddhist variants (CBETA)"),
    ("dict.collation.opt.recPunct", "记录标点差异", "Record punctuation differences"),
    ("dict.collation.strict.strict", "标点过滤:严格", "Punctuation filter: strict"),
    ("dict.collation.strict.default", "标点过滤:默认", "Punctuation filter: default"),
    ("dict.collation.run", "开始校勘", "Start collation"),
    ("dict.collation.runHint", "填完①②后可用", "Available after ①② are filled"),
    ("dict.collation.needBase", "请先填写底本与对校本", "Please fill in the base and witness texts first"),
    ("dict.collation.export", "导出校勘记", "Export collation notes"),
    ("dict.collation.resultEmpty", "校勘结果将显示在这里", "Collation results will appear here"),
    ("dict.collation.hint", "支持任意古籍文本：底本与对校本可以是同一本书的不同版本、刻本与手抄本、或今人整理本与原书。",
     "Supports any classical text: base and witness can be different editions of the same book, printed vs manuscript, or a modern edition vs the original."),
    ("dict.collation.buddhistHint", "偵測到佛典主題文本：建議在下方選項勾選「佛典異體歸一」（CBETA 異體字表），並可比對 CBETA Online（cbetaonline.dila.edu.tw）同經異本。",
     "Detected a Buddhist-canon-themed text: enable \"Buddhist variant normalization\" (CBETA variant table) below, and compare with CBETA Online (cbetaonline.dila.edu.tw)."),
    ("dict.collation.autoFilled", "已自动填入语料面板载入的第一篇文档作为底本。", "Auto-filled the first document loaded in the Corpus panel as the base text."),
    ("dict.collation.toCorpus", "底本送语料", "Send base to corpus"),
    ("dict.collation.toCorpusDone", "底本已送入语料面板，切到「语料」页运行分析", "Base sent to Corpus panel; switch to the Corpus tab to run analysis"),
    ("dict.collation.lookupWords", "异文查词典:", "Look up variants:"),
    ("dict.collation.notesTitle", "校勘记", "Collation notes"),
    ("dict.collation.noExport", "没有可导出的校勘记", "No collation notes to export"),
    # 指令 / 對話框 / 懸停
    ("dict.cmd.openCollation", "打开校勘面板", "Open collation panel"),
    ("dict.cmd.openDict", "打开词典面板", "Open dictionary panel"),
    ("dict.cmd.importParallel", "导入跨语库平行对齐", "Import parallel alignment (DNX/MITRA/TSV)"),
    ("dict.cmd.lookupSelection", "查询选中文本", "Look up selection"),
    ("dict.cmd.lookupSelectionNone", "没有选中文本", "No text selected"),
    ("dict.cmd.rescan", "重新扫描词典文件夹", "Rescan dictionary folders"),
    ("dict.cmd.openBookmarks", "打开书签列表", "Open bookmarks"),
    ("dict.cmd.openHistory", "打开查询历史", "Open lookup history"),
    ("dict.cmd.fulltext", "词典全文搜索", "Full-text search in dictionaries"),
    ("dict.modal.parallelTitle", "貼上平行對齊數據（TSV/JSONL；DNX 兩段用 --- 分隔）", "Paste parallel alignment data (TSV/JSONL; separate DNX segments with ---)"),
    ("dict.modal.imported", "已導入 {n} 對平行句對——語料面板「⇄ 平行對讀」區塊顯示", "Imported {n} parallel pairs — shown in the Corpus panel's \"⇄ Parallel reading\" section"),
    ("dict.hover.notFound", "未找到「{word}」", "Not found: \"{word}\""),
    ("dict.menu.lookup", "li 詞典: 查询「{short}」", "li Dictionary: look up \"{short}\""),
    ("dict.inline.count", "{n} 条结果", "{n} results"),
]

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

def gen_block() -> str:
    lines = []
    for key, zh, en, *rest in ENTRIES:
        bo = rest[0] if len(rest) > 0 else None
        ug = rest[1] if len(rest) > 1 else None
        mn = rest[2] if len(rest) > 2 else None
        langs = [f'    "zh": "{esc(zh)}"', f'    "en": "{esc(en)}"']
        if bo: langs.append(f'    "bo": "{esc(bo)}"')
        if ug: langs.append(f'    "ug": "{esc(ug)}"')
        if mn: langs.append(f'    "mn": "{esc(mn)}"')
        lines.append('  "%s": {\n%s\n  },' % (key, ",\n".join(langs)))
    return "\n".join(lines)

def insert_i18n():
    with io.open(I18N, "r", encoding="utf-8") as f:
        src = f.read()
    marker = "  },\n};\n\nexport function t("
    assert marker in src, "DICT closing marker not found in i18n.ts"
    block = gen_block()
    src = src.replace(marker, "  },\n\n" + block + "\n};\n\nexport function t(", 1)
    with io.open(I18N, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[i18n] inserted {len(ENTRIES)} dict.* entries")

# ---- 2) 字面量替換 ----
# (file, prefix, [(literal, key), ...])  prefix: 視圖類用 this.plugin.T；plugin.ts 用 this.T
MAP = {
    "src/dict/settings.ts": ("this.plugin.T", [
        ("词典文件夹 Dictionary folders", "dict.set.folders"),
        ("逗号分隔的仓库内文件夹路径。插件会递归扫描 .mdx/.mdd、StarDict (.ifo+.idx+.dict[.dz][+.syn])、.xdxf、dictd (.index+.dict[.dz])，以及同名配套的 .css/.js/字体文件。", "dict.set.foldersDesc"),
        ("立即扫描 Scan now", "dict.set.scan"),
        ("扫描上述文件夹并加载词典（插件启动时也会自动扫描）。", "dict.set.scanDesc"),
        ("扫描并加载 Scan & load", "dict.set.scanBtn"),
        ("提取 MDD 资源 Extract .mdd assets", "dict.set.extractMdd"),
        ("导入 MDict 词典时把 .mdd 中的图片/音频/字体/CSS 提取到仓库（.li-assets/），供词条内显示。", "dict.set.extractMddDesc"),
        ("MDD 资源预算 Asset budget (MB)", "dict.set.mddBudget"),
        ("每部词典最多提取的资源总大小，防止仓库膨胀。", "dict.set.mddBudgetDesc"),
        ("全文搜索结果上限 Full-text limit", "dict.set.fullTextLimit"),
        ("每部词典的全文/内容搜索最多返回条数。", "dict.set.fullTextLimitDesc"),
        ("行内编辑器建议 Inline suggest", "dict.set.inlineSuggest"),
        ("在编辑器中输入 \"li <query>\" 触发行内词典建议（借鉴 WordNet 插件交互）。", "dict.set.inlineSuggestDesc"),
        ("外部来源链接 External links", "dict.set.externalLinks"),
        ("结果页显示 Wiktionary / Etymonline 等在线词典深链。", "dict.set.externalLinksDesc"),
        ("词形还原回退 Lemma fallback", "dict.set.lemmaFallback"),
        ("查询失败时自动尝试词形还原候选（ran→run、studies→study 等，英语）。", "dict.set.lemmaFallbackDesc"),
        ("中文转换 Chinese conversion", "dict.set.zhConvert"),
        ("词条显示时在繁/简之间转换（MDict “Chinese Conversion” 菜单同款；OpenCC 单字表，Apache-2.0）。", "dict.set.zhConvertDesc"),
        ("不转换 No conversion", "dict.set.zhConvert.none"),
        ("繁→简 Traditional → Simplified", "dict.set.zhConvert.t2s"),
        ("简→繁 Simplified → Traditional", "dict.set.zhConvert.s2t"),
        ("修复中文断行 Fix Chinese line wrap", "dict.set.fixZhWrap"),
        ("合并词条内被硬换行切断的中文句子（句号/冒号后不断行）。源自 MDict 同名功能。", "dict.set.fixZhWrapDesc"),
        ("词典块可折叠 Collapsible blocks", "dict.set.collapsible"),
        ("多词典结果按 MDict 联合查询样式渲染：每部词典一个可折叠块，仅第一条展开，可一键全部展开/收起。", "dict.set.collapsibleDesc"),
        ("佛學模式 Buddhist canon mode", "dict.set.buddhist"),
        ("啟用漢文佛典處理：CBETA 異體字歸一化（17,085 組）、缺字碼還原、文言/佛典功能詞過濾、佛典主題詞檢測。", "dict.set.buddhistDesc"),
        ("悬停查询 Hover lookup", "dict.set.hover"),
        ("按住修饰键（默认 Ctrl）悬停在单词上弹出释义浮窗，点击浮窗可固定。支持中日韩文（Intl.Segmenter）。", "dict.set.hoverDesc"),
        ("悬停触发键 Hover trigger", "dict.set.hoverTrigger"),
        ("悬浮查词的修饰键。", "dict.set.hoverTriggerDesc"),
        ("Ctrl / ⌘", "dict.set.hoverTrigger.ctrl"),
        ("Alt / Option", "dict.set.hoverTrigger.alt"),
        ("Shift", "dict.set.hoverTrigger.shift"),
        ("Meta / Win", "dict.set.hoverTrigger.meta"),
        ("选区清洗 Selection cleaning", "dict.set.selectionClean"),
        ("清理来自 PDF/高亮的选区：软连字符跨行去连字、合字归一（ﬁ→fi）、零宽字符移除。", "dict.set.selectionCleanDesc"),
        ("记录查询历史 Remember lookups", "dict.set.remember"),
        ("在词典面板的「历史」页显示查询记录。", "dict.set.rememberDesc"),
        ("模糊回退 Fuzzy fallback", "dict.set.fuzzy"),
        ("精确匹配失败时，尝试忽略大小写与标点的模糊匹配（MDict 词典）。", "dict.set.fuzzyDesc"),
        ("分组 Groups", "dict.set.groups"),
        ("新分组名，如：英语 / 医学 / 计算机", "dict.set.newGroupPlaceholder"),
        ("添加分组", "dict.set.addGroup"),
        ("删除", "dict.set.delGroup"),
        ("已加载词典 Loaded dictionaries", "dict.set.loaded"),
        ("尚未加载词典。请将词典文件放入上面的文件夹后点击「扫描并加载」。", "dict.set.noDicts"),
        ("支持的格式 Supported formats", "dict.set.formats"),
        ("↑ 上移", "dict.set.moveUp"),
        ("移除", "dict.set.remove"),
        ("MDict", "dict.set.fmt.mdict"),
        (".mdx + .mdd（可选）+ 同名 .css/.js/字体（可选）", "dict.set.fmt.mdictFiles"),
        ("v1.2 / v2.0，zlib 与 LZO 压缩；MDD 资源自动提取；加密词典不支持", "dict.set.fmt.mdictNote"),
        ("StarDict", "dict.set.fmt.stardict"),
        (".ifo + .idx + .dict 或 .dict.dz（可选 .syn）", "dict.set.fmt.stardictFiles"),
        ("idxoffsetbits=32/64、sametypesequence、dictzip 随机访问", "dict.set.fmt.stardictNote"),
        ("XDXF", "dict.set.fmt.xdxf"),
        (".xdxf 或 .xdxf.gz", "dict.set.fmt.xdxfFiles"),
        ("logical 与 visual 两种格式", "dict.set.fmt.xdxfNote"),
        ("dictd", "dict.set.fmt.dictd"),
        (".index + .dict 或 .dict.dz", "dict.set.fmt.dictdFiles"),
        ("DICT 协议服务器数据库格式", "dict.set.fmt.dictdNote"),
    ]),
    "src/dict/view.ts": ("this.plugin.T", [
        ("li 詞典", "dict.panel.title"),
        ("查询", "dict.tab.lookup"),
        ("书签", "dict.tab.bookmarks"),
        ("历史", "dict.tab.history"),
        ("语料", "dict.tab.corpus"),
        ("管理", "dict.tab.manage"),
        ("输入单词查询… Type a word", "dict.search.placeholder"),
        ("全文/内容搜索… Full-text & content search (Enter)", "dict.ft.placeholder"),
        ("Aa 大小写", "dict.ft.matchCase"),
        ("⌐ 整词", "dict.ft.wholeWords"),
        (".* 正则", "dict.ft.regex"),
        ("多词用 | 分隔", "dict.ft.sep"),
        ("搜索", "dict.ft.search"),
        ("全部 All", "dict.all"),
        ("仅查此词典 Only this", "dict.chip.onlyThis"),
        ("词典信息 Info", "dict.chip.info"),
        ("上移 Move up", "dict.chip.moveUp"),
        ("禁用 Disable", "dict.chip.disable"),
        ("启用 Enable", "dict.chip.enable"),
        ("删除 Delete…", "dict.chip.delete"),
        ("还没有导入词典", "dict.empty.title"),
        ("支持 MDict (.mdx/.mdd)、StarDict (.ifo/.idx/.dict[.dz])、XDXF (.xdxf) 与 dictd (.index/.dict[.dz])。", "dict.empty.desc"),
        ("将词典文件放入仓库任意文件夹（建议 dictionaries/），然后在管理页扫描导入。", "dict.empty.hint"),
        ("打开管理面板", "dict.empty.btn"),
        ("准备就绪", "dict.ready"),
        ("最近查询 Recent", "dict.recent"),
        ("加入书签 Add bookmark", "dict.addBookmark"),
        ("移除书签 Remove bookmark", "dict.removeBookmark"),
        ("分享为图片 Share as PNG", "dict.share.png"),
        ("正在生成分享图片…", "dict.share.generating"),
        ("笔记 Generate note", "dict.note"),
        ("⚡ 闪卡", "dict.flashcard"),
        ("复制闪卡到剪贴板 Copy flashcards (Spaced Repetition compatible)", "dict.flashcard.none"),
        ("没有可生成的闪卡内容", "dict.flashcard.none"),
        ("在线来源:", "dict.extlinks"),
        ("🪷 巴利/梵文:", "dict.paliSanskrit"),
        ("🌱 词源 Etymology", "dict.etymology"),
        ("抓取 etymonline 中…", "dict.etym.loading"),
        ("来源 etymonline.com ↗", "dict.etym.src"),
        ("未找到词源（或网络不可用）", "dict.etym.none"),
        ("你是不是要找：", "dict.didYouMean"),
        ("试试全文搜索（管理页）或更短的形式。", "dict.tryFulltext"),
        ("⬇ 全部展开", "dict.expandAll"),
        ("⬆ 全部收起", "dict.collapseAll"),
        ("复制", "dict.copy"),
        ("插入", "dict.insert"),
        ("已复制 HTML 到剪贴板", "dict.copyDone"),
        ("📊 语料", "dict.sendCorpus"),
        ("词条已送入语料面板，切到「语料」页运行分析", "dict.sendCorpusDone"),
        ("词条内容为空，无法分析", "dict.sendCorpusEmpty"),
        ("⇄ 互校", "dict.collate"),
        ("两个词条内容一致，无差异", "dict.collateSame"),
        ("查询结果页点击 ★ 收藏词条。", "dict.bookmarks.hint"),
        ("清空书签", "dict.bookmarks.clear"),
        ("未找到", "dict.noResults"),
        ("管理词典 Manage dictionaries", "dict.aria.manage"),
    ]),
    "src/dict/collation-view.ts": ("this.plugin.T", [
        ("校勘 Collation", "dict.collation.title"),
        ("📜 校勘 Collation", "dict.collation.title"),
        ("三步校勘：① 选底本 → ② 选对校本 → ③ 点「开始校勘」。异文自动分类，底本原貌不改动。", "dict.collation.steps"),
        ("— 从 vault 选择文档 —", "dict.collation.vaultDoc"),
        ("或直接粘贴文本到此处…", "dict.collation.paste"),
        ("①", "dict.collation.base"),
        ("底本 Base", "dict.collation.base"),
        ("校勘基准（保持原貌）", "dict.collation.baseDesc"),
        ("②", "dict.collation.target"),
        ("对校本 Collation", "dict.collation.target"),
        ("与之比对的另一版本", "dict.collation.targetDesc"),
        ("⚙ 校勘选项（默认已适合古籍）", "dict.collation.options"),
        ("忽略标点", "dict.collation.opt.ignorePunct"),
        ("忽略繁简", "dict.collation.opt.ignoreTrad"),
        ("忽略异体", "dict.collation.opt.ignoreVar"),
        ("佛典異體 (CBETA)", "dict.collation.opt.buddhist"),
        ("记录标点差异", "dict.collation.opt.recPunct"),
        ("标点过滤:严格", "dict.collation.strict.strict"),
        ("标点过滤:默认", "dict.collation.strict.default"),
        ("🔍 开始校勘", "dict.collation.run"),
        ("填完①②后可用", "dict.collation.runHint"),
        ("请先填写底本与对校本", "dict.collation.needBase"),
        ("📄 导出校勘记", "dict.collation.export"),
        ("校勘结果将显示在这里", "dict.collation.resultEmpty"),
        ("支持任意古籍文本：底本与对校本可以是同一本书的不同版本、刻本与手抄本、或今人整理本与原书。", "dict.collation.hint"),
        ("偵測到佛典主題文本：建議在下方選項勾選「佛典異體歸一」（CBETA 異體字表），並可比較 CBETA Online（cbetaonline.dila.edu.tw）同經異本。", "dict.collation.buddhistHint"),
        ("已自动填入语料面板载入的第一篇文档作为底本。", "dict.collation.autoFilled"),
        ("📊 底本送语料", "dict.collation.toCorpus"),
        ("底本已送入语料面板，切到「语料」页运行分析", "dict.collation.toCorpusDone"),
        ("异文查词典:", "dict.collation.lookupWords"),
        ("校勘记（", "dict.collation.notesTitle"),
        ("没有可导出的校勘记", "dict.collation.noExport"),
    ]),
    "src/dict/plugin.ts": ("this.T", [
        ("Open collation panel / 打开校勘面板", "dict.cmd.openCollation"),
        ("Open dictionary panel / 打开词典面板", "dict.cmd.openDict"),
        ("Import parallel alignment (DNX/MITRA/TSV) / 导入跨语库平行对齐", "dict.cmd.importParallel"),
        ("Look up selection / 查询选中文本", "dict.cmd.lookupSelection"),
        ("没有选中文本 / No text selected", "dict.cmd.lookupSelectionNone"),
        ("Rescan dictionary folders / 重新扫描词典文件夹", "dict.cmd.rescan"),
        ("Open bookmarks / 打开书签列表", "dict.cmd.openBookmarks"),
        ("Open lookup history / 打开查询历史", "dict.cmd.openHistory"),
        ("Full-text search in dictionaries / 词典全文搜索", "dict.cmd.fulltext"),
        ("貼上平行對齊數據（TSV/JSONL；DNX 兩段用 --- 分隔）", "dict.modal.parallelTitle"),
    ]),
}

def wire():
    total = 0
    for rel, (prefix, pairs) in MAP.items():
        path = os.path.join(ROOT, rel)
        with io.open(path, "r", encoding="utf-8") as f:
            src = f.read()
        # 長字面量先替換，避免被子串干擾（配對含引號，實際不會子串命中，仍排序保險）
        pairs = sorted(pairs, key=lambda p: -len(p[0]))
        for literal, key in pairs:
            repl = "%s('%s')" % (prefix, key)
            for q in ("'", '"'):
                tok = q + literal + q
                if tok in src:
                    src = src.replace(tok, repl)
                    total += 1
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"[wire] {rel}: {len(pairs)} mappings")
    print(f"[wire] total replacements: {total}")

if __name__ == "__main__":
    insert_i18n()
    wire()
    print("DONE")
