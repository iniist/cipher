/**
 * Browsertests fuer das Bearbeiten direkt in der Tabelle.
 *
 * Die Zahl unter "Einzahlen" oeffnet sich per Tipp in der Zeile: ein Feld,
 * darunter eine schmale Zeile mit der anderen Einheit, dem Umschalter und
 * "Fertig". Es ist derselbe Wert wie im Block "Faktor oder FP je Platz" —
 * nur dort, wo man ihn sieht.
 */
const { test, expect } = require("@playwright/test");

const zahl = (page, slot) => page.locator(`[data-pay-open="${slot}"]`);
const feld = (page) => page.locator("#rows .pay-in");
const zusatz = (page) => page.locator("#rows tr.pay-edit");
const blockFeld = (page, slot) => page.locator(`.slot-list li[data-slot="${slot}"] input`);

async function frontenac(page) {
  await page.goto("/index.html");
  await page.locator("#building").selectOption("Château_Frontenac", { force: true });
  await page.fill("#level", "198");
  await page.fill("#factor", "2,00");
  await page.locator("#level").blur();
  await expect(zahl(page, 1)).toHaveText("3.200");
}

test("ein Tipp auf die Zahl oeffnet das Feld in der Zeile, in FP", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 1).click();

  await expect(feld(page)).toBeFocused();
  await expect(feld(page)).toHaveValue("3.200");
  await expect(feld(page)).toHaveAttribute("inputmode", "numeric");
  await expect(zusatz(page)).toContainText("≙ Faktor 2,00");
  // Die Zusatzzeile zaehlt nur, solange sie offen ist.
  await expect(page.locator("#rows tr")).toHaveCount(6);
  // Der Block oben bleibt dabei zu.
  await expect(page.locator("#slots")).not.toHaveAttribute("open", "");
});

test("getippt wird mitgerechnet, und der Platz ist danach eigen", async ({ page }) => {
  await frontenac(page);
  const vorher = await page.locator("#sumExternal").getAttribute("data-value");

  await zahl(page, 1).click();
  await feld(page).fill("3.500");
  await expect(feld(page)).toBeFocused();
  await expect(page.locator("#sumExternal")).not.toHaveAttribute("data-value", vorher);
  await expect(zusatz(page)).toContainText("≙ Faktor 2,19");

  await feld(page).press("Enter");
  await expect(zusatz(page)).toHaveCount(0);
  await expect(page.locator("#rows tr")).toHaveCount(5);
  await expect(zahl(page, 1)).toHaveText("3.500");
  await expect(zahl(page, 1)).toBeFocused();
  await expect(page.locator("#rows tr").nth(1)).toHaveClass(/own/);

  // Derselbe Wert steht im Block oben.
  await page.locator("#slots summary").click();
  await expect(blockFeld(page, 1)).toHaveValue("3.500");
});

test("umgeschaltet auf Faktor wird ein Faktor getippt", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 0).click();
  await zusatz(page).locator('[data-pay-unit="factor"]').click();

  await expect(feld(page)).toHaveValue("2,00");
  await expect(feld(page)).toBeFocused();
  await feld(page).fill("1,90");
  await expect(zusatz(page)).toContainText("≙ 6.080 FP");

  await zusatz(page).locator(".pay-edit-done").click();
  await expect(zahl(page, 0)).toHaveText("6.080");

  // Ein Platz mit eigenem Faktor oeffnet wieder in Faktor.
  await zahl(page, 0).click();
  await expect(feld(page)).toHaveValue("1,90");
});

test("Zuruecknehmen laesst den Platz wieder dem Faktor oben folgen", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 2).click();
  await expect(zusatz(page).locator(".pay-edit-reset")).toBeHidden();
  await feld(page).fill("1.500");
  await expect(zusatz(page).locator(".pay-edit-reset")).toBeVisible();

  await zusatz(page).locator(".pay-edit-reset").click();
  await expect(zusatz(page)).toHaveCount(0);
  await expect(zahl(page, 2)).toHaveText("1.070");
  await expect(page.locator("#rows tr").nth(2)).not.toHaveClass(/own/);
});

test("ein Tipp daneben schliesst, ein Tipp auf eine andere Zahl oeffnet die", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 1).click();
  await zahl(page, 3).click();
  await expect(zusatz(page)).toHaveCount(1);
  await expect(feld(page)).toHaveValue("270");

  await page.locator("h2").first().click();
  await expect(zusatz(page)).toHaveCount(0);
  await expect(feld(page)).toHaveCount(0);
});

test("ein abgewaehlter Platz laesst sich nicht oeffnen", async ({ page }) => {
  await frontenac(page);
  const haken = page.locator('#rows input[data-slot="4"]');
  // Angeboten -> vergeben -> nicht angeboten.
  await haken.click();
  await haken.click();
  await expect(page.locator("#rows tr").nth(4)).toHaveClass(/off/);
  await expect(zahl(page, 4)).toBeDisabled();
});

test("mit Tab aus dem Feld heraus schliesst es", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 1).focus();
  await page.keyboard.press("Enter");
  await expect(feld(page)).toBeFocused();
  // Feld -> Umschalter -> Fertig; dann aus der Zusatzzeile hinaus.
  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  await expect(zusatz(page)).toHaveCount(0);
});

test("ein Tipp auf die Checkbox darunter trifft die Checkbox", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 1).click();
  await page.locator('#rows input[data-slot="3"]').click();
  await expect(zusatz(page)).toHaveCount(0);
  expect(await page.locator('#rows input[data-slot="3"]').evaluate((box) => box.indeterminate)).toBe(true);
});

test("ein Betrag, der nicht passt, laesst das Feld offen", async ({ page }) => {
  await frontenac(page);
  await zahl(page, 1).click();
  await feld(page).fill("99999");
  await expect(feld(page)).toBeFocused();
  await expect(zusatz(page)).toHaveCount(1);
  await feld(page).fill("3.000");
  await expect(zusatz(page)).toContainText("≙ Faktor");
});
