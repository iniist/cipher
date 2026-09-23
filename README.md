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

Du wählst ein Bauwerk, eine Stufe und deinen Arche-Faktor. cipher zeigt
dir dann für jeden der fünf Mäzen-Plätze:

| Spalte | Bedeutung |
| --- | --- |
| **Belohnung** | Was der Platz auszahlt (P1 aus dem Datensatz, P2–P5 daraus abgeleitet) |
| **Einzahlen** | Was ein Förderer für diesen Platz zahlen muss, inklusive Arche-Bonus |
| **Sichern** | Was *du* vorab einzahlen musst, damit der Platz nicht mehr überboten werden kann — auf Tipp auch als laufende Summe |

Dazu die Aufteilung in Eigenanteil und Fremdkapital, den Betrag, den du vorab
einzahlen solltest, und zwei fertige Zeilen zum Kopieren in den Förderchat —
samt einer Sammlung, die mehrere davon aufhebt.

Häkchen weg = der Platz wird nicht angeboten und fällt in deinen Eigenanteil.

### Schritt oder Summe

Dieselbe Spalte, zwei verbreitete Lesarten. Manche wollen wissen, was
*dieser* Platz sie noch kostet (`+1.060`), andere, wo sie stehen, wenn er
sicher ist (`74.393`). Ein Tipp auf den Spaltenkopf — oder auf eine der
Zahlen — schaltet um, und die Überschrift nennt die aktive Lesart:
„Sichern“ gegen „Summe“.

Zwei Worte, nicht „Vorher sichern“ gegen „Vorher zusammen“: als Paar lesen
sie sich schneller, und die Spalte ist bei 320 Pixeln 68 Pixel breit — dort
zählt jedes Wort, das wegfällt. Dass das „vorher“ gemeint ist, steht im
Fußtext und im Kasten über der Tabelle.

Es ist dieselbe Lage wie bei der Stufenzahl, und darum dieselbe Antwort:
umschalten statt entscheiden, und die Beschriftung sagt, was dasteht. Eine
fünfte Spalte wäre der naheliegende Weg gewesen — bei 320 Pixeln ist die
vorhandene aber 68 Pixel breit, eine weitere passt schlicht nicht.

Die Summe endet beim Betrag aus dem Kasten darunter, nicht beim Eigenanteil:
die letzten FP zahlst du ein, wenn alle Plätze vergeben sind.

Der Hinweis dazu im Fußtext hat den Satz über den Zeitpunkt verdrängt
(„bevor der Platz vergeben wird“). Das war gemessen nötig: quer auf einem
iPhone SE kostet dort jede Zeile ein Zwanzigstel Bildschirm, und der Test
daneben hält die Seite unter 4,5 davon — mit beidem waren es 4,52. Verloren
ist nichts, der Kasten über der Tabelle erklärt den Zeitpunkt genauer.

**„Sicher“ gilt in beiden.** Wo nichts nachzulegen ist, bewegt sich auch die
Summe nicht, und das Wort sagt das deutlicher als eine wiederholte Zahl. Eine
Sonderregel für P2 braucht es dafür nicht: nach P1 ist P2 fast immer von
selbst sicher, und wo ein eigener Faktor oder Betrag doch etwas nötig macht,
erscheint die Zahl von allein.

„Fast immer“ ist gemessen. Über alle 1256 P1-Werte des Datensatzes, alle
Faktoren von 1,80 bis 2,00 und fünf Größenordnungen von Gesamtkosten —
71.097 Pläne, in denen beide Plätze angeboten werden — braucht P2 nach P1 in
9,1 % der Fälle doch etwas, und dann **immer genau 1 FP**, nie mehr. Bei 1,80,
1,90 und 2,00 tritt der Fall überhaupt nicht auf; er entsteht nur bei krummen
Faktoren, wo die Abrundung der Einzahlung um einen Punkt danebenfällt.

Zwei Einheitentests halten beides fest — die Obergrenze von 1 FP und die
Sicherheit bei den drei Werten der Schnellwahl —, damit die Aussage nicht
still altert, wenn der Datensatz sich ändert.

### Aktuelle oder nächste Stufe

Dieselbe Zahl heißt für die einen „das Bauwerk steht auf 80“, für die anderen
„es wird gerade auf 81 gezogen“. Beides ist verbreitet, und wer die falsche
Lesart annimmt, rechnet eine Stufe daneben.

