/**
 * Tests fuer die Kuerzel (abbr.js). Die Datei ist von Hand gepflegt —
 * genau darum soll ein Tippfehler dort auffallen, bevor er in der Seite
 * steht.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../data.js");
const ABBR = require("../abbr.js");

test("jedes Bauwerk hat ein Kuerzel", () => {
  for (const building of DATA.buildings) {
    assert.equal(typeof ABBR[building.id], "string", `${building.name}: Kuerzel fehlt`);
    assert.ok(ABBR[building.id].trim(), `${building.name}: Kuerzel ist leer`);
  }
});

test("jedes Kuerzel gehoert zu einem Bauwerk", () => {
  const ids = new Set(DATA.buildings.map((building) => building.id));
  for (const id of Object.keys(ABBR)) {
    assert.ok(ids.has(id), `${id}: kein solches Bauwerk in data.js`);
  }
});

test("kein Kuerzel kommt doppelt vor", () => {
  const seen = new Map();
  for (const [id, abbr] of Object.entries(ABBR)) {
    const key = abbr.toLowerCase();
    assert.ok(!seen.has(key), `"${abbr}" steht bei ${seen.get(key)} und ${id}`);
    seen.set(key, id);
  }
});

test("Kuerzel sind kurz und ohne Rand", () => {
  for (const [id, abbr] of Object.entries(ABBR)) {
    assert.equal(abbr, abbr.trim(), `${id}: Leerzeichen am Rand`);
    assert.ok(abbr.length <= 12, `${id}: "${abbr}" ist laenger als 12 Zeichen`);
  }
});
