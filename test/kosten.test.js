/**
 * Der Kostendatensatz seit dem Prestige-Update (kosten.js, erzeugt von
 * tools/import-inno.js aus dem Wiki von InnoGames).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const DATA = require("../data.js");
const COSTS = require("../kosten.js");
const Calc = require("../calc.js");

test("jedes Bauwerk hat eine lueckenlose Kostentabelle", () => {
  for (const building of DATA.buildings) {
    const costs = COSTS.costs[building.id];
    assert.ok(costs, building.id);
    assert.equal(costs.length, Calc.hasGold(building.id) ? 500 : 200, building.id);
    assert.ok(costs.every((cost) => Number.isInteger(cost) && cost > 0), building.id);
  }
  assert.equal(Object.keys(COSTS.costs).length, DATA.buildings.length);
});

test("die Ablesungen aus dem Spiel stehen exakt in der Tabelle", () => {
  const seen = [
    ["The_Arc", 189, 136088], ["Castel_del_Monte", 112, 22732],
    ["Saturn_VI_Gate_HYDRA", 89, 28556], ["The_Blue_Galaxy", 103, 13758],
    ["Himeji_Castle", 102, 12781], ["Terracotta_Army", 102, 12781],
    ["Arctic_Orangery", 155, 87593], ["Alcatraz", 122, 38357],
    ["Château_Frontenac", 102, 9237], ["Space_Carrier", 78, 7008],
    ["Observatory", 102, 7604], ["The_Kraken", 112, 26574],
    ["Shattered_Horizon_Siphon", 64, 265600], ["Shattered_Horizon_Siphon", 72, 298800]
  ];
  for (const [id, level, cost] of seen) assert.equal(COSTS.costs[id][level - 1], cost, `${id} ${level}`);
});

test("Gold-Bauwerke kosten bis Stufe 500 so viel wie im Artikel 7009", () => {
  const sum = (id) => COSTS.costs[id].reduce((a, b) => a + b, 0);
  assert.equal(sum("The_Arc"), 755880935);
  assert.equal(sum("Alcatraz"), 755832405);
  assert.equal(sum("The_Blue_Galaxy"), 755944845);
});

test("der Arche-Bonus stimmt mit den Ablesungen aus dem Spiel", () => {
  const { copper, gold } = COSTS.arcBonus;
  assert.equal(copper.length, 500);
  assert.equal(gold.length, 500);
  // Stufe, Kupfer, Gold — Screenshots vom 6.11.2026
  for (const [level, c, g] of [[178, 98, 19], [179, 99, 19], [180, 99, 19], [181, 99, 20], [188, 99, 21], [201, 100, 23]]) {
    assert.equal(copper[level - 1], c, `Kupfer ${level}`);
    assert.equal(gold[level - 1], g, `Gold ${level}`);
  }
  assert.equal(gold[99], 0);
  assert.equal(gold[100], 5);
  assert.equal(copper[193], 100);
});