Der Umschalter unter dem Feld stellt ein, welche gemeint ist; die Zeile
daneben nennt jeweils die andere Zahl — steht „80“ als aktuelle Stufe da,
liest man darunter „Gefördert wird Stufe 81“. Die Antwort steht also da,
egal wie herum jemand denkt.

Gerechnet wird intern immer mit der Stufe, die gefördert wird. Umschalten
ändert nur die Anzeige, nie den Plan — auch die gemerkten Favoriten wandern
mit und zeigen dieselbe Lesart. Im aktuellen Modus ist zusätzlich Stufe 0
erlaubt: ein Bauwerk, das noch gar nicht steht.

### Arche-Faktor

Der obere Faktor läuft über einen Stepper mit eintippbarem Feld: `−`, Wert,
`+`, darunter die Schnellwahl für die gängigen Werte. Zulässig ist 1,80 bis 2,00.
Das Feld nimmt an, was man tatsächlich tippt — `1,93`, `1.93`, `1,9`, `193`
und `193 %` führen alle zum selben Ergebnis. Pfeiltasten ändern den Wert um
eine Stufe.

Vorher war es ein Schieberegler. Auf dem Telefon sprang dessen Wert schon beim
**Aufsetzen** des Fingers dorthin, wo man ihn hinsetzte — beim Scrollen also
ständig unbemerkt. Keine `touch-action`-Einstellung hilft dagegen: der Wert
wird gesetzt, bevor der Browser die Geste überhaupt einordnet. Gemessen:
`pan-y` ändert nichts, `none` beseitigt nur das Scrollen.

Ein Stepper hat keine Schiene, die man versehentlich trifft. Knöpfe lösen erst
beim Loslassen aus, und eine Wischgeste bricht den Klick ab. Der schmale
Balken unter dem Feld zeigt weiterhin die Lage im Bereich — als reine Anzeige,
ohne Angriffsfläche.

Die `−`- und `+`-Knöpfe sind Zeichen im Feld, keine Fächen. Zuerst waren es
volle Flächen in `--btn`; auf einem Bildschirm mit Stufe, Faktor und fünf
Plätzen sind das vierzehn helle Blöcke, die lauter sind als die Zahlen, um
die es geht. Die Fläche zum Tippen ist dieselbe geblieben — leiser heißt
nicht kleiner.

An der Bereichsgrenze verblasst das Zeichen, nicht der Knopf: `opacity` hätte
auch seine Trennlinie mitgenommen. Im Kontrastmodus verschwindet das Zeichen
stattdessen ganz, denn ein blasses Grau wäre dort genau das Falsche.

### Faktor oder FP je Platz

Der Arche-Bonus gehört dem Förderer, nicht dem Bauwerk: wer P3 übernimmt,
kann eine andere Arche haben als wer P1 nimmt. Hinter dem Aufklapper
„Faktor oder FP je Platz“ steht darum für jeden der fünf Plätze ein
eigener Wert.

Das Modell in zwei Sätzen:

- Ein Platz **folgt** dem Wert oben, bis du ihn anfasst. Danach ist er
  **eigen**, trägt das Wort daneben und bleibt stehen, wenn der obere Wert
  sich bewegt.
- **„Alle wieder angleichen“** nimmt alle fünf zurück aufs Folgen, ein
  einzelnes × nur einen.

Dadurch muss der obere Wähler nie ausgegraut werden — er ist weiterhin die
Vorgabe für jeden Platz ohne eigenen Wert und zeigt damit immer etwas
Wahres. Ausgegraut würde er weiter „1,90“ anzeigen, während die Plätze
längst etwas anderes sagen. Gibt es Unterschiede, nennt der Kopf des Blocks
die Spanne (`1,85–1,95`), auch zugeklappt.

#### Faktor oder Betrag

Wer einen Platz wegschnappt, zahlt eine Summe, die zu keinem Faktor im
zulässigen Bereich passt — und trotzdem verschiebt sie alles darunter. Darum
nimmt jede Platz-Zeile ihren Wert wahlweise als Faktor oder als Betrag in FP
entgegen; der Umschalter im Block wählt, was eine folgende Zeile anzeigt.

