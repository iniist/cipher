/**
 * Misst, ab welcher Spreizung der Arche-Faktoren ein tieferer Maezen-Platz
 * teurer werden kann als ein hoeherer.
 *
 *   node tools/order-scan.js                     (die Bereiche aus der README)
 *   node tools/order-scan.js 170-200 120-200     (eigene Bereiche)
 *
 * Hintergrund: Die Belohnungen werden auf 5 gerundet, halbieren sich von
 * Platz zu Platz also nicht exakt. Jeder Platz hat einen eigenen Faktor, und
 * der schlechteste Fall ist immer derselbe — der bessere Platz zahlt mit dem
 * schwaechsten Faktor des Bereichs, der schlechtere mit dem staerksten.
 *
 * Gezaehlt wird, bei wie vielen der verschiedenen P1-Werte des Datensatzes
 * dabei ein Platz mit **echt kleinerer** Belohnung mehr kostet als der Platz
 * ueber ihm. Zwei Plaetze mit derselben Belohnung — P1 und P2 fallen bei
 * 5 FP beide auf 5 — bleiben aussen vor: dort dreht schon jeder Unterschied
 * im Faktor die Reihenfolge, und eine kleinere Belohnung ueberholt nichts.
 * Dieser Fall steht als Fussnote in der README.
 *
 * Die Zahlen in der README stammen aus diesem Lauf. Nach einem Datenimport
 * also erneut laufen lassen und die Tabelle dort nachziehen.
 */
"use strict";

const Calc = require("../calc.js");
const DATA = require("../data.js");

const DEFAULT_RANGES = [[180, 200], [150, 200], [100, 200]];

/** Jeden P1-Wert des Datensatzes einmal, aufsteigend. */
function p1Values() {
  const seen = new Set();
  for (const name of Object.keys(DATA.curves)) {
    for (const value of DATA.curves[name].p1) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Kostet bei diesem P1 ein Platz mit kleinerer Belohnung mehr als der
 * Platz ueber ihm? `low` ist der schwaechste Faktor des Bereichs, `high`
 * der staerkste — beide in Prozentpunkten, so wie buildPlan sie nimmt.
 */
function inverts(p1, low, high) {
  const rewards = Calc.rewardChain(p1);
  for (let slot = 1; slot < rewards.length; slot++) {
    if (rewards[slot] >= rewards[slot - 1]) continue;
    if (Calc.contribution(rewards[slot], high) > Calc.contribution(rewards[slot - 1], low)) return true;
  }
  return false;
}

function parseRange(argument) {
  const match = /^(\d+)-(\d+)$/.exec(argument);
  if (!match) throw new Error(`Bereich erwartet als "180-200", bekommen: ${argument}`);
  return [Number(match[1]), Number(match[2])];
}

function format(factor) {
  return (factor / 100).toFixed(2).replace(".", ",");
}

function main(argv) {
  const ranges = argv.length ? argv.map(parseRange) : DEFAULT_RANGES;
  const values = p1Values();

  console.log(`Datensatz vom ${DATA.generated}: ${values.length} verschiedene P1-Werte\n`);
  console.log("| Bereich | Fälle mit vertauschter Reihenfolge |");
  console.log("| --- | --- |");
  for (const [low, high] of ranges) {
    const hits = values.filter((value) => inverts(value, low, high)).length;
    console.log(`| ${format(low)} – ${format(high)} | ${hits} |`);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { p1Values, inverts };
