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

### Bauwerk finden

49 Bauwerke in 24 Zeitaltern sind viel zum Scrollen. Das Suchfeld unter der
Auswahl filtert nach Name, Kurzname und Zeitalter — Groß- und Kleinschreibung
sowie Umlaute spielen keine Rolle. Das gerade gewählte Bauwerk bleibt dabei
immer wählbar, auch wenn die Suche es nicht trifft.

### Favoriten

Bauwerk **und** Stufe lassen sich zusammen merken (bis zu zwölf Kombinationen).
Ein Tipp auf einen Favoriten springt zurück — praktisch, wenn du mehrere
Bauwerke parallel hochziehst. Die Liste zeigt drei Reihen und scrollt darüber
hinaus, damit sie den Förderplan nicht aus dem Bild schiebt. Sie liegt im
Browser, nicht auf einem Server.

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
404.html          Fehlerseite
styles.css        Darstellung, drei Themes über data-theme
fonts.css         @font-face für die lokal ausgelieferte Schrift
data.js           Datensatz der Legendären Bauwerke (generiert)
calc.js           Rechenkern, reine Funktionen
app.js            Oberfläche: DOM, Ereignisse, Easter Eggs
legal.js          Kleines Skript für die beiden Rechtsseiten
netlify.toml      Auslieferung: Header, Caching, 404
robots.txt        Hält /tools/ und /test/ aus dem Suchindex
tools/serve.js    Statischer Server für Entwicklung und Tests
tools/import.html Holt die Daten aus dem Wiki (läuft nur lokal)
tools/build-data.js  Macht aus dem Import wieder data.js
test/             Einheitentests (node:test) und Browsertests (Playwright)
```

## Ausliefern

Es gibt keinen Build-Schritt. Das Repo-Wurzelverzeichnis ist das, was
ausgeliefert wird; `node_modules/`, `test/` und `tools/` braucht die Seite im
Betrieb nicht.

Auf Netlify genügt es, das Repository zu verbinden — `netlify.toml` setzt
Publish-Verzeichnis, Header und Weiterleitungen selbst. Auf jedem anderen
Webspace reicht Hochladen; die Header aus `netlify.toml` sollten dann in der
Server-Konfiguration nachgebildet werden.

### Vorschau beim Teilen

Die Startseite bringt Open-Graph- und Twitter-Card-Angaben mit, damit der Link
in Chats und Foren als Karte mit Titel und Beschreibung erscheint statt als
nackte URL.

Bewusst **ohne Bild**: ein `og:image`, das auf eine fehlende Datei zeigt,
erzeugt eine kaputte Karte — eine reine Textkarte ist dagegen vollständig.

`canonical` und `og:url` zeigen auf <https://cipher-calc.netlify.app/>. Die
Rechtsseiten bekommen bewusst kein `canonical`: sie stehen auf `noindex`, und
beides nebeneinander wäre ein widersprüchliches Signal. Bei einem Umzug auf
eine eigene Domain sind beide Angaben in `index.html` anzupassen — ein Test
hält den Wert fest, die Suite schlägt also an.

### Header

`netlify.toml` setzt unter anderem einen Content-Security-Policy, der das
Versprechen „lädt nichts von Dritten“ vom Browser durchsetzen lässt:
`connect-src 'none'` verbietet jede fetch-, XHR- und Beacon-Anfrage,
`default-src 'self'` lässt nur Dateien von dieser Domain zu. Das eine
Inline-Skript, das vor dem ersten Frame das Theme setzt, ist über seinen
SHA-256-Hash erlaubt — nicht über `'unsafe-inline'`.

Damit ein falscher Hash nicht erst nach dem Deploy auffällt, liest
`tools/serve.js` dieselben Header aus `netlify.toml` und liefert sie aus. Die
Browsertests laufen also gegen die Produktionsvorgaben und schlagen an, sobald
der CSP die Seite bricht.

## Entwicklung

```bash
npm install                        # nur für die Tests nötig
npx playwright install chromium    # einmalig, für die Browsertests
npm run serve                      # http://localhost:4173
npm run test:unit                  # Rechenkern und Datensatz (node:test)
npm run test:e2e                   # Browsertests (Playwright, Desktop + Mobil)
npm test                           # beides
```

### Automatisch

`.github/workflows/tests.yml` lässt die **Einheitentests bei jedem Push**
laufen — sie brauchen keinen Browser und sind in Sekunden durch. Die
**Browsertests** kosten einen Chromium-Download und laufen darum nur bei Pull
Requests und auf `main`. Ein neuer Push auf denselben Zweig bricht den
laufenden Durchgang ab, damit auf einem privaten Repo keine Minuten
verpuffen. Schlägt ein Browsertest fehl, hängt der Playwright-Bericht sieben
Tage als Artefakt am Lauf.

Die Browsertests decken Berechnung, Favoriten, Speicherung, Migration aus dem
Vorgänger, die Rechtstexte, Barrierefreiheit, die Easter Eggs, die
Sicherheits-Header samt CSP und die Zusicherung „keine externen Anfragen“ ab.

## Barrierefreiheit

- Drei Darstellungen: Blaupause (dunkel), Weißpause (hell) und ein
  Kontrastmodus in Schwarz auf Weiß.
- Alle Bedienelemente sind beschriftet und per Tastatur erreichbar, mit
  deutlich sichtbarem Fokusring.
- `prefers-reduced-motion` schaltet sämtliche Animationen ab — auch die
  Easter Eggs, die dann nur noch einen kurzen Texthinweis zeigen.
- Ab etwa 390 Pixel Breite stehen Stufe und Name nebeneinander, darunter
  untereinander — auf schmalen Telefonen bliebe die Stufenzahl sonst
  abgeschnitten. Browsertests messen das bei 320, 360 und 390 Pixeln nach.

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

### Datensatz erneuern

`data.js` wird erzeugt, nicht von Hand gepflegt. Der Weg dorthin geht über zwei
Schritte:

```bash
npm run serve
# http://localhost:4173/tools/import.html öffnen,
# „Alle LGs importieren", dann „Datendatei herunterladen"
node tools/build-data.js ~/Downloads/lg-daten.json
npm run test:unit
```

`tools/import.html` liest die Wiki-Seiten aller Bauwerke, gleicht Kosten und
Belohnungen gegen die Formeln ab und markiert jede Stufe danach, wie sicher ihr
Wert ist. `tools/build-data.js` überführt das Ergebnis in `data.js`.

**Der Importer gehört nicht zur Website.** `netlify.toml` beantwortet
`/tools/*` mit 404, lokal ist er über `npm run serve` erreichbar. Im
Unterschied zur Anwendung fragt er das Wiki ab — aber erst auf Knopfdruck, beim
Laden der Seite geht keine Anfrage hinaus.

Zwei Dinge stehen nicht im Wiki und übernimmt der Konverter deshalb aus der
bestehenden `data.js`:

- die **Kurznamen** für den Förderchat (`Leuchtturm von Alexandria` →
  `Leuchtturm`), die von Hand gepflegt sind — sie dürfen in `data.js` direkt
  geändert werden und überleben den nächsten Lauf
- **Bauwerke, die der Import nicht liefert**; sie bleiben mit ihren bisherigen
  Werten stehen, statt stillschweigend zu verschwinden

Beides meldet der Konverter im Lauf. `test/build-data.test.js` prüft es, indem
es aus `data.js` ein Import-JSON baut, durch den Konverter schickt und das
Ergebnis mit dem Original vergleicht.

## Lizenz

Quellcode: [MIT](./LICENSE).
Datensatz (`data.js`): CC BY-SA 3.0, abgeleitet aus dem Forge of Empires Wiki.
Schrift (`fonts/`): SIL Open Font License 1.1, siehe `fonts/LICENSE-Barlow.txt`.
