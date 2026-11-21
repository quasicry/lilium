import * as lib from "./lib-export";
const s = lib.getScheme("tibetan-wylie") as any;
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(" ","utf8"));
const TIB = /[ༀ-࿿]/;
const fold = (x) => Array.from(x).flatMap((c) => {
  let cp = c.codePointAt(0);
  if (cp === 0x0F69) return ["C40", "S40"];
  if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
  if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
  if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
  return ["O" + cp];
}).sort().join(",");
let total=0, passThru=0, rt1=0, osc=0, nonSem=0, notConv=0;
const passList=[]; const nonsemList=[];
for (const bk of Object.keys(data)) {
  for (const ent of data[bk].tibetanWords) {
    const w = Array.isArray(ent) ? ent[0] : ent;
    total++;
    const rom = s.nativeToRoman(w);
    if (TIB.test(rom)) { passThru++; if (passList.length<5) passList.push([w, Array.from(w).map(c=>c.codePointAt(0).toString(16)).join(' ')]); continue; }
    const back = s.romanToNative(rom);
    if (back === w) { rt1++; continue; }
    const rom2 = s.nativeToRoman(back);
    const back2 = s.romanToNative(rom2);
    if (back2 === back) osc++;
    if (fold(back) !== fold(back2)) { nonSem++; if (nonsemList.length<5) nonsemList.push([w, rom, rom2]); }
    if (back2 !== back) notConv++;
  }
}
console.log(JSON.stringify({total, passThru, rt1, osc, nonSem, notConv, passList, nonsemList}));
