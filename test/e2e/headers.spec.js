/**
 * Browsertests fuer die Antwort-Header aus netlify.toml.
 *
 * Der Testserver liefert dieselben Header aus wie Netlify. Ein
 * Content-Security-Policy, der die Seite zerlegt, faellt damit hier auf
 * und nicht erst nach dem Deploy.
 */
const { test, expect } = require("@playwright/test");

const PAGES = ["/index.html", "/impressum.html", "/datenschutz.html"];

/** Konsolenfehler und blockierte Anfragen einer Seite einsammeln. */
function collectViolations(page) {
  const violations = [];
  page.on("console", (message) => {
    if (message.type() === "error") violations.push("console: " + message.text());
  });
  page.on("pageerror", (error) => violations.push("pageerror: " + error.message));
  page.on("requestfailed", (request) => {
    violations.push("blockiert: " + request.url() + " — " + (request.failure() || {}).errorText);
  });
  return violations;
}

test.describe("Sicherheits-Header", () => {
  for (const path of PAGES.concat(["/404.html"])) {
    test(`${path} liefert die erwarteten Header`, async ({ request }) => {
      const response = await request.get(path);
      const headers = response.headers();

      expect(headers["referrer-policy"]).toBe("no-referrer");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["content-security-policy"]).toBeTruthy();

      const csp = headers["content-security-policy"];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("connect-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      // Inline-Skripte laufen ueber einen Hash, nicht ueber 'unsafe-inline'.
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    });
  }

  test("Schriften werden lange zwischengespeichert", async ({ request }) => {
    const response = await request.get("/fonts/barlow-semi-condensed-latin-400-normal.woff2");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("immutable");
  });
});

test.describe("Content-Security-Policy im Betrieb", () => {
  for (const path of PAGES) {
    test(`${path} laeuft ohne CSP-Verstoss`, async ({ page }) => {
      const violations = collectViolations(page);
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      expect(violations, violations.join("\n")).toEqual([]);
    });
  }

  test("das Inline-Skript fuer das Theme wird ausgefuehrt", async ({ page }) => {
    // Waere der Hash im CSP falsch, bliebe das Theme beim Standard stehen.
    await page.goto("/index.html");
    await page.click('.modes button[data-mode="light"]');

    const violations = collectViolations(page);
    await page.goto("/impressum.html");
    // Das Theme kann nur aus dem Inline-Skript im <head> stammen.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("die Anwendung bleibt unter dem CSP voll bedienbar", async ({ page }) => {
    const violations = collectViolations(page);
    await page.goto("/index.html");

    await page.selectOption("#building", "Notre_Dame");
    await page.fill("#level", "55");
    await page.locator("#level").blur();
    await page.fill("#playerName", "Dani");
    await page.click("#favSave");
    await page.locator('#factorChips button[data-factor="200"]').click();
    await page.locator('#rows input[data-slot="4"]').uncheck();

    await expect(page.locator("#rows tr")).toHaveCount(5);
    await expect(page.locator("#favList li")).toHaveCount(1);
    await expect(page.locator("#chatPlain")).toContainText("Dani");
    // Die Balkenbreiten kommen aus style-Attributen — die braucht style-src.
    await expect(page.locator("#bar i").first()).toHaveAttribute("style", /width/);

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

test.describe("404", () => {
  test("eine unbekannte Adresse liefert die eigene 404-Seite", async ({ page }) => {
    const response = await page.goto("/gibt-es-nicht.html");
    expect(response.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("Nichts eingezeichnet");
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});
