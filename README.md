# 🎬 PATO FAMILIADA — STUDIO TV + MIKROFON + EDYTOR PYTAŃ

Wersja 2.0, 11 listopada 2026. Gra na osobnych telefonach: **Żaneta, Łukasz, Maciek, Dominika, Malwina**. Bez Michała. Dwa tryby: **DRUŻYNY (2 na 3)** oraz **SOLO (każdy na każdego)**.

## Co nowego?

- **Edycja pytań na telefonie, bez GitHuba:** ekran startowy lub lobby prowadzącego → **✏️ EDYTUJ PYTANIA I ODPOWIEDZI**. Dodawaj, usuwaj, zmieniaj kolejność, treść, wszystkie 5 odpowiedzi, punkty i dopuszczalne synonimy dla każdej odpowiedzi. Na końcu naciśnij **💾 ZAPISZ DO GRY**.
- **Pytania zapamiętywane na urządzeniu prowadzącego:** przez localStorage. Przy tworzeniu pokoju Twój zestaw pytań jest przesyłany do serwera i widoczny we wspólnej rozgrywce. Nie musisz zmieniać kodu. Dla bezpieczeństwa polecam **📥 Pobierz kopię JSON** i **📤 Wgraj pytania JSON** — po wyczyszczeniu danych przeglądarki lokalna kopia może zniknąć.
- **Wszystkie 50 pytań na start.** W lobby wybierz 8, 15, 20 lub wszystkie rundy i kolejność **Po kolei / Losowo**. Nowo dodane pytanie jest pierwsze w kolejności, więc przy ustawieniu „Po kolei” pojawi się od razu.
- **TV w trybie widza:** po utworzeniu pokoju Wódz wybiera **📺 OTWÓRZ EKRAN TV** lub **📋 Kopiuj link do TV**. Adres wygląda `https://TWOJA-GRA.onrender.com/tv.html?code=12345`. Otwórz tę stronę w przeglądarce telewizora lub na osobnym urządzeniu wyświetlającym obraz na TV. Ekran TV nie zna tajnych odpowiedzi przed odkryciem. Wyświetla pytanie, 5 pól, wynik, odpowiadającego, duży X lub animację trafionej odpowiedzi.
- **Automatyczna ocena głosem (przeglądarki z obsługą Web Speech API):** gdy Łukasz jako pierwszy naciśnie czerwony przycisk, ekran TV pokazuje „ODPOWIADA: ŁUKASZ”. Łukasz na swoim telefonie naciska **🎙️ POWIEDZ ODPOWIEDŹ** i mówi po polsku. Mikrofon można też włączyć na telefonie Wodza. Gdy rozpoznane słowa pasują do aktualnej odpowiedzi albo synonimu, właściwe pole odsłania się na wszystkich urządzeniach; gdy nie pasują, TV pokazuje ❌. Głos nie jest przechowywany przez nasz serwer.
- **Ręczne sterowanie jako pewne zabezpieczenie:** jeśli mikrofon źle rozpoznaje polski język albo nie działa, prowadzący naciska właściwą odpowiedź lub **❌ ZŁA ODPOWIEDŹ**. W razie pomyłki użyj **↩️ Cofnij ostatnią ocenę**. Prowadzący może też wybrać, **kto właśnie odpowiada**, bez wyścigu przycisków.
- **Boty do testów** i wspólny kod pokoju, ranking, kradzieże punktów po trzech X, finał Diamentu Euforii.

## 🕹️ Przykładowa runda z Łukaszem

