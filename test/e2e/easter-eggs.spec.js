/**
 * Browsertests fuer die drei Easter Eggs.
 * Sie duerfen Spass machen, aber niemanden stoeren: bei
 * prefers-reduced-motion bleibt alles ruhig.
 */
const { test, expect } = require("@playwright/test");

test("Konami-Code laesst einen Scan ueber die Blaupause laufen", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#wordmark").focus(); // Fokus raus aus den Eingabefeldern

  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
    await page.keyboard.press(key);
  }

  await expect(page.locator(".scan")).toBeAttached();
  await expect(page.locator(".toast")).toHaveText("Blaupause geprüft");
  await expect(page.locator(".scan")).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 4000 });
});

test("der Konami-Code greift nicht, waehrend man tippt", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#playerName").focus();

  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
    await page.keyboard.press(key);
  }
  await expect(page.locator(".scan")).toHaveCount(0);
});

test("fuenf Tipps auf die Wortmarke zeichnen sie neu", async ({ page }) => {
  await page.goto("/index.html");
  const wordmark = page.locator("#wordmark");

  for (let i = 0; i < 4; i++) await wordmark.click();
  await expect(wordmark).not.toHaveClass(/plotting/);

  await wordmark.click();
  await expect(wordmark).toHaveClass(/plotting/);
  await expect(wordmark.locator("span")).toHaveCount(6); // c-i-p-h-e-r
  await expect(page.locator(".toast")).toHaveText("Neu gezeichnet");

  // Danach steht wieder der schlichte Text da
  await expect(wordmark).not.toHaveClass(/plotting/, { timeout: 3000 });
  await expect(wordmark).toHaveText("cipher");
});

test("der Freigabe-Stempel erscheint bei einem Plan ohne Vorleistung", async ({ page }) => {
  await page.goto("/index.html");

  // Dieser Zuschnitt geht ohne einen einzigen vorgestreckten FP auf und
  // laesst trotzdem noch etwas zum Selberleveln uebrig — das ist selten.
  await page.locator("#building").selectOption("Lotus_Temple", { force: true });
  await page.fill("#level", "37");
  await page.locator("#level").blur();
  await page.locator('#factorChips button[data-factor="200"]').click();

  await expect(page.locator(".stamp")).toBeVisible();
  await expect(page.locator(".stamp")).toContainText("Freigegeben");
  await expect(page.locator("#lumpValue")).toHaveText("0");

  // Nur einmal je Besuch
  await expect(page.locator(".stamp")).toHaveCount(0, { timeout: 4000 });
  await page.fill("#level", "38");
  await page.locator("#level").blur();
  await page.waitForTimeout(200);
  await expect(page.locator(".stamp")).toHaveCount(0);
});

test.describe("mit prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("bleiben die Animationen aus, die Hinweise aber lesbar", async ({ page }) => {
    await page.goto("/index.html");

    // Kein Stempel, auch nicht bei einem perfekten Zuschnitt
    await page.locator("#building").selectOption("Lotus_Temple", { force: true });
    await page.fill("#level", "37");
    await page.locator("#level").blur();
    await page.locator('#factorChips button[data-factor="200"]').click();
    await expect(page.locator(".stamp")).toHaveCount(0);

    // Konami meldet sich, ohne den Lichtstrahl zu zeigen
    await page.locator("#wordmark").focus();
    for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
      await page.keyboard.press(key);
    }
    await expect(page.locator(".toast")).toHaveText("Blaupause geprüft");
    await expect(page.locator(".scan")).toHaveCount(0);

    // Die Wortmarke bleibt ein schlichter Text
    const wordmark = page.locator("#wordmark");
    for (let i = 0; i < 5; i++) await wordmark.click();
    await expect(wordmark).not.toHaveClass(/plotting/);
    await expect(wordmark).toHaveText("cipher");
  });
});
