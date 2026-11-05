/**
 * Browsertests mit eingetragenen Gesamtkosten.
 *
 * Seit dem Prestige-Update rechnet cipher nur mit Gesamt-FP, die aus dem
 * Spiel eingetragen sind (cipher:costs). Die meisten Tests pruefen aber
 * den Plan, nicht das Eintragen. Diese Fixture legt darum vor dem ersten
 * Laden fuer jedes Bauwerk Gesamtkosten fuer die Stufen 1 bis 400 ab, so
 * als haette sie jemand eingetragen. Als Zahlen dienen die Kosten des
 * Datensatzes: Sie sind plausibel und machen Summen nachrechenbar.
 *
 * Einmal je Test, nicht bei jedem Laden: Wer im Test den Speicher leert
 * (Datenschutzseite, Welten), soll danach wirklich leeren Speicher haben.
 * Das Eintragen selbst prueft test/e2e/kosten.spec.js ohne diese Fixture.
 */
const base = require("@playwright/test");
const DATA = require("../../data.js");
const Calc = require("../../calc.js");

const BIS_STUFE = 400;

const KOSTEN = {};
DATA.buildings.forEach((building) => {
  if (building.base == null) return;
  for (let level = 1; level <= BIS_STUFE; level++) {
    KOSTEN[building.id + ":" + level] = Calc.totalCost(building, level, {}).value;
  }
});

/** Gesamtkosten, mit denen die Tests rechnen. */
function kosten(id, level) {
  return KOSTEN[id + ":" + level];
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((json) => {
      try {
        if (sessionStorage.getItem("test:kosten")) return;
        sessionStorage.setItem("test:kosten", "1");
        localStorage.setItem("cipher:costs", json);
      } catch (error) { /* Speicher gesperrt: dann ohne */ }
    }, JSON.stringify(KOSTEN));
    await use(page);
  }
});

module.exports = { test, expect: base.expect, kosten, KOSTEN };
