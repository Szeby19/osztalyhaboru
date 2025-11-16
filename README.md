

Ez a repository egy egyszerű HTML5/JavaScript játék scaffold, amit személyre szabhatsz a képeiddel és mp3 fájljaiddal.

Mi már készült:
- `index.html` – a menük és a vászon (canvas)
- `css/style.css` – egyszerű stílusok
- `js/game.js` – a játék logikája: karakterválasztás (27), NPC-k, boss, hangok

Hová tedd a fájlokat (assets):
- `assets/images/char1.png` ... `assets/images/char27.png` – karakter képek. Ha nincs kép, a játék helyettesítő címkéket használ.
- `assets/sounds/catch.mp3` – hang, mikor "elkaptak".
- `assets/sounds/boss_line1.mp3`, `boss_line2.mp3`, ... – boss hangok (legalább egy legyen).

Menü háttérkép (testreszabható)
- A főmenü hátterét egyszerűen megváltoztathatod: helyezd el a kívánt képet `assets/images/menu_bg.png` néven (png vagy jpg). A játék automatikusan betölti és kitölti vele a menü hátterét. Ha nincs ilyen fájl, alapértelmezett szín jelenik meg.

Játék háttérkép
- A játék (játékmenet) háttere most az alapértelmezett színnel jelenik meg. (Korábbi verzióban volt lehetőség egy `assets/images/game_bg.png` fájl használatára — ezt a funkciót most visszavontuk.)

Hogyan futtasd:
1. Egyszerűen nyisd meg a `index.html` fájlt a böngésződben (Chrome/Edge/Firefox). Néhány böngésző korlátozhatja a helyi audio betöltést amikor közvetlenül fájlt megnyitod — ilyenkor indíts egy helyi egyszerű szervert:

   PowerShell-ben (Windows) a projekt mappában:

```powershell
# ha van Python 3
python -m http.server 5500
# majd megnyitod: http://localhost:5500
```

2. A menüben Start → válassz karaktert. A játék billentyűi: nyilak vagy WASD.

Testreszabás:
- Cseréld le a `assets/images/charX.png` fájlokat a saját karakterképeidre.
- Cseréld a `assets/sounds/*.mp3` fájlokat a saját mp3-akkal. A fájlneveket megtartva a kód automatikusan betölti őket.

Fejlesztési ötletek / következő lépések:
- Menü: add hozzá a karakter leírását.
- Hangok: kezelj több hangkimenetet, hangerő beállítást mentve.
- Többféle ellenség viselkedés, pontozás, élet/életek száma, mentés.

Ha szeretnéd, beállítom, hogy a boss ütemezése, több grafika, vagy mentés/játékállás működjön — jelezd, mit szeretnél pontosan.
