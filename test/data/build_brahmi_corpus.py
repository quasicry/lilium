#!/usr/bin/env python3
# Build Brahmi authoritative corpus for roman<->Brahmi round-trip tests.
import json, unicodedata, re, urllib.request, os

TOML_URL = "https://raw.githubusercontent.com/indic-transliteration/common_maps/master/brahmic/brahmi.toml"
toml_text = urllib.request.urlopen(TOML_URL).read().decode("utf-8")

deva_to_brahmi = {}
section = None
for line in toml_text.splitlines():
    m = re.match(r'^\[(\w+)\]$', line.strip())
    if m:
        section = m.group(1); continue
    m = re.match(r'^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*$', line.strip())
    if m and section:
        k = m.group(1); v = m.group(2)
        if '\\' in k: k = k.encode().decode('unicode_escape')
        if '\\' in v: v = v.encode().decode('unicode_escape')
        deva_to_brahmi[k] = v
print("toml pairs:", len(deva_to_brahmi))

def valid_brahmi(s):
    for ch in s:
        if unicodedata.category(ch) == 'Cn':
            return False, f"unassigned U+{ord(ch):04X}"
        if ord(ch) >= 0x11000 and not (0x11000 <= ord(ch) <= 0x1107F):
            return False, f"outside Brahmi block U+{ord(ch):04X}"
    return True, ""

VOW = {'a':'अ','ā':'आ','i':'इ','ī':'ई','u':'उ','ū':'ऊ','ṛ':'ऋ','ṝ':'ॠ','e':'ए','ai':'ऐ','o':'ओ','au':'औ'}
VMARK= {'ā':'ा','i':'ि','ī':'ी','u':'ु','ū':'ू','ṛ':'ृ','ṝ':'ॄ','e':'े','ai':'ै','o':'ो','au':'ौ'}
CONS = {'k':'क','kh':'ख','g':'ग','gh':'घ','ṅ':'ङ','c':'च','ch':'छ','j':'ज','jh':'झ','ñ':'ञ',
        'ṭ':'ट','ṭh':'ठ','ḍ':'ड','ḍh':'ढ','ṇ':'ण','t':'त','th':'थ','d':'द','dh':'ध','n':'न',
        'p':'प','ph':'फ','b':'ब','bh':'भ','m':'म','y':'य','r':'र','l':'ल','v':'व','ś':'श','ṣ':'ष','s':'स','h':'ह','ḷ':'ळ'}
TOKENS = re.compile('|'.join(sorted(list(VOW)+list(CONS), key=len, reverse=True)) + '|ṃ|ṁ|ḥ|ं|ः')

def iast_to_deva(w):
    w = w.replace('ṃ','ं').replace('ṁ','ं').replace('ḥ','ः')
    out = ""; last_cons = False
    for tok in TOKENS.findall(w):
        if tok == 'ं': out += 'ं'; last_cons = False; continue
        if tok == 'ः': out += 'ः'; last_cons = False; continue
        if tok in VOW:
            if last_cons:
                if tok != 'a': out += VMARK[tok]
            else:
                out += VOW[tok]
            last_cons = False
        else:
            if last_cons: out += '्'
            out += CONS[tok]; last_cons = True
    if last_cons: out += '्'
    return out

def deva_to_brahmi_toml(deva):
    out = ""; i = 0
    while i < len(deva):
        for L in (3,2,1):
            if i+L <= len(deva) and deva[i:i+L] in deva_to_brahmi:
                out += deva_to_brahmi[deva[i:i+L]]; i += L; break
        else:
            return None, f"no toml mapping at {deva[i:]!r}"
    return out, ""

S_H = ("Hultzsch, Corpus Inscriptionum Indicarum Vol. I (1925), IAST of Ashokan edict vocabulary; "
       "Brahmi per Unicode chart U+11000; cross-checked vs indic-transliteration brahmi.toml (MIT)")
S_WG = "Wikipedia 'Edicts of Ashoka' - direct Brahmi Unicode quote (Gujarra Minor Rock Edict)"
S_WP = "Wikipedia 'Pillars of Ashoka' - direct Brahmi Unicode quote (7th Major Pillar Edict)"

