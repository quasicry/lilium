# UCD 本地副本與溯源（scripts/ucd/）

本目錄存放 Unicode Character Database（UCD）資料檔的**原始副本**，供
`scripts/gen-vo.mjs`、`scripts/gen-lb.mjs` **離線**重新生成 `src/tsdata/*.gen.ts`。

為什麼要存副本：生成腳本若直接開網路抓檔，輸出就會隨上游更新而變動，「重跑產出
一致」這條幂等要求無法成立，離線環境也無法重現。因此流程是：
**人工抓一次 → 存進本目錄 → gen 腳本只做離線解析**。

## 檔案清單

| 檔案 | 來源 URL | Unicode 版本 | UCD 資料發布日 | 用途 |
|---|---|---|---|---|
| `VerticalOrientation-18.0.0.txt` | <https://www.unicode.org/Public/UCD/latest/ucd/VerticalOrientation.txt> | 18.0.0 | 2026-06-29 | UAX #50 `Vertical_Orientation`（vo）→ `src/tsdata/vo.gen.ts` |
| `LineBreak-18.0.0.txt` | <https://www.unicode.org/Public/UCD/latest/ucd/LineBreak.txt> | 18.0.0 | 2026-08-07 | UAX #14 `Line_Break`（lb）→ `src/tsdata/lb.gen.ts` |

版本號與發布日取自各檔案檔頭（`# VerticalOrientation-18.0.0.txt` / `# Date:`），
**不是抓取當日**——否則每次重跑都會產出不同的檔頭。

## 更新方式

沙箱 DNS 有污染，須走 Cloudflare WARP SOCKS5 代理並用 `socks5h`（代理端解析 DNS）：

```bash
curl -s -x socks5h://127.0.0.1:40000 --max-time 60 \
  -o scripts/ucd/VerticalOrientation-<ver>.txt \
  https://www.unicode.org/Public/UCD/latest/ucd/VerticalOrientation.txt
curl -s -x socks5h://127.0.0.1:40000 --max-time 60 \
  -o scripts/ucd/LineBreak-<ver>.txt \
  https://www.unicode.org/Public/UCD/latest/ucd/LineBreak.txt
```

若 `curl` 失敗，先用 `python3 /workspace/warp/doh_hosts.py` 重新釘 DNS（`/etc/hosts`
的 WARP DoH 釘定有 25 秒 TTL）。換版後記得同步改兩個 gen 腳本裡的 `SOURCE_FILE`
常數，並更新 `NOTICE.md` / `FONT-LICENSES.md` 的 Unicode 版本記載。

## 授權

UCD 依 Unicode Terms of Use / Unicode License 釋出，允許免費使用、複製、修改與再散布，
**但須保留著作權與授權宣告**：<https://www.unicode.org/terms_of_use.html>

生成檔 `src/tsdata/vo.gen.ts`、`src/tsdata/lb.gen.ts` 的檔頭已內嵌：Unicode 版本號、
來源 URL、UCD 資料發布日、以及上述授權宣告；散佈時不得移除。
「Unicode」「Unicode Logo」為 Unicode, Inc. 於美國及其他國家的註冊商標。

`src/tsdata/punct.gen.ts` **不含** UCD 衍生資料（是依 W3C clreq 人工整理的三態表），
故不適用 Unicode License；其溯源見該檔檔頭。
