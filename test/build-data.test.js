/**
 * Tests fuer tools/build-data.js.
 *
 * Das Wiki wird hier nicht angefasst. Stattdessen wird aus dem bestehenden
 * data.js ein Import-JSON in genau der Form gebaut, die tools/import.html
 * herunterlaedt, durch den Konverter geschickt und das Ergebnis mit dem
 * Original verglichen. Kommt derselbe Datensatz heraus, stimmt die
 * Abbildung zwischen beiden Formaten.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "tools", "build-data.js");
const DATA = require("../data.js");

/** Den bestehenden Datensatz in die Ausgabeform des Importers bringen. */
function asImport(data, options = {}) {
  const skip = options.skip || [];
  return {
    version: 2,
    generated: (options.generated || data.generated) + "T00:00:00.000Z",
    source: "forgeofempires.fandom.com (CC BY-SA)",
    lg: data.buildings
      .filter((building) => !skip.includes(building.id))
      .map((building) => {
        const curve = building.curve ? data.curves[building.curve] : null;
        return {
          id: building.id,
          en: building.id.replace(/_/g, " "),
          de: options.rename && options.rename[building.id]
            ? options.rename[building.id]
            : building.name,
          age: building.era,
          costA: building.base,
          costDerivedFrom: null,
          cost1to10: building.costs,
          maxLevel: building.maxLevel,
          p1Curve: null,
          p1: curve ? curve.p1 : [],
          p1src: curve ? curve.source : "",
          stats: {},
          issues: []
        };
      })
  };
}

/** Konverter in einem Wegwerf-Verzeichnis laufen lassen. */
function convert(importJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cipher-build-"));
  const inputPath = path.join(dir, "lg-daten.json");
  const outPath = path.join(dir, "data.out.js");
  fs.writeFileSync(inputPath, JSON.stringify(importJson));

  const stdout = execFileSync(
    process.execPath,
    [SCRIPT, inputPath, "--out", outPath],
    { cwd: ROOT, encoding: "utf8" }
  );

  return { stdout, result: require(outPath), dir };
}

test("der Rundlauf erzeugt denselben Datensatz", () => {
  const { result } = convert(asImport(DATA));

  assert.equal(result.generated, DATA.generated);
  assert.equal(result.buildings.length, DATA.buildings.length);
  assert.deepEqual(
    result.buildings.map((b) => b.id).sort(),
    DATA.buildings.map((b) => b.id).sort()
  );

  for (const original of DATA.buildings) {
    const built = result.buildings.find((b) => b.id === original.id);
    assert.deepEqual(built, original, `${original.id} weicht ab`);
  }

  assert.deepEqual(Object.keys(result.curves).sort(), Object.keys(DATA.curves).sort());
  for (const [era, curve] of Object.entries(DATA.curves)) {
    assert.deepEqual(result.curves[era], curve, `Kurve "${era}" weicht ab`);
  }
});

test("Kurznamen bleiben erhalten, auch wenn der Import sie nicht kennt", () => {
  // Der Importer liefert nur den vollen Namen; die Kurznamen sind von Hand
  // gepflegt und muessen aus dem bestehenden data.js uebernommen werden.
  const curated = DATA.buildings.filter((b) => b.short !== b.name);
  assert.ok(curated.length >= 5, "der Datensatz sollte kuratierte Kurznamen haben");

  const { result } = convert(asImport(DATA));
  for (const original of curated) {
    const built = result.buildings.find((b) => b.id === original.id);
    assert.equal(built.short, original.short, `${original.name}: Kurzname verloren`);
  }
});

test("ein Bauwerk, das der Import nicht liefert, bleibt erhalten", () => {
  const dropped = DATA.buildings[3];
  const { stdout, result } = convert(asImport(DATA, { skip: [dropped.id] }));

  const kept = result.buildings.find((b) => b.id === dropped.id);
  assert.ok(kept, `${dropped.name} darf nicht stillschweigend verschwinden`);
  assert.deepEqual(kept, dropped);
  assert.match(stdout, /vom Import nicht geliefert/);
});