Es ist **ein** Feld, nicht zwei nebeneinander, weil es eine Zahl ist: die
Einzahlung dieses Platzes. Zwei Bedienelemente für dieselbe Zahl können sich
widersprechen — dann zeigt die Tabelle den einen Wert an, während der Plan mit
dem anderen rechnet. Unter dem Feld steht darum immer die jeweils andere
Lesart (`≙ 6.400 FP`, `≙ Faktor 2,00`), dieselbe Idee wie bei der Stufenzahl.

Getippt wird in der Einheit, die im Feld **steht**, nicht in der des
Umschalters. Andersherum würde ein Klick in ein Feld mit `10.000` diesen
Betrag als Faktor lesen und auf 2,00 stutzen. Weicht eine Zeile vom Umschalter
ab, nennt ihr Nachsatz darum beide Einheiten — `10.000 FP ≙ Faktor 3,13` statt
nur `≙ Faktor 3,13`. Neben dem Feld wäre dafür kein Platz: bei 320 Pixeln
drängt schon ein längeres Wort das × aus der Zeile. Die Einheit wechselt ein
Platz nur über das ×, das ihn ohnehin freigibt.

Das Abzeichen am zugeklappten Block nennt die Faktorspanne nur, solange alle
eigenen Werte Faktoren sind. Eine Betragsspanne wäre nichtssagend — 50 bis
10.000 ist zwischen P5 und P1 der Normalfall. Dann steht dort, wie viele
Plätze eigene Werte tragen.

**Was es nicht gibt: „hat schon eingezahlt“.** Naheliegend wäre ein dritter
Zustand für einen Platz, dessen FP bereits im Topf liegen. Er ändert am Geld
aber nichts: die Kette schiebt sich zusammen, weil nach einem gesicherten
Platz immer genau dessen Einzahlung offensteht. Ob sie vorab eingeht oder an
ihrer Stelle in der Reihe, ändert weder den Eigenanteil noch die Summe des
Vorgestreckten — nur, welche Zeile wie viel davon trägt. Ein Einheitentest
hält das fest.

**Die Absicherung trägt das ohne neue Regel.** `buildPlan` rechnet
`needed = remaining − 2 × Einzahlung` — mit der Einzahlung *dieses* Platzes.
Ein schwächerer Faktor bedeutet also automatisch mehr vorher sichern, und
das stimmt auch inhaltlich: ein kleinerer Beitrag ist leichter zu
überbieten. Umgekehrt wirkt jeder Platz auf die Plätze unter ihm, weil sie
nacheinander vergeben werden.

**Warum der Bereich bei 1,80 endet.** Die Belohnungen werden auf 5 gerundet,
halbieren sich von Platz zu Platz also nicht exakt. Spreizt man die Faktoren
weit genug, kann ein tieferer Platz dadurch mehr kosten als ein höherer.
Gemessen wird der schlechteste Fall — der bessere Platz zahlt mit dem
schwächsten Faktor des Bereichs, der schlechtere mit dem stärksten — über
alle 1256 verschiedenen P1-Werte des Datensatzes:

| Bereich | Fälle mit vertauschter Reihenfolge |
| --- | --- |
| 1,80 – 2,00 | 0 |
| 1,50 – 2,00 | 0 |
| 1,00 – 2,00 | 628 |

Solange der Bereich bei 1,80 bleibt, kann der Fall nicht eintreten und
braucht keine Warnung.

Für **getippte Beträge** gilt die Schranke nicht: wer P4 auf 2.000 setzt,
während P3 bei 1.070 steht, hat eine Reihenfolge gebaut, die das Spiel so
nicht vergibt. Verboten wird das nicht — du trägst ein, was im Förderfenster
steht —, aber der Plan sagt es. Der Einheitentest oben prüft deshalb
ausdrücklich nur Einzahlungen, die aus einem Faktor stammen.

Die Tabelle stammt aus [`tools/order-scan.js`](./tools/order-scan.js); das
Skript nimmt auch eigene Bereiche (`node tools/order-scan.js 170-200`). Weil
sie mit dem Datensatz altert, hält ein Einheitentest die Aussage selbst fest:
Über den gesamten Datensatz darf im Bereich 1,80–2,00 kein Platz mit
kleinerer Belohnung den über ihm überholen. Nach einem Import ist die Tabelle
darum nachzuziehen, aber ein stiller Fehler kann sie nicht mehr werden.

