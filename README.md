# Kracht

Een PWA om fitnesssessies te loggen en progressie te zien. Werkt offline, draait
op iPhone en Android, en slaat alles lokaal op je toestel op.

Gebouwd rond het patroon uit je FitNotes-logboek: één oefening per spiergroep per
training, drie sets van tien, gewicht omhoog zodra die drie sets schoon zijn.

---

## Wat de app doet

**Loggen in twee tikken.** Je opent de app, ziet per spiergroep welke oefening aan
de beurt is met het gewicht dat je moet pakken, tikt erop en tikt drie keer op
"Log set". Geen menu's, geen zoeken.

**Voorstellen op basis van je eigen historie.**

- *Welke oefening* — elke oefening heeft zijn eigen ritme. De ene doe je om de
  twee weken, de andere om de twee maanden. De app zet het aantal verstreken
  dagen af tegen dat eigen ritme, zodat allebei op hun moment terugkomen en
  oefeningen die je hebt laten vallen niet blijven opduiken.
- *Welk gewicht* — heb je alle werksets op het topgewicht gehaald, dan gaat het
  gewicht een stap omhoog. Zo niet, dan blijft het staan. Na een pauze van meer
  dan zes weken begint hij bewust een stap lichter.
- *Welke stap* — de gewichten van een machine (54, 59, 66 …) hebben niets met
  schijven van 2,5 kg te maken. De app leest de reeks terug uit je logboek, dus
  de + knop springt naar de pen die er echt in past.

**Progressie.** Per oefening een grafiek van topgewicht, geschat 1RM of volume,
met records gemarkeerd. Verder een jaarkalender met trainingsdichtheid, volume
per maand, sterkste stijgers, en de balans over je spiergroepen.

**Verder.** Routines om een vaste dag met één tik klaar te zetten, een
schijvenrekenaar met jouw schijven, en een records-overzicht.

---

## Op je telefoon zetten

De app draait op elke statische host. Met GitHub Pages:

```bash
git init
git add .
git commit -m "Kracht"
git branch -M main
git remote add origin https://github.com/<jouwnaam>/kracht.git
git push -u origin main
```

Daarna in de repo: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Na een minuut staat hij op `https://<jouwnaam>.github.io/kracht/`.

Open die link op je telefoon:

- **iPhone** — Safari, deelknop, "Zet op beginscherm".
- **Android** — Chrome, menu, "App installeren".

Daarna start hij fullscreen vanaf je beginscherm en werkt hij zonder internet.

### Lokaal bekijken

```bash
python -m http.server 8765
```

Dan `http://127.0.0.1:8765/`.

---

## Je data

**Alles staat op je toestel** (IndexedDB). Er is geen server en geen account.

### Waarom je geschiedenis niet in de repo staat

GitHub Pages is publiek: alles wat je pusht is voor iedereen leesbaar. Daarom
staan `data/seed.json`, `kracht-backup.json` en de FitNotes-backup in
`.gitignore`. De gehoste app start dus leeg en vraagt je één keer om je back-up
in te lezen.

Zo zet je hem op een nieuw toestel:

1. Zet `kracht-backup.json` in iCloud Drive of Google Drive.
2. Open de app, ga naar **Meer → Inlezen van bestand** en kies dat bestand.
3. Klaar — 6.478 sets, 420 trainingsdagen, al je records.

Wil je hem tóch meeleveren (bijvoorbeeld bij een private repo), haal dan
`data/seed.json` uit `.gitignore`. De app pakt die dan automatisch bij de eerste
start.

### Synchroniseren tussen twee telefoons

**Meer → Opslaan naar bestand** schrijft een JSON-back-up. Bewaar die in je
Drive-map en lees hem op je andere telefoon in via **Inlezen van bestand**.

Op Android en desktop onthoudt de app welk bestand je koos, dus daarna is
opslaan één tik. Op iOS komt het deelmenu op zodat je "Bewaar in Bestanden" kunt
kiezen.

Inlezen voegt samen, het overschrijft niet. Elke set draagt een tijdstempel, en
bij dezelfde set wint de nieuwste versie. Ook verwijderingen reizen mee: die
worden als markering bewaard, zodat iets wat je op de ene telefoon weggooit niet
terugkomt via de andere. Je kunt dus op beide toestellen loggen en ze daarna in
willekeurige volgorde samenvoegen.

---

## Opnieuw uit FitNotes importeren

```bash
python tools/convert_fitnotes.py FitNotes_Backup.fitnotes data/seed.json
```

Een `.fitnotes`-bestand is een SQLite-database. Het script leest daar de
oefeningen, categorieën, sets, notities en je schijven uit. De ids zijn afgeleid
van de FitNotes-rijen, dus je kunt dit opnieuw draaien zonder dubbele sets.

Iconen opnieuw genereren (na een kleurwijziging bijvoorbeeld):

```bash
python tools/make_icons.py
```

---

## Structuur

```
index.html              Casco
css/styles.css          Liquid-glass ontwerp, licht en donker
js/store.js             State, IndexedDB, samenvoegen van back-ups
js/engine.js            Gewichtsladder, progressie, rotatie, statistiek
js/charts.js            SVG-grafieken, met de hand getekend
js/app.js               Schermen en interactie
sw.js                   Offline cache
tools/                  FitNotes-conversie en icoongenerator
```

Geen build, geen dependencies, geen externe verzoeken. Wat je ziet is wat er
draait.

Na een wijziging aan een bestand: hoog `CACHE` op in `sw.js` (`kracht-v1` →
`kracht-v2`), anders blijven telefoons de oude versie serveren.
