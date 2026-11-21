#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

"""打包交付 tar.gz：li-handoff-v<version>/<相對路徑>。

與 scripts/zip-delivery.py 採用同一套排除規則（含 core dump / heap snapshot 攔截），
避免兩種格式產出內容不一致。
"""
import tarfile, os, sys, pathlib, time

BUILD_LIST_ERROR_HINT = (
    "  這是暫時性 I/O 錯誤（已重試三次）。若反覆出現，請檢查該檔是否為"
    "只寫一半的殘留物、磁碟空間是否充足 —— 打包絕不可靜默略過檔案。"
)


def write_entry(add, name, arcname):
    """寫入一個歸檔項；暫時性 OSError 重試三次，仍失敗則報出檔名後中止。

    之所以 report-and-die 而不是略過：交付包少一個檔是很難被發現的錯誤，
    寧可讓整條流水線失敗，也不能產出「看起來成功但內容不全」的交付物。
    """
    last = None
    for attempt in range(3):
        try:
            add(name, arcname)
            return True
        except OSError as e:
            last = e
            time.sleep(0.2 * (attempt + 1))
    raise SystemExit(
        f"✗ 打包失敗：{name}\n  {last!r}\n{BUILD_LIST_ERROR_HINT}"
    )

root = pathlib.Path.cwd()
out = pathlib.Path(sys.argv[1])
version = sys.argv[2]
EXCLUDE_NAMES = {"node_modules", ".git", "artifacts"}
EXCLUDE_RELPATH = ("node_modules/", "test/build/", ".git/", "artifacts/", "fonts-src/")
EXCLUDE_SUFFIX = (".core", ".hprof", ".heapsnapshot", ".heapprofile")
MAX_SINGLE_FILE = 256 * 1024 * 1024

if out.exists():
    out.unlink()
count = 0
skipped = []
entries = []
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
            entries.append((p, f"li-handoff-v{version}/{rel}"))
            count += 1

with tarfile.open(out, "w:gz", compresslevel=9) as t:
    for p, arc in entries:
        write_entry(t.add, p, arc)

print(f"entries: {count}")
if skipped:
    total = sum(s for _, s in skipped) / 1048576
    print(f"skipped {len(skipped)} 個行程殘留物（{total:.0f} MB）")