Eine Ausnahme der Ehrlichkeit halber: Gezählt werden nur Plätze mit **echt
kleinerer** Belohnung. Bei P1 = 5 fällt auch P2 auf 5, weil auf Vielfache von
5 gerundet wird — zwei gleich hohe Belohnungen trennt dann nur noch der
Faktor, und P2 mit 2,00 kostet 10 FP gegen P1 mit 1,80 und 9 FP. Das betrifft
Stufe 1 eines Bauwerks und geht um 1 FP; eine Warnung wäre dafür lauter als
die Sache.

### Bauwerk finden

49 Bauwerke in 24 Zeitaltern sind viel zum Scrollen. Das Suchfeld unter der
Auswahl findet sie nach Name, Kurzname und Zeitalter — Groß- und
Kleinschreibung sowie Umlaute spielen keine Rolle. Die Treffer erscheinen als
eigene Liste darunter, ein Tipp darauf wählt das Bauwerk aus, Enter nimmt den
ersten.

Die Suche **schränkt das Auswahlfeld nicht ein**. Es enthält immer alle
Bauwerke und zeigt immer das wirklich gewählte; nichts wechselt die Auswahl
ohne einen Klick. Am Telefon erspart das den Weg durch die native Liste mit
49 Einträgen.

Weil die Suche auch das Zeitalter durchsucht, kann ein Treffer auf den ersten
Blick unerklärlich wirken: „ho" findet den **Markusdom**, obwohl in dessen
Namen kein „ho" steht — er liegt im Hochmittelalter. Zwei Dinge machen das
lesbar: Namenstreffer stehen vor Zeitalter-Treffern, und in jedem Eintrag
wird genau die Stelle hervorgehoben, die getroffen hat.

### Kürzel statt Namen

Im Förderchat schreibt kaum jemand „Arktische Orangerie“ aus — die einen
schreiben „Orangerie“, die anderen „AO“. Der Schalter **Kürzel** rechts über
dem Auswahlfeld wechselt zwischen beidem: aus, heißt ein Bauwerk wie bisher
mit seinem Kurznamen aus dem Datensatz; an, mit seinem Kürzel aus
[`abbr.js`](./abbr.js) — `Obsi`, `AO`, `TA`, `Inno`. Die Wahl wird gemerkt.

Der Schalter wirkt überall, wo cipher ein Bauwerk kurz nennt: in beiden
Chat-Zeilen, in der Sammlung, am Merken-Knopf, auf den Favoriten-Chips und
als Platzhalter im Feld „Eigenes Kürzel“. Das Auswahlfeld bleibt beim vollen Namen,
dort wird gesucht und nicht getippt. Die Suche kennt die Kürzel in beiden
Stellungen: „obsi“ findet das Observatorium.

**Die Kürzel pflegen.** `abbr.js` ist von Hand gepflegt und wird von keinem
Import angefasst — eine Zeile je Bauwerk, links der Schlüssel aus `data.js`,
rechts das Kürzel. Ein Kürzel ändern heißt, den Text rechts zu ändern.
`test/abbr.test.js` prüft, dass jedes Bauwerk eines hat, keines doppelt
vorkommt und keines länger als zwölf Zeichen ist.

**Die Sammlung zieht mit.** Sie speichert zu jeder Zeile, an welcher Stelle
der Name des Bauwerks steht. Wird danach umgeschaltet oder ein eigenes Kürzel
vergeben, tauscht sie ihn dort aus — sonst stünde in einer Nachricht „AO“
neben „Terrakotta-Armee“, je nachdem, wann kopiert wurde. Zeilen, die vor dem
Schalter gesammelt wurden, tragen diese Stelle nicht und bleiben, wie sie
sind.

**Die Chips springen nicht.** Mit Kürzeln schrumpft ein Favorit auf „KI 12“,
und beim Umschalten würden alle Reihen neu umbrechen. Der Name behält darum
auf dem Chip mindestens fünf Zeichen Platz.

### Eigenes Kürzel

Der Datensatz bringt je Bauwerk einen Kurznamen mit, von Hand gepflegt und
unstrittig verkürzt: aus „Leuchtturm von Alexandria“ wird „Leuchtturm“. Was
eine Gilde daraus macht, ist er nicht — „AO“ für die Arktische Orangerie
versteht die eine Runde sofort und die nächste gar nicht.

