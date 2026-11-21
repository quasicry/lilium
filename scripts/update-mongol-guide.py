#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""
更新蒙古文轉寫指引文案：蒙科立 ↔ 輸入法。

背景：蒙科立功能命令已於 v1.10.0 後移除，但設定頁的「方案指引」
文案（set.translitMongol / set.translit.desc.mongol）仍描述已刪除的
「Unicode ↔ 蒙科立代碼」命令，屬誤導性死文案。

本腳本將兩鍵的 20 語言內容整體替換為輸入法說明。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "i18n.ts"

TITLE = {
    "zh": "蒙古文：拉丁打字輸入法",
    "zh-TW": "蒙古文：拉丁打字輸入法",
    "ja": "モンゴル文字：ラテン入力（IME）",
    "ko": "몽골어: 라틴 입력기",
    "en": "Mongolian: Latin typing IME",
    "mn": "Монгол: латин бичгийн IME",
    "bo": "སོག་པོ་ཡིག：ལེ་ཊིན་ཡིག་འཇུག",
    "ug": "موڭغۇلچە: لاتىن كىرگۈزگۈچ",
    "es": "Mongol: IME de escritura latina",
    "fr": "Mongol : IME de saisie latine",
    "de": "Mongolisch: Latein-Eingabe (IME)",
    "it": "Mongolo: IME di digitazione latina",
    "pt": "Mongol: IME de digitação latina",
    "ru": "Монгольский: ввод латиницей (IME)",
    "nl": "Mongools: Latijnse invoer (IME)",
    "pl": "Mongolski: IME pisania łacińskiego",
    "sv": "Mongoliska: latinskt IME",
    "cs": "Mongolština: IME latinského psaní",
    "hu": "Mongol: latin beviteli IME",
    "el": "Μογγολικά: IME λατινικής πληκτρολόγησης",
}

