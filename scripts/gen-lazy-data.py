# -*- coding: utf-8 -*-
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry
"""
把 src/dict/data/*.ts 的巨型物件字面量轉成「JSON 字串常數 + 懶 JSON.parse」的 .lazy.ts。

為什麼：Obsidian 在啟動時會同步 require 整個 main.js，所有頂層物件字面量都會被求值。
實測（Node 22，冷啟動）：
    buddhist-chars 226.5ms / pali-sanskrit 61.4ms / tibetan-lexicon 54.1ms … 合計 377.6ms
改成 JSON 字串後首次使用才 JSON.parse，成本降到約 1/8，且未使用時為 0。

產生的 .lazy.ts 形如：
    const RAW_CB_CODE_MAP = `{"CB00001":"..."}`;
    let cache: Record<string,string> | null = null;
    export function loadCbCodeMap(): Record<string,string> { ... }
"""
import json
import os
import subprocess
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src/dict/data")
TMP = "/tmp/lazygen"
os.makedirs(TMP, exist_ok=True)

# name -> (export name -> TS 型別)
TABLES = {
    # v2.9.18：buddhist-chars 已隨 CBETA 三表剝離移入附錄（附录/佛學資料-cbeta-gaiji/data/），
    # 不再生成；如需重生成，把兩檔放回 src/dict/data/ 並補回本條目。
    # v2.9.28：pali-sanskrit 已隨巴利-梵文表剝離移入附錄（附录/佛學資料-pali-sanskrit/data/），
    # 不再生成；恢復方法見該附錄 README。
    # v2.9.12：tibetan-lexicon 已隨藏文詞條剝離移入附錄，不再生成
    # v2.8.37：stopwords-spacy 已隨語料功能剝離移入附錄，不再生成
    "collation-chars": {
        "ZH_T2S_EXT": "Record<string, string>",
        "ZH_S2T_EXT": "Record<string, string>",
        "VARIANT_COMMON": "Record<string, string>",
    },
    "ranjana": {"RANJANA_MAP": "Record<string, { char?: string; pua?: string; romanized?: string }>"},
    # r153：zh-convert 已併入 collation-chars 共享 EXT 表（shim 再導出），
    # 其 .lazy.ts 為手寫委派檔（loadZhT2s=loadZhT2sExt），不再由本腳本生成。
    # "zh-convert": {"ZH_T2S": "Record<string, string>", "ZH_S2T": "Record<string, string>"},
    "lemma-lookup-en": {"SPACY_LEMMA_LOOKUP_EN": "Record<string, string[]>"},
}


def to_fn(name: str) -> str:
    """CB_CODE_MAP -> loadCbCodeMap"""
    parts = name.lower().split("_")
    return "load" + "".join(p.capitalize() for p in parts)


def js_template_literal(s: str) -> str:
    """把 JSON 字串安全地放進 JS 模板字面量。"""
    s = s.replace("\\", "\\\\")          # 先處理反斜線
    s = s.replace("`", "\\`")            # 模板字面量終止符
    s = s.replace("${", "\\${")          # 插值起始
    s = s.replace("\u2028", "\\u2028")   # 行分隔符（避免舊引擎問題）
    s = s.replace("\u2029", "\\u2029")
    return s


def main():
    total_src = 0
    total_json = 0
    for mod, exports in TABLES.items():
        src = os.path.join(DATA, mod + ".ts")
        out_cjs = os.path.join(TMP, mod + ".cjs")
        subprocess.run(
            [os.path.join(ROOT, "node_modules/.bin/esbuild"), src,
             "--bundle", "--format=cjs", "--platform=node",
             f"--outfile={out_cjs}", "--log-level=silent"],
            check=True, cwd=ROOT,
        )
        # 讀值
        probe = os.path.join(TMP, "probe.cjs")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("const m = require(%r);\nconsole.log(JSON.stringify(Object.keys(m)));\n" % out_cjs)
        keys = json.loads(subprocess.run(["node", probe], capture_output=True, text=True,
                                         check=True).stdout.strip())
        missing = [k for k in exports if k not in keys]
        if missing:
            raise SystemExit(f"{mod}: 缺少導出 {missing}")

        chunks = []
        for name in exports:
            p2 = os.path.join(TMP, "dump.cjs")
            with open(p2, "w", encoding="utf-8") as f:
                f.write("const m = require(%r);\nprocess.stdout.write(JSON.stringify(m[%r]));\n"
                        % (out_cjs, name))
            raw = subprocess.run(["node", p2], capture_output=True, check=True).stdout.decode("utf-8")
            lit = js_template_literal(raw)
            ty = exports[name]
            chunks.append((name, ty, lit, len(raw)))

        body = [
            "// SPDX-License-Identifier: AGPL-3.0-or-later",
            "// Copyright (C) 2026 quasicry",
            "/**",
            f" * 自動生成（scripts/gen-lazy-data.py）——請勿手改，改源頭 {mod}.ts 後重跑。",
            " *",
            f" * {mod} 的資料以 JSON 字串內嵌，首次存取才 JSON.parse，避免在插件啟動時",
            " * 同步求值數百毫秒的物件字面量（見 src/dict/sorted-index.ts 同批效能修復說明）。",
            " */",
            "",
        ]
        for name, ty, lit, n in chunks:
            fn = to_fn(name)
            body += [
                f"/** {name}（{n:,} 位元組 JSON） */",
                f"const RAW_{name} = `{lit}`;",
                f"let CACHE_{name}: {ty} | null = null;",
                f"export function {fn}(): {ty} {{",
                f"  if (CACHE_{name} === null) CACHE_{name} = JSON.parse(RAW_{name}) as {ty};",
                f"  return CACHE_{name} as {ty};",
                "}",
                "/** 僅供測試：釋放快取，驗證懶載入冪等 */",
                f"export function resetCache{''.join(p.capitalize() for p in name.lower().split('_'))}ForTest(): void {{ CACHE_{name} = null; }}",
                "",
            ]
        dst = os.path.join(DATA, mod + ".lazy.ts")
        with open(dst, "w", encoding="utf-8") as f:
            f.write("\n".join(body))

        s_sz = os.path.getsize(src)
        j_sz = sum(n for _, _, _, n in chunks)
        d_sz = os.path.getsize(dst)
        total_src += s_sz
        total_json += j_sz
        print(f"{mod:20s} ts {s_sz/1048576:6.2f}MB -> json {j_sz/1048576:6.2f}MB (lazy.ts {d_sz/1048576:6.2f}MB)")

    print(f"\n合計：ts {total_src/1048576:.2f}MB -> json {total_json/1048576:.2f}MB "
          f"（省 {(total_src-total_json)/1048576:.2f}MB）")


main()
