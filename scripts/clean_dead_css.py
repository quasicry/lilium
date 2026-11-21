#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry


# -*- coding: utf-8 -*-
"""
清理 styles.css 中「已無生產者」的死選擇器（li-corpus-* / li-col-* / li-parallel-* 家族）。

做法：
  - 以 src/**/*.ts 實際產出的 class 字面量（cls: 字串、.li-xxx 字面量）為準，
    區分 live（保留）與 dead（待刪）。
  - 僅刪除「選擇器裡只含 dead class、不含任何 live class」的規則區塊；
    若一條規則同時含 live 與 dead，則保留（避免誤傷轉寫面板）。
  - 遞迴處理 @media / @supports；若刪除後區塊體已無任何保留的子規則，
    則整個 @media / @supports 一併移除。
  - 保留所有註解與空白，僅以「區間刪除」重組，確保不破壞其它樣式。

輸出：
  - 就地重寫 styles.css
  - 快照被刪規則到 appendix_path（供還原）
  - 印出刪除統計
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_PATH = os.path.join(ROOT, "styles.css")
APPENDIX_DIR = os.path.join(ROOT, "附录")
SNAPSHOT_NAME = "已移除死選擇器快照.css"

# 只捕捉 class 名（不含前導 '.'），以便與 src 字面量對齊
LI_RE = re.compile(r"\.((?:li-(?:corpus|col|parallel)[a-zA-Z0-9_-]*))")


def collect_src_classes():
    """掃 src/**/*.ts，收集實際產出的 li-(corpus|col|parallel)* class 字面量。"""
    tokens = set()
    for dp, dns, fns in os.walk(os.path.join(ROOT, "src")):
        if "node_modules" in dp:
            continue
        for f in fns:
            if not f.endswith(".ts"):
                continue
            s = io.open(os.path.join(dp, f), encoding="utf-8", errors="replace").read()
            for m in re.findall(r"cls:\s*['\"`]([^'\"`]*)", s):
                tokens |= set(m.split())
            tokens |= set(re.findall(r"li-(?:corpus|col|parallel)[a-zA-Z0-9_-]*", s))
    return tokens


def classify(css, src_tokens):
    fam = set(LI_RE.findall(css))
    live = sorted(c for c in fam if c in src_tokens)
    dead = sorted(c for c in fam if c not in src_tokens)
    return set(live), set(dead), fam


# ---- 底層掃描：跳過字串與註解，做括號配對 ----

def skip_ws_comment(s, i):
    """從 i 起跳過空白與 /* */ 註解，回傳新的索引。"""
    n = len(s)
    while i < n:
        c = s[i]
        if c in " \t\r\n\f":
            i += 1
        elif c == "/" and i + 1 < n and s[i + 1] == "*":
            end = s.find("*/", i + 2)
            i = n if end == -1 else end + 2
        else:
            break
    return i


def scan_string(s, i):
    """若 s[i] 是引號，跳過整個字串（含轉義），回傳結束索引；否則回傳 i。"""
    c = s[i]
    if c in "\"'":
        quote = c
        j = i + 1
        while j < len(s):
            if s[j] == "\\":
                j += 2
                continue
            if s[j] == quote:
                return j + 1
            j += 1
        return j
    return i


def find_matching_brace(s, open_idx):
    """從 s[open_idx]=='{' 起，找到配對的 '}' 索引（不含），回傳 close+1。"""
    depth = 0
    j = open_idx
    n = len(s)
    while j < n:
        if s[j] == "/" and j + 1 < n and s[j + 1] == "*":
            j = s.find("*/", j + 2)
            if j == -1:
                j = n
            continue
        j = scan_string(s, j)
        if j > open_idx and s[j - 1] in "\"'":
            # scan_string 已跳過字串，j 已前進
            pass
        c = s[j]
        if c == "{":
            depth += 1
            j += 1
        elif c == "}":
            depth -= 1
            j += 1
            if depth == 0:
                return j
        else:
            j += 1
    return n


def parse_atrule_prelude_end(s, i):
    """at-rule 從 i（'@' 處）掃到第一個 '{' 或 ';'，回傳該符號索引。"""
    j = i + 1
    n = len(s)
    while j < n:
        if s[j] == "/" and j + 1 < n and s[j + 1] == "*":
            end = s.find("*/", j + 2)
            j = n if end == -1 else end + 2
            continue
        j = scan_string(s, j)
        if j < n and s[j] in "{;":
            return j
        j += 1
    return n


def parse_statement(s, i):
    """在 i（非空白、非註解）處解析一條語句。
    回傳 (node_dict, end_index)。
    node: {'type','raw','lead','prelude'(rule/atrule),'body'(atrule),'children'(atrule)}
    """
    if s[i] == "@":
        pre_end = parse_atrule_prelude_end(s, i)
        prelude = s[i:pre_end]
        name = prelude.split(" ", 1)[0].split("(", 1)[0].strip()
        if pre_end < len(s) and s[pre_end] == "{":
            close = find_matching_brace(s, pre_end)
            body = s[pre_end + 1 : close - 1]
            return {
                "type": "atrule",
                "name": name,
                "raw": s[i:close],
                "prelude": prelude,
                "body": body,
                "children": None,
            }, close
        else:
            # 語句型 at-rule（@import 等），以 ';' 結束
            end = pre_end + 1 if pre_end < len(s) and s[pre_end] == ";" else len(s)
            return {"type": "atstmt", "name": name, "raw": s[i:end], "prelude": prelude}, end
    else:
        # style rule：掃到 '{'
        j = i
        n = len(s)
        while j < n:
            if s[j] == "/" and j + 1 < n and s[j + 1] == "*":
                end = s.find("*/", j + 2)
                j = n if end == -1 else end + 2
                continue
            j = scan_string(s, j)
            if j < n and s[j] == "{":
                break
            j += 1
        if j >= n or s[j] != "{":
            # 沒有 '{'：當作裸宣告（如 @font-face 體內），整段保留
            return {"type": "decl", "raw": s[i:]}, n
        prelude = s[i:j]
        close = find_matching_brace(s, j)
        body = s[j + 1 : close - 1]
        return {"type": "rule", "raw": s[i:close], "prelude": prelude, "body": body}, close


def scan_scope(s):
    """掃描一個作用域（整份檔或 @media 體），回傳 (nodes, trail)。
    每個 node 含 'lead'（前方空白/註解）。trail 為結尾剩餘空白/註解。
    """
    nodes = []
    i = 0
    n = len(s)
    last = 0
    while i < n:
        j = skip_ws_comment(s, i)
        if j >= n:
            break
        node, end = parse_statement(s, j)
        node["lead"] = s[last:j]
        nodes.append(node)
        last = end
        i = end
    trail = s[last:]
    return nodes, trail


def rule_classes(prelude):
    return set(LI_RE.findall(prelude))


def render_nodes(nodes, trail, dead, live, removed, depth=0):
    """重組一層節點。回傳 (text, kept_count)。"""
    out = []
    kept = 0
    for node in nodes:
        lead = node.get("lead", "")
        t = node["type"]
        if t == "rule":
            classes = rule_classes(node["prelude"])
            has_dead = classes & dead
            has_live = classes & live
            if has_dead and not has_live:
                removed.append(node["raw"])
                continue  # 刪除
            out.append(lead + node["raw"])
            kept += 1
        elif t == "atrule":
            name = node["name"]
            if name in ("@media", "@supports", "@container", "@layer"):
                child_nodes, child_trail = scan_scope(node["body"])
                child_text, child_kept = render_nodes(
                    child_nodes, child_trail, dead, live, removed, depth + 1
                )
                if child_kept == 0:
                    # 體內已無保留子規則：整個 at-rule 移除
                    removed.append(node["raw"])
                    continue
                rebuilt = "%s{%s%s}" % (node["prelude"], child_text, child_trail)
                out.append(lead + rebuilt)
                kept += 1
            else:
                # @keyframes / @font-face / @page 等：不遞迴，直接保留
                out.append(lead + node["raw"])
                kept += 1
        elif t == "atstmt":
            out.append(lead + node["raw"])
            kept += 1
        elif t == "decl":
            out.append(lead + node["raw"])
            kept += 1
    return "".join(out), kept


def main():
    css = io.open(CSS_PATH, encoding="utf-8").read()
    src_tokens = collect_src_classes()
    live, dead, fam = classify(css, src_tokens)
    sys.stderr.write(
        "家族選擇器 %d | 保留 %d | 死 %d\n" % (len(fam), len(live), len(dead))
    )

    removed = []
    top_nodes, top_trail = scan_scope(css)
    rendered, top_kept = render_nodes(top_nodes, top_trail, dead, live, removed)

    # 統計被刪的獨特選擇器
    removed_classes = set()
    for raw in removed:
        removed_classes |= set(LI_RE.findall(raw))
    dead_removed = sorted(c for c in dead if c in removed_classes)
    dead_kept = sorted(c for c in dead if c not in removed_classes)

    sys.stderr.write("刪除規則區塊數: %d\n" % len(removed))
    sys.stderr.write("刪除歸屬的死選擇器: %d/%d\n" % (len(dead_removed), len(dead)))
    if dead_kept:
        sys.stderr.write("未刪除的死選擇器（與 live 同規則，保留）: %s\n" % dead_kept)

    io.open(CSS_PATH, "w", encoding="utf-8").write(rendered)

    # 快照
    os.makedirs(APPENDIX_DIR, exist_ok=True)
    snap_path = os.path.join(APPENDIX_DIR, SNAPSHOT_NAME)
    header = (
        "/* ----------------------------------------------------------------\n"
        " * 本檔為 styles.css 中「已無生產者」的死選擇器規則快照。\n"
        " * 僅供還原參考；這些 class 在 src 中已不再被任何程式碼產出。\n"
        " * 生成工具：scripts/clean_dead_css.py\n"
        " * ----------------------------------------------------------------\n\n"
    )
    snap = header + "\n\n".join(r.strip() for r in removed if r.strip()) + "\n"
    io.open(snap_path, "w", encoding="utf-8").write(snap)
    sys.stderr.write("快照已寫入: %s\n" % snap_path)
    sys.stderr.write("styles.css 行數: %d -> %d\n" % (css.count(chr(10)) + 1, rendered.count(chr(10)) + 1))


if __name__ == "__main__":
    main()
