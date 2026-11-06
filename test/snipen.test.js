/**
 * Snipen: Gewinngrenze mit Arche-Bonus und der Betrag, ab dem ein Platz in
 * einem fremden Bauwerk sicher ist (Calc.snipePlaces).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Calc = require("../calc.js");
const COSTS = require("../kosten.js");

/** Arche 183 eines Nachbarn, Screenshot vom 6.11.2026: 34.456 / 127.430. */
const ARCHE_183 = Calc.rewardsFromCost(COSTS.costs.The_Arc[182], 183, true);

test("der Bonus wird gerundet wie im Spiel", () => {
  // Tooltip: 11124 FP +2.336, 94723 Medaillen +19.892, 13 Kupfer-BP +3, 8 Gold-BP +2
  assert.equal(Calc.arcExtra(11124, 21), 2336);
  assert.equal(Calc.arcExtra(94723, 21), 19892);
  assert.equal(Calc.arcExtra(13, 21), 3);
  assert.equal(Calc.arcExtra(8, 21), 2);
});

test("Gewinngrenze ist Belohnung plus Bonus, sicher ab der Hälfte von offen", () => {
  const [p1] = Calc.snipePlaces({ rewards: ARCHE_183, open: 127430 - 34456, taken: [], bonus: 21 });
  assert.equal(p1.reward, 11124);
  assert.equal(p1.value, 13460);
  assert.equal(p1.safe, 46487);
  assert.equal(p1.status, "riskant");
  assert.equal(p1.pay, 13460);
  assert.equal(p1.threat, 13461);
});

test("wer schon auf dem Platz steht, kann nachlegen", () => {
  // Offen 3.000, belegt 5.000 / 2.000 / 900.
  const rows = Calc.snipePlaces({ rewards: ARCHE_183, open: 3000, taken: [900, 5000, 2000], bonus: 21 });
  assert.equal(rows[0].status, "zu");
  // P2: (3000 + 2000) / 2 = 2500; danach sind 500 offen, 2000 + 500 = 2500 reicht nicht vorbei.
  assert.deepEqual([rows[1].status, rows[1].safe, rows[1].profit], ["lohnt", 2500, 6730 - 2500]);
  // P3: (3000 + 900) / 2 = 1950, aufgerundet.
  assert.deepEqual([rows[2].status, rows[2].safe], ["lohnt", 1950]);
  // P4 ist frei: 1 FP genügt zum Nehmen, sicher erst mit 1500.
  assert.deepEqual([rows[3].status, rows[3].take, rows[3].safe], ["riskant", 1, 1500]);
});

test("bei Gleichstand bleibt vorn, wer zuerst da war", () => {
  // 1000 auf P1, offen 1000: 1000 reichen nicht zum Nehmen, 1001 schon.
  const [p1] = Calc.snipePlaces({ rewards: [5000], open: 1000, taken: [1000], bonus: 0 });
  assert.equal(p1.take, 1001);
  assert.equal(p1.status, "zu");
  const [p1b] = Calc.snipePlaces({ rewards: [5000], open: 1001, taken: [1000], bonus: 0 });
  assert.deepEqual([p1b.take, p1b.safe, p1b.status], [1001, 1001, "lohnt"]);
});

test("zu teuer, wenn schon der Platz mehr kostet als er bringt", () => {
  const [p1] = Calc.snipePlaces({ rewards: [100], open: 5000, taken: [300], bonus: 0 });
  assert.equal(p1.status, "teuer");
});

test("Plätze ohne Belohnung tauchen als leer auf", () => {
  const rows = Calc.snipePlaces({ rewards: [10, 0], open: 100, taken: [], bonus: 0 });
  assert.equal(rows[1].status, "leer");
});

test("der Preis einer Blaupause, wenn man für sie draufzahlt", () => {
  // 8 Gold-BP + 2 Bonus = 10; 1.000 FP Verlust → 100 FP je Blaupause.
  assert.equal(Calc.blueprintPrice(1000, 8, 21), 100);
  assert.equal(Calc.blueprintPrice(1000, 0, 21), null);
});