W = [
 ("dhamma","𑀥𑀫𑁆𑀫",S_H,"dhamma, core concept of the edicts"),
 ("dhaṃmathaṃbhā","𑀥𑀁𑀫𑀣𑀁𑀪𑀸",S_WP,"'pillars of Dhamma', direct Wikipedia Brahmi quote"),
 ("devānaṃpiya","𑀤𑁂𑀯𑀸𑀦𑀁𑀧𑀺𑀬",S_H,"'Beloved of the Gods', royal title"),
 ("devānaṃpiyasa","𑀤𑁂𑀯𑀸𑀦𑀁𑀧𑀺𑀬𑀲",S_WG,"genitive, direct Wikipedia Brahmi quote (Gujarra)"),
 ("piyadasi","𑀧𑀺𑀬𑀤𑀲𑀺",S_H,"Priyadasi, Ashoka's epithet"),
 ("piyadasino","𑀧𑀺𑀬𑀤𑀲𑀺𑀦𑁄",S_WG,"direct Wikipedia Brahmi quote (Gujarra)"),
 ("asokarājā","𑀅𑀲𑁄𑀓𑀭𑀸𑀚𑀸",S_WG,"'King Ashoka', direct Wikipedia Brahmi quote (Gujarra)"),
 ("asoka","𑀅𑀲𑁄𑀓",S_H,"Ashoka"),
 ("rājā","𑀭𑀸𑀚𑀸",S_H,"king"),
 ("saṃgha","𑀲𑀁𑀖",S_H,"monastic community (Schism Edicts)"),
 ("buddha","𑀩𑀼𑀤𑁆𑀥",S_H,"the Buddha"),
 ("desa","𑀤𑁂𑀲",S_H,"country / region"),
 ("ya","𑀬",S_H,"'and' (most frequent particle)"),
 ("ca","𑀘",S_H,"'and' (Prakrit ca)"),
 ("va","𑀯",S_H,"'or / like'"),
 ("savve","𑀲𑀯𑁆𑀯𑁂",S_H,"'all' (savve)"),
 ("sādhu","𑀲𑀸𑀥𑀼",S_H,"'good / meritorious'"),
 ("puṇa","𑀧𑀼𑀡",S_H,"merit (Skt puṇya)"),
 ("sila","𑀲𑀺𑀮",S_H,"virtue (Skt śīla)"),
 ("mātā","𑀫𑀸𑀢𑀸",S_H,"mother (MRE 3 mātari)"),
 ("pitā","𑀧𑀺𑀢𑀸",S_H,"father (MRE 3 pitari)"),
 ("loka","𑀮𑁄𑀓",S_H,"world"),
 ("sukha","𑀲𑀼𑀔",S_H,"happiness"),
 ("dukkha","𑀤𑀼𑀓𑁆𑀔",S_H,"suffering"),
 ("jīva","𑀚𑀻𑀯",S_H,"living being"),
 ("pāṇa","𑀧𑀸𑀡",S_H,"living beings (sava-pāṇā)"),
 ("hiṃsā","𑀳𑀺𑀁𑀲𑀸",S_H,"violence, abstention theme (MRE 1-4)"),
 ("dāna","𑀤𑀸𑀦",S_H,"gift / liberality"),
 ("saca","𑀲𑀘",S_H,"truth (Skt satya, Pillar Edict 2)"),
 ("parisuddhi","𑀧𑀭𑀺𑀲𑀼𑀤𑁆𑀥𑀺",S_H,"purity (Pillar Edict 2)"),
 ("māgadha","𑀫𑀸𑀕𑀥",S_H,"Magadha"),
 ("kāliṃga","𑀓𑀸𑀮𑀺𑀁𑀕",S_H,"Kalinga (MRE 13)"),
 ("gaṃdhāra","𑀕𑀁𑀥𑀸𑀭",S_H,"Gandhara (MRE 13)"),
 ("yoṇa","𑀬𑁄𑀡",S_H,"Greek / Yona (MRE 2, 13)"),
 ("āṃtiyoka","𑀆𑀁𑀢𑀺𑀬𑁄𑀓",S_H,"Antiochos (MRE 2 Aṃtiyoko)"),
 ("dhaṃmaghosa","𑀥𑀁𑀫𑀖𑁄𑀲",S_H,"'drum of Dhamma' (MRE 4)"),
 ("saṃbodhi","𑀲𑀁𑀩𑁄𑀥𑀺",S_H,"enlightenment (MRE 8, Sambodhi)"),
 ("bodhi","𑀩𑁄𑀥𑀺",S_H,"enlightenment (MRE 8)"),
 ("brāhmaṇa","𑀩𑁆𑀭𑀸𑀳𑁆𑀫𑀡",S_H,"Brahmana (MRE 3, 9)"),
 ("samaṇa","𑀲𑀫𑀡",S_H,"Sramana (MRE 3 samaṇe)"),
 ("thaṃbha","𑀣𑀁𑀪",S_H,"pillar (Skt stambha)"),
 ("vihāra","𑀯𑀺𑀳𑀸𑀭",S_H,"dwelling / monastery"),
 ("thupa","𑀣𑀼𑀧",S_H,"stupa (Nigali Sagar edict)"),
 ("pāṭaliputa","𑀧𑀸𑀝𑀮𑀺𑀧𑀼𑀢",S_H,"Pataliputra"),
 ("cakkhu","𑀘𑀓𑁆𑀔𑀼",S_H,"eye (cakkhu)"),
 ("hita","𑀳𑀺𑀢",S_H,"welfare (hita)"),
 ("sukhāya","𑀲𑀼𑀔𑀸𑀬",S_H,"for happiness (sukhāya)"),
 ("pajā","𑀧𑀚𑀸",S_H,"people (Skt prajā)"),
 ("āṇā","𑀆𑀡𑀸",S_H,"order / edict (Skt ājñā)"),
 ("hida","𑀳𑀺𑀤",S_H,"here / in this world (hida loke)"),
 ("bāhuta","𑀩𑀸𑀳𑀼𑀢",S_H,"much / many (bāhuta)"),
 ("appa","𑀅𑀧𑁆𑀧",S_H,"few (appa)"),
 ("bahu","𑀩𑀳𑀼",S_H,"many (bahu)"),
 ("dayā","𑀤𑀬𑀸",S_H,"mercy (Pillar Edict 2)"),
 ("mahāmāta","𑀫𑀳𑀸𑀫𑀸𑀢",S_H,"high official (mahāmātā)"),
 ("yuta","𑀬𑀼𑀢",S_H,"subordinate officer (Skt yukta)"),
 ("deva","𑀤𑁂𑀯",S_H,"god (devānaṃ-piya)"),
 ("dāni","𑀤𑀸𑀦𑀺",S_H,"now (MRE 13)"),
 ("lasuṇa","𑀮𑀲𑀼𑀡",S_H,"garlic (MRE 2)"),
 ("phala","𑀨𑀮",S_H,"fruit (MRE 2 phalāni)"),
 ("samavāya","𑀲𑀫𑀯𑀸𑀬",S_H,"concord (MRE 12)"),
 ("viyāpata","𑀯𑀺𑀬𑀸𑀧𑀢",S_H,"occupied / busy (MRE 3)"),
 ("anuvekhā","𑀅𑀦𑀼𑀯𑁂𑀔𑀸",S_H,"exertion (MRE 6)"),
]

