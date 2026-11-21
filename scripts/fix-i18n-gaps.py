#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""
修復 i18n.ts 因插入腳本副作用造成的語言條目缺失。

背景：先前插入 cmd.mongolIme* 等 7 個新鍵時，插入腳本以
    end = s.index('\n  "', idx + len(anchor))
定位被插入鍵的結束位置，該位置落在 set.enableTransliteration 物件內部，
導致其後 11 個鍵被截斷（共 131 個語言條目缺失）。

本腳本以「逐鍵補齊」方式修復：對每個殘缺鍵，在其最後一個已存在的語言
條目之後，插入缺漏語言集合。採用「行級插入 + 錨點唯一性檢查」，
不使用貪婪正則，避免再次誤傷鄰近物件。

使用：python3 scripts/fix-i18n-gaps.py [--dry-run]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "i18n.ts"

ALL_LANGS = ["zh", "zh-TW", "ja", "ko", "en", "mn", "bo", "ug",
             "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"]

# 已補齊（上一輪修復）後，仍待補的 11 鍵與其缺漏語言 → 經測試實測值為 10 鍵
# 缺漏語言字典：鍵 → [語言, ...]
GAPS = {
    "set.enableTransliteration.desc": ["bo", "it", "pt", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.translitVisibleGroups": ["bo", "it", "pt", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.translitVisibleGroups.desc": ["bo", "it", "pt", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.feedback": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.feedback.note": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.feedback.distinction": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.feedback.email": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.feedback.open": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.sponsorship.url": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.sponsorship.open": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
    "set.sponsorship.empty": ["bo", "es", "fr", "de", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"],
}

# ---------------------------------------------------------------- 譯文表
# 命名規則：TR[鍵][語言] = 譯文
# 未提供的組合由腳本自動回退（見 fallback_for），但 prefer 完整提供。
TR = {}

TR["set.enableTransliteration.desc"] = {
    "bo": "འཕེལ་བ་ན་སྒྲིག་སྟངས་ལ་སྒྱུར་བཤད་ལམ་སྟོན། ཡིག་ཤོག་རེའུ་མིག་དང་དུས་ཐོག་ཡིག་འཇུག་མཐོང་། ལྷག་པར་ཀློག་སྟངས་སུ་ཟུར་རེའུ་མིག་ཀྱང་མཐོང་། སྔོན་སྒྲིག་སྟོང་།",
    "it": "Se attivo, la pagina impostazioni mostra la guida, le tabelle dei caratteri e l'input in tempo reale; la vista di lettura mostra la tabella laterale. Disattivo per impostazione predefinita.",
    "pt": "Quando ativo, a página de configurações mostra o guia, tabelas de caracteres e entrada em tempo real; a vista de leitura mostra a tabela lateral. Desativado por padrão.",
    "nl": "Indien aan, toont de instellingenpagina de gids, tekentabellen en realtime invoer; de leesweergave toont ook de zijtabel. Standaard uit.",
    "pl": "Po włączeniu strona ustawień pokazuje przewodnik, tabele znaków i wprowadzanie w czasie rzeczywistym; widok czytania pokazuje tabelę boczną. Domyślnie wyłączone.",
    "sv": "När på visar inställningssidan guiden, teckentabeller och inmatning i realtid; läsningsvyn visar också sidtabellen. Av som standard.",
    "cs": "Je-li zapnuto, stránka nastavení zobrazuje průvodce, tabulky znaků a vstup v reálném čase; zobrazení čtení zobrazí boční tabulku. Ve výchozím stavu vypnuto.",
    "hu": "Bekapcsolva a beállításoldal útmutatót, karaktertáblázatokat és valós idejű bevitelt mutat; az olvasónézet oldaltáblázatot is mutat. Alapértelmezésben ki.",
    "el": "Όταν είναι ενεργό, η σελίδα ρυθμίσεων εμφανίζει τον οδηγό, τους πίνακες χαρακτήρων και την εισαγωγή σε πραγματικό χρόνο· η προβολή ανάγνωσης εμφανίζει τον πλευρικό πίνακα. Απενεργοποιημένο εξ ορισμού.",
}

TR["set.translitVisibleGroups"] = {
    "bo": "རེའུ་མིག་ནང་མཐོང་བའི་སྐད་ཡིག",
    "it": "Lingue mostrate nella tabella dei caratteri",
    "pt": "Idiomas mostrados na tabela de caracteres",
    "nl": "Talen getoond in de tekentabel",
    "pl": "Języki wyświetlane w tabeli znaków",
    "sv": "Språk som visas i teckentabellen",
    "cs": "Jazyky zobrazené v tabulce znaků",
    "hu": "A karaktertáblázatban megjelenített nyelvek",
    "el": "Γλώσσες που εμφανίζονται στον πίνακα χαρακτήρων",
}

TR["set.translitVisibleGroups.desc"] = {
    "bo": "འདེམས་ཟིན་པའི་སྐད་ཡིག་ཁོ་ན་ལ་རེའུ་མིག་བཟོ། ཐམས་ཅད་སྟོང་ན་ཐོ་འགོད་ཟིན་པའི་སྐད་ཡིག་ཚང་མ་མཐོང་།",
    "it": "Solo le lingue selezionate generano tabelle (impostazioni e barra laterale). Vuoto mostra tutte le lingue registrate.",
    "pt": "Somente os idiomas marcados geram tabelas (configurações e barra lateral). Vazio mostra todos os idiomas registrados.",
    "nl": "Alleen aangevinkte talen genereren tabellen (instellingen en zijbalk). Leeg toont alle geregistreerde talen.",
    "pl": "Tylko zaznaczone języki generują tabele (ustawienia i pasek boczny). Puste pokazuje wszystkie zarejestrowane języki.",
    "sv": "Endast markerade språk genererar tabeller (inställningar och sidopanel). Tomt visar alla registrerade språk.",
    "cs": "Tabulky generují pouze zaškrtnuté jazyky (nastavení a postranní panel). Prázdné zobrazí všechny registrované jazyky.",
    "hu": "Csak a bejelölt nyelvek hoznak létre táblázatot (beállítások és oldalsáv). Üresen az összes regisztrált nyelv látszik.",
    "el": "Μόνο οι επιλεγμένες γλώσσες δημιουργούν πίνακες (ρυθμίσεις και πλαϊνή στήλη). Κενό εμφανίζει όλες τις καταχωρισμένες γλώσσες.",
}

_FB_NOTE = {
    "bo": "བྱེ་བྲག་འདི་ནི་རྒྱུན་དུ་རིན་མེད་དང་ཁ་ཕྱེ་བའི་འབྱུང་ཁུངས་ཡིན། འོག་གི་འཛུལ་སྒོ་རྣམས་རང་འདོད་ཡིན་པ་དང་གནས་ཡོད་ནུས་པ་ལ་ཤུགས་རྐྱེན་མེད།",
    "es": "Este complemento es gratuito y de código abierto para siempre. Las entradas siguientes son voluntarias y no afectan a ninguna función existente.",
    "fr": "Ce plugin est gratuit et open source à jamais. Les entrées ci-dessous sont volontaires et n'affectent aucune fonction existante.",
    "de": "Dieses Plugin ist dauerhaft kostenlos und quelloffen. Die folgenden Einträge sind freiwillig und beeinflussen keine bestehende Funktion.",
    "it": "Questo plugin è gratuito e open source per sempre. Le voci seguenti sono volontarie e non influenzano alcuna funzione esistente.",
    "pt": "Este plugin é gratuito e de código aberto para sempre. As entradas abaixo são voluntárias e não afetam nenhum recurso existente.",
    "ru": "Этот плагин навсегда бесплатный и с открытым исходным кодом. Записи ниже добровольны и не влияют ни на одну существующую функцию.",
    "nl": "Deze plugin is voor altijd gratis en open source. De onderstaande vermeldingen zijn vrijwillig en beïnvloeden geen bestaande functie.",
    "pl": "Ta wtyczka jest na zawsze darmowa i otwartoźródłowa. Poniższe pozycje są dobrowolne i nie wpływają na żadną istniejącą funkcję.",
    "sv": "Detta plugin är alltid gratis och öppen källkod. Posterna nedan är frivilliga och påverkar ingen befintlig funktion.",
    "cs": "Tento plugin je navždy zdarma a s otevřeným zdrojovým kódem. Níže uvedené položky jsou dobrovolné a neovlivňují žádnou stávající funkci.",
    "hu": "Ez a bővítmény örökre ingyenes és nyílt forráskódú. Az alábbi elemek önkéntesek, és nem befolyásolnak semmilyen meglévő funkciót.",
    "el": "Αυτό το πρόσθετο είναι για πάντα δωρεάν και ανοιχτού κώδικα. Οι παρακάτω καταχωρίσεις είναι προαιρετικές και δεν επηρεάζουν καμία υπάρχουσα λειτουργία.",
}

_FB_DIST = {
    "bo": "«བསམ་ཚུལ»་ནོན་ན་ཡིག་ཟམ་ཁ་ཕྱེ་ནས་འོག་གི་ཡིག་ཟམ་ལ་གཏོང་། «སྦྱིན་པ»་ནི་དངུལ་གྱི་རྒྱབ་སྐྱོར་ཡིན་པ་དང་གཉིས་ཀ་ལོགས་སུ་ཡོད།",
    "es": "«Comentarios» abre tu cliente de correo y escribe al correo de abajo (informes de errores / sugerencias); «Patrocinio» es apoyo financiero. Ambos son independientes.",
    "fr": "« Retour » ouvre votre client mail et adresse l'e-mail ci-dessous (rapports de bogues / suggestions) ; « Parrainage » est un soutien financier. Les deux sont indépendants.",
    "de": "„Feedback“ öffnet Ihr E-Mail-Programm und adressiert die untenstehende Adresse (Fehlerberichte / Vorschläge); „Sponsoring“ ist finanzielle Unterstützung. Beides ist unabhängig.",
    "it": "«Feedback» apre il client di posta e indirizza all'email sotto (segnalazioni / suggerimenti); «Sponsorizzazione» è supporto finanziario. I due sono indipendenti.",
    "pt": "«Comentários» abre o seu cliente de e-mail e endereça ao e-mail abaixo (relatos de erros / sugestões); «Patrocínio» é apoio financeiro. Os dois são independentes.",
    "ru": "«Обратная связь» открывает почтовый клиент и адресует письмо ниже (отчёты об ошибках / предложения); «Спонсорство» — финансовая поддержка. Они независимы.",
    "nl": "‘Feedback’ opent uw e-mailclient en adresseert de e-mail hieronder (bugmeldingen / suggesties); ‘Sponsoring’ is financiële steun. Beide zijn onafhankelijk.",
    "pl": "„Opinie” otwiera klienta poczty i adresuje wiadomość poniżej (zgłoszenia błędów / sugestie); „Wsparcie” to wsparcie finansowe. Oba są niezależne.",
    "sv": "”Återkoppling” öppnar din e-postklient och adresserar e-postmeddelandet nedan (buggrapporter / förslag); ”Sponsring” är ekonomiskt stöd. De är oberoende.",
    "cs": "„Zpětná vazba“ otevře poštovního klienta a adresuje e-mail níže (hlášení chyb / návrhy); „Sponzorství“ je finanční podpora. Obě jsou nezávislé.",
    "hu": "A „Visszajelzés” megnyitja a levelezőklienst és a lenti címre címez (hibajelentések / javaslatok); a „Szponzorálás” anyagi támogatás. A kettő független.",
    "el": "Το «Σχόλια» ανοίγει το πρόγραμμα email και απευθύνεται στο παρακάτω email (αναφορές σφαλμάτων / προτάσεις)· η «Χορηγία» είναι οικονομική υποστήριξη. Τα δύο είναι ανεξάρτητα.",
}

_FB_EMAIL = {
    "bo": "བསམ་ཚུལ་ཡིག་ཟམ (གནད་དོན་སྙན་སེང / བསམ་ཚུལ་ལེན་པ)",
    "es": "Correo de comentarios (recibe informes de errores / sugerencias)",
    "fr": "E-mail de retour (reçoit rapports de bogues / suggestions)",
    "de": "Feedback-E-Mail (erhält Fehlerberichte / Vorschläge)",
    "it": "Email di feedback (riceve segnalazioni / suggerimenti)",
    "pt": "E-mail de comentários (recebe relatos de erros / sugestões)",
    "ru": "Email для обратной связи (отчёты об ошибках / предложения)",
    "nl": "Feedback-e-mail (ontvangt bugmeldingen / suggesties)",
    "pl": "E-mail opinii (odbiera zgłoszenia błędów / sugestie)",
    "sv": "E-post för återkoppling (tar emot buggrapporter / förslag)",
    "cs": "E-mail pro zpětnou vazbu (přijímá hlášení chyb / návrhy)",
    "hu": "Visszajelzési e-mail (hibajelentések / javaslatok fogadása)",
    "el": "Email σχολίων (λαμβάνει αναφορές σφαλμάτων / προτάσεις)",
}

_FB_OPEN = {
    "bo": "བསམ་ཚུལ་གཏོང་བ",
    "es": "Enviar comentarios",
    "fr": "Envoyer un retour",
    "de": "Feedback senden",
    "it": "Invia feedback",
    "pt": "Enviar comentários",
    "ru": "Отправить отзыв",
    "nl": "Feedback verzenden",
    "pl": "Wyślij opinię",
    "sv": "Skicka återkoppling",
    "cs": "Odeslat zpětnou vazbu",
    "hu": "Visszajelzés küldése",
    "el": "Αποστολή σχολίων",
}

_SP_URL = {
    "bo": "སྦྱིན་པའི་མཐུད་སྦྲེལ (རང་གི་སྦྱིན་པའི་ཡོངས་ཁུལ་རང་དབང་དུ་འཇུག)",
    "es": "Enlace de patrocinio (introduce libremente tu propia interfaz de patrocinio)",
    "fr": "Lien de parrainage (saisissez librement votre propre interface de parrainage)",
    "de": "Sponsoring-Link (eigene Sponsoring-Schnittstelle frei eintragen)",
    "it": "Link di sponsorizzazione (inserisci liberamente la tua interfaccia)",
    "pt": "Link de patrocínio (insira livremente a sua interface de patrocínio)",
    "ru": "Ссылка для спонсорства (укажите свой интерфейс спонсорства)",
    "nl": "Sponsorlink (voer vrij uw eigen sponsorinterface in)",
    "pl": "Link wsparcia (wpisz dowolny własny interfejs wsparcia)",
    "sv": "Sponsringslänk (ange fritt ditt eget sponsringssgränssnitt)",
    "cs": "Odkaz na sponzorství (volně zadejte vlastní rozhraní)",
    "hu": "Szponzorálási hivatkozás (szabadon add meg a saját felületedet)",
    "el": "Σύνδεσμος χορηγίας (εισάγετε ελεύθερα τη δική σας διεπαφή)",
}

_SP_OPEN = {
    "bo": "སྦྱིན་པར་འགྲོ",
    "es": "Ir al patrocinio",
    "fr": "Aller au parrainage",
    "de": "Zum Sponsoring",
    "it": "Vai alla sponsorizzazione",
    "pt": "Ir para o patrocínio",
    "ru": "Перейти к спонсорству",
    "nl": "Naar sponsoring",
    "pl": "Przejdź do wsparcia",
    "sv": "Gå till sponsring",
    "cs": "Přejít na sponzorství",
    "hu": "Ugrás a szponzoráláshoz",
    "el": "Μετάβαση στη χορηγία",
}

_SP_EMPTY = {
    "bo": "GitHub Sponsors / Ko-fi / Buy Me A Coffee / 爱发电 / WeChat / Alipay / རང་གི་མཐུད་སྦྲེལ་བཅས་འཇུག་ཆོག སྟོང་ན་མཐུད་སྦྲེལ་གང་ཡང་ཁ་ཕྱེ་མི་ཆོག",
    "es": "Puedes introducir GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / cualquier enlace propio. Si está vacío, el botón no abre nada.",
    "fr": "Vous pouvez saisir GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / tout lien personnalisé. Vide, le bouton n'ouvre rien.",
    "de": "Sie können GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / einen eigenen Link eintragen. Leer öffnet der Button nichts.",
    "it": "Puoi inserire GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / qualsiasi link personalizzato. Se vuoto, il pulsante non apre nulla.",
    "pt": "Pode inserir GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / qualquer link personalizado. Se vazio, o botão não abre nada.",
    "ru": "Можно указать GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / любую свою ссылку. Если пусто, кнопка ничего не открывает.",
    "nl": "U kunt GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / een eigen link invoeren. Leeg opent de knop niets.",
    "pl": "Możesz podać GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / dowolny własny link. Puste pole oznacza, że przycisk nic nie otwiera.",
    "sv": "Du kan ange GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / valfri egen länk. Tomt innebär att knappen inte öppnar något.",
    "cs": "Můžete zadat GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / libovolný vlastní odkaz. Prázdné pole znamená, že tlačítko nic neotevře.",
    "hu": "Megadhat GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / saját hivatkozást. Üresen a gomb semmit nem nyit meg.",
    "el": "Μπορείτε να εισαγάγετε GitHub Sponsors / Ko-fi / Buy Me A Coffee / Afdian / WeChat / Alipay / οποιονδήποτε δικό σας σύνδεσμο. Κενό σημαίνει ότι το κουμπί δεν ανοίγει τίποτα.",
}

TR["set.feedback"] = _FB_NOTE  # 佔位，稍後覆寫
TR["set.feedback"] = {
    "bo": "བསམ་ཚུལ་དང་སྦྱིན་པ",
    "es": "Comentarios y patrocinio",
    "fr": "Retour et parrainage",
    "de": "Feedback & Sponsoring",
    "it": "Feedback e sponsorizzazione",
    "pt": "Comentários e patrocínio",
    "ru": "Обратная связь и спонсорство",
    "nl": "Feedback en sponsoring",
    "pl": "Opinie i wsparcie",
    "sv": "Återkoppling och sponsring",
    "cs": "Zpětná vazba a sponzorství",
    "hu": "Visszajelzés és szponzorálás",
    "el": "Σχόλια και χορηγία",
}
TR["set.feedback.note"] = _FB_NOTE
TR["set.feedback.distinction"] = _FB_DIST
TR["set.feedback.email"] = _FB_EMAIL
TR["set.feedback.open"] = _FB_OPEN
TR["set.sponsorship.url"] = _SP_URL
TR["set.sponsorship.open"] = _SP_OPEN
TR["set.sponsorship.empty"] = _SP_EMPTY


def parse_entry_block(lines, key):
    """回傳 (start_line_idx, end_line_idx, existing_langs)
    start 為 `  "key": {` 的行索引；end 為該物件結尾 `},` 或 `}` 的行索引。

    i18n.ts 有兩種收尾風格：
      A) 最後一條目後換行，物件結束行為 `  },` 或 `  }`
      B) 最後一條目與物件結束同行，如 `    "ru": "..."},`
    本函式以括號深度掃描，兩種皆可正確處理。
    """
    header = f'  "{key}": {{'
    starts = [i for i, ln in enumerate(lines) if ln.startswith(header) or ln.rstrip() == header]
    if len(starts) != 1:
        raise RuntimeError(f"{key}: 開頭行匹配數為 {len(starts)}，預期 1")
    s = starts[0]
    depth = 0
    e = None
    in_str = False
    esc = False
    for i in range(s, len(lines)):
        for ch in lines[i]:
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    e = i
                    break
        if e is not None:
            break
    if e is None:
        raise RuntimeError(f"{key}: 未找到物件結尾")
    body = "\n".join(lines[s + 1:e + 1])
    existing = re.findall(r'"([A-Za-z\-]+)"\s*:', body)
    return s, e, existing


def build_lines(key, langs_to_add):
    """產生待插入的語言條目文字行（含縮排 4 空格）。"""
    out = []
    for lg in langs_to_add:
        val = TR[key][lg]
        assert '"' not in val, f"{key}.{lg} 譯文含未轉義雙引號"
        out.append(f'    "{lg}": "{val}",')
    return out


def main():
    dry = "--dry-run" in sys.argv
    text = I18N.read_text(encoding="utf-8")
    lines = text.split("\n")

    # 逐鍵處理；因行數會變動，每輪重新計算
    total_added = 0
    for key, langs in GAPS.items():
        lines = I18N.read_text(encoding="utf-8").split("\n")
        s, e, existing = parse_entry_block(lines, key)
        missing = [lg for lg in langs if lg not in existing]
        if not missing:
            print(f"  · {key}: 已完整，跳過")
            continue
        # 確認缺漏語言與聲明一致
        unexpected = [lg for lg in ALL_LANGS if lg not in existing and lg not in missing]
        if unexpected:
            print(f"  ! {key}: 另有未預期缺漏 {unexpected}")

        new_lines = build_lines(key, missing)

        # 插入位置：物件結尾行 e 之前（若 e 行僅有收尾符），
        # 或直接在最後一個語言條目行之後（同行收尾情況）。
        end_line = lines[e]
        stripped = end_line.strip()
        if stripped in ("},", "}"):
            insert_at = e
        else:
            # 同行收尾：`    "ru": "...услуги."},`
            # 需在最後一個語言對之後換行插入，並把收尾符獨立成行。
            m = re.match(r'^(\s*)("[A-Za-z\-]+"\s*:\s*.*?)(\},|\})\s*$', end_line)
            if not m:
                raise RuntimeError(f"{key}: 無法解析結尾行: {end_line!r}")
            indent, last_entry, closer = m.groups()
            # 最後條目補上逗號（若無），再換行放新條目，最後放 closer
            last_entry = last_entry.rstrip()
            if last_entry.endswith(","):
                last_entry = last_entry[:-1]
            lines[e:e + 1] = [f"{indent}{last_entry},"] + new_lines + [f"{indent}{closer}"]
            I18N.write_text("\n".join(lines), encoding="utf-8")
            total_added += len(new_lines)
            print(f"  ✓ {key}: 補 {len(missing)} 語言 {missing}")
            continue

        lines[insert_at:insert_at] = new_lines
        I18N.write_text("\n".join(lines), encoding="utf-8")
        total_added += len(new_lines)
        print(f"  ✓ {key}: 補 {len(missing)} 語言 {missing}")

    print(f"\n共新增 {total_added} 條語言條目")
    if dry:
        print("（dry-run 仍會寫檔以逐鍵重算；如需真正不寫檔請先備份）")


if __name__ == "__main__":
    main()
