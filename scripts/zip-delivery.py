#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

"""打包交付 zip：li-handoff-v<version>/<相對路徑>，排除 node_modules/.git/artifacts/test-build。

補：排除 core dump / heap snapshot 等行程崩潰殘留物
（`node test/dict-perf.mjs` 的隔離子行程若 OOM，會在專案根目錄留下數 GB 的 `core.<pid>`，
曾被整包打進交付 zip，令體積由 45MB 暴增到 274MB）。
另加「單檔 >256MB 攔截」守衛，避免日後再有巨型殘留物靜默入包。
"""
import zipfile, os, sys, pathlib, time

BUILD_LIST_ERROR_HINT = (
    "  這是暫時性 I/O 錯誤（已重試三次）。若反覆出現，請檢查該檔是否為"
    "只寫一半的殘留物、磁碟空間是否充足 —— 打包絕不可靜默略過檔案。"
)


def probe_read(filename):
    """開檔預讀驗證可讀性；暫時性 OSError 重試三次。

    ⚠️ 為什麼重試只做在「讀」上，不做在「寫入 zip」上（v2.8.13 修）：
    舊版在 `write()` 上重試三次。實測踩到暫時性 I/O error 時，Python zipfile
    有可能已把 zinfo append 進 filelist 才在中途失敗，重試就會再寫一份同名
    條目 → 產出帶 `Duplicate name` 警告的壞包（解壓時後者覆蓋前者，看起來
    「打包成功」實則狀態不可信）。交付包壞了很難被發現，所以寫入一律不重試：
    寧可整條流水線中止，也不能產出內容重複的 zip。
    """
    last = None
    for attempt in range(3):
        try:
            with open(filename, "rb") as f:
                f.read(1)  # 只讀 1 位元組驗證可讀，不把大檔讀進記憶體
            return
        except OSError as e:
            last = e
            time.sleep(0.2 * (attempt + 1))
    raise SystemExit(
        f"✗ 打包失敗（無法讀取）：{filename}\n  {last!r}\n{BUILD_LIST_ERROR_HINT}"
    )


def write_entry(write, filename, arcname):
    """寫入一個壓縮項；失敗則報出檔名後中止（不重試，理由見 probe_read）。

    之所以 report-and-die 而不是略過：交付包少一個檔是很難被發現的錯誤，
    寧可讓整條流水線失敗，也不能產出「看起來成功但內容不全」的交付物。
    """
    probe_read(filename)
    try:
        write(filename, arcname)
    except OSError as e:
        raise SystemExit(
            f"✗ 打包失敗：{filename}\n  {e!r}\n{BUILD_LIST_ERROR_HINT}"
        )

root = pathlib.Path.cwd()
out = pathlib.Path(sys.argv[1])
version = sys.argv[2]
EXCLUDE_NAMES = {"node_modules", ".git", "artifacts"}
EXCLUDE_RELPATH = ("node_modules/", "test/build/", ".git/", "artifacts/")
# 行程崩潰殘留物（core dump / heap snapshot / V8 診斷檔）
EXCLUDE_SUFFIX = (".core", ".hprof", ".heapsnapshot", ".heapprofile")
MAX_SINGLE_FILE = 256 * 1024 * 1024  # 256 MB

if out.exists():
    out.unlink()
count = 0
skipped = []
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_NAMES]
        for name in sorted(filenames):
            p = pathlib.Path(dirpath) / name
            rel = p.as_posix()[len(root.as_posix()) + 1:]
            if rel.startswith(EXCLUDE_RELPATH):
                continue
            if name.startswith("core.") or name.endswith(EXCLUDE_SUFFIX):
                skipped.append((rel, p.stat().st_size))
                continue
            if p.is_file():
                size = p.stat().st_size
                if size > MAX_SINGLE_FILE:
                    raise SystemExit(
                        f"✗ 攔截巨型檔案：{rel}（{size / 1048576:.0f} MB）\n"
                        f"  請確認是否為行程殘留物；確需打包請調高 MAX_SINGLE_FILE。"
                    )
                write_entry(z.write, p, f"li-handoff-v{version}/{rel}")
                count += 1
print(f"entries: {count}")
if skipped:
    total = sum(s for _, s in skipped) / 1048576
    print(f"skipped {len(skipped)} 個行程殘留物（{total:.0f} MB）：")
    for rel, s in skipped:
        print(f"  - {rel}（{s / 1048576:.0f} MB）")
