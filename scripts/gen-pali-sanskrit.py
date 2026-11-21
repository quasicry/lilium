#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

"""
生成 src/dict/data/pali-sanskrit.ts —— v2.8.85 全量重建。

來源：Digital Pāḷi Dictionary (dpd-db) dpd.txt 的 "Sanskrit:" 欄，
      取「全量」對應（含一詞多對應），不再只取首個等價詞。

用法：
  curl -L -o dpd-txt.zip https://github.com/digitalpalidictionary/dpd-db/releases/download/<ver>/dpd-txt.zip
  unzip dpd-txt.zip            # → dpd.txt
  python3 scripts/gen-pali-sanskrit.py dpd.txt src/dict/data/pali-sanskrit.ts <dpd-ver>

轉換規則：
  · 詞頭：頂格行第一個 token（去「1.1」義項序號與尾逗號）→ 主詞形。
  · Sanskrit 欄：剝離全形/半形括號內注釋（如 "karman [kṛ]" → "karman"），
    按 , ， 、 ; ； 切分為多個對應詞，去重後以 " / " 串接（首個為主對應）。
  · 同詞頭多義項取聯集（順序穩定：先出現者在前）。
"""
import re
import sys


def parse(dpd_path):
    pali2skt = {}
    order = {}
    with open(dpd_path, encoding='utf-8') as f:
        head = None
        for line in f:
            if line.startswith('  '):
                if head is None:
                    continue
                m = re.match(r'  Sanskrit: (.*)$', line.rstrip('\n'))
                if not m:
                    continue
                raw = re.sub(r'\([^)]*\)', '', m.group(1))          # 去括號注釋
                raw = re.sub(r'\[[^\]]*\]', '', raw)                 # 去方括號根標記
                parts = [p.strip() for p in re.split(r'[,，、;；]', raw) if p.strip()]
                if not parts:
                    continue
                bucket = pali2skt.setdefault(head, [])
                for p in parts:
                    if p not in bucket:
                        bucket.append(p)
            else:
                if not line.strip():
                    head = None
                    continue
                # 頂格行：詞頭 [+ 義項序號] [+ 詞類…] ，取第一個 token
                tok = line.split(' ')[0].rstrip(',')
                head = tok or None
    return pali2skt


def main():
    dpd_path, out_path = sys.argv[1], sys.argv[2]
    dpd_ver = sys.argv[3] if len(sys.argv) > 3 else 'unknown'
    data = parse(dpd_path)
    data = {k: v for k, v in data.items() if v}
    multi = sum(1 for v in data.values() if len(v) > 1)

    K = ' / '.join(sorted(data.keys()))  # 穩定排序（UTF-8 字典序）
    keys = sorted(data.keys())
    body = ','.join('"%s":"%s"' % (k.replace('\\', '\\\\').replace('"', '\\"'),
                                   ' / '.join(data[k]).replace('\\', '\\\\').replace('"', '\\"'))
                    for k in keys)

    header = f'''/**
 * Pāli → Sanskrit equivalence map — v2.8.85 全量重建（多對應）。
 *
 * {len(data):,} 條巴利詞頭→梵文對應詞。巴利語是中古印度-雅利安語，多數詞彙有
 * 梵文對應形式（如 kamma→karman、dhamma→dharma、paññā→prajñā）；查詢巴利詞時
 * 顯示梵文對應可輔助確認詞源與跨語系檢索。
 *
 * 本版依用戶指示改為**全量**：一詞多對應者全部保留，以 " / " 串接（首個為主對應）；
 * 其中 {multi:,} 條為多對應（舊版僅取首個等價詞，故此表詞形亦更完整）。
 * 來源：Digital Pāḷi Dictionary (dpd-db) dpd.txt "Sanskrit:" 欄（{dpd_ver}）。
 * DPD 數據以 ODbL/CC 方式自由發布（dpd-db releases），本表為語言事實映射。
 * Source: https://github.com/digitalpalidictionary/dpd-db
 * 生成：scripts/gen-pali-sanskrit.py
 */
export const PALI_SANSKRIT_MAP: Record<string, string> = {{{body}}};
'''
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(header)
    print(f'wrote {out_path}: {len(data)} 詞形（多對應 {multi}），{len(header):,} bytes')


if __name__ == '__main__':
    main()
