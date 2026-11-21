// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * data.json 併發讀-改-寫競態回歸測試（階段 6 深度排查）。
 *
 * 背景：融合後 data.json 有 4 個寫者
 *   lilium 核心 `vw` / 辭典設定 `dict` / 詞典資料 `dictStore` / 查詞快取 `dictLookupCache`
 * 若各自 `loadData()` → 改 → `saveData()`，併發時後寫者以過期快照覆寫先寫者，造成資料丟失。
 *
 * 本測試：
 *   1. 對照組：不用互斥器，證明併發會真的丟資料（bug 真實存在）
 *   2. 實驗組：用 DataMutex，證明 4 個寫者的結果全部保留（修復有效）
 *   3. 單筆事務失敗不得卡死佇列
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, "build", "data-mutex.mjs");

let pass = 0;
let fail = 0;
const ok = (m) => {
  pass++;
  console.log("  \u2713 " + m);
};
const bad = (m, e) => {
  fail++;
  console.log("  \u2717 " + m + " \u2014 " + (e?.message ?? e));
};
async function test(name, fn) {
  try {
    await fn();
  } catch (e) {
    bad(name, e);
  }
}

// ---------- 模擬 DataHost：非同步（有延遲）的 data.json ----------
function makeHost(initial = {}) {
  let store = { ...initial };
  return {
    async loadData() {
      await new Promise((r) => setTimeout(r, 5)); // 模擬磁碟讀延遲
      return JSON.parse(JSON.stringify(store));
    },
    async saveData(data) {
      await new Promise((r) => setTimeout(r, 5)); // 模擬磁碟寫延遲
      store = JSON.parse(JSON.stringify(data));
    },
    peek: () => store,
  };
}

// ---------- 打包 DataMutex ----------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [path.join(ROOT, "src/shared/data-mutex.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${OUT}`],
  { stdio: "pipe" }
);
const { DataMutex } = await import(OUT + "?t=" + Date.now());

console.log("\n[data-mutex] 併發讀-改-寫競態");

const KEYS = ["vw", "dict", "dictStore", "dictLookupCache"];

await test("對照組：無互斥器時，4 個寫者併發會互相覆寫（證明 bug 真實存在）", async () => {
  const host = makeHost();
  // 模擬舊實作：各自 load -> 改 -> save
  await Promise.all(
    KEYS.map(async (k) => {
      const raw = (await host.loadData()) || {};
      raw[k] = { writtenBy: k };
      await host.saveData(raw);
    })
  );
  const final = host.peek();
  const present = KEYS.filter((k) => final[k]);
  assert.ok(
    present.length < KEYS.length,
    `預期無互斥時會丟資料（實得保留 ${present.length}/${KEYS.length}），若全部保留則本測試失去對照意義`
  );
  ok(`無互斥：僅保留 ${present.length}/${KEYS.length} 個命名空間（${present.join(", ")}）→ 競態 bug 確認`);
});

await test("實驗組：DataMutex 串行化後，4 個寫者併發結果全部保留", async () => {
  const host = makeHost();
  const mutex = new DataMutex(host);
  await Promise.all(
    KEYS.map((k) =>
      mutex.mutate((raw) => {
        raw[k] = { writtenBy: k };
      })
    )
  );
  const final = host.peek();
  for (const k of KEYS) {
    assert.deepStrictEqual(final[k], { writtenBy: k }, `命名空間 ${k} 應被保留`);
  }
  ok("DataMutex：vw / dict / dictStore / dictLookupCache 四者全部保留，零覆寫");
});

await test("實驗組：高併發（每命名空間 8 次寫入）仍無丟失", async () => {
  const host = makeHost();
  const mutex = new DataMutex(host);
  const jobs = [];
  for (const k of KEYS) {
    for (let i = 0; i < 8; i++) {
      jobs.push(
        mutex.mutate((raw) => {
          const cur = (raw[k] && raw[k].n) || 0;
          raw[k] = { n: cur + 1 };
        })
      );
    }
  }
  await Promise.all(jobs);
  const final = host.peek();
  for (const k of KEYS) {
    assert.strictEqual(final[k].n, 8, `${k} 累加應為 8，實得 ${final[k]?.n}`);
  }
  ok("每命名空間 8 次併發累加均正確（32 筆寫入零丟失）");
});

await test("只讀快照：read() 讀到的是最新狀態且不會寫入", async () => {
  const host = makeHost({ vw: { theme: "paper" } });
  const mutex = new DataMutex(host);
  const snap = await mutex.read();
  assert.deepStrictEqual(snap.vw, { theme: "paper" }, "read() 應回傳既有內容");
  // read 不應改變底層（內容相同即未寫入）
  assert.deepStrictEqual(host.peek(), { vw: { theme: "paper" } }, "read() 不應寫入");
  ok("read() 只讀不寫，回傳最新快照");
});

await test("事務拋錯不得卡死佇列（後續寫入仍可完成）", async () => {
  const host = makeHost();
  const mutex = new DataMutex(host);
  await assert.rejects(
    mutex.mutate(() => {
      throw new Error("boom");
    }),
    /boom/,
    "失敗事務應把錯誤拋給呼叫端"
  );
  // 佇列若被卡死，下面這行會永久 pending
  const done = await Promise.race([
    mutex.mutate((raw) => {
      raw.after = true;
    }).then(() => "done"),
    new Promise((r) => setTimeout(() => r("timeout"), 2000)),
  ]);
  assert.strictEqual(done, "done", "失敗事務後佇列仍須可用");
  assert.strictEqual(host.peek().after, true, "後續寫入應生效");
  ok("失敗事務不污染佇列，後續寫入正常完成");
});

await test("損壞資料（null / 陣列）回退為空物件，不拋錯", async () => {
  for (const bad0 of [null, undefined, [], "oops"]) {
    const host = {
      async loadData() {
        return bad0;
      },
      async saveData(d) {
        host.saved = d;
      },
      saved: undefined,
    };
    const mutex = new DataMutex(host);
    const out = await mutex.mutate((raw) => {
      raw.ok = 1;
      return raw;
    });
    assert.strictEqual(out.ok, 1, `載入 ${JSON.stringify(bad0)} 時應回退為空物件`);
  }
  ok("data.json 損壞（null/陣列/字串）時回退空物件，不在載入期拋出");
});

await test("C7（A1 回歸防護）：mutate(fn, false) 只讀快照不得落盤", async () => {
  const host = makeHost({ vw: { uiLang: "zh-TW" } });
  const mutex = new DataMutex(host);
  let snap;
  await mutex.mutate((raw) => { snap = raw; }, false);
  assert.deepStrictEqual(snap, { vw: { uiLang: "zh-TW" } }, "快照應含既有資料");
  await new Promise((r) => setTimeout(r, 30)); // 給任何殘留寫入機會
  assert.strictEqual(host.saved, undefined, "loadSettings 語義（save=false）不得觸發 saveData");
  ok("mutate(fn, false) 全程零 saveData——A1（loadSettings 無謂回寫）回歸被門禁攔截");
});

console.log(`\n[data-mutex] 結果：${pass} 通過 / ${fail} 失敗`);
if (fail > 0) {
  console.log("[data-mutex] \u274c 有失敗");
  process.exit(1);
}
console.log("[data-mutex] 全部通過 \u2705");