Das Feld **Eigenes Kürzel** unter „Dein Name“ setzt darum je Bauwerk einen eigenen
Namen. Die beiden stehen zusammen, weil sie zusammen eine Zeile ergeben:
`[Dein Name] [Bauwerk] P5 P4 P3`. Der Platzhalter zeigt immer den Namen aus
dem Datensatz, leer lassen heißt also „den nehmen“ — es braucht kein
Zurücksetzen, und es wird auch nichts gespeichert, solange niemand etwas
vergeben hat.

Das Kürzel gilt überall, wo cipher ein Bauwerk kurz nennt: in der Chat-Zeile,
in der Sammlung, am Merken-Knopf und auf den Favoriten-Chips — und zwar in
beiden Stellungen des Schalters „Kürzel“, denn wer es vergibt, meint es
ausdrücklich. Der Platzhalter zeigt, was ohne eigenes gälte. Im Quelltext
ist das eine Funktion, `shortName(building)`, und sechs Aufrufstellen.

Gespeichert wird unter `cipher:shorts`, nach dem Schlüssel des Bauwerks. Weil
der stabil ist, überlebt ein Kürzel jede Erneuerung des Datensatzes — im
Unterschied zu einer Änderung direkt in `data.js`, die zwar auch überlebt,
aber für alle gilt und einen Import braucht.

**Die Suche kennt es.** Wer sein Bauwerk „AO“ nennt, findet es auch so. Damit
entsteht allerdings ein Treffer der Sorte, gegen die der Abschnitt oben
argumentiert: „AO“ steht in „Arktische Orangerie“ nirgends, es gäbe also
nichts hervorzuheben. Ein Kurzname *aus dem Datensatz* hat das Problem nicht,
er ist immer ein Stück des Namens. Darum nennt so ein Treffer sein Kürzel
ausdrücklich — `Arktische Zukunft · AO` — und die Hervorhebung sitzt dort.

**Was es kostet.** Ein zweites Feld in der Spalte: 25 Pixel Höhe, sobald
Stufe und Name nebeneinander stehen (ab 390 Pixel Breite), und 78 Pixel
darunter, wo sie untereinander stehen. Dafür sind die beiden Spalten ab 390
Pixel erstmals gleich hoch — vorher endete die rechte auf halber Strecke.

### Favoriten

Ein Favorit ist ein Bauwerk (bis zu zwölf), und seine Stufe ist die, auf der
es zuletzt stand. Ziehst du ein gemerktes Bauwerk eine Stufe weiter, wandert
der Eintrag mit — neu merken musst du nichts, und doppelt steht ein Bauwerk
nie in der Liste. Vorher war jede Stufe ein eigener Eintrag; wer sein Bauwerk
levelte, hatte es danach zweimal da.

Ein Tipp auf einen Favoriten springt zurück — praktisch, wenn du mehrere
Bauwerke parallel hochziehst. Auch der Wechsel per Auswahlfeld oder Suche auf
ein gemerktes Bauwerk lädt dessen Stufe; ohne das würde die mitgebrachte
Stufe des vorigen Bauwerks den Eintrag überschreiben. Die Liste zeigt drei
Reihen und scrollt darüber hinaus, damit sie den Förderplan nicht aus dem
Bild schiebt. Sie liegt im Browser, nicht auf einem Server.

Die Liste ist **„zuletzt benutzt zuerst“**: Merken und Antippen stellen einen
Eintrag nach vorn. Der erste Chip ist damit das, womit du zuletzt gearbeitet
hast — im Normalfall also das Aktive. Vorher galt „zuletzt gemerkt zuerst“,
und das lehrte das Auge eine Regel, die nur meistens stimmte: direkt nach dem
Merken stand der neue Eintrag vorn und war aktiv, beim ersten Antippen eines
älteren Eintrags nicht mehr. Wer per Stufen-Stepper zufällig in eine gemerkte
Stufe läuft, hat die Liste nicht angefasst — dann bewegt sie sich auch nicht,
nur der Marker wandert.

Das Gemerkte steht **vor** allem anderen im Bauwerk-Panel. Vorher stand es
ganz unten dahinter, hinter Suche, Stufe, Name und Faktor — auf dem Telefon
also außerhalb des ersten Bildschirms, obwohl es genau das ist, wozu die
meisten beim Wiederkommen wollen. Solange nichts gemerkt ist, fällt der
Streifen ganz weg; ein leerer Platzhalter an der prominentesten Stelle wäre
schlechter als gar keiner.

