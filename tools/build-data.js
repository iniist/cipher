/**
 * Erzeugt data.js aus dem JSON, das tools/import.html herunterlaedt.
 *
 *   node tools/build-data.js lg-daten.json
 *   node tools/build-data.js lg-daten.json --dry          (nur berichten)
 *   node tools/build-data.js lg-daten.json --out tmp.js   (woanders hinschreiben)
 *
 * Der Importer liest das Wiki und kennt darum nur, was dort steht. Zwei
 * Dinge stehen nicht im Wiki und werden deshalb aus dem bestehenden data.js
 * uebernommen:
 *
 *   - die Kurznamen fuer den Foerderchat ("Leuchtturm von Alexandria" ->
 *     "Leuchtturm"), die von Hand gepflegt sind
 *   - Bauwerke, die der Import nicht laden konnte; sie bleiben mit ihren
 *     bisherigen Werten stehen, statt stillschweigend zu verschwinden
 *
 * Nach dem Lauf: `npm run test:unit` — die Datentests pruefen den neuen
 * Datensatz auf Vollstaendigkeit und Plausibilitaet.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "data.js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");

// --out schreibt woandershin; die Kurznamen kommen weiterhin aus data.js.
const outFlag = args.indexOf("--out");
const TARGET = outFlag >= 0 && args[outFlag + 1]
  ? path.resolve(args[outFlag + 1])
  : SOURCE;

// Ohne --out ist outFlag -1; der Wert danach darf dann nicht ausgefiltert
// werden, sonst verschwindet das erste Argument.
const outValueIndex = outFlag >= 0 ? outFlag + 1 : -1;
const positional = args.filter((arg, index) => !arg.startsWith("--") && index !== outValueIndex);
const inputPath = positional[0];

if (!inputPath) {
  process.stderr.write("Aufruf: node tools/build-data.js <lg-daten.json> [--dry] [--out <datei>]\n");
  process.exit(2);
}

const warnings = [];
const warn = (message) => warnings.push(message);

// ------------------------------------------------------------------ Einlesen

const imported = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(imported.lg) || !imported.lg.length) {
  process.stderr.write("Die Datei enthält keine Bauwerke (Feld \"lg\").\n");
  process.exit(1);
}

/** Bisheriger Datensatz, sofern vorhanden — Quelle für Kurznamen. */
let previous = { buildings: [], curves: {} };
try {
  previous = require(SOURCE);
} catch (error) {
  warn("Kein bestehendes data.js gefunden — Kurznamen werden aus den Namen abgeleitet.");
}
const previousById = new Map(previous.buildings.map((building) => [building.id, building]));

// ---------------------------------------------------------------- Umwandeln

const buildings = [];
const curves = {};
const seenEras = new Map();

for (const entry of imported.lg) {
  const known = previousById.get(entry.id);

  if (entry.costA == null) warn(`${entry.de}: keine Kostenformel im Import.`);
  if (Array.isArray(entry.cost1to10) && entry.cost1to10.includes(null)) {
    warn(`${entry.de}: Kosten der Stufen 1–10 unvollständig.`);
  }

  const curveKey = buildCurve(entry);

  buildings.push({
    id: entry.id,
    name: entry.de,
    short: known ? known.short : entry.de,
    era: entry.age,
    base: entry.costA == null ? null : entry.costA,
    maxLevel: entry.maxLevel,
    curve: curveKey,
    costs: entry.costA == null ? null : entry.cost1to10
  });

  if (!known) warn(`${entry.de}: neu im Datensatz — bitte einen Kurznamen prüfen.`);
}

/**
 * Die P1-Kurve eines Zeitalters ablegen. Alle Bauwerke eines Zeitalters
 * teilen sich dieselbe Kurve; der Importer liefert sie darum identisch
 * mehrfach. Weicht eine ab, ist etwas faul.
 */
function buildCurve(entry) {
  if (!Array.isArray(entry.p1) || !entry.p1.length) {
    warn(`${entry.de}: keine P1-Werte im Import.`);
    return null;
  }
  if (entry.p1.includes(null)) {
    warn(`${entry.de}: P1-Kurve hat Lücken, Zeitalter "${entry.age}" bleibt ohne Kurve.`);
    return null;
  }

  const serialised = entry.p1.join(",") + "|" + entry.p1src;
  if (!seenEras.has(entry.age)) {
    seenEras.set(entry.age, serialised);
    curves[entry.age] = { p1: entry.p1, source: entry.p1src };
  } else if (seenEras.get(entry.age) !== serialised) {
    warn(`${entry.de}: P1-Kurve weicht von den übrigen "${entry.age}"-Bauwerken ab, erste gewinnt.`);
  }
  return entry.age;
}

