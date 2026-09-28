/**
 * Tests fuer tools/foe-helper.js und die Option --foe-helper von
 * tools/build-data.js.
 *
 * Die echte Tabelle des FoE-Helpers steht unter AGPLv3 und liegt darum
 * nicht im Repo. Die Tests bauen stattdessen eine kleine Datei im selben
 * Format aus den Kurven in data.js.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { ERA_IDS, parseRewards, parseLevels, compareCurves } = require("../tools/foe-helper.js");
const DATA = require("../data.js");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "tools", "build-data.js");

/** Eine greatbuildings.js im Aufbau des FoE-Helpers erzeugen. */
function helperSource(rows) {
  let out = "let GreatBuildings = {\n    /** P1 */\n    Rewards: {\n";
  for (const [id, row] of Object.entries(rows)) {
    if (row.comment) out += `        // formula estimates: levels ${row.comment}\n`;
    out += `        ${id}: [${row.p1.join(", ")}],\n`;
  }
  return out + "    },\n\n    GreatBuildingsData: [\n        { 'ID': 'X', 'FPProductions': [1, 2] },\n    ],\n};\n";
}

/** Tabelle, die in allen Zeitaltern genau den Kurven von data.js entspricht. */
function matchingRows() {
  const rows = {};
  for (const [era, curve] of Object.entries(DATA.curves)) rows[ERA_IDS[era]] = { p1: [...curve.p1] };
  return rows;
}

test("jedes Zeitalter in data.js hat eine FoE-Helper-Kennung", () => {
  for (const era of Object.keys(DATA.curves)) {
    assert.ok(ERA_IDS[era] !== undefined, `${era} fehlt in ERA_IDS`);
  }
  const ids = Object.values(ERA_IDS);
  assert.equal(new Set(ids).size, ids.length, "Kennungen doppelt vergeben");
});

test("die Tabelle wird gelesen, Schaetzungen der richtigen Zeile zugeordnet", () => {
  const rewards = parseRewards(helperSource({
    0: { p1: [5, 10, 15], comment: "1-2" },
    2: { p1: [5, 10] }
  }));

  assert.deepEqual([...rewards.keys()], [0, 2]);
  assert.deepEqual(rewards.get(0).p1, [5, 10, 15]);
  // Der FoE-Helper zaehlt ab 0, cipher ab 1.
  assert.deepEqual([...rewards.get(0).estimated], [2, 3]);
  assert.equal(rewards.get(2).estimated.size, 0, "der Kommentar gilt nur fuer die naechste Zeile");
});

test("Stufenangaben mit Einzelwerten und Bereichen", () => {
  assert.deepEqual([...parseLevels("231, 242, 248-250")], [232, 243, 249, 250, 251]);
  assert.deepEqual([...parseLevels("unlesbar")], []);
});

test("ohne Tabelle kommt null zurueck", () => {
  assert.equal(parseRewards("let GreatBuildings = { Show: () => {} };"), null);
});

test("abweichende Wiki-Werte werden einzeln gemeldet, Schaetzungen zusammengefasst", () => {
  const curves = {
    "Bronzezeit": { p1: [5, 10, 15, 20, 25], source: "wweee" }
  };
  const rewards = parseRewards(helperSource({
    2: { p1: [5, 15, 15, 25, 30, 35, 40], comment: "4" }
  }));

  const { lines, wikiMismatches } = compareCurves(curves, rewards);
  const text = lines.join("\n");

  assert.equal(wikiMismatches, 1);
  assert.match(text, /Bronzezeit: Stufe 2 laut Wiki 10 FP, FoE-Helper misst 15 FP\./);
  // Stufe 4 ist beim FoE-Helper selbst geschaetzt und bleibt aussen vor.
  assert.match(text, /1 geschätzte Werte weichen von der Messung ab \(bis 5 FP\), z\. B\. Stufe 4: 20 statt 25\./);
  assert.match(text, /FoE-Helper kennt Stufen bis 7, cipher bis 5\./);
  assert.match(lines[0], /^4 gemessene Werte verglichen, 2 abweichend, davon 1 aus dem Wiki\./);
});

test("fehlende Zeitalter werden benannt statt uebergangen", () => {
  const curves = {
    "Bronzezeit": { p1: [5], source: "w" },
    "Neues Zeitalter": { p1: [5], source: "w" }
  };
  const rewards = parseRewards(helperSource({ 0: { p1: [5] } }));
  const text = compareCurves(curves, rewards).lines.join("\n");

  assert.match(text, /Bronzezeit: fehlt in der FoE-Helper-Tabelle/);
  assert.match(text, /Neues Zeitalter: kein FoE-Helper-Zeitalter zugeordnet/);
});

/** build-data.js mit --foe-helper im Probelauf starten. */
function runBuild(helperFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cipher-helper-"));
  const inputPath = path.join(dir, "lg-daten.json");
  fs.writeFileSync(inputPath, JSON.stringify({
    generated: DATA.generated,
    lg: DATA.buildings.map((building) => {
      const curve = building.curve ? DATA.curves[building.curve] : null;
      return {
        id: building.id, de: building.name, age: building.era,
        costA: building.base, cost1to10: building.costs, maxLevel: building.maxLevel,
        p1: curve ? curve.p1 : [], p1src: curve ? curve.source : ""
      };
    })
  }));
  return { dir, run: (file) => execFileSync(process.execPath,
    [SCRIPT, inputPath, "--dry", "--foe-helper", file], { cwd: ROOT, encoding: "utf8" }) };
}

test("build-data.js berichtet den Abgleich und laesst den Datensatz in Ruhe", () => {
  const { dir, run } = runBuild();
  const file = path.join(dir, "greatbuildings.js");
  fs.writeFileSync(file, helperSource(matchingRows()));

  const before = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  const stdout = run(file);

  assert.match(stdout, /Abgleich mit FoE-Helper:/);
  assert.match(stdout, /abweichend, davon 0 aus dem Wiki/);
  assert.equal(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"), before);
});

test("build-data.js ueberspringt eine Datei ohne Tabelle mit Hinweis", () => {
  const { dir, run } = runBuild();
  const file = path.join(dir, "greatbuildings.js");
  fs.writeFileSync(file, "// anderes Format\n");

  assert.match(run(file), /Keine Tabelle "Rewards" gefunden/);
});

test("build-data.js bricht ab, wenn die Datei fehlt", () => {
  const { dir, run } = runBuild();
  assert.throws(() => run(path.join(dir, "gibt-es-nicht.js")), (error) => {
    assert.equal(error.status, 2);
    assert.match(error.stderr, /FoE-Helper-Datei nicht lesbar/);
    return true;
  });
});
