/**
 * Ein eigener Datensatz fuer die Browsertests.
 *
 * Die Tests zum Leerzustand brauchen ein Bauwerk ohne Kosten und ohne
 * Kurve. Frueher wurde dafuer eines genommen, bei dem der echte Datensatz
 * zufaellig eine Luecke hatte — mit jeder Datenverbesserung verlor der Test
 * seinen Gegenstand. Darum wird hier ./data.js abgefangen und ein kleiner
 * eigener Datensatz ausgeliefert: ein paar echte Bauwerke, damit die Seite
 * rechnet wie immer, ein absichtlich leeres und eines auf einer absichtlich
 * wackligen Kurve.
 */
const DATA = require("../../data.js");
const Calc = require("../../calc.js");

/** Schluessel des absichtlich leeren Bauwerks. */
const OHNE_DATEN = "Leeres_Bauwerk";

/**
 * Schluessel des Bauwerks auf einer absichtlich wackligen Kurve.
 *
 * Der Hinweis fuer hochgerechnete P1-Werte haengt daran, dass der
 * Ausblendtest des Zeitalters Fehlschuesse findet. Frueher stand dafuer
 * die Virtuelle Zukunft im Test — bis zwei im Spiel abgelesene Stufen die
 * Kurve so weit absicherten, dass der Test keine Fehlschuesse mehr fand
 * und der Hinweis verschwand. Der Browsertest pruefte damit nicht mehr die
 * Anzeige, sondern den Stand des Wikis.
 *
 * Darum eine eigene Kurve, die den Test garantiert nicht besteht: unten
 * waechst sie mit Exponent 1,20, ab Stufe 60 mit 1,23. Wer nur die untere
 * Haelfte fittet, muss die obere verfehlen — und zwar deutlich.
 */
const WACKLIG = "Wackliges_Bauwerk";
const WACKLIG_KURVE = "Wackliges Zeitalter";

/** So weit reicht die wacklige Kurve; darueber rechnet cipher hoch. */
const WACKLIG_STUFEN = 120;

/** Echte Bauwerke, die mitkommen; das erste ist die Voreinstellung der Seite. */
const ECHTE = ["The_Arc", "Observatory", "Notre_Dame"];

/** Die wacklige Kurve rechnen: Exponentenknick bei Stufe 60. */
function wackligeKurve() {
  const KNICK = 60;
  const UNTEN = 1.2;
  const OBEN = 1.23;
  const FAKTOR = 8;
  // Am Knick muss die Kurve stetig bleiben, sonst faellt sie dort.
  const oben = FAKTOR * Math.pow(KNICK, UNTEN - OBEN);

  const p1 = [];
  for (let level = 1; level <= WACKLIG_STUFEN; level++) {
    const steigt = level <= KNICK;
    p1.push(Calc.roundTo5((steigt ? FAKTOR : oben) * Math.pow(level, steigt ? UNTEN : OBEN)));
  }
  return { p1: p1, source: "w".repeat(WACKLIG_STUFEN) };
}

/** Den kleinen Datensatz zusammenstellen. */
function testDaten() {
  const buildings = ECHTE.map(function (id) {
    const building = DATA.buildings.find((b) => b.id === id);
    if (!building) throw new Error(`Testdaten: "${id}" fehlt im Datensatz`);
    return building;
  });

  const curves = {};
  for (const building of buildings) {
    if (building.curve) curves[building.curve] = DATA.curves[building.curve];
  }

  buildings.push({
    id: OHNE_DATEN,
    name: "Leeres Bauwerk",
    short: "Leer",
    era: "Ohne Daten",
    base: null,
    maxLevel: 200,
    curve: null,
    costs: null
  });

  buildings.push({
    id: WACKLIG,
    name: "Wackliges Bauwerk",
    short: "Wacklig",
    era: WACKLIG_KURVE,
    base: 507.778903369,
    maxLevel: WACKLIG_STUFEN,
    curve: WACKLIG_KURVE,
    costs: [50, 70, 130, 200, 270, 330, 420, 490, 570, 650]
  });
  curves[WACKLIG_KURVE] = wackligeKurve();

  return { generated: DATA.generated, buildings: buildings, curves: curves };
}

/**
 * ./data.js durch die Testdaten ersetzen. Muss vor dem Laden der Seite
 * aufgerufen werden — oder davor, dass sie neu geladen wird.
 * @param {import("@playwright/test").Page} page
 */
async function mitTestdaten(page) {
  const body = `(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CIPHER_DATA = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";
  return ${JSON.stringify(testDaten())};
});
`;

  await page.route("**/data.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: body
  }));
}

module.exports = { mitTestdaten, testDaten, OHNE_DATEN, WACKLIG, WACKLIG_KURVE, WACKLIG_STUFEN };
