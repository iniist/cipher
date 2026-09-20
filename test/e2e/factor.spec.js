/**
 * Browsertests fuer den Arche-Faktor.
 *
 * Der Faktor lief frueher ueber einen Schieberegler. Auf dem Telefon sprang
 * dessen Wert schon beim Aufsetzen des Fingers dorthin, wo man ihn hinsetzte
 * — beim Scrollen also staendig unbemerkt. Die Tests unten halten beides
 * fest: dass der Stepper das kann, was der Regler konnte, und dass die
 * Scrollfalle weg ist.
 */
const { test, expect } = require("@playwright/test");

const factor = (page) => page.locator("#factor");

test.describe("Bedienung", () => {
  test.beforeEach(async ({ page }) => await page.goto("/index.html"));

  test("zeigt den Faktor in deutscher Schreibweise", async ({ page }) => {
    await expect(factor(page)).toHaveValue("1,90");
  });

  test("die Knöpfe gehen eine Stufe auf und ab", async ({ page }) => {
    await page.click("#factorUp");
    await expect(factor(page)).toHaveValue("1,91");
    await page.click("#factorDown");
    await page.click("#factorDown");
    await expect(factor(page)).toHaveValue("1,89");
  });

  test("an den Grenzen schalten sich die Knöpfe ab", async ({ page }) => {
    await page.locator('#factorChips button[data-factor="200"]').click();
    await expect(page.locator("#factorUp")).toBeDisabled();
    await expect(page.locator("#factorDown")).toBeEnabled();

    await page.locator('#factorChips button[data-factor="185"]').click();
    await expect(page.locator("#factorDown")).toBeDisabled();
    await expect(page.locator("#factorUp")).toBeEnabled();
  });

  test("der Plan rechnet mit, wenn der Faktor sich ändert", async ({ page }) => {
    await page.fill("#level", "80");
    await page.locator("#level").blur();
    const before = await page.locator("#rows td.pay").first().textContent();

    await page.locator('#factorChips button[data-factor="200"]').click();
    await expect(page.locator("#rows td.pay").first()).not.toHaveText(before);
  });

  test("Pfeiltasten ändern den Wert", async ({ page }) => {
    await factor(page).focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(factor(page)).toHaveValue("1,92");
    await page.keyboard.press("ArrowDown");
    await expect(factor(page)).toHaveValue("1,91");
  });

  test("die Schnellwahl setzt den Wert", async ({ page }) => {
    await page.locator('#factorChips button[data-factor="195"]').click();
    await expect(factor(page)).toHaveValue("1,95");
    await expect(page.locator('#factorChips button[data-factor="195"]')).toHaveClass(/on/);
  });
});

test.describe("Eingabe von Hand", () => {
  test.beforeEach(async ({ page }) => await page.goto("/index.html"));

  // Was Leute tatsächlich tippen, soll ankommen.
  const SCHREIBWEISEN = [
    ["1,93", "1,93"],
    ["1.93", "1,93"],
    ["1,9", "1,90"],
    ["193", "1,93"],
    ["193 %", "1,93"],
    ["2", "2,00"]
  ];

  for (const [eingabe, erwartet] of SCHREIBWEISEN) {
    test(`"${eingabe}" wird als ${erwartet} gelesen`, async ({ page }) => {
      await factor(page).fill(eingabe);
      await factor(page).blur();
      await expect(factor(page)).toHaveValue(erwartet);
    });
  }

  test("Werte außerhalb des Bereichs werden begrenzt", async ({ page }) => {
    await factor(page).fill("3,50");
    await factor(page).blur();
    await expect(factor(page)).toHaveValue("2,00");

    await factor(page).fill("1,00");
    await factor(page).blur();
    await expect(factor(page)).toHaveValue("1,85");
  });

  test("Unsinn lässt den letzten gültigen Wert stehen", async ({ page }) => {
    await page.locator('#factorChips button[data-factor="195"]').click();
    await factor(page).fill("abc");
    await factor(page).blur();
    await expect(factor(page)).toHaveValue("1,95");
  });

  test("der Wert überlebt einen Neuladen", async ({ page }) => {
    await factor(page).fill("1,97");
    await factor(page).blur();
    await page.reload();
    await expect(factor(page)).toHaveValue("1,97");
  });
});

test.describe("Anzeigebalken", () => {
  test.beforeEach(async ({ page }) => await page.goto("/index.html"));

  // Die Breite laeuft animiert auf ihren Wert zu, also auf den Endstand
  // warten statt mittendrin zu messen. Der Rahmen des Containers zaehlt bei
  // getBoundingClientRect mit, darum kommt 100 % als knapp 0,99 an.
  const gaugeWidth = (page) => expect.poll(() => page.locator("#factorGauge").evaluate((el) =>
    Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100)));

  test("zeigt die Lage im Bereich", async ({ page }) => {
    await page.locator('#factorChips button[data-factor="185"]').click();
    await gaugeWidth(page).toBe(0);

    await page.locator('#factorChips button[data-factor="200"]').click();
    await gaugeWidth(page).toBeGreaterThan(98);

    // 1,90 liegt bei einem Drittel zwischen 1,85 und 2,00.
    await page.locator('#factorChips button[data-factor="190"]').click();
    await gaugeWidth(page).toBeGreaterThan(30);
    await page.locator('#factorChips button[data-factor="190"]').click();
    await gaugeWidth(page).toBeLessThan(36);
  });

  test("ist kein Bedienelement", async ({ page }) => {
    const gauge = page.locator(".fac-gauge");
    expect(await gauge.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    expect(await gauge.evaluate((el) => el.getAttribute("aria-hidden"))).toBe("true");
    expect(await gauge.evaluate((el) => el.querySelectorAll("input, button, a").length)).toBe(0);
  });
});

test.describe("keine Scrollfalle mehr", () => {
  test("Wischen über die Faktor-Zeile ändert den Wert nicht", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Berührungsgesten gibt es nur im mobilen Projekt");
    await page.goto("/index.html");

    const start = await page.locator(".fac").evaluate((el) => {
      const r = el.getBoundingClientRect();
      // Mitten auf das Bedienelement — genau dort, wo der Regler früher
      // seinen Wert hingesetzt hätte.
      return { x: Math.round(r.left + r.width * 0.75), y: Math.round(r.top + r.height / 2) };
    });

    const before = await factor(page).inputValue();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y }]
    });

    await touch("touchStart", start.x, start.y);
    for (let dy = 10; dy <= 120; dy += 20) await touch("touchMove", start.x + 2, start.y - dy);
    await touch("touchEnd", start.x, start.y - 120);
    await page.waitForTimeout(300);

    expect(await factor(page).inputValue(), "der Faktor darf sich beim Scrollen nicht ändern").toBe(before);
    expect(await page.evaluate(() => window.scrollY), "die Seite muss dabei scrollen").toBeGreaterThan(0);
  });

  test("es gibt keinen Schieberegler mehr", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator('input[type="range"]')).toHaveCount(0);
  });
});
