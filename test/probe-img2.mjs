// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as lib from "./build/vwlib.mjs";
const CHROME = process.env.CHROME_BIN || "chromium";
function chromium(args) { return execFileSync(CHROME, ["--headless","--no-sandbox","--disable-gpu","--hide-scrollbars",...args], { encoding: "utf8", maxBuffer: 50*1024*1024 }); }
const TMP = path.join(import.meta.dirname, "build");
const eff = lib.resolveEffective(lib.SCRIPTS.han, lib.DEFAULT_TYPOGRAPHY, lib.DEFAULT_PAGE);
const dataUri = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="rgb(220,80,80)"/></svg>');
const pageHtml = `<div class="li-page"><div class="li-page-body"><div class="li-doc" lang="zh-Hant">
<p>天地玄黃宇宙洪荒日月盈昃。</p>
<p><span class="internal-embed media-embed image-embed is-loaded"><img src="${dataUri}"></span></p>
<p>辰宿列張寒來暑往秋收冬藏。</p>
</div></div></div>`;
const probe = `
<style>
/* P2 候選修法 */
.li-doc p { max-width: 100%; }
.li-doc { width: 100%; }
.li-doc .internal-embed { display: block; max-width: 100%; }
.li-doc .internal-embed img { max-width: 100% !important; width: auto !important; }
.li-doc p .internal-embed img { max-width: 100%; max-height: var(--li-img-block); }
</style>
<script>
window.addEventListener('load', () => {
  try {
    const img = document.querySelector('.li-doc img');
    const doc = document.querySelector('.li-doc');
    const m = document.createElement('div'); m.id='li-result';
    const put=(k,v)=>m.setAttribute(k,encodeURIComponent(String(v)));
    const b=img.getBoundingClientRect(), bd=doc.getBoundingClientRect();
    put('data-img',[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)].join(','));
    put('data-doc',[Math.round(bd.width),Math.round(bd.height)].join(','));
    put('data-imgCSS', getComputedStyle(img).maxWidth+'|'+getComputedStyle(img).width); put('data-overflow', (b.x < bd.x - 1 || b.x+b.width > bd.x+bd.width+1) ? 'YES':'NO');
    document.body.appendChild(m);
  } catch (e) {
    const m = document.createElement('div'); m.id='li-result'; m.setAttribute('data-status','ERR'); m.setAttribute('data-err',String(e)); document.body.appendChild(m);
  }
});
</script>`;
const html = lib.buildStandaloneHtml({ title:"img-probe2", bodyHtml: pageHtml+probe, typesetCss: lib.buildTypesetCss(eff), pageCss: lib.buildPageCss(eff,true), fontFaces:"", lang:"zh-Hant" });
const hp = path.join(TMP,"probe-img2.html");
fs.writeFileSync(hp, html);
chromium(["--screenshot="+path.join(TMP,"probe-img2.png"),"--window-size=800,1200","--virtual-time-budget=4000",`file://${hp}`]);