Der Stern steht dafür unten bei dem, was er merkt, und sagt es auch:
„Die Arche · Stufe 81 merken“. Damit erklärt der Knopf die Funktion selbst,
und die Einträge im Streifen sind gefüllt statt umrandet — die Faktor-Chips
daneben sind Einstellungen, diese hier Sprungmarken, und gleiche Optik hieße
gleiche Bedeutung.

### Sammlung

Manche stellen mehrere Bauwerke **gleichzeitig** in die Fördergruppe. Am Ende
soll dann eine Nachricht alle Zeilen enthalten — und genau dafür lief der Weg
bisher über eine Notiz außerhalb: kopieren, wegschreiben, nächstes Bauwerk,
wieder kopieren.

Die Sammlung ist diese Notiz, nur an der Stelle, an der die Zeilen ohnehin
entstehen. Unter den beiden Kopierkästen sammelt sie jede Zeile, die du
kopierst; „Alle kopieren“ gibt sie am Ende untereinander zurück. Jede Zeile
lässt sich einzeln wieder herausnehmen, „Sammlung leeren“ räumt alles weg.
Sie liegt im `localStorage` und überdauert damit das Schließen des Browsers.
Solange nichts gesammelt ist, fällt der Kasten ganz weg.

Gesammelt wird **beim Kopieren** und nicht über einen eigenen Knopf. Der Grund
ist die Wahl zwischen „Nur Plätze“ und „Mit FP“: ein Knopf „Sammeln“ müsste sie
ein zweites Mal stellen. Der Kopierknopf hat sie schon beantwortet, also nimmt
die Sammlung genau die Zeile, die auch in der Zwischenablage landet.

Je Bauwerk steht **eine** Zeile in der Sammlung. Wer nach einer Korrektur
erneut kopiert, meint dieselbe Förderung noch einmal und nicht eine zweite —
die neue Zeile ersetzt darum die alte an deren Platz, und die Reihenfolge der
Sammlung bleibt die Reihenfolge des Sammelns. Mehr als 15 Zeilen hält sie
nicht; läuft sie über, fällt die älteste heraus.

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
- Es gibt keine eingebundenen Analyse-, Statistik- oder Werbedienste, keine
  CDNs, keine eingebetteten Inhalte, keine Cookies.
- Das Favicon steckt als Daten-URI direkt im HTML.

Ein Browsertest prüft das bei jedem Lauf nach: Jede Anfrage, die nicht an den
eigenen Host geht, lässt die Suite rot werden.

### Reichweitenmessung

Beim Hoster ist **Netlify Web Analytics** eingeschaltet. Das ist der Grund,
warum oben „eingebundene“ Dienste steht: Web Analytics wertet die
CDN-Logfiles serverseitig aus und fasst die Seite selbst nicht an — kein
Cookie, kein Skript, nichts, was auf dem Gerät gespeichert oder von dort
gelesen wird. Deshalb greift § 25 TDDDG nicht, und es braucht kein
Einwilligungsbanner. Es entstehen auch keine neuen Daten: die IP-Adresse
steht ohnehin im Logfile, sie bekommt nur einen zweiten Zweck.

Bewusst **nicht** eingeschaltet ist Netlifys *Real User Metrics*. Das spritzt
ein Skript in die Auslieferung und meldet Web-Vitals-Werte aus dem Browser
— also genau die Art Anfrage, die dieses Projekt nicht stellt. Es würde
ohnehin nicht funktionieren: `connect-src 'none'` verbietet jede Verbindung,
auch zur eigenen Domain. Ein Test in `headers.spec.js` hält diese Direktive
fest, damit sie niemand nebenbei aufweicht.

Eine Einschränkung ehrlichkeitshalber: Die Zusicherung „keine externen
Anfragen“ prüft die Suite gegen den lokalen Server. Würde an der Edge ein
Skript eingespritzt, bliebe der Test grün. Die CSP-Zusicherung oben ist
darum die belastbarere von beiden.

Gespeichert wird ausschließlich im `localStorage`, unter Schlüsseln mit dem
Präfix `cipher:` — und nur das, was die Anwendung zum Weiterarbeiten braucht.
Auf der Datenschutzseite gibt es einen Knopf, der alles davon löscht.

## Dateien

