/**
 * Browsertests fuer "Ueberzahlt? Faktor anpassen" und "P5 levelt mit".
 *
 * Arche 80 kostet in den Testkosten 5.464 FP, P1 bringt seit dem
 * Prestige-Update 796. Wer schon 2.950 drin hat, bekommt P3 nicht mehr
 * unter; mit 1,83 fuer alle passen wieder alle fuenf, und 13 FP bleiben
 * zum Leveln.
 */
const { test, expect } = require("./mit-kosten");

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
      ownPaid: 2950,
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
  await expect.poll(() => sichern(page)).toEqual(["Sicher", "Sicher", "passt nicht", "+120", "+37"]);
});

test("ueberzahlt passen mit gesenktem Faktor wieder alle Plaetze", async ({ page }) => {
  await open(page);
  await page.locator("#fitOn").check();

  await expect.poll(() => sichern(page)).toEqual(["Sicher", "Sicher", "Sicher", "Sicher", "Sicher"]);
  await expect.poll(() => kosten(page)).toEqual(["1.457", "728", "243", "60", "13"]);
  await expect(page.locator("#fitHint")).toContainText("Faktor 1,83 statt 1,90");
  await expect(page.locator("#fitHint")).toContainText("13 FP bleiben für dich");
  await expect(page.locator("#standBadge")).toContainText("Faktor 1,83");
  await expect(page.locator("#warn")).toHaveText("");
  // Der eingestellte Faktor bleibt die Obergrenze, er wird nicht ueberschrieben.
  await expect(page.locator("#factor")).toHaveValue("1,90");
  await expect(page.locator("#chatPoints")).toHaveText("Dani Die Arche P5(13) P4(60) P3(243) P2(728) P1(1457)");
});

test("P5 levelt mit, den Rest teilen sich die Plaetze", async ({ page }) => {
  await open(page, { fit: true });
  await expect(page.locator("#fitLevelRow")).toBeVisible();
  await expect(page.locator("#fitLevelLabel")).toHaveText("P5 levelt mit");
  await page.locator("#fitLevel").check();

  // P5 zahlt nicht drauf: die 13 FP gehen nach Belohnung auf P1 bis P3.
  await expect.poll(() => kosten(page)).toEqual(["1.465", "732", "244", "60", "13"]);
  await expect(page.locator("#fitHint")).toContainText("Die übrigen 13 FP teilen sich die Plätze, keiner über Faktor 1,90. P5 schließt die Stufe ab.");
  await expect(page.locator("#lumpText")).toContainText("P5 schließt die Stufe ab, wie unter „Schon im Bauwerk“ gewählt");
  await expect(page.locator("#chatPoints")).toContainText("P5(13) P4(60) P3(244) P2(732) P1(1465)");
});

test("passt selbst 1,00 nicht, fallen die hinteren Plaetze weg", async ({ page }) => {
  await open(page, { fit: true, ownPaid: 4300 });
  await expect(page.locator("#fitHint")).toContainText("Faktor 1,46 statt 1,90");
  await expect(page.locator("#fitHint")).toContainText("P2, P3, P4 und P5 fallen weg");
  await expect.poll(() => sichern(page)).toEqual(["Sicher", "passt nicht", "passt nicht", "passt nicht", "passt nicht"]);
});

test("ohne Ueberzahlung bleibt alles beim Alten", async ({ page }) => {
  await open(page, { fit: true, ownPaid: null });
  await expect(page.locator("#fitHint")).toContainText("Passt mit deinem Faktor 1,90");
  await expect.poll(() => kosten(page)).toEqual(["1.512", "756", "253", "63", "13"]);
});

test("die Schalter ueberleben einen Neuladen", async ({ page }) => {
  await open(page);
  await page.locator("#fitOn").check();
  await page.locator("#fitLevel").check();
  await page.reload();
  await expect(page.locator("#fitOn")).toBeChecked();
  await expect(page.locator("#fitLevel")).toBeChecked();
});

test("die Schalter gelten nur fuer Bauwerk und Stufe", async ({ page }) => {
  await open(page);
  await page.locator("#fitOn").check();
  await page.locator("#fitLevel").check();

  // Eine andere Stufe faengt aus an, wie der Stand selbst.
  await page.locator("#levelUp").click();
  await expect(page.locator("#fitOn")).not.toBeChecked();
  await expect(page.locator("#fitLevelRow")).toBeHidden();
  await expect(page.locator("#ownPaid")).toHaveValue("");
});

test("ein anderer Favorit faengt ohne Anpassung an", async ({ page }) => {
  await open(page, { fit: true });
  await page.evaluate(() => {
    localStorage.setItem("cipher:favorites", JSON.stringify([{ id: "Notre_Dame", level: 42 }]));
  });
  await page.reload();
  await expect(page.locator("#fitOn")).toBeChecked();

  await page.locator(".fav-go").filter({ hasText: "Notre Dame 42" }).click();
  await expect(page.locator("#fitOn")).not.toBeChecked();
  await expect(page.locator("#standBadge")).toBeHidden();
});