DESC = {
    "zh": "以拉丁字母直接打出標準蒙古文（Unicode U+1820–U+1842），無需安裝蒙科立字型。命令面板搜「蒙古文」可用：拉丁轉蒙古文、列出候選字、舊編碼升級。開啟「即時上屏」後，在編輯器輸入大寫開頭的詞加空格即自動轉換：Monggol␣→ᠮᠣᠩᠭᠣᠯ；小寫詞保持原樣，故英文正文不受影響。引擎自動處理選形、ng 連寫合流與變體選擇符（FVS）插入，導出 PDF/EPUB/HTML 直接內嵌 Noto Sans Mongolian 即可正確顯示。",
    "zh-TW": "以拉丁字母直接打出標準蒙古文（Unicode U+1820–U+1842），無需安裝蒙科立字型。命令面板搜「蒙古文」可用：拉丁轉蒙古文、列出候選字、舊編碼升級。開啟「即時上屏」後，在編輯器輸入大寫開頭的詞加空格即自動轉換：Monggol␣→ᠮᠣᠩᠭᠣᠯ；小寫詞保持原樣，故英文正文不受影響。引擎自動處理選形、ng 連寫合流與變體選擇符（FVS）插入，導出 PDF/EPUB/HTML 直接內嵌 Noto Sans Mongolian 即可正確顯示。",
    "ja": "ラテン文字で標準モンゴル文字（Unicode U+1820–U+1842）を直接入力できます。メンクソフトフォントは不要です。コマンドパレットで「モンゴル」を検索すると、ラテン→モンゴル、候補一覧、旧エンコード変換が使えます。「即時上屏」を有効にすると、大文字で始まる語＋スペースで自動変換：Monggol␣→ᠮᠣᠩᠭᠣᠯ。小文字の語はそのままなので英文は影響を受けません。字形選択・ng 連写合流・変体選択子（FVS）の挿入は自動処理され、PDF/EPUB/HTML 書き出しでは Noto Sans Mongolian が埋め込まれ正しく表示されます。",
    "ko": "라틴 문자로 표준 몽골어(Unicode U+1820–U+1842)를 바로 입력할 수 있으며 멩쿠소프트 글꼴이 필요 없습니다. 명령 팔레트에서 '몽골'을 검색하면 라틴→몽골, 후보 목록, 구형 인코딩 변환이 있습니다. '실시간 입력'을 켜면 대문자로 시작하는 단어+공백이 자동 변환됩니다: Monggol␣→ᠮᠣᠩᠭᠣᠯ. 소문자 단어는 그대로여서 영문 본문에 영향이 없습니다. 자형 선택, ng 연서 합류, 변형 선택자(FVS) 삽입은 자동 처리되며 PDF/EPUB/HTML 내보내기 시 Noto Sans Mongolian이 포함되어 올바르게 표시됩니다.",
    "en": "Type standard Mongolian (Unicode U+1820–U+1842) directly with Latin letters — no Menksoft font required. Search “Mongolian” in the command palette for: Latin→Mongolian, list candidates, legacy encoding upgrade. With realtime input on, type a capitalised word plus space to convert automatically: Monggol␣→ᠮᠣᠩᠭᠣᠯ; lowercase words are left untouched, so English prose is unaffected. The engine handles glyph selection, ng ligature merging and variation selector (FVS) insertion automatically, and PDF/EPUB/HTML exports embed Noto Sans Mongolian so text renders correctly.",
    "mn": "Латин үсгээр стандарт монгол бичгийг (Unicode U+1820–U+1842) шууд бичнэ — Менксофт фонт шаардлагагүй. Үйлдлийн самбараас «Монгол» хайж: латин→монгол, нэр дэвшигч, хуучин код хөрвүүлэлт. «Бодит цагийн оруулга» асаалттай үед том үсгээр эхэлсэн үг + зай автоматаар хөрвөнө: Monggol␣→ᠮᠣᠩᠭᠣᠯ; жижиг үсгийн үг хэвээр үлдэх тул англи текстэд нөлөөлөхгүй. Дүрс сонголт, ng холболт, FVS оруулалтыг автоматаар гүйцэтгэх ба PDF/EPUB/HTML экспорт Noto Sans Mongolian-ыг оруулж зөв харагдана.",
    "bo": "ལེ་ཊིན་ཡི་གེས་སོག་པོ་ཡིག་གི་ཚད་ལྡན་ཡིག་ཀོད（Unicode U+1820–U+1842）ཐད་ཀར་འཇུག་ཐུབ། མེན་ཁེ་སོཕཊ་ཡིག་གཟུགས་མི་དགོས། བཀའ་ཤིང་ནང་ སོག་པོ འཚོལ་ན་ ལེ་ཊིན→སོག་པོ། འདེམས་ཡིག་ཐོ། ཡིག་ཀོད་རྙིང་པ་བསྒྱུར་བ་བཅས་ཡོད། དུས་ཐོག་ཡིག་འཇུག་ཁ་ཕྱེ་ན་འགོ་ཡི་གེ་ཆེན་པོས་འགོ་བརྩམས་པའི་ཚིག་དང་སྟོང་བར་ཁ་བྲལ་གྱིས་རང་འགུལ་དུ་སྒྱུར། Monggol␣→ᠮᠣᠩᠭᠣᠯ། ཡི་གེ་ཆུང་བའི་ཚིག་རྣམས་ཇི་བཞིན་དུ་ལུས་པས་དབྱིན་ཡིག་གི་རྩོམ་ཡིག་ལ་ཤུགས་རྐྱེན་མེད། གཟུགས་འདེམས་པ། ng མཐུད་སྦྲེལ། FVS འཇུག་པ་བཅས་རང་འགུལ་དུ་བྱེད་ལ། ཕྱིར་འདྲེན་ PDF/EPUB/HTML ལ་ Noto Sans Mongolian འདུ་བྱེད་པས་ཡང་དག་པར་མཐོང་ཐུབ།",
    "ug": "لاتىن ھەرپلىرى بىلەن ئۆلچەملىك موڭغۇلچە (Unicode U+1820–U+1842) بىۋاسىتە كىرگۈزۈڭ — Menksoft خەت نۇسخىسى كەتمەيدۇ. بۇيرۇق تاختىسىدا «موڭغۇل» نى ئىزدەڭ: لاتىن→موڭغۇل، نامزات تىزىملىكى، كونا كود ئۆزگەرتىش. «رەسمىي كىرگۈزۈش» ئېچىلسا، چوڭ ھەرپتىن باشلانغان سۆز قوش بوشلۇق بىلەن ئاپتوماتىك ئۆزگىرىدۇ: Monggol␣→ᠮᠣᠩᠭᠣᠯ؛ كىچىك ھەرپلىك سۆزلەر ئەسلىدە قالىدۇ، شۇڭا ئىنگلىزچە تېكىستكە تەسىر يوق. شەكىل تاللاش، ng ئۇلىنىش ۋە FVS قىستۇرۇش ئاپتوماتىك بىر تەرەپ قىلىنىدۇ، PDF/EPUB/HTML ئېكسپورتى Noto Sans Mongolian نى قىستۇرۇپ توغرا كۆرسىتىدۇ.",
    "es": "Escribe mongol estándar (Unicode U+1820–U+1842) directamente con letras latinas, sin necesidad de fuentes Menksoft. Busca «Mongol» en la paleta para: latín→mongol, listar candidatos, actualizar codificación antigua. Con la entrada en tiempo real activada, escribe una palabra con inicial mayúscula y espacio para convertirla: Monggol␣→ᠮᠣᠩᠭᠣᠯ; las minúsculas se dejan intactas, así que el texto en inglés no se ve afectado. El motor gestiona la selección de glifos, la ligadura ng y los selectores de variación (FVS); las exportaciones PDF/EPUB/HTML incrustan Noto Sans Mongolian y se muestran correctamente.",
    "fr": "Tapez du mongol standard (Unicode U+1820–U+1842) directement en lettres latines, sans police Menksoft. Cherchez « Mongol » dans la palette pour : latin→mongol, lister les candidats, mettre à niveau l’ancien encodage. Avec la saisie en temps réel, tapez un mot avec majuscule initiale puis espace pour convertir : Monggol␣→ᠮᠣᠩᠭᠣᠯ ; les mots en minuscules restent inchangés, le texte anglais n’est donc pas affecté. Le moteur gère la sélection de glyphes, la ligature ng et l’insertion des sélecteurs de variante (FVS) ; les exports PDF/EPUB/HTML intègrent Noto Sans Mongolian et s’affichent correctement.",
    "de": "Tippen Sie Standard-Mongolisch (Unicode U+1820–U+1842) direkt mit lateinischen Buchstaben – ohne Menksoft-Schriftart. Suchen Sie „Mongolisch“ in der Befehlspalette für: Latein→Mongolisch, Kandidatenliste, Altkodierung aktualisieren. Mit aktivierter Echtzeiteingabe ein großgeschriebenes Wort plus Leerzeichen eingeben: Monggol␣→ᠮᠣᠩᠭᠣᠯ; kleingeschriebene Wörter bleiben unverändert, englischer Text ist also nicht betroffen. Die Engine übernimmt Glyphenwahl, ng-Ligatur und Variantenselektor-Einfügung (FVS); PDF/EPUB/HTML-Exporte betten Noto Sans Mongolian ein und werden korrekt dargestellt.",
    "it": "Digita mongolo standard (Unicode U+1820–U+1842) direttamente con lettere latine, senza font Menksoft. Cerca «Mongolo» nella palette per: latino→mongolo, elenco candidati, aggiornamento codifica precedente. Con l’input in tempo reale attivo, digita una parola con iniziale maiuscola più spazio per convertire: Monggol␣→ᠮᠣᠩᠭᠣᠯ; le parole minuscole restano invariate, quindi il testo inglese non è interessato. Il motore gestisce selezione dei glifi, legatura ng e inserimento dei selettori di variante (FVS); le esportazioni PDF/EPUB/HTML incorporano Noto Sans Mongolian e vengono visualizzate correttamente.",
    "pt": "Digite mongol padrão (Unicode U+1820–U+1842) diretamente com letras latinas, sem fonte Menksoft. Procure «Mongol» na paleta para: latim→mongol, listar candidatos, atualizar codificação antiga. Com a entrada em tempo real ativa, digite uma palavra com inicial maiúscula mais espaço para converter: Monggol␣→ᠮᠣᠩᠭᠣᠯ; palavras em minúsculas permanecem intactas, então o texto em inglês não é afetado. O motor cuida da seleção de glifos, ligadura ng e inserção de seletores de variação (FVS); as exportações PDF/EPUB/HTML incorporam Noto Sans Mongolian e são exibidas corretamente.",
    "ru": "Набирайте стандартный монгольский (Unicode U+1820–U+1842) напрямую латиницей — шрифт Menksoft не нужен. Найдите «Монгол» в палитре команд: латиница→монгольский, список кандидатов, обновление старой кодировки. При включённом вводе в реальном времени наберите слово с заглавной буквы и пробел: Monggol␣→ᠮᠣᠩᠭᠣᠯ; слова со строчной остаются без изменений, поэтому английский текст не затрагивается. Движок сам выбирает начертания, выполняет лигатуру ng и вставляет селекторы вариантов (FVS); экспорт PDF/EPUB/HTML встраивает Noto Sans Mongolian и отображается корректно.",
    "nl": "Typ standaard Mongools (Unicode U+1820–U+1842) direct met Latijnse letters — geen Menksoft-lettertype nodig. Zoek «Mongools» in het opdrachtenpalet voor: Latijn→Mongools, kandidatenlijst, oude codering bijwerken. Met realtime-invoer aan typt u een woord met hoofdletter plus spatie om te converteren: Monggol␣→ᠮᠣᠩᠭᠣᠯ; woorden in kleine letters blijven ongewijzigd, dus Engelse tekst wordt niet beïnvloed. De engine regelt glyphkeuze, ng-ligatuur en het invoegen van variatiekeuzes (FVS); PDF/EPUB/HTML-exports sluiten Noto Sans Mongolian in en worden correct weergegeven.",
    "pl": "Pisz standardowy mongolski (Unicode U+1820–U+1842) bezpośrednio literami łacińskimi — font Menksoft nie jest potrzebny. Wyszukaj „Mongolski“ w palecie poleceń: łacina→mongolski, lista kandydatów, aktualizacja starego kodowania. Przy włączonym wprowadzaniu w czasie rzeczywistym wpisz słowo z wielkiej litery i spację, aby przekonwertować: Monggol␣→ᠮᠣᠩᠭᠣᠯ; słowa małą literą pozostają bez zmian, więc tekst angielski nie jest naruszany. Silnik obsługuje wybór glifów, ligaturę ng i wstawianie selektorów wariantów (FVS); eksport PDF/EPUB/HTML osadza Noto Sans Mongolian i wyświetla się poprawnie.",
    "sv": "Skriv standardmongoliska (Unicode U+1820–U+1842) direkt med latinska bokstäver — ingen Menksoft-font behövs. Sök «Mongoliska» i kommandopaletten för: latin→mongoliska, lista kandidater, uppgradera äldre kodning. Med realtidsinmatning på: skriv ett ord med versal plus mellanslag för att konvertera: Monggol␣→ᠮᠣᠩᠭᠣᠯ; gemena ord lämnas orörda, så engelsk text påverkas inte. Motorn sköter glyfval, ng-ligatur och infogning av variantväljare (FVS); PDF/EPUB/HTML-exporter bäddar in Noto Sans Mongolian och visas korrekt.",
    "cs": "Pište standardní mongolštinu (Unicode U+1820–U+1842) přímo latinkou — font Menksoft není potřeba. V paletě příkazů hledejte „Mongolština“: latinka→mongolština, seznam kandidátů, upgrade starého kódování. Při zapnutém vstupu v reálném čase napište slovo s velkým počátečním písmenem a mezeru: Monggol␣→ᠮᠣᠩᠭᠣᠯ; malá slova zůstávají beze změny, takže anglický text není dotčen. Engine řeší výběr glyfů, ligaturu ng a vkládání selektorů variant (FVS); export PDF/EPUB/HTML vkládá Noto Sans Mongolian a zobrazuje se správně.",
    "hu": "Írjon standard mongolt (Unicode U+1820–U+1842) közvetlenül latin betűkkel — Menksoft font nem szükséges. Keresse a „Mongol” kifejezést a parancspalettán: latin→mongol, jelöltek listája, régi kódolás frissítése. Bekapcsolt valós idejű bevitelnél írjon egy nagybetűvel kezdődő szót és szóközt: Monggol␣→ᠮᠣᠩᠭᠣᠯ; a kisbetűs szavak változatlanok maradnak, így az angol szöveg nem sérül. A motor kezeli a glifválasztást, az ng ligatúrát és a variációszelektorok (FVS) beszúrását; a PDF/EPUB/HTML export beágyazza a Noto Sans Mongolian-t és helyesen jelenik meg.",
    "el": "Πληκτρολογήστε τυπικά μογγολικά (Unicode U+1820–U+1842) απευθείας με λατινικά γράμματα — δεν απαιτείται γραμματοσειρά Menksoft. Αναζητήστε «Μογγολικά» στην παλέτα εντολών: λατινικά→μογγολικά, λίστα υποψηφίων, αναβάθμιση παλιάς κωδικοποίησης. Με ενεργή εισαγωγή σε πραγματικό χρόνο, πληκτρολογήστε λέξη με κεφαλαίο και κενό: Monggol␣→ᠮᠣᠩᠭᠣᠯ· οι πεζές λέξεις μένουν ανέπαφες, οπότε το αγγλικό κείμενο δεν επηρεάζεται. Η μηχανή χειρίζεται επιλογή γλυφών, ligature ng και εισαγωγή επιλογέων παραλλαγής (FVS)· οι εξαγωγές PDF/EPUB/HTML ενσωματώνουν το Noto Sans Mongolian και εμφανίζονται σωστά.",
}