```
index.html        Die Anwendung
impressum.html    Impressum
datenschutz.html  Datenschutzerklärung
404.html          Fehlerseite
styles.css        Darstellung, sechs Themes über data-theme
fonts.css         @font-face für die lokal ausgelieferte Schrift
data.js           Datensatz der Legendären Bauwerke (generiert)
abbr.js           Kürzel je Bauwerk für den Förderchat (von Hand gepflegt)
calc.js           Rechenkern, reine Funktionen
app.js            Oberfläche: DOM, Ereignisse, Easter Eggs
legal.js          Kleines Skript für die beiden Rechtsseiten
netlify.toml      Auslieferung: Header, Caching, 404
robots.txt        Hält /tools/ und /test/ aus dem Suchindex
tools/serve.js    Statischer Server für Entwicklung und Tests
tools/import.html Holt die Daten aus dem Wiki (läuft nur lokal)
tools/build-data.js  Macht aus dem Import wieder data.js
tools/order-scan.js  Misst die Faktor-Spreizung für die Tabelle oben
test/             Einheitentests (node:test) und Browsertests (Playwright)
```

## Ausliefern

Es gibt keinen Build-Schritt. Das Repo-Wurzelverzeichnis ist das, was
ausgeliefert wird; `test/` und `tools/` braucht die Seite im Betrieb nicht.

Weil sie trotzdem im Deploy liegen, beantwortet `netlify.toml` beide Pfade mit
404 — und zwar mit `force = true`. Das ist kein Detail: Netlify wendet eine
Weiterleitung auf einen Pfad, unter dem eine Datei liegt, sonst gar nicht an.
Ohne `force` waren der Importer und alle Tests live abrufbar, obwohl die
Regel dastand. `tools/serve.js` bildet dieselbe Regel nach, und ein
Browsertest prüft die Wirkung: `/tools/import.html` muss mit 404 antworten,
nicht nur eine Regel im Text stehen haben.

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
SHA-256-Hash erlaubt — nicht über `'unsafe-inline'`. Auch `style-src` kommt
ohne `'unsafe-inline'` aus: Platzfarben laufen über Klassen (`.slot-1` bis
`.slot-5`), Balkenbreiten setzt JavaScript über `element.style` — das zählt
für den CSP nicht als Inline-Stil. Dazu `Strict-Transport-Security`, damit
der Browser gar nicht erst über `http` anfragt.

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

Die Browsertests decken Berechnung, den Wert je Platz in beiden Einheiten,
die Lesart der Absicherungsspalte, eigene Kürzel, die Lesart der
Stufenzahl, Favoriten, Speicherung, Migration aus dem Vorgänger, die
Rechtstexte, Barrierefreiheit, die Easter Eggs, die Sicherheits-Header samt
CSP und die Zusicherung „keine externen Anfragen“ ab.

## Barrierefreiheit

- Sechs Darstellungen: Blaupause (dunkel), Weißpause (hell), ein
  Kontrastmodus in Schwarz auf Weiß, Papier (warmes, liniertes Schreibpapier),
  Weltall (Neon auf Sternenhimmel) und Schmiede (Holz und Messing in den
  Farben des Spiels).
- Alle Bedienelemente sind beschriftet und per Tastatur erreichbar, mit
  deutlich sichtbarem Fokusring.
- `prefers-reduced-motion` schaltet sämtliche Animationen ab — auch die
  Easter Eggs, die dann nur noch einen kurzen Texthinweis zeigen.
- Ab etwa 390 Pixel Breite stehen Stufe und Name nebeneinander, darunter
  untereinander — auf schmalen Telefonen bliebe die Stufenzahl sonst
  abgeschnitten. Browsertests messen das bei 320, 360 und 390 Pixeln nach.

## Telefon im Querformat

Quer ist Höhe das knappe Gut und Breite im Überfluss da. Dort stehen die
Einstellungen links und der Förderplan rechts — einstellen und ablesen ohne
Scrollen. Das kürzt die Seite auf einem iPhone 14 quer von **1856 auf 1202
Pixel**, also von knapp fünf auf gut drei Bildschirme.

Die zweite Zahl ist nachgemessen: hier stand lange 1141, und dazwischen ist
die Seite gewachsen. Eine dokumentierte Messung altert mit dem, was über ihr
liegt — anders als bei der Faktor-Spreizung hält hier kein Test sie fest, sie
ist also nach Änderungen an den Panels nachzuziehen.

Aus demselben Grund zeigt der Streifen mit dem Gemerkten quer zwei Reihen
statt drei — das gibt rund 36 Pixel an den Rest zurück, ohne dass ein
Eintrag verloren geht.

