/**
 * Browsertests fuer den Schalter "Kuerzel".
 *
 * Mit dem Schalter nennt cipher jedes Bauwerk mit seinem Kuerzel aus
 * abbr.js ("AO" statt "Arktische Orangerie") — ueberall, wo es kurz genannt wird.
 * Ein selbst vergebenes Kuerzel gilt in beiden Stellungen.
 */
const { test, expect } = require("@playwright/test");

const schalter = (page) => page.locator("#useAbbr");
const feld = (page) => page.locator("#buildingShort");
const chat = (page) => page.locator("#chatPlain");
const merken = (page) => page.locator("#favSaveText");
const zustand = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("cipher:state") || "{}"));

/** Arktische Orangerie mit einem Namen davor. */
async function orangerie(page) {
  await page.goto("/index.html");
  await page.selectOption("#building", "Arctic_Orangery");
  await page.fill("#playerName", "Dani");
}

test.describe("Der Schalter", () => {
  test("ist anfangs aus, und alles steht beim vollen Namen", async ({ page }) => {
    await orangerie(page);
    await expect(schalter(page)).not.toBeChecked();
    await expect(chat(page)).toContainText("Dani Arktische Orangerie");
  });

  test("setzt das Kuerzel in Chat-Zeilen, Merken-Knopf und Platzhalter", async ({ page }) => {
    await orangerie(page);
    await schalter(page).check();

    await expect(chat(page)).toContainText("Dani AO P");
    await expect(page.locator("#chatPoints")).toContainText("Dani AO P");
    await expect(merken(page)).toContainText("AO · Stufe");
    await expect(feld(page)).toHaveAttribute("placeholder", "AO");
  });

  test("laesst das Auswahlfeld beim vollen Namen", async ({ page }) => {
    await orangerie(page);
    await schalter(page).check();
    await expect(page.locator("#building option:checked")).toHaveText("Arktische Orangerie");
  });

  test("wirkt auf die Favoriten-Chips", async ({ page }) => {
    await orangerie(page);
    await page.click("#favSave");
    await expect(page.locator("#favList .fav-n").first()).toHaveText("Arktische Orangerie");

    await schalter(page).check();
    await expect(page.locator("#favList .fav-n").first()).toHaveText("AO");
  });

  test("ueberdauert das Neuladen", async ({ page }) => {
    await orangerie(page);
    await schalter(page).check();
    expect((await zustand(page)).useAbbr).toBe(true);

    await page.reload();
    await expect(schalter(page)).toBeChecked();
    await expect(chat(page)).toContainText("Dani AO");
  });

  test("ist auch ueber seine Beschriftung erreichbar", async ({ page }) => {
    await orangerie(page);
    await expect(schalter(page)).toHaveAccessibleName(/Kürzel statt Namen verwenden/);
    await page.locator(".abbr-toggle").click();
    await expect(schalter(page)).toBeChecked();
  });
});

test.describe("Ein eigenes Kuerzel", () => {
  test("gilt in beiden Stellungen", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("Oran");
    await expect(chat(page)).toContainText("Dani Oran P");

    await schalter(page).check();
    await expect(chat(page)).toContainText("Dani Oran P");
    await expect(feld(page)).toHaveValue("Oran");
  });
});

test.describe("Die Sammlung zieht mit", () => {
  test("tauscht den Namen in gesammelten Zeilen beim Umschalten", async ({ page }) => {
    await orangerie(page);
    await page.click('[data-copy="chatPlain"]');
    await page.selectOption("#building", "Terracotta_Army");
    await page.click('[data-copy="chatPlain"]');

    const zeilen = page.locator("#collList .coll-t");
    await expect(zeilen.nth(0)).toContainText("Dani Arktische Orangerie P");
    await expect(zeilen.nth(1)).toContainText("Dani Terrakotta-Armee P");

    await schalter(page).check();
    await expect(zeilen.nth(0)).toContainText("Dani AO P");
    await expect(zeilen.nth(1)).toContainText("Dani TA P");

    // Und das bleibt so, auch gespeichert.
    const gespeichert = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cipher:collection")).map((entry) => entry.text));
    expect(gespeichert[0]).toMatch(/^Dani AO P/);
    expect(gespeichert[1]).toMatch(/^Dani TA P/);

    await schalter(page).uncheck();
    await expect(zeilen.nth(0)).toContainText("Dani Arktische Orangerie P");
  });

  test("gilt auch ohne Spielernamen", async ({ page }) => {
    await page.goto("/index.html");
    await page.selectOption("#building", "Arctic_Orangery");
    await page.click('[data-copy="chatPlain"]');
    await schalter(page).check();
    await expect(page.locator("#collList .coll-t").first()).toHaveText(/^AO P/);
  });

  test("laesst Zeilen von vorher stehen, wie sie sind", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("cipher:collection", JSON.stringify([
      { id: "Arctic_Orangery", text: "Dani Orangerie P5 P4" }
    ])));
    await page.reload();
    await schalter(page).check();
    await expect(page.locator("#collList .coll-t").first()).toHaveText("Dani Orangerie P5 P4");
  });

  test("bringt Zeilen mit dem frueheren Kurznamen auf den vollen Namen", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("cipher:collection", JSON.stringify([
      { id: "Arctic_Orangery", text: "Dani Orangerie P5", label: "Orangerie", at: 5 }
    ])));
    await page.reload();
    await expect(page.locator("#collList .coll-t").first()).toHaveText("Dani Arktische Orangerie P5");
  });

  test("verwirft eine Stelle, die nicht zur Zeile passt", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("cipher:collection", JSON.stringify([
      { id: "Arctic_Orangery", text: "Dani Orangerie P5", label: "Orangerie", at: 3 }
    ])));
    await page.reload();
    await schalter(page).check();
    await expect(page.locator("#collList .coll-t").first()).toHaveText("Dani Orangerie P5");
  });
});

test.describe("Die Suche", () => {
  test("findet ein Bauwerk ueber sein Kuerzel, auch bei ausgeschaltetem Schalter", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#buildingFilter", "obsi");

    const treffer = page.locator("#filterResults li").first();
    await expect(treffer).toContainText("Observatorium");
    await expect(treffer.locator("span mark")).toHaveText("Obsi");
  });
});

test("ein kurzer Name haelt auf dem Chip mindestens fuenf Zeichen Platz", async ({ page }) => {
  await page.goto("/index.html");
  await page.selectOption("#building", "A.I._Core");
  await page.click("#favSave");
  await schalter(page).check();

  const name = page.locator("#favList .fav-n").first();
  await expect(name).toHaveText("KI");
  const [breite, fuenf] = await name.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:5ch";
    element.parentNode.appendChild(probe);
    const result = [element.getBoundingClientRect().width, probe.getBoundingClientRect().width];
    probe.remove();
    return result;
  });
  expect(breite).toBeGreaterThanOrEqual(fuenf - 0.5);
});
