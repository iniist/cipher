/**
 * Tests fuer den Datensatz. Sie fangen ab, dass ein neuer Export
 * unbemerkt kaputte oder unvollstaendige Eintraege einschleust.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../data.js");

test("der Datensatz traegt ein plausibles Datum", () => {
  assert.match(DATA.generated, /^\d{4}-\d{2}-\d{2}$/);
  const generated = new Date(DATA.generated);
  assert.ok(!isNaN(generated.valueOf()));
  assert.ok(generated > new Date("2020-01-01"));
});

test("jedes Bauwerk ist vollstaendig beschrieben", () => {
  assert.ok(DATA.buildings.length > 40);

  for (const building of DATA.buildings) {
    const where = building.id;
    assert.equal(typeof building.id, "string", `${where}: id fehlt`);
    assert.ok(building.name, `${where}: name fehlt`);
    assert.ok(building.short, `${where}: short fehlt`);
    assert.ok(building.era, `${where}: era fehlt`);
    assert.ok(Number.isInteger(building.maxLevel) && building.maxLevel > 0, `${where}: maxLevel unbrauchbar`);

    if (building.base != null) assert.ok(building.base > 0, `${where}: base muss positiv sein`);

    // Die Tabelle der Stufen 1-10 darf fehlen: stammt der Basiswert aus im
    // Spiel abgelesenen Stufen ab 11, steht sie nirgends, und totalCost
    // rechnet unten ersatzweise mit der Formel weiter. Ist sie da, muss sie
    // vollstaendig und plausibel sein — und ohne Basiswert ergibt sie keinen
    // Sinn, weil ab Stufe 11 dann nichts folgt.
    if (building.costs != null) {
      assert.ok(building.base != null, `${where}: Kosten ohne Basiswert`);
      assert.ok(Array.isArray(building.costs) && building.costs.length === 10,
        `${where}: die Kostentabelle braucht zehn Werte`);
      for (const cost of building.costs) {
        assert.ok(Number.isInteger(cost) && cost > 0, `${where}: unbrauchbarer Kostenwert ${cost}`);
      }
    }
  }
});

test("Bauwerks-Schluessel sind eindeutig", () => {
  const seen = new Set();
  for (const building of DATA.buildings) {
    assert.ok(!seen.has(building.id), `doppelter Schluessel: ${building.id}`);
    seen.add(building.id);
  }
});

test("jedes Bauwerk verweist auf eine vorhandene Kurve", () => {
  for (const building of DATA.buildings) {
    if (building.curve == null) continue;
    assert.ok(DATA.curves[building.curve], `${building.id}: Kurve "${building.curve}" fehlt`);
  }
});

test("jede Kurve ist in sich stimmig", () => {
  for (const [era, curve] of Object.entries(DATA.curves)) {
    assert.ok(curve.p1.length > 0, `${era}: leere Kurve`);
    assert.equal(curve.p1.length, curve.source.length,
      `${era}: zu jeder Belohnung gehoert genau eine Herkunft`);

    let previous = 0;
    curve.p1.forEach((reward, index) => {
      assert.ok(Number.isInteger(reward) && reward > 0, `${era} Stufe ${index + 1}: ${reward} ist keine Belohnung`);
      assert.equal(reward % 5, 0, `${era} Stufe ${index + 1}: ${reward} ist nicht durch 5 teilbar`);

      // Die Belohnung darf nie fallen. Einzige Ausnahme sind Stufen, die im
      // Wiki widerspruechlich angegeben sind ("x") — die kennzeichnet die
      // Anwendung ohnehin sichtbar und bittet um eine eigene Eingabe.
      if (curve.source[index] !== "x" && curve.source[index - 1] !== "x") {
        assert.ok(reward >= previous, `${era} Stufe ${index + 1}: Belohnung faellt gegenueber der Vorstufe`);
      }
      previous = reward;
    });

    assert.match(curve.source, /^[wex]+$/, `${era}: unbekanntes Herkunftszeichen`);
  }
});

test("jede fallende Belohnung ist als unstimmig gekennzeichnet", () => {
  // Eine Belohnung, die gegenueber ihrer Vorstufe faellt, kann es im Spiel
  // nicht geben — im Wiki schon, durch Tippfehler. Erlaubt ist so eine
  // Stelle darum nur mit dem Zeichen "x": dann weiss die Anwendung, dass
  // der Wert nicht gesichert ist, und bittet um eine eigene Eingabe.
  //
  // Frueher stand hier zusaetzlich, es gebe genau eine solche Stelle. Das
  // war der damalige Datenstand als Sollwert verkleidet, und es fiel dem
  // ersten Import zum Opfer, der die verdorbenen Wiki-Werte der
  // Jahrhundertwende durch Kurvenwerte ersetzt hat: danach faellt nirgends
  // mehr etwas, und der Test schlug ausgerechnet wegen einer Verbesserung
  // fehl. Gezaehlt wird darum nichts mehr — geprueft wird die Regel.
  const dips = [];
  for (const [era, curve] of Object.entries(DATA.curves)) {
    for (let index = 1; index < curve.p1.length; index++) {
      if (curve.p1[index] < curve.p1[index - 1]) {
        dips.push({ era, level: index + 1, source: curve.source[index] });
      }
    }
  }
  for (const dip of dips) {
    assert.equal(dip.source, "x",
      `${dip.era} Stufe ${dip.level}: fallende Belohnung ohne Kennzeichnung als widerspruechlich`);
  }
});

test("die Standardauswahl existiert", () => {
  assert.ok(DATA.buildings.some((building) => building.id === "The_Arc"),
    "The_Arc ist die Voreinstellung der Anwendung und muss im Datensatz stehen");
});
