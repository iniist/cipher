/**
 * Abgleich der P1-Kurven mit der Belohnungstabelle des FoE-Helpers.
 *
 * Der FoE-Helper (https://github.com/mainIine/foe-helfer-extension) fuehrt in
 * js/web/greatbuildings/js/greatbuildings.js eine Tabelle `Rewards` mit der
 * P1-Belohnung je Zeitalter und Stufe, zum grossen Teil im Spiel gemessen.
 * Stufen, fuer die dort keine Messung vorliegt, stehen als Kommentar
 * „formula estimates: levels …“ ueber der Zeile.
 *
 * Die Tabelle steht unter AGPLv3 und wird darum weder mitgeliefert noch in
 * data.js uebernommen. Sie dient nur als Gegenprobe: build-data.js liest die
 * Datei, die man ihm gibt, und meldet, wo cipher von einer Messung abweicht.
 *
 *   curl -fsSL -o foe-helper.js \
 *     https://raw.githubusercontent.com/mainIine/foe-helfer-extension/master/js/web/greatbuildings/js/greatbuildings.js
 *   node tools/build-data.js lg-daten.json --foe-helper foe-helper.js
 */
"use strict";

/**
 * Zeitalter-Kennungen des FoE-Helpers (Technologies.Eras: NoAge = 0,
 * StoneAge = 1, BronzeAge = 2, …) zu den Zeitaltern in data.js.
 * Die Steinzeit hat keine Legendaeren Bauwerke.
 */
const ERA_IDS = {
  "Ohne Zeitalter": 0,
  "Bronzezeit": 2,
  "Eisenzeit": 3,
  "Frühes Mittelalter": 4,
  "Hochmittelalter": 5,
  "Spätes Mittelalter": 6,
  "Kolonialzeit": 7,
  "Industriezeitalter": 8,
  "Jahrhundertwende": 9,
  "Moderne": 10,
  "Postmoderne": 11,
  "Gegenwart": 12,
  "Morgen": 13,
  "Zukunft": 14,
  "Arktische Zukunft": 15,
  "Ozeanische Zukunft": 16,
  "Virtuelle Zukunft": 17,
  "Mars": 18,
  "Asteroidengürtel": 19,
  "Venus": 20,
  "Jupitermond": 21,
  "Titan": 22,
  "Raumfahrt-Hub": 23,
  "Stellares Zeitalter": 24
};

/**
 * Die Tabelle `Rewards` aus dem Quelltext lesen.
 *
 * @param {string} source Inhalt von greatbuildings.js
 * @returns {Map<number, {p1: number[], estimated: Set<number>}>|null}
 *   je Zeitalter-Kennung die Werte (Index = Stufe - 1) und die geschaetzten
 *   Stufen (1-basiert); null, wenn keine Tabelle zu finden ist
 */
function parseRewards(source) {
  const start = source.search(/^\s*Rewards\s*:\s*\{/m);
  if (start < 0) return null;

  const rows = new Map();
  let estimated = new Set();

  for (const line of source.slice(start).split("\n").slice(1)) {
    if (/^\s*\}/.test(line)) break;

    const comment = line.match(/^\s*\/\/\s*formula estimates:\s*levels\s+(.*)$/);
    if (comment) {
      estimated = parseLevels(comment[1]);
      continue;
    }

    const row = line.match(/^\s*(\d+)\s*:\s*\[([^\]]*)\]/);
    if (!row) continue;
    const p1 = row[2].split(",").map((value) => value.trim()).filter(Boolean).map(Number);
    if (!p1.length || p1.some((value) => !Number.isFinite(value))) continue;

    rows.set(Number(row[1]), { p1, estimated });
    estimated = new Set();
  }

  return rows.size ? rows : null;
}

/**
 * „231, 242, 248-251“ in Stufen uebersetzen. Der FoE-Helper zaehlt die
 * Stufen dort wie die Tabelle ab 0; zurueck kommen sie ab 1 gezaehlt, wie
 * in cipher.
 */
function parseLevels(text) {
  const levels = new Set();
  for (const part of text.split(",")) {
    const range = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) continue;
    const from = Number(range[1]);
    const to = range[2] === undefined ? from : Number(range[2]);
    for (let level = from; level <= to; level++) levels.add(level + 1);
  }
  return levels;
}

/**
 * Die P1-Kurven von cipher mit der Tabelle vergleichen. Verglichen werden
 * nur Stufen, die der FoE-Helper gemessen hat — gegen seine eigenen
 * Schaetzungen zu pruefen, bringt nur Rauschen.
 *
 * @param {Object<string, {p1: number[], source: string}>} curves
 * @param {Map} rewards Ergebnis von parseRewards
 * @returns {{lines: string[], wikiMismatches: number}} Bericht und Zahl der
 *   Wiki-Werte, die einer Messung widersprechen
 */
function compareCurves(curves, rewards) {
  const lines = [];
  let wikiMismatches = 0;
  let checked = 0;
  let deviating = 0;

  for (const [era, curve] of Object.entries(curves)) {
    const id = ERA_IDS[era];
    if (id === undefined) {
      lines.push(`${era}: kein FoE-Helper-Zeitalter zugeordnet, nicht geprüft.`);
      continue;
    }
    const row = rewards.get(id);
    if (!row) {
      lines.push(`${era}: fehlt in der FoE-Helper-Tabelle, nicht geprüft.`);
      continue;
    }

    const wiki = [];
    const estimates = [];
    let measured = 0;

    for (let i = 0; i < curve.p1.length && i < row.p1.length; i++) {
      const level = i + 1;
      if (row.estimated.has(level) || curve.p1[i] == null) continue;
      measured++;
      if (curve.p1[i] === row.p1[i]) continue;

      const mismatch = { level, ours: curve.p1[i], theirs: row.p1[i] };
      if (curve.source[i] === "w") wiki.push(mismatch);
      else estimates.push(mismatch);
    }

    checked += measured;
    deviating += wiki.length + estimates.length;
    wikiMismatches += wiki.length;

    for (const m of wiki) {
      lines.push(`${era}: Stufe ${m.level} laut Wiki ${m.ours} FP, FoE-Helper misst ${m.theirs} FP.`);
    }
    if (estimates.length) {
      const worst = Math.max(...estimates.map((m) => Math.abs(m.ours - m.theirs)));
      const sample = estimates.slice(0, 3)
        .map((m) => `Stufe ${m.level}: ${m.ours} statt ${m.theirs}`).join(", ");
      lines.push(`${era}: ${estimates.length} geschätzte Werte weichen von der Messung ab ` +
        `(bis ${worst} FP), z. B. ${sample}.`);
    }
    if (row.p1.length > curve.p1.length) {
      lines.push(`${era}: FoE-Helper kennt Stufen bis ${row.p1.length}, cipher bis ${curve.p1.length}.`);
    }
  }

  lines.unshift(`${checked} gemessene Werte verglichen, ${deviating} abweichend, ` +
    `davon ${wikiMismatches} aus dem Wiki.`);
  return { lines, wikiMismatches };
}

module.exports = { ERA_IDS, parseRewards, parseLevels, compareCurves };
