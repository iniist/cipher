# cipher

**Förderrechner für Legendäre Bauwerke in *Forge of Empires*** —
live unter <https://foe-foerderrechner.com/>.

cipher rechnet aus, wie viele FP du vorab einzahlen musst, damit dir niemand
die Mäzen-Plätze wegschnappt, und schreibt die Zeile für den Förderchat gleich
mit. Eine statische Seite, komplett im Browser: kein Konto, keine Cookies,
keine Tracker.

> **Kein offizielles Angebot.** cipher ist ein inoffizielles Fan-Projekt und
> steht in keiner Verbindung zur InnoGames GmbH. „Forge of Empires“ sowie alle
> zugehörigen Bezeichnungen und Logos sind Marken der InnoGames GmbH.
> Alle Angaben ohne Gewähr — im Zweifel gilt das Spiel.

Eine bebilderte Vorstellung aller Funktionen steht unter
[`/rundgang`](https://foe-foerderrechner.com/rundgang).

## Funktionen

- **Förderplan** für P1–P5: Belohnung, Kosten für den Förderer und was du
  vorher sichern musst — wahlweise als Schritt je Platz oder als laufender
  Stand deiner FP im Bauwerk.
- **Plätze angeboten, vergeben oder selbst gezahlt** — ein Tipp aufs Häkchen
  schaltet weiter; für Förderung in Runden lässt sich eintragen, wie viele FP
  schon von dir im Bauwerk liegen.
- **Arche-Faktor 1,80–2,00**, auf Wunsch je Platz eigens als Faktor oder als
  tatsächlich gezahlter Betrag, auch direkt in der Tabelle.
- **Chat-Zeile** mit oder ohne FP-Beträge, Bauwerk als vollem Namen, Kürzel
  oder eigenem Kürzel; eine **Sammlung** fasst Zeilen mehrerer Bauwerke zu
  einer Nachricht zusammen.
- **Favoriten**, die beim Leveln mitwandern, und eigener Stand für jede der
  **24 deutschen Welten**.
- Stufe wahlweise als aktuelle oder als geförderte Stufe lesbar.
- Sechs Darstellungen inklusive Kontrastmodus, vollständig per Tastatur und
  Screenreader bedienbar, eigenes Layout für Telefone im Querformat.
- Als App installierbar (Web-App-Manifest; bewusst ohne Service Worker, damit
  niemand auf einem alten Datensatz hängen bleibt).

## Wie es rechnet

Ein Platz ist **sicher**, sobald höchstens noch das Doppelte seiner Einzahlung
offen ist — dann reicht der Rest für kein höheres Gegengebot mehr. cipher geht
die Plätze von P1 abwärts durch, bestimmt für jeden diesen Schwellwert und
summiert, was du dafür vorstrecken musst. Was am Ende übrig bleibt, zahlst du
selbst ein und levelst damit.

- Belohnungen: P2 = P1/2, P3 = P2/3, P4 = P3/4, P5 = P4/5, jeweils
  kaufmännisch auf ein Vielfaches von 5 gerundet.
- Einzahlung: `floor((Belohnung × Faktor + 50) / 100)`.
- Fehlen im Datensatz Gesamtkosten oder P1 (sehr hohe Stufen, neue Bauwerke),
  fragt cipher danach und rechnet ab Stufe 11 mit × 1,025 je Stufe hoch.

Der Rechenkern steckt in [`calc.js`](./calc.js): reine Funktionen, ohne DOM
und Speicherzugriff, vollständig getestet.

## Datenschutz

- Keine Anfragen an Dritte: Schrift, Icons und Skripte liegen im Repo.
  `connect-src 'none'` in der CSP verbietet jede fetch-/XHR-/Beacon-Anfrage,
  ein Browsertest schlägt bei jeder fremden Anfrage an.
- Gespeichert wird nur im `localStorage` unter `cipher:…`; die
  Datenschutzseite hat einen Knopf, der alles löscht.
- Beim Hoster läuft Netlify Web Analytics (serverseitig aus den Logfiles, kein
  Skript, kein Cookie). Real User Metrics ist bewusst aus.

## Entwicklung

Kein Build-Schritt — das Wurzelverzeichnis ist die Website.

```bash
npm install                        # nur für die Tests nötig
npx playwright install chromium    # einmalig, für die Browsertests
npm run serve                      # http://localhost:4173
npm run test:unit                  # Rechenkern und Datensatz (node:test)
npm run test:e2e                   # Browsertests (Playwright, Desktop + Mobil)
npm test                           # beides
```

`tools/serve.js` liefert dieselben Header und Weiterleitungen aus wie
`netlify.toml`, die Browsertests laufen also gegen die Produktions-CSP.
In CI (`.github/workflows/tests.yml`) laufen die Einheitentests bei jedem Push,
die Browsertests bei Pull Requests und auf `main`.

```
index.html          Die Anwendung
app.js              Oberfläche: DOM, Ereignisse, Easter Eggs
calc.js             Rechenkern, reine Funktionen
data.js             Datensatz der Legendären Bauwerke (generiert)
abbr.js             Kürzel je Bauwerk (von Hand gepflegt)
styles.css          Darstellung, sechs Themes über data-theme
rundgang.*          Vorstellungsseite; Bilder in bilder/ via tools/screenshots.js
umzug.*             Übernimmt den Speicher von der alten Adresse cipher-calc.netlify.app
impressum.html, datenschutz.html, legal.js, 404.html
netlify.toml        Header (CSP, HSTS), Caching, Weiterleitungen
tools/              Server, Import, Bild- und Messskripte (nicht ausgeliefert)
test/               Einheitentests und Browsertests (nicht ausgeliefert)
```

`tools/` und `test/` liegen zwar im Deploy, `netlify.toml` beantwortet sie aber
mit 404. Die Regeln brauchen `force = true`, sonst greift Netlify bei
existierenden Dateien nicht ein.

## Datensatz erneuern

`data.js` wird aus dem [Forge of Empires Wiki](https://forgeofempires.fandom.com/de/wiki/)
erzeugt, nicht von Hand gepflegt.

- **Per GitHub Actions:** Workflow „Datensatz importieren“ von Hand starten —
  er importiert, baut `data.js`, lässt die Tests laufen und öffnet einen Pull
  Request.
- **Lokal:** `npm run import`, danach `npm run test:unit`.

Bauwerke oder Formeln, die der Import nicht liefert, übernimmt
`tools/build-data.js` aus der bestehenden `data.js` und meldet sie. Ein neues
Bauwerk braucht einen Eintrag in `abbr.js` — `test/abbr.test.js` schlägt sonst
an. Widersprüchliche oder aus der Kurve fallende Wiki-Werte werden als
`source: "x"` markiert; die Anwendung weist darauf hin.

## Lizenz

Quellcode: [MIT](./LICENSE). Abweichend lizenziert (Details in
[NOTICE.md](./NOTICE.md)):

- Datensatz (`data.js`): [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.de),
  abgeleitet aus dem Forge of Empires Wiki.
- Schrift (`fonts/`): SIL Open Font License 1.1, siehe `fonts/LICENSE-Barlow.txt`.
