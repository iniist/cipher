/**
 * Helfer fuer das Menue.
 *
 * Name, Darstellung und Kuerzel-Schalter stehen im Menue. Wer sie in einem
 * Test setzt, oeffnet es, stellt ein und schliesst es wieder — wie jemand,
 * der die Seite bedient.
 */
const { expect } = require("@playwright/test");

/** Das Menue oeffnen, `aktion` ausfuehren, das Menue wieder schliessen. */
async function imMenue(page, aktion) {
  await page.click("#settingsPick");
  await expect(page.locator("#settings")).toBeVisible();
  await aktion();
  await page.click("#settingsClose");
  await expect(page.locator("#settings")).toBeHidden();
}

async function nameEintragen(page, name) {
  await imMenue(page, () => page.fill("#playerName", name));
}

async function themaWaehlen(page, theme) {
  await imMenue(page, () => page.click(`.modes button[data-mode="${theme}"]`));
}

module.exports = { imMenue, nameEintragen, themaWaehlen };