Die Umschaltung hängt an drei Bedingungen zusammen:

```css
@media (orientation: landscape) and (max-height: 520px) and (min-width: 540px)
```

`orientation` allein genügt nicht — ein Desktop-Fenster ist auch „landscape".
Die Höhe unterscheidet: Telefone quer sind 330–430 Pixel hoch, Tablets und
Desktops deutlich mehr. Die Mindestbreite fängt ein hochkant gehaltenes
Telefon ab, dessen Ansicht durch eine eingeblendete Tastatur flacher als breit
werden könnte.

**Das Hochformat bleibt davon unberührt** — nicht aus Sorgfalt, sondern weil
Regeln innerhalb einer Abfrage nicht greifen können, wenn sie nicht zutrifft.
`test/e2e/landscape.spec.js` hält es trotzdem fest: bei vier Hochformat-Größen,
auf dem Desktop und auf dem Tablet wird geprüft, dass Aufbau, Breite und
Polster unverändert sind.

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
(`source: "x"`) und die Anwendung weist beim Aufruf darauf hin. Dasselbe
Zeichen bekommen Wiki-Werte, die weiter als eine Rundungsstufe (5 FP) neben der
Kurve ihres Zeitalters liegen: verrutschte Zeilen und doppelt abgetippte Zahlen
steigen zwar brav an, sind aber keine Wahrheit — dort gilt der Kurvenwert.

### Datensatz erneuern

`data.js` wird erzeugt, nicht von Hand gepflegt. Der Weg dorthin geht über zwei
Schritte:

```bash
# tools/import.html direkt im Browser öffnen (Datei, kein Server nötig),
# „Alle LGs importieren", dann „Datendatei herunterladen"
node tools/build-data.js ~/Downloads/lg-daten.json
npm run test:unit
node tools/order-scan.js   # Tabelle unter „Warum der Bereich bei 1,80 endet" nachziehen
```

Der Importer läuft absichtlich nicht über `npm run serve`: der Testserver
bildet die 404-Regel für `/tools/` nach, genau wie Netlify. Als Datei geöffnet
funktioniert er trotzdem, weil das Wiki seine API mit CORS für jede Herkunft
beantwortet.

`tools/import.html` liest die Wiki-Seiten aller Bauwerke, gleicht Kosten und
Belohnungen gegen die Formeln ab und markiert jede Stufe danach, wie sicher ihr
Wert ist. `tools/build-data.js` überführt das Ergebnis in `data.js`.

**Der Importer gehört nicht zur Website.** `netlify.toml` beantwortet
`/tools/*` mit 404, lokal ist er über `npm run serve` erreichbar. Im
Unterschied zur Anwendung fragt er das Wiki ab — aber erst auf Knopfdruck, beim
Laden der Seite geht keine Anfrage hinaus.

Drei Dinge stehen nicht zwingend im Wiki und übernimmt der Konverter deshalb
aus der bestehenden `data.js`:

- die **Kurznamen** für den Förderchat (`Leuchtturm von Alexandria` →
  `Leuchtturm`), die von Hand gepflegt sind — sie dürfen in `data.js` direkt
  geändert werden und überleben den nächsten Lauf
- **Bauwerke, die der Import nicht liefert**; sie bleiben mit ihren bisherigen
  Werten stehen, statt stillschweigend zu verschwinden
- **Kostenformel und P1-Kurve eines Bauwerks, das der Import leer liefert** —
  etwa der Horizontriss-Siphon, den das Wiki nicht kennt und dessen Werte aus
  im Spiel abgelesenen Stufen stammen

Alle drei meldet der Konverter im Lauf. `test/build-data.test.js` prüft es, indem
es aus `data.js` ein Import-JSON baut, durch den Konverter schickt und das
Ergebnis mit dem Original vergleicht.

## Lizenz

Quellcode: [MIT](./LICENSE). Die Datei enthält nur den MIT-Text, damit
GitHub die Lizenz erkennt; was anders lizenziert ist, steht in
[NOTICE.md](./NOTICE.md):

- Datensatz (`data.js`): CC BY-SA 3.0, abgeleitet aus dem Forge of Empires Wiki.
- Schrift (`fonts/`): SIL Open Font License 1.1, siehe `fonts/LICENSE-Barlow.txt`.
