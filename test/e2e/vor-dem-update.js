/**
 * Browsertests laufen auf einem Datum vor dem Prestige-Update.
 *
 * Ab dem 5.11.2026 blendet pause.js den Rechner aus. Die Tests pruefen aber
 * den Rechner, nicht den Kalender: Ohne festes Datum wuerden sie ab dem
 * Stichtag alle rot. Darum stellt diese Fixture die Uhr jeder Seite auf
 * einen Tag davor. Timer laufen dabei normal weiter, nur Date.now() steht.
 * Die Pause selbst prueft test/e2e/pause.spec.js mit eigener Uhrzeit.
 */
const base = require("@playwright/test");

const VOR_DEM_UPDATE = new Date("2026-11-01T12:00:00Z");

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(VOR_DEM_UPDATE);
    await use(page);
  }
});

module.exports = { test, expect: base.expect, VOR_DEM_UPDATE };
