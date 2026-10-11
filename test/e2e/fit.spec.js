/**
 * Browsertests fuer "Ueberzahlt? Faktor anpassen" und "P5 levelt mit".
 *
 * Arche 80 kostet 5.464 FP, P1 bringt 1.375. Mit 1,90 sichert man der Reihe
 * nach 951 FP vor. Wer schon 1.200 drin hat, bekommt P3 nicht mehr unter;
 * mit 1,80 fuer alle passen wieder alle fuenf, und 7 FP bleiben zum Leveln.
 */
const { test, expect } = require("@playwright/test");

const sichern = (page) => page.locator("#rows .pre").allTextContents();
const kosten = (page) => page.locator("#rows td.pay .pay-btn").allTextContents();

async function open(page, extra) {
  await page.goto("/index.html");
  await page.evaluate((extra) => {
    localStorage.setItem("cipher:state", JSON.stringify(Object.assign({
      building: "The_Arc",
      level: 80,
      factor: 190,
      name: "Dani",
      chatMode: "points",
      ownPaid: 1200,
      ownPaidFor: "The_Arc:80"
    }, extra || {})));
  }, extra);
  await page.reload();
}

test("aus ist der Schalter nur ein Angebot", async ({ page }) => {
  await open(page);
  await expect(page.locator("#fitOn")).not.toBeChecked();
  await expect(page.locator("#fitLevelRow")).toBeHidden();
  await expect(page.locator("#fitHint")).toContainText("senkt cipher den Faktor");
  await expect.poll(() => sichern(page)).toEqual(["Sicher", "Sicher", "passt nicht", "+112", "+76"]);
});

test("ueberzahlt passen mit gesenktem Faktor wieder alle Plaetze", async ({ page }) => {
  await open(page);
  await page.locator("#fitOn").check();

  await expect.poll(() => sichern(page)).toEqual(["Sicher", "Sicher", "Sicher", "Sicher", "Sicher"]);
  await expect.poll(() => kosten(page)).toEqual(["2.475", "1.242", "414", "108", "18"]);
  await expect(page.locator("#fitHint")).toContainText("Faktor 1,80 statt 1,90");
  await expect(page.locator("#fitHint")).toContainText("7 FP bleiben für dich");
  await expect(page.locator("#standBadge")).toContainText("Faktor 1,80");
  await expect(page.locator("#warn")).toHaveText("");
  // Der eingestellte Faktor bleibt die Obergrenze, er wird nicht ueberschrieben.
  await expect(page.locator("#factor")).toHaveValue("1,90");
  await expect(page.locator("#chatPoints")).toHaveText("Dani Die Arche P5(18) P4(108) P3(414) P2(1242) P1(2475)");
});

test("P5 levelt mit und zahlt den Rest", async ({ page }) => {
  await open(page, { fit: true });
  await expect(page.locator("#fitLevelRow")).toBeVisible();
  await expect(page.locator("#fitLevelLabel")).toHaveText("P5 levelt mit");
  await page.locator("#fitLevel").check();

  await expect.poll(() => kosten(page)).toEqual(["2.475", "1.242", "414", "108", "25"]);
  await expect(page.locator("#fitHint")).toContainText("P5 zahlt 7 FP mehr und schließt die Stufe ab");
  await expect(page.locator("#lumpText")).toContainText("P5 schließt die Stufe ab, wie unter „Schon im Bauwerk“ gewählt");
  await expect(page.locator("#chatPoints")).toContainText("P5(25)");
});

test("passt selbst 1,00 nicht, fallen die hinteren Plaetze weg", async ({ page }) => {
  await open(page, { fit: true, ownPaid: 3500 });
  await expect(page.locator("#fitHint")).toContainText("Faktor 1,42 statt 1,90");
  await expect(page.locator("#fitHint")).toContainText("P2, P3, P4 und P5 fallen weg");
  await expect.poll(() => sichern(page)).toEqual(["Sicher", "passt nicht", "passt nicht", "passt nicht", "passt nicht"]);
});

test("ohne Ueberzahlung bleibt alles beim Alten", async ({ page }) => {
  await open(page, { fit: true, ownPaid: null, ownPaidFor: "" });
  await expect(page.locator("#fitHint")).toContainText("Passt mit deinem Faktor 1,90");
  await expect.poll(() => kosten(page)).toEqual(["2.613", "1.311", "437", "114", "19"]);
});

test("die Schalter ueberleben einen Neuladen", async ({ page }) => {
  await open(page);
  await page.locator("#fitOn").check();
  await page.locator("#fitLevel").check();
  await page.reload();
  await expect(page.locator("#fitOn")).toBeChecked();
  await expect(page.locator("#fitLevel")).toBeChecked();
});