1. Żaneta tworzy pokój, kopiuje link **Ekran TV** na telewizor lub na laptop podłączony do TV.
2. Każdy wchodzi na główny link na swoim telefonie, wpisuje kod pokoju, wybiera imię.
3. Żaneta ustala tryb i rundy, naciska **START**.
4. Łukasz naciska czerwony przycisk jako pierwszy. Na TV pojawia się: **ODPOWIADA: ŁUKASZ**.
5. Łukasz naciska **🎙️ POWIEDZ ODPOWIEDŹ** na swoim telefonie i mówi np. „telefon”. Telefon pyta o pozwolenie na mikrofon.
6. Rozpoznanie trafia do serwera. Jeśli „telefon” jest na planszy, na TV odsłania się **TELEFON | 25 pkt** we właściwym rzędzie. Jeśli nie pasuje — pokazuje się **❌**.
7. Jeśli źle usłyszało, Żaneta naciska **Cofnij ostatnią ocenę** i ocenia ręcznie.

**Ważne:** TV **nie musi mieć mikrofonu** — mikrofon jest na telefonie odpowiadającego albo prowadzącego. Rozpoznawanie głosu działa wyłącznie tam, gdzie przeglądarka obsługuje `SpeechRecognition`/`webkitSpeechRecognition`, po zezwoleniu na mikrofon i na stronie HTTPS (Render). Na iPhonie działanie zależy od wersji systemu i przeglądarki; automatyczne X może też wystąpić po źle rozpoznanej wypowiedzi. Nie ma gwarancji stuprocentowej poprawności. Część przeglądarek przetwarza głos przez własną usługę internetową.

## 📲 Instalacja z iPhone'a (GitHub + Render)

### Jeśli masz już repozytorium `pato-familiada`

1. Pobierz ZIP, rozpakuj w aplikacji **Pliki**.
2. Wejdź do istniejącego repozytorium na GitHubie. W głównym katalogu **podmień** pliki `server.js`, `package.json`, `questions.json` oraz ewentualnie `README.md`.
3. Wejdź do folderu `public` i **podmień** `app.js`, `index.html`, `style.css`. **Dodaj nowe** `tv.html`, `tv.js`, `tv.css` (oraz zachowaj `manifest.webmanifest`).
4. Wciśnij **Commit changes**. Render powinien wdrożyć zmiany automatycznie. Jeżeli nie, użyj **Manual Deploy → Deploy latest commit** w swoim Web Service.

### Jeśli gry jeszcze nie instalowano

1. GitHub → nowe repozytorium `pato-familiada`.
2. **Add file → Upload files**. W głównym folderze prześlij `server.js`, `package.json`, `questions.json`, `README.md` (plus opcjonalnie testy i `.gitignore`).
3. W folderze `public` prześlij `index.html`, `app.js`, `style.css`, `tv.html`, `tv.js`, `tv.css`, `manifest.webmanifest`.
4. Render → **New → Web Service** → połącz GitHub z tym repozytorium → **Build Command: `npm install`**, **Start Command: `npm start`**.
5. Po uruchomieniu serwisu skopiuj jego link do gry. Ekran na TV ma ścieżkę `/tv.html?code=KOD`, ale najwygodniej skopiować go z lobby prowadzącego.

**Uwaga:** nie przesyłaj samego pliku ZIP do repozytorium — najpierw rozpakuj. Pliki muszą zachować strukturę `public/`.

## Testy

Node.js 18+:

```sh
npm install
npm run check
npm test
npm start
```

Przeprowadzono testy symulacyjne rozgrywki z botami w dwóch trybach, do finału, oraz testy specjalne: Łukasz naciskający przycisk i zgłaszający odpowiedź głosem, synonimy, automatyczny X, cofnięcie oceny, edycja banku, niezależny TV-widz. Test klienta sprawdza załadowanie 50 pytań, editor i ekran Łukasza. **Nie przeprowadzono testu na prawdziwym telewizorze ani testu rzeczywistego rozpoznawania głosu na iPhonie — te funkcje wymagają sprawdzenia po wdrożeniu.**

Pokoje przechowywane są w pamięci serwera; po restarcie lub uśpieniu serwisu mogą zostać utracone. **Własne pytania prowadzącego są na jego urządzeniu**, nie w trwałej bazie danych, dlatego polecam backup JSON.
