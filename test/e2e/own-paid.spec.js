/**
 * Browsertests fuer das Feld "Deine FP schon im Bauwerk".
 *
 * Der Fall aus der Rueckmeldung: Arche 181, P1 zahlt 10.000, P2 9.999 —
 * beide, bevor irgendetwas gesichert war. Ohne Stand rechnet cipher, als
 * haettest du vor P1 schon gesichert, und P3 bis P5 passen nicht mehr.
 * Mit Stand 0 rechnet es vom jetzigen Bauwerk aus.
 */
const { test, expect } = require("@playwright/test");

const summe = (page, id) => page.locator(`#${id}`).getAttribute("data-value");
const sichern = (page) => page.locator("#rows .pre").allTextContents();

async function open(page, extra) {
  await page.goto("/index.html");
  await page.evaluate((extra) => {
    localStorage.setItem("cipher:state", JSON.stringify(Object.assign({
      building: "The_Arc",
      level: 181,
      factor: 200,
      enabled: [true, true, true, true, true],
      taken: [true, true, false, false, false],
      slotPays: [10000, 9999, null, null, null]
    }, extra || {})));
  }, extra);
  await page.reload();
}

test("ohne vergebenen Platz bleibt das Feld weg", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#ownIn")).toBeHidden();
});

test("leer rechnet wie bisher, mit Stand 0 passen P3 bis P5", async ({ page }) => {
  await open(page);
  await expect(page.locator("#ownIn")).toBeVisible();
  await expect.poll(() => sichern(page)).toEqual(
    ["vergeben", "vergeben", "passt nicht", "passt nicht", "passt nicht"]);

  await page.locator("#ownPaid").fill("0");
  await expect.poll(() => sichern(page)).toEqual(
    ["vergeben", "vergeben", "+43.715", "+600", "+190"]);
  await expect.poll(() => summe(page, "lumpValue")).toBe("44505");
  await expect.poll(() => summe(page, "sumOwn")).toBe("44565");
  await expect.poll(() => summe(page, "sumExternal")).toBe("21589");
  await expect(page.locator("#warn")).toHaveText("");

  // Leeren fuehrt zurueck zur alten Rechnung.
  await page.locator("#ownPaid").fill("");
  await expect.poll(() => sichern(page)).toEqual(
    ["vergeben", "vergeben", "passt nicht", "passt nicht", "passt nicht"]);
});

test("die Summe beginnt bei dem, was schon drin ist", async ({ page }) => {
  await open(page, { secureMode: "total" });
  await page.locator("#ownPaid").fill("40.000");
  await expect.poll(() => sichern(page)).toEqual(
    ["vergeben", "vergeben", "43.715", "44.315", "44.505"]);
});

test("der Stand gilt nur fuer seine Stufe", async ({ page }) => {
  await open(page);
  await page.locator("#ownPaid").fill("0");
  await expect.poll(() => sichern(page)).toContain("+43.715");
  await page.reload();
  await expect(page.locator("#ownPaid")).toHaveValue("0");

  await page.locator("#levelUp").click();
  await expect(page.locator("#ownPaid")).toHaveValue("");
});
