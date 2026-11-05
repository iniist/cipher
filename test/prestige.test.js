/**
 * Die Belohnungsregel seit dem Prestige-Update (5.11.2026), geprueft an
 * Ablesungen aus dem Spiel (deutscher Server, 5.11.2026).
 *
 * Jede Zeile: Bauwerk, geförderte Stufe, Gesamtkosten, Belohnungen P1..Pn
 * wie im Tooltip. null heisst: nicht abgelesen.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Calc = require("../calc.js");

const ABLESUNGEN = [
  ["The_Arc", 189, 136088, [11880, 5940, 1980, 495, 99, 17, 2]],
  ["Castel_del_Monte", 112, 22732, [1984, 992, 331, 83, 17, 4, 0]],
  ["Saturn_VI_Gate_HYDRA", 89, 28556, [4159, 2079, 693, 173, 35]],
  ["The_Blue_Galaxy", 103, 13758, [1201]],
  ["Himeji_Castle", 102, 12781, [1116]],
  ["Arctic_Orangery", 155, 87593, [7647]],
  ["Alcatraz", 122, 38357, [3348]],
  ["Château_Frontenac", 102, 9237, [806]],
  ["Space_Carrier", 78, 7008, [1021]],
  ["Observatory", 102, 7604, [664]],
  ["Terracotta_Army", 102, 12781, [1116]],
  ["The_Kraken", 112, 26574, [2320]]
];

test("jede Ablesung aus dem Spiel trifft die Regel exakt", () => {
  for (const [id, level, cost, seen] of ABLESUNGEN) {
    const rewards = Calc.rewardsFromCost(cost, level, Calc.isGold(id, level));
    seen.forEach((value, index) => {
      assert.equal(rewards[index], value, `${id} Stufe ${level} P${index + 1}`);
    });
  }
});

test("Gold-Stufen haben 7 Plätze, Kupfer-Stufen 5", () => {
  assert.equal(Calc.rewardsFromCost(22732, 112, true).length, 7);
  assert.equal(Calc.rewardsFromCost(28556, 89, false).length, 5);
});

test("Gold gilt für Gold-Bauwerke ab Stufe 101, sonst Kupfer", () => {
  assert.equal(Calc.isGold("The_Arc", 100), false);
  assert.equal(Calc.isGold("The_Arc", 101), true);
  assert.equal(Calc.isGold("Space_Carrier", 78), false);
  assert.equal(Calc.isGold("Tower_of_Babel", 150), false);
});

test("Bauwerke ohne Gold-Kategorie enden bei Stufe 200", () => {
  assert.equal(Calc.maxLevelOf("Tower_of_Babel"), 200);
  assert.equal(Calc.maxLevelOf("The_Arc"), null);
});

test("Mäzen-Anteil je Stufenbereich laut Artikel 7011", () => {
  const cases = [[1, 25], [9, 25], [10, 30], [39, 30], [40, 40], [69, 40], [70, 25],
    [100, 25], [101, 15], [200, 15], [201, 10], [300, 10], [301, 7], [400, 7], [401, 5], [500, 5], [650, 5]];
  for (const [level, share] of cases) assert.equal(Calc.rewardShare(level), share, `Stufe ${level}`);
});

test("die Gewichte sind die normierte alte Kette", () => {
  const five = Calc.placeWeights(5);
  assert.ok(Math.abs(five.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(Math.abs(five[0] - 0.582524) < 1e-6);
  assert.ok(Math.abs(five[1] / five[0] - 1 / 2) < 1e-12);
  assert.ok(Math.abs(five[4] / five[3] - 1 / 5) < 1e-12);
  const seven = Calc.placeWeights(7);
  assert.ok(Math.abs(seven[0] - 0.581986) < 1e-6);
  assert.ok(Math.abs(seven[6] / seven[5] - 1 / 7) < 1e-12);
});

test("3 FP lassen sich nicht auszahlen und werden zu 4", () => {
  assert.equal(Calc.roundReward(2.76), 4);
  assert.equal(Calc.roundReward(3.4), 4);
  assert.equal(Calc.roundReward(2.4), 2);
  assert.equal(Calc.roundReward(0.39), 0);
});

test("ein Plan aus den Belohnungen rechnet mit allen 7 Plätzen", () => {
  const rewards = Calc.rewardsFromCost(22732, 112, true);
  const plan = Calc.buildPlan({
    total: 22732,
    rewards,
    factor: 100,
    enabled: [true, true, true, true, true, true, true]
  });
  assert.equal(plan.rows.length, 7);
  assert.deepEqual(plan.rows.map((row) => row.reward), [1984, 992, 331, 83, 17, 4, 0]);
  // P7 bringt keine FP und wird nicht angeboten.
  assert.equal(plan.rows[6].offered, false);
  assert.equal(plan.rows[5].offered, true);
  assert.equal(plan.total, 22732);
  assert.equal(plan.external + plan.ownShare, 22732);
});