test("ein Bauwerk, das der Import leer liefert, behaelt seine Werte", () => {
  // Der Fall des Horizontriss-Siphons: das Wiki kennt ihn nicht, seine
  // Werte stammen aus dem Spiel. Der Import liefert den Eintrag, aber ohne
  // Inhalt — frueher wurde damit alles mit null ueberschrieben. Gewaehlt
  // wird ein Bauwerk, das allein in seinem Zeitalter steht: dann ist auch
  // die Kurve nur hier zu retten.
  const lonely = DATA.buildings.find((building) =>
    building.base != null &&
    DATA.buildings.filter((other) => other.era === building.era).length === 1);
  assert.ok(lonely, "es sollte ein Bauwerk geben, das allein sein Zeitalter bildet");

  const input = asImport(DATA);
  const entry = input.lg.find((lg) => lg.id === lonely.id);
  entry.costA = null;
  entry.cost1to10 = null;
  entry.p1 = [];
  entry.p1src = "";

  const { stdout, result } = convert(input);
  const built = result.buildings.find((b) => b.id === lonely.id);
  assert.deepEqual(built, lonely, `${lonely.name}: Werte beim Import verloren`);
  assert.deepEqual(result.curves[lonely.curve], DATA.curves[lonely.curve],
    `${lonely.name}: Kurve beim Import verloren`);

  assert.match(stdout, /bisherige Basis übernommen/);
  assert.match(stdout, /bisherige Kurve/);
});

test("ohne bisherige Werte bleibt ein leerer Import leer", () => {
  // Die Rettung darf nichts erfinden: ein neues Bauwerk ohne Inhalt bleibt
  // ohne Inhalt — und sagt es.
  const input = asImport(DATA);
  input.lg.push({
    id: "Leeres_Bauwerk",
    en: "Leeres Bauwerk",
    de: "Leeres Bauwerk",
    age: "Unbekanntes Zeitalter",
    costA: null,
    cost1to10: null,
    maxLevel: 200,
    p1: [],
    p1src: "",
    stats: {},
    issues: []
  });

  const { stdout, result } = convert(input);
  const added = result.buildings.find((b) => b.id === "Leeres_Bauwerk");
  assert.deepEqual(added, {
    id: "Leeres_Bauwerk",
    name: "Leeres Bauwerk",
    short: "Leeres Bauwerk",
    era: "Unbekanntes Zeitalter",
    base: null,
    maxLevel: 200,
    curve: null,
    costs: null
  });
  assert.match(stdout, /keine Kostenformel im Import\./);
});

test("ein neues Bauwerk wird gemeldet und bekommt den Namen als Kurznamen", () => {
  const input = asImport(DATA);
  input.lg.push({
    id: "Brandneues_Bauwerk",
    en: "Brandneues Bauwerk",
    de: "Brandneues Bauwerk",
    age: "Zukunft",
    costA: 500,
    cost1to10: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    maxLevel: 100,
    p1: DATA.curves["Zukunft"].p1,
    p1src: DATA.curves["Zukunft"].source,
    stats: {},
    issues: []
  });

  const { stdout, result } = convert(input);
  const added = result.buildings.find((b) => b.id === "Brandneues_Bauwerk");
  assert.ok(added);
  assert.equal(added.short, "Brandneues Bauwerk");
  assert.match(stdout, /neu im Datensatz/);
});

test("ein umbenanntes Bauwerk behaelt seinen gepflegten Kurznamen", () => {
  const arc = DATA.buildings.find((b) => b.id === "The_Arc");
  const { result } = convert(asImport(DATA, { rename: { The_Arc: "Die Arche (neu)" } }));

  const built = result.buildings.find((b) => b.id === "The_Arc");
  assert.equal(built.name, "Die Arche (neu)");
  assert.equal(built.short, arc.short);
});

test("das Ergebnis besteht die Datenpruefungen", () => {
  const { result } = convert(asImport(DATA));

  for (const building of result.buildings) {
    assert.ok(building.id && building.name && building.short && building.era);
    assert.ok(Number.isInteger(building.maxLevel) && building.maxLevel > 0);
    if (building.costs != null) {
      assert.ok(building.base != null);
      assert.equal(building.costs.length, 10);
      assert.ok(building.costs.every((cost) => Number.isInteger(cost) && cost > 0));
    }
    if (building.curve != null) assert.ok(result.curves[building.curve]);
  }
  for (const curve of Object.values(result.curves)) {
    assert.equal(curve.p1.length, curve.source.length);
    assert.match(curve.source, /^[wex]+$/);
  }
});