kept, dropped = [], []
for rom, native, src, note in W:
    ok, msg = valid_brahmi(native)
    if not ok:
        dropped.append({"rom":rom,"native":native,"reason":msg}); continue
    deva = iast_to_deva(rom)
    tb, err = deva_to_brahmi_toml(deva)
    if tb != native:
        dropped.append({"rom":rom,"deva":deva,"expected_native":native,"toml":tb,"err":err}); continue
    kept.append({"rom":rom,"native":native,"source":src,"note":note})

print("KEPT", len(kept), "DROPPED", len(dropped))
for d in dropped: print("DROP", json.dumps(d, ensure_ascii=False))

outdir = os.path.dirname(os.path.abspath(__file__))
out = {"meta":{
  "purpose":"Roman (IAST) <-> Brahmi round-trip test corpus for Ashokan Prakrit",
  "unicode_range":"U+11000-U+1107F",
  "sources":[
    "https://archive.org/details/InscriptionsOfAsoka.NewEditionByE.Hultzsch - Hultzsch, CII Vol.I (1925), public domain, IAST readings of Ashokan edicts",
    "https://en.wikipedia.org/wiki/Edicts_of_Ashoka - direct Brahmi Unicode quotes (Gujarra inscription)",
    "https://en.wikipedia.org/wiki/Pillars_of_Ashoka - direct Brahmi Unicode quote (Dhaṃma thaṃbhā)",
    "https://www.unicode.org/charts/PDF/U11000.pdf - Unicode Brahmi chart U+11000..U+1107F (glyph values)",
    "https://raw.githubusercontent.com/indic-transliteration/common_maps/master/brahmic/brahmi.toml (MIT) - independent codepoint-by-codepoint cross-validation only"
  ],
  "validation":"every Brahmi codepoint checked assigned via Python unicodedata; every word reproduced exactly from its IAST via the brahmi.toml map (independent check)"
 },
 "words":kept}
with open(os.path.join(outdir,"brahmi-authoritative-words.json"),"w",encoding="utf-8") as f:
    json.dump(out,f,ensure_ascii=False,indent=2)

pairs=[]; skipped=[]
for k,v in deva_to_brahmi.items():
    if v=="" : skipped.append((k,"empty")); continue
    ok,_=valid_brahmi(v)
    if not ok: skipped.append((k,"invalid brahmi")); continue
    pairs.append({"deva":k,"brahmi":v})
pairs.sort(key=lambda p:[ord(c) for c in p["deva"]])
mp={"meta":{
  "source":"indic-transliteration brahmi.toml (MIT)",
  "url":TOML_URL,
  "license":"MIT",
  "note":"Devanagari key -> Brahmi value map from indic-transliteration/common_maps (git submodule of indic_transliteration_py), MIT licensed. All Brahmi values verified assigned in Unicode.",
  "entry_count":len(pairs)
},"pairs":pairs}
with open(os.path.join(outdir,"brahmi-authoritative-map.json"),"w",encoding="utf-8") as f:
    json.dump(mp,f,ensure_ascii=False,indent=2)
print("pairs:",len(pairs),"skipped:",skipped)
