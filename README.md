# cipher

**Das Förder-Dashboard für Mäzen-Plätze & FP-Einsatz.**

Quelltext: https://github.com/iniist/cipher

cipher rechnet aus, wie du ein Legendäres Bauwerk in *Forge of Empires* so
förderst, dass dir niemand die Mäzen-Plätze wegschnappt — und schreibt den Text
für den Förderchat gleich mit. Eine statische Seite, komplett im Browser, ohne
Konto, ohne Server, ohne Tracking.

> **Kein offizielles Angebot.** cipher ist ein inoffizielles Fan-Projekt und
> steht in keiner Verbindung zur InnoGames GmbH. „Forge of Empires“ sowie alle
> zugehörigen Bezeichnungen und Logos sind Marken der InnoGames GmbH.
> Alle Angaben ohne Gewähr — im Zweifel gilt das Spiel.

---

## Was es macht

Du wählst ein Bauwerk, die nächste Stufe und deinen Arche-Faktor. cipher zeigt
dir dann für jeden der fünf Mäzen-Plätze:

| Spalte | Bedeutung |
| --- | --- |
| **Belohnung** | Was der Platz auszahlt (P1 aus dem Datensatz, P2–P5 daraus abgeleitet) |
| **Einzahlen** | Was ein Förderer für diesen Platz zahlen muss, inklusive Arche-Bonus |
| **Vorher sichern** | Was *du* vorab einzahlen musst, damit der Platz nicht mehr überboten werden kann |

Dazu die Aufteilung in Eigenanteil und Fremdkapital, den Betrag, den du vorab
einzahlen solltest, und zwei fertige Zeilen zum Kopieren in den Förderchat.

Häkchen weg = der Platz wird nicht angeboten und fällt in deinen Eigenanteil.

### Favoriten

Bauwerk **und** Stufe lassen sich zusammen merken (bis zu zwölf Kombinationen).
Ein Tipp auf einen Favoriten springt zurück — praktisch, wenn du mehrere
Bauwerke parallel hochziehst. Die Liste liegt im Browser, nicht auf einem Server.

### Wenn Daten fehlen

Für sehr hohe Stufen und für neue Bauwerke kennt der Datensatz nicht immer
Gesamtkosten oder P1. cipher sagt das dann offen und bittet dich, die Zahlen aus
dem Förderfenster einzutragen. Ab Stufe 11 rechnet es daraus die übrigen Stufen
hoch, weil die Kostenkurve rein exponentiell ist (× 1,025 je Stufe).

## Wie es rechnet

Ein Platz ist **sicher**, sobald höchstens noch das Doppelte seiner Einzahlung
offen ist — dann reicht der Rest für kein höheres Gegengebot mehr. cipher geht
die Plätze von P1 abwärts durch, bestimmt für jeden diesen Schwellwert und
summiert, was du dafür vorstrecken musst. Was am Ende übrig bleibt, zahlst du
selbst ein und levelst damit.

Die Belohnungen der hinteren Plätze folgen aus P1: P2 = P1/2, P3 = P2/3,
P4 = P3/4, P5 = P4/5 — jeweils kaufmännisch auf ein Vielfaches von 5 gerundet.
Die Einzahlung ist `floor((Belohnung × Faktor + 50) / 100)`.

Der ganze Rechenkern steckt in [`calc.js`](./calc.js) und besteht nur aus reinen
Funktionen — ohne DOM, ohne Speicherzugriff, vollständig getestet.

## Keine externen Anfragen

cipher lädt **nichts** von Drittanbietern:

- Die Schrift (Barlow Semi Condensed, SIL OFL 1.1) liegt als `woff2` im
  Verzeichnis `fonts/`.
- Es gibt keine Analyse-, Statistik- oder Werbedienste, keine CDNs, keine
  eingebetteten Inhalte, keine Cookies.
- Das Favicon steckt als Daten-URI direkt im HTML.

Ein Browsertest prüft das bei jedem Lauf nach: Jede Anfrage, die nicht an den
eigenen Host geht, lässt die Suite rot werden.

Gespeichert wird ausschließlich im `localStorage`, unter Schlüsseln mit dem
Präfix `cipher:` — und nur das, was die Anwendung zum Weiterarbeiten braucht.
Auf der Datenschutzseite gibt es einen Knopf, der alles davon löscht.

## Dateien

```
index.html        Die Anwendung
impressum.html    Impressum
datenschutz.html  Datenschutzerklärung
styles.css        Darstellung, drei Themes über data-theme
fonts.css         @font-face für die lokal ausgelieferte Schrift
data.js           Datensatz der Legendären Bauwerke (generiert)
calc.js           Rechenkern, reine Funktionen
app.js            Oberfläche: DOM, Ereignisse, Easter Eggs
legal.js          Kleines Skript für die beiden Rechtsseiten
tools/serve.js    Statischer Server für Entwicklung und Tests
test/             Einheitentests (node:test) und Browsertests (Playwright)
```

Zum Ausliefern reicht es, das Verzeichnis auf einen beliebigen Webspace zu
kopieren. `node_modules/`, `test/` und `tools/` braucht die Seite im Betrieb nicht.

## Entwicklung

```bash
npm install          # nur für die Tests nötig
npm run serve        # http://localhost:4173
npm run test:unit    # Rechenkern und Datensatz (node:test)
npm run test:e2e     # Browsertests (Playwright, Desktop + Mobil)
npm test             # beides
```

Die Browsertests decken Berechnung, Favoriten, Speicherung, Migration aus dem
Vorgänger, die Rechtstexte, Barrierefreiheit, die Easter Eggs und die
Zusicherung „keine externen Anfragen“ ab.

## Barrierefreiheit

- Drei Darstellungen: Blaupause (dunkel), Weißpause (hell) und ein
  Kontrastmodus in Schwarz auf Weiß.
- Alle Bedienelemente sind beschriftet und per Tastatur erreichbar, mit
  deutlich sichtbarem Fokusring.
- `prefers-reduced-motion` schaltet sämtliche Animationen ab — auch die
  Easter Eggs, die dann nur noch einen kurzen Texthinweis zeigen.

## Easter Eggs

Drei Stück, alle harmlos und alle stumm bei `prefers-reduced-motion`. Sie zu
finden ist der Punkt, deshalb hier nur so viel: einer belohnt einen wirklich gut
zugeschnittenen Förderplan (in rund einem von tausend Fällen), einer hört auf
eine sehr alte Tastenfolge, und einer sitzt im Namen selbst.

## Daten

Kosten- und Belohnungswerte stammen aus dem von Spielerinnen und Spielern
gepflegten [Forge of Empires Wiki](https://forgeofempires.fandom.com/de/wiki/)
(Fandom) und stehen dort unter
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.de). Der
daraus abgeleitete Datensatz in `data.js` wird unter derselben Lizenz
weitergegeben. Stand siehe `generated` in der Datei.

Wo das Wiki sich widerspricht, ist die Stufe im Datensatz als solche markiert
(`source: "x"`) und die Anwendung weist beim Aufruf darauf hin.

## Lizenz

Quellcode: [MIT](./LICENSE).
Datensatz (`data.js`): CC BY-SA 3.0, abgeleitet aus dem Forge of Empires Wiki.
Schrift (`fonts/`): SIL Open Font License 1.1, siehe `fonts/LICENSE-Barlow.txt`.
