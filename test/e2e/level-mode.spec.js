/**
 * Browsertests fuer die Lesart der Stufenzahl.
 *
 * Dieselbe Zahl heisst fuer die einen "das Bauwerk steht auf 80", fuer die
 * anderen "es wird gerade auf 81 gezogen". Gerechnet wird immer mit der
 * Stufe, die gefoerdert wird — der Umschalter aendert nur, welche Zahl im
 * Feld steht. Diese Tests halten genau das fest: die Anzeige wandert, der
 * Plan nicht.
 */
const { test, expect } = require("@playwright/test");

const modeButton = (page, mode) => page.locator(`#levelMode button[data-level-mode="${mode}"]`);

/**
 * Die Foerderchat-Zeile mit Einzahlungen. Sie steht ohne Animation da und
 * eignet sich darum als Fingerabdruck des gerechneten Plans — die Summen
 * oben zaehlen hoch und waeren beim Vergleich unzuverlaessig.
 */
const planFingerprint = (page) => page.locator("#chatPoints").textContent();

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.fill("#playerName", "Dani");
});

test("voreingestellt ist die naechste Stufe", async ({ page }) => {
  await expect(page.locator("#levelLabel")).toHaveText("Nächste Stufe");
  await expect(modeButton(page, "next")).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton(page, "current")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#level")).toHaveValue("10");
  // Die Zeile nennt die Zahl, die nicht im Feld steht.
  await expect(page.locator("#levelHint")).toHaveText("Steht aktuell auf Stufe 9.");
});

test("umschalten zaehlt das Feld herunter, laesst den Plan aber stehen", async ({ page }) => {
  await page.fill("#level", "80");
  await page.locator("#level").blur();
  const before = await planFingerprint(page);

  await modeButton(page, "current").click();

  await expect(page.locator("#levelLabel")).toHaveText("Aktuelle Stufe");
  await expect(page.locator("#level")).toHaveValue("79");
  await expect(page.locator("#levelHint")).toHaveText("Gefördert wird Stufe 80.");
  expect(await planFingerprint(page), "derselbe Plan, andere Beschriftung").toBe(before);
});

test("im aktuellen Modus rechnet cipher die Stufe darueber", async ({ page }) => {
  await modeButton(page, "current").click();
  await page.fill("#level", "79");
  await page.locator("#level").blur();
  const asCurrent = await planFingerprint(page);

  await modeButton(page, "next").click();
  await expect(page.locator("#level")).toHaveValue("80");
  expect(await planFingerprint(page)).toBe(asCurrent);
});

test("die Grenzen des Feldes wandern mit", async ({ page }) => {
  await page.locator("#building").selectOption("Tower_of_Babel", { force: true });

  await expect(page.locator("#level")).toHaveAttribute("min", "1");
  await expect(page.locator("#level")).toHaveAttribute("max", "1000");

  // In der Lesart "aktuell" steht ueberall eine Stufe weniger.
  await modeButton(page, "current").click();
  await expect(page.locator("#level")).toHaveAttribute("min", "0");
  await expect(page.locator("#level")).toHaveAttribute("max", "999");

  await page.fill("#level", "9999");
  await page.locator("#level").blur();
  await expect(page.locator("#level")).toHaveValue("999");
});

test("Stufe 0 ist im aktuellen Modus erlaubt und heisst: noch nicht gebaut", async ({ page }) => {
  await modeButton(page, "current").click();
  await page.fill("#level", "0");
  await page.locator("#level").blur();

  await expect(page.locator("#level")).toHaveValue("0");
  await expect(page.locator("#levelHint")).toHaveText("Gefördert wird Stufe 1.");
  // Stufe 1 ist eine echte Stufe, es steht also ein Plan da.
  await expect(page.locator("#rows tr")).toHaveCount(5);
});

test("die erste Stufe wird auch im naechsten Modus benannt", async ({ page }) => {
  await page.fill("#level", "1");
  await page.locator("#level").blur();
  await expect(page.locator("#levelHint")).toHaveText("Noch nicht gebaut.");
});

test("die Stepperknoepfe bewegen die angezeigte Zahl", async ({ page }) => {
  await modeButton(page, "current").click();
  await page.fill("#level", "79");
  await page.locator("#level").blur();

  await page.click("#levelUp");
  await expect(page.locator("#level")).toHaveValue("80");
  await expect(page.locator("#levelHint")).toHaveText("Gefördert wird Stufe 81.");

  await page.click("#levelDown");
  await page.click("#levelDown");
  await expect(page.locator("#level")).toHaveValue("78");
});

test("die Lesart ueberlebt einen Neuladen", async ({ page }) => {
  await page.fill("#level", "64");
  await page.locator("#level").blur();
  await modeButton(page, "current").click();
  await expect(page.locator("#level")).toHaveValue("63");

  await page.reload();
  await expect(modeButton(page, "current")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#levelLabel")).toHaveText("Aktuelle Stufe");
  await expect(page.locator("#level")).toHaveValue("63");
  await expect(page.locator("#levelHint")).toHaveText("Gefördert wird Stufe 64.");
});

test("Favoriten folgen der eingestellten Lesart", async ({ page }) => {
  await page.locator("#building").selectOption("Notre_Dame", { force: true });
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");

  await modeButton(page, "current").click();
  // Derselbe Favorit, dieselbe gerechnete Stufe — nur andersherum beschriftet.
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 41");
  await expect(page.locator("#favSaveText")).toHaveText("Notre Dame · Stufe 41 gemerkt");
  await expect(page.locator("#favList li").first()).toHaveAttribute("aria-current", "true");
});

test("genau eine der beiden Lesarten ist gedrueckt", async ({ page }) => {
  for (const mode of ["current", "next", "current"]) {
    await modeButton(page, mode).click();
    const pressed = await page.locator('#levelMode button[aria-pressed="true"]').count();
    expect(pressed).toBe(1);
    await expect(modeButton(page, mode)).toHaveAttribute("aria-pressed", "true");
  }
});

test("der Umschalter traegt eine Beschriftung fuer Screenreader", async ({ page }) => {
  await expect(page.locator("#levelMode")).toHaveAttribute("role", "group");
  await expect(page.locator("#levelMode")).toHaveAttribute("aria-label", /Zahl/);
  // Das Feld verweist auf die erklaerende Zeile darunter.
  await expect(page.locator("#level")).toHaveAttribute("aria-describedby", "levelHint");
});
