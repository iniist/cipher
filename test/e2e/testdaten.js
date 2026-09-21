/**
 * Ein eigener Datensatz fuer die Browsertests.
 *
 * Die Tests zum Leerzustand brauchen ein Bauwerk ohne Kosten und ohne
 * Kurve. Frueher wurde dafuer eines genommen, bei dem der echte Datensatz
 * zufaellig eine Luecke hatte — mit jeder Datenverbesserung verlor der Test
 * seinen Gegenstand. Darum wird hier ./data.js abgefangen und ein kleiner
 * eigener Datensatz ausgeliefert: ein paar echte Bauwerke, damit die Seite
 * rechnet wie immer, und ein absichtlich leeres.
 */
const DATA = require("../../data.js");

/** Schluessel des absichtlich leeren Bauwerks. */
const OHNE_DATEN = "Leeres_Bauwerk";

/** Echte Bauwerke, die mitkommen; das erste ist die Voreinstellung der Seite. */
const ECHTE = ["The_Arc", "Observatory", "Notre_Dame"];

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

module.exports = { mitTestdaten, testDaten, OHNE_DATEN };