def replace_block(text: str, key: str, values: dict[str, str]) -> str:
    """替換 `  "key": {\n ... \n  },` 整個物件的內容。"""
    header = f'  "{key}": {{'
    start = text.index(header)
    # 找物件結尾：從 start 起，深度歸零處
    i = start + len(header)
    depth = 1
    in_str = False
    esc = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
        i += 1
    end = i  # 指向 '}' 本身
    # 吞掉 '}' 與其後的逗號（block 已自帶 `},`）
    j = end + 1
    if j < len(text) and text[j] == ",":
        j += 1
    body_lines = []
    order = ["zh", "zh-TW", "ja", "ko", "en", "mn", "bo", "ug",
             "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"]
    for lg in order:
        v = values[lg]
        assert '"' not in v, f"{key}.{lg} 含雙引號"
        body_lines.append(f'    "{lg}": "{v}",')
    block = f'  "{key}": {{\n' + "\n".join(body_lines) + "\n  },"
    return text[:start] + block + text[j:]


def main():
    text = I18N.read_text(encoding="utf-8")
    text = replace_block(text, "set.translitMongol", TITLE)
    text = replace_block(text, "set.translit.desc.mongol", DESC)
    I18N.write_text(text, encoding="utf-8")
    print("✓ set.translitMongol 已更新（20 語言）")
    print("✓ set.translit.desc.mongol 已更新（20 語言）")


if __name__ == "__main__":
    main()