// Bauwerke, die der Import nicht kennt, nicht verlieren.
for (const old of previous.buildings) {
  if (buildings.some((building) => building.id === old.id)) continue;
  warn(`${old.name}: vom Import nicht geliefert, bisherige Werte übernommen.`);
  buildings.push(old);
  if (old.curve && !curves[old.curve] && previous.curves[old.curve]) {
    curves[old.curve] = previous.curves[old.curve];
  }
}

// Reihenfolge des Imports beibehalten; nachgetragene Bauwerke hängen hinten an.

// ---------------------------------------------------------------- Schreiben

const generated = String(imported.generated || "").slice(0, 10) ||
  new Date().toISOString().slice(0, 10);

const quote = (value) => JSON.stringify(value);

let out = `/*!
 * cipher — Datensatz der Legendären Bauwerke
 *
 * Quelle: Forge of Empires Wiki (Fandom), lizenziert unter CC BY-SA 3.0.
 * Stand der Daten: siehe \`generated\`.
 *
 * Aufbau:
 *   buildings[]           Ein Eintrag je Legendärem Bauwerk
 *     .id                 Stabiler Schlüssel (Wiki-Seitenname)
 *     .name               Anzeigename (deutsch)
 *     .short              Kurzname für den Förderchat
 *     .era                Zeitalter, dient als Gruppe im Auswahlfeld
 *     .base               Basiswert A der Kostenformel (null = unbekannt)
 *     .costs[0..9]        Gesamtkosten der Stufen 1-10 laut Wiki (null = unbekannt)
 *     .maxLevel           Höchste im Spiel erreichbare Stufe
 *     .curve              Schlüssel in \`curves\` für die P1-Belohnung (null = unbekannt)
 *
 *   curves{era}           P1-Belohnung je Stufe, gemeinsam für alle Bauwerke eines Zeitalters
 *     .p1[level-1]        Belohnung für Platz 1 in FP
 *     .source[level-1]    Herkunft als Zeichen: "w" = Wiki, "e" = geschätzt,
 *                         "x" = Wiki-Angabe widerspricht sich oder der Kurve
 *                               des Zeitalters, es gilt der Kurvenwert
 *
 * Diese Datei wird erzeugt von tools/build-data.js aus dem JSON, das
 * tools/import.html herunterlädt. Handische Änderungen gehen beim nächsten
 * Lauf verloren — mit einer Ausnahme: die Kurznamen (.short) werden aus der
 * bestehenden Datei übernommen und dürfen hier gepflegt werden.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CIPHER_DATA = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var buildings = [
`;

for (const building of buildings) {
  out += `    { id: ${quote(building.id)}, name: ${quote(building.name)}, short: ${quote(building.short)},` +
    ` era: ${quote(building.era)}, base: ${building.base === null ? "null" : building.base},` +
    ` maxLevel: ${building.maxLevel}, curve: ${building.curve === null ? "null" : quote(building.curve)},` +
    ` costs: ${building.costs === null ? "null" : "[" + building.costs.join(", ") + "]"} },\n`;
}

out += `  ];

  var curves = {
`;

for (const [era, curve] of Object.entries(curves)) {
  out += `    ${quote(era)}: {\n      p1: [${curve.p1.join(", ")}],\n      source: ${quote(curve.source)}\n    },\n`;
}

out += `  };

  return { generated: ${quote(generated)}, buildings: buildings, curves: curves };
});
`;

// ------------------------------------------------------------------ Bericht

const report = [
  `Bauwerke:   ${buildings.length}`,
  `Zeitalter:  ${Object.keys(curves).length}`,
  `Stand:      ${generated}`,
  `Kurznamen:  ${buildings.filter((b) => b.short !== b.name).length} abweichend übernommen`
];

process.stdout.write(report.join("\n") + "\n");

if (warnings.length) {
  process.stdout.write("\nHinweise:\n" + warnings.map((w) => "  - " + w).join("\n") + "\n");
}

if (dryRun) {
  process.stdout.write(`\nProbelauf — ${TARGET} wurde nicht verändert.\n`);
} else {
  fs.writeFileSync(TARGET, out);
  process.stdout.write(`\n${path.relative(ROOT, TARGET)} geschrieben. Jetzt: npm run test:unit\n`);
}
