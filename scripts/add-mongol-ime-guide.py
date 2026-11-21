#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry


# -*- coding: utf-8 -*-
"""插入蒙古文輸入法指引的兩個 i18n 鍵（各 20 語言）。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "i18n.ts"

TITLE = {
    "zh": "蒙古文輸入法：拉丁打字",
    "zh-TW": "蒙古文輸入法：拉丁打字",
    "ja": "モンゴル文字 IME：ラテン入力",
    "ko": "몽골어 입력기: 라틴 타이핑",
    "en": "Mongolian IME: Latin typing",
    "mn": "Монгол IME: латин бичих",
    "bo": "སོག་པོ་ཡིག་འཇུག：ལེ་ཊིན་འཇུག",
    "ug": "موڭغۇل كىرگۈزگۈچ: لاتىن كىرگۈزۈش",
    "es": "IME mongol: escritura latina",
    "fr": "IME mongol : saisie latine",
    "de": "Mongolische IME: Lateineingabe",
    "it": "IME mongolo: digitazione latina",
    "pt": "IME mongol: digitação latina",
    "ru": "Монгольская IME: ввод латиницей",
    "nl": "Mongoolse IME: Latijns typen",
    "pl": "IME mongolskie: pisanie łacińskie",
    "sv": "Mongolisk IME: latinskt skrivande",
    "cs": "Mongolská IME: latinské psaní",
    "hu": "Mongol IME: latin gépelés",
    "el": "Μογγολικό IME: λατινική πληκτρολόγηση",
}

DESC = {
    "zh": "在「即時上屏」中選擇本方案後：輸入大寫開頭的詞再加空格，即時轉為標準蒙古文（Monggol␣→ᠮᠣᠩᠭᠣᠯ）；小寫詞保持原樣，因此英文正文、程式碼、網址都不會受影響。蒙古文本身無大小寫，故以首字母大寫作為「轉換」的意圖標記。句首的英文詞（如 Time、File）仍可能誤觸——可用 Ctrl/Cmd+Z 撤銷，或關閉即時上屏改用手動命令。",
    "zh-TW": "在「即時上屏」中選擇本方案後：輸入大寫開頭的詞再加空格，即時轉為標準蒙古文（Monggol␣→ᠮᠣᠩᠭᠣᠯ）；小寫詞保持原樣，因此英文正文、程式碼、網址都不會受影響。蒙古文本身無大小寫，故以首字母大寫作為「轉換」的意圖標記。句首的英文詞（如 Time、File）仍可能誤觸——可用 Ctrl/Cmd+Z 撤銷，或關閉即時上屏改用手動命令。",
    "ja": "「即時上屏」で本方案を選ぶと：大文字で始まる語＋スペースで即座に標準モンゴル文字へ変換（Monggol␣→ᠮᠣᠩᠭᠣᠯ）。小文字の語はそのままなので、英文・コード・URL は影響を受けません。モンゴル文字に大文字小文字は無いため、先頭大文字を「変換する」意図の印にしています。文頭の英単語（Time、File など）は誤発動し得ます——Ctrl/Cmd+Z で取り消すか、即時上屏を切って手動コマンドをご利用ください。",
    "ko": "‘실시간 입력’에서 이 방식을 선택하면: 대문자로 시작하는 단어+공백이 즉시 표준 몽골어로 변환됩니다(Monggol␣→ᠮᠣᠩᠭᠣᠯ). 소문자 단어는 그대로이므로 영문 본문, 코드, URL은 영향받지 않습니다. 몽골어에는 대소문자가 없어 첫 글자 대문자를 ‘변환’ 의도 표시로 씁니다. 문장 첫 영단어(Time, File 등)는 오발동할 수 있습니다——Ctrl/Cmd+Z로 취소하거나 실시간 입력을 끄고 수동 명령을 쓰세요.",
    "en": "Select this scheme under realtime input: type a capitalised word plus space to convert instantly to standard Mongolian (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Lowercase words stay as typed, so English prose, code and URLs are unaffected. Mongolian has no letter case, so an initial capital marks the intent to convert. English words at the start of a sentence (e.g. Time, File) may still trigger — undo with Ctrl/Cmd+Z, or turn realtime input off and use the manual commands.",
    "mn": "«Бодит цагийн оруулга»-д энэ схемийг сонгоод: том үсгээр эхэлсэн үг + зайг бичвэл шууд стандарт монгол бичиг болно (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Жижиг үсгийн үг хэвээр үлдэх тул англи текст, код, URL-д нөлөөлөхгүй. Монгол бичигт том/жижиг үсэг байхгүй тул эхний том үсгийг «хөрвүүлэх» санааны тэмдэг болгов. Өгүүлбэрийн эхний англи үг (Time, File) алдаатай ажиллаж болзошгүй — Ctrl/Cmd+Z-ээр буцаана уу, эсвэл бодит цагийн оруулгыг унтраагаад гар командыг хэрэглэнэ үү.",
    "bo": "དུས་ཐོག་ཡིག་འཇུག་ནང་ལམ་ལུགས་འདི་འདེམས་རྗེས། འགོ་ཡི་གེ་ཆེན་པོས་འགོ་བརྩམས་པའི་ཚིག་དང་སྟོང་བ་བྲིས་ན་དུས་ཐོག་ཏུ་ཚད་ལྡན་སོག་པོ་ཡིག་ཏུ་འགྱུར། Monggol␣→ᠮᠣᠩᠭᠣᠯ། ཡི་གེ་ཆུང་བའི་ཚིག་ཇི་བཞིན་དུ་ལུས་པས་དབྱིན་ཡིག ཀོཌ། དྲ་ཐག་ལ་ཤུགས་རྐྱེན་མེད། སོག་པོ་ཡིག་ལ་ཡི་གེ་ཆེ་ཆུང་མེད་པས་འགོ་ཡི་གེ་ཆེན་པོ་ནི་སྒྱུར་བའི་དམིགས་ཡུལ་གྱི་རྟགས་ཡིན། ཚིག་གི་འགོར་དབྱིན་ཡིག Time/File སོགས་མི་འདོད་པར་འཕྲོ་སྲིད། Ctrl/Cmd+Z ཡིས་ཕྱིར་བསྐྲོད་དམ་དུས་ཐོག་ཡིག་འཇུག་བཀག་ནས་ལག་བཀའ་བེད་སྤྱོད་གནང་།",
    "ug": "«رەسمىي كىرگۈزۈش» دىن بۇ لايىھەنى تاللىغاندىن كېيىن: چوڭ ھەرپتىن باشلانغان سۆز قوش بوشلۇق بىلەن دەرھال ئۆلچەملىك موڭغۇلچىغا ئۆزگىرىدۇ (Monggol␣→ᠮᠣᠩᠭᠣᠯ). كىچىك ھەرپلىك سۆزلەر ئەسلىدە قالىدۇ، شۇڭا ئىنگلىزچە تېكىست، كود ۋە URL لارغا تەسىر يوق. موڭغۇلچىدا چوڭ-كىچىك ھەرپ پەرقى يوق، شۇڭا باش ھەرپنى «ئۆزگەرتىش» نىيىتىنىڭ بەلگىسى قىلدۇق. جۈملىنىڭ بېشىدىكى ئىنگلىزچە سۆزلەر (Time، File) خاتا قوزغىلىشى مۇمكىن — Ctrl/Cmd+Z بىلەن يېنىۋېلىڭ ياكى رەسمىي كىرگۈزۈشنى تاقاپ قول بۇيرۇقىنى ئىشلىتىڭ.",
    "es": "Al elegir este esquema en «entrada en tiempo real»: escriba una palabra con inicial mayúscula y espacio para convertirla al instante a mongol estándar (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Las palabras en minúscula se mantienen, así que el texto en inglés, el código y las URL no se ven afectados. El mongol no distingue mayúsculas, por lo que la inicial mayúscula marca la intención de convertir. Las palabras inglesas a principio de frase (Time, File) pueden activarse por error: deshaga con Ctrl/Cmd+Z o desactive la entrada en tiempo real y use los comandos manuales.",
    "fr": "En choisissant ce schéma dans « saisie en temps réel » : tapez un mot à majuscule initiale puis espace pour le convertir instantanément en mongol standard (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Les mots en minuscules restent tels quels : le texte anglais, le code et les URL ne sont pas affectés. Le mongol n’a pas de casse, la majuscule initiale marque donc l’intention de convertir. Les mots anglais en début de phrase (Time, File) peuvent se déclencher à tort : annulez avec Ctrl/Cmd+Z, ou désactivez la saisie en temps réel et utilisez les commandes manuelles.",
    "de": "Wenn Sie dieses Schema unter „Echtzeiteingabe“ wählen: ein großgeschriebenes Wort plus Leerzeichen wird sofort in Standard-Mongolisch umgewandelt (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Kleingeschriebene Wörter bleiben unverändert, englischer Text, Code und URLs sind also nicht betroffen. Mongolisch kennt keine Groß-/Kleinschreibung, daher markiert der Großbuchstabe am Wortanfang die Umwandlungsabsicht. Englische Wörter am Satzanfang (Time, File) können fälschlich auslösen: mit Ctrl/Cmd+Z rückgängig machen oder die Echtzeiteingabe abschalten und die manuellen Befehle nutzen.",
    "it": "Scegliendo questo schema in «input in tempo reale»: digitare una parola con iniziale maiuscola più spazio per convertirla subito in mongolo standard (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Le parole minuscole restano invariate, quindi testo inglese, codice e URL non sono interessati. Il mongolo non ha maiuscole/minuscole, quindi l’iniziale maiuscola segnala l’intenzione di convertire. Parole inglesi a inizio frase (Time, File) possono attivarsi per errore: annullare con Ctrl/Cmd+Z oppure disattivare l’input in tempo reale e usare i comandi manuali.",
    "pt": "Ao escolher este esquema em «entrada em tempo real»: digite uma palavra com inicial maiúscula mais espaço para convertê-la na hora em mongol padrão (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Palavras em minúsculas permanecem, então texto em inglês, código e URLs não são afetados. O mongol não tem maiúsculas/minúsculas, por isso a inicial maiúscula marca a intenção de converter. Palavras inglesas no início da frase (Time, File) podem disparar por engano: desfaça com Ctrl/Cmd+Z ou desative a entrada em tempo real e use os comandos manuais.",
    "ru": "Выбрав эту схему в «вводе в реальном времени»: наберите слово с заглавной буквы и пробел — оно мгновенно станет стандартным монгольским (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Слова со строчной остаются как есть, поэтому английский текст, код и URL не затрагиваются. В монгольском нет регистра, поэтому заглавная буква в начале слова обозначает намерение преобразовать. Английские слова в начале предложения (Time, File) могут срабатывать ошибочно: отмените через Ctrl/Cmd+Z или отключите ввод в реальном времени и пользуйтесь ручными командами.",
    "nl": "Kiest u dit schema bij ‘realtime invoer’: typ een woord met hoofdletter plus spatie om het direct naar standaard Mongools te converteren (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Woorden in kleine letters blijven ongewijzigd, dus Engelse tekst, code en URL’s worden niet beïnvloed. Mongools kent geen hoofdletters, daarom markeert de beginhoofdletter de bedoeling om te converteren. Engelse woorden aan het begin van een zin (Time, File) kunnen onterecht afgaan: maak ongedaan met Ctrl/Cmd+Z of zet realtime invoer uit en gebruik de handmatige opdrachten.",
    "pl": "Wybierając ten schemat w „wprowadzaniu w czasie rzeczywistym”: wpisz słowo z wielkiej litery i spację, aby natychmiast zamienić je na standardowy mongolski (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Słowa małą literą pozostają bez zmian, więc tekst angielski, kod i adresy URL nie są naruszane. Mongolski nie ma wielkości liter, dlatego początkowa wielka litera oznacza zamiar konwersji. Angielskie słowa na początku zdania (Time, File) mogą wyzwalać się omyłkowo: cofnij przez Ctrl/Cmd+Z albo wyłącz wprowadzanie w czasie rzeczywistym i użyj poleceń ręcznych.",
    "sv": "Väljer du detta schema under ”realtidsinmatning”: skriv ett ord med versal plus mellanslag för att omedelbart konvertera till standardmongoliska (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Gemena ord förblir oförändrade, så engelsk text, kod och webbadresser påverkas inte. Mongoliskan har inga versaler/gemener, därför markerar inledande versal avsikten att konvertera. Engelska ord i början av meningar (Time, File) kan utlösas felaktigt: ångra med Ctrl/Cmd+Z eller stäng av realtidsinmatning och använd de manuella kommandona.",
    "cs": "Zvolíte-li toto schéma v „vstupu v reálném čase“: napište slovo s velkým počátečním písmenem a mezeru a ihned se převede na standardní mongolštinu (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Malá slova zůstávají beze změny, takže anglický text, kód a adresy URL nejsou dotčeny. Mongolština nerozlišuje velikost písmen, proto počáteční velké písmeno označuje úmysl převést. Anglická slova na začátku věty (Time, File) se mohou spustit omylem: vezměte zpět pomocí Ctrl/Cmd+Z nebo vypněte vstup v reálném čase a použijte ruční příkazy.",
    "hu": "Ha ezt a sémát választja a „valós idejű bevitelnél”: írjon egy nagybetűvel kezdődő szót és szóközt, és azonnal standard mongollá alakul (Monggol␣→ᠮᠣᠩᠭᠣᠯ). A kisbetűs szavak változatlanok maradnak, így az angol szöveg, a kód és az URL-ek nem sérülnek. A mongol nem tesz különbséget kis- és nagybetű között, ezért a kezdő nagybetű jelzi az átalakítás szándékát. A mondat eleji angol szavak (Time, File) tévesen aktiválódhatnak: vonja vissza Ctrl/Cmd+Z-vel, vagy kapcsolja ki a valós idejű bevitelt és használja a kézi parancsokat.",
    "el": "Επιλέγοντας αυτό το σχήμα στην «εισαγωγή σε πραγματικό χρόνο»: πληκτρολογήστε λέξη με κεφαλαίο αρχικό και κενό για άμεση μετατροπή σε τυπικά μογγολικά (Monggol␣→ᠮᠣᠩᠭᠣᠯ). Οι πεζές λέξεις μένουν ως έχουν, οπότε αγγλικό κείμενο, κώδικας και URL δεν επηρεάζονται. Τα μογγολικά δεν έχουν πεζά/κεφαλαία, γι’ αυτό το αρχικό κεφαλαίο δηλώνει την πρόθεση μετατροπής. Αγγλικές λέξεις στην αρχή πρότασης (Time, File) μπορεί να ενεργοποιηθούν κατά λάθος: αναιρέστε με Ctrl/Cmd+Z ή απενεργοποιήστε την εισαγωγή σε πραγματικό χρόνο και χρησιμοποιήστε τις χειροκίνητες εντολές.",
}

ORDER = ["zh", "zh-TW", "ja", "ko", "en", "mn", "bo", "ug",
         "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"]


def block(key, values):
    lines = [f'  "{key}": {{']
    for lg in ORDER:
        v = values[lg]
        assert '"' not in v, f"{key}.{lg}"
        lines.append(f'    "{lg}": "{v}",')
    lines.append("  },")
    return "\n".join(lines) + "\n"


def main():
    text = I18N.read_text(encoding="utf-8")
    anchor = '  "set.translitManchu": {'
    idx = text.index(anchor)
    ins = block("set.translitMongolIme", TITLE) + block("set.translit.desc.mongolIme", DESC)
    text = text[:idx] + ins + text[idx:]
    I18N.write_text(text, encoding="utf-8")
    print("✓ 已插入 set.translitMongolIme（20 語言）")
    print("✓ 已插入 set.translit.desc.mongolIme（20 語言）")


if __name__ == "__main__":
    main()
