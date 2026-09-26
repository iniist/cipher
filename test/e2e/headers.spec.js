/**
 * Browsertests fuer die Antwort-Header aus netlify.toml.
 *
 * Der Testserver liefert dieselben Header aus wie Netlify. Ein
 * Content-Security-Policy, der die Seite zerlegt, faellt damit hier auf
 * und nicht erst nach dem Deploy.
 */
const { test, expect } = require("@playwright/test");
const { abwaehlen } = require("./plaetze");
const path = require("node:path");
const fs = require("node:fs");

const PAGES = ["/index.html", "/impressum.html", "/datenschutz.html", "/rundgang.html"];

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
      // Inline-Skripte laufen ueber einen Hash, Stile ueber Klassen und
      // element.style — 'unsafe-inline' kommt nirgends mehr vor.
      expect(csp).toContain("style-src 'self';");
      expect(csp).not.toContain("'unsafe-inline'");

      // Netlify erzwingt HTTPS nur per Weiterleitung; HSTS haelt den Browser
      // ganz von http fern.
      expect(headers["strict-transport-security"]).toMatch(/max-age=\d{7,}/);

      // FLoC ist Geschichte; das unbekannte Feature liess Chrome bei jedem
      // Aufruf einen Fehler in die Konsole schreiben.
      expect(headers["permissions-policy"]).not.toContain("interest-cohort");
      expect(headers["permissions-policy"]).toContain("camera=()");
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

    await page.locator("#building").selectOption("Notre_Dame", { force: true });
    await page.fill("#level", "55");
    await page.locator("#level").blur();
    await page.fill("#playerName", "Dani");
    await page.click("#favSave");
    await page.locator('#factorChips button[data-factor="200"]').click();
    await abwaehlen(page, 4);

    await expect(page.locator("#rows tr")).toHaveCount(5);
    await expect(page.locator("#favList li")).toHaveCount(1);
    await expect(page.locator("#chatPlain")).toContainText("Dani");
    // Die Balkenbreiten setzt JS ueber element.style. Das landet zwar als
    // style-Attribut im DOM, zaehlt fuer den CSP aber nicht als Inline-Stil —
    // genau deshalb kommt style-src ohne 'unsafe-inline' aus.
    await expect(page.locator("#bar i").first()).toHaveAttribute("style", /width/);
    // Und die Platzfarben kommen aus Klassen, nicht aus Attributen.
    await expect(page.locator("#rows .tag").first()).toHaveClass(/slot-1/);
    expect(await page.locator("#rows .tag").first().getAttribute("style")).toBeNull();

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

test.describe("Werkzeuge nicht öffentlich", () => {
  // Der Datenimporter und die Tests liegen im Repo, gehören aber nicht zur
  // Website. Weil `publish = "."` alles ausliefert, liegen die Dateien im
  // Deploy — und Netlify wendet eine Weiterleitung auf einen Pfad mit
  // existierender Datei nur an, wenn sie `force = true` trägt. Der
  // Testserver bildet genau diese Regel nach; darum prüft der Test die
  // Wirkung und nicht nur den Text der Regel.
  const HIDDEN = ["/tools/import.html", "/tools/serve.js", "/test/e2e/app.spec.js", "/test/calc.test.js"];

  for (const hidden of HIDDEN) {
    test(`${hidden} liegt im Deploy, antwortet aber mit 404`, async ({ request }) => {
      const response = await request.get(hidden);
      expect(response.status()).toBe(404);
      // Nicht der Dateiinhalt, sondern die eigene Fehlerseite.
      expect(await response.text()).toContain("Nichts eingezeichnet");
    });
  }

  test("die Regeln tragen force — ohne das würden sie von den Dateien überdeckt", async ({ request }) => {
    // Der Text der Regel ist hier zweite Sicherung: der Testserver liest
    // dieselbe Datei, aber falls jemand den Server ändert, bleibt das hier.
    // Von der Platte gelesen — über den Server ist netlify.toml selbst 404.
    const toml = fs.readFileSync(path.resolve(__dirname, "../../netlify.toml"), "utf8");
    for (const prefix of ["/tools/*", "/test/*"]) {
      const block = toml.slice(toml.indexOf(`from = "${prefix}"`));
      expect(block.slice(0, 120)).toMatch(/force = true/);
    }
  });

  test("die Netlify-Adresse leitet dauerhaft auf die eigene Domain um", async () => {
    // Nur auf Netlify pruefbar; hier steht fest, dass die Regel da ist, als
    // erste Weiterleitung, mit Pfad, 301 und force.
    const toml = fs.readFileSync(path.resolve(__dirname, "../../netlify.toml"), "utf8");
    const first = toml.slice(toml.indexOf("[[redirects]]"));
    expect(first).toMatch(/^\[\[redirects\]\]\s+from = "https:\/\/cipher-calc\.netlify\.app\/\*"\s+to = "https:\/\/foe-foerderrechner\.com\/:splat"\s+status = 301\s+force = true/);
  });

  test("der Importer läuft direkt als Datei und lädt nichts von Dritten", async ({ page }) => {
    // Ueber den Server ist er absichtlich nicht mehr erreichbar; zum
    // Arbeiten oeffnet man ihn als Datei. Das Wiki antwortet mit CORS fuer
    // jede Herkunft, darum braucht er keinen Server.
    const foreign = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("file:") && !url.startsWith("data:")) foreign.push(url);
    });

    await page.goto("file://" + path.resolve(__dirname, "../../tools/import.html"), { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("LG-Datenimport");
    // Er darf beim Laden nichts anfragen — das Wiki erst auf Knopfdruck.
    expect(foreign, `fremde Anfragen: ${foreign.join(", ")}`).toEqual([]);
  });
});

test.describe("Teilen-Vorschau", () => {
  test("die Startseite bringt Titel und Beschreibung für die Vorschau mit", async ({ page }) => {
    await page.goto("/index.html");

    const meta = (selector) => page.locator(selector).getAttribute("content");

    expect(await meta('meta[property="og:type"]')).toBe("website");
    expect(await meta('meta[property="og:site_name"]')).toBe("cipher");
    expect(await meta('meta[property="og:locale"]')).toBe("de_DE");
    expect(await meta('meta[property="og:title"]')).toMatch(/^cipher —/);
    expect((await meta('meta[property="og:description"]')).length).toBeGreaterThan(60);
    expect(["summary", "summary_large_image"]).toContain(await meta('meta[name="twitter:card"]'));
  });

  test("ein versprochenes Bild liegt auch da", async ({ page, request }) => {
    // Ein og:image, das ins Leere zeigt, erzeugt eine kaputte Karte. Jede
    // Bildangabe muss darum auf eine Datei dieser Seite zeigen, und die
    // grosse Karte gibt es nur mit Bild.
    for (const pagePath of ["/index.html", "/rundgang.html"]) {
      await page.goto(pagePath);
      const images = await page.locator('meta[property="og:image"], meta[name="twitter:image"]')
        .evaluateAll((elements) => elements.map((element) => element.content));
      for (const url of images) {
        expect(url, pagePath).toMatch(/^https:\/\/foe-foerderrechner\.com\//);
        const response = await request.get(new URL(url).pathname);
        expect(response.status(), url).toBe(200);
        expect(response.headers()["content-type"], url).toMatch(/^image\//);
      }
      const card = await page.locator('meta[name="twitter:card"]').getAttribute("content");
      if (card === "summary_large_image") expect(images.length, pagePath).toBeGreaterThan(0);
    }
  });

  test("die eigene Adresse ist eingetragen und überall dieselbe", async ({ page }) => {
    await page.goto("/index.html");

    const SITE = "https://foe-foerderrechner.com/";
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(SITE);
    expect(await page.locator('meta[property="og:url"]').getAttribute("content")).toBe(SITE);
  });

  test("die Rechtsseiten bekommen kein canonical", async ({ page }) => {
    // Sie stehen auf noindex. Ein canonical daneben wäre ein
    // widersprüchliches Signal an Suchmaschinen.
    for (const path of ["/impressum.html", "/datenschutz.html", "/404.html"]) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    }
  });

  test("robots.txt hält die Werkzeuge aus dem Index", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Disallow: /tools/");
    expect(body).toContain("Disallow: /test/");
  });

  test("die Rechtsseiten bleiben auf noindex", async ({ page }) => {
    // "follow": aus dem Index heraus, die Links darauf zaehlen trotzdem.
    for (const path of ["/impressum.html", "/datenschutz.html"]) {
      await page.goto(path);
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex, follow");
    }
    await page.goto("/404.html");
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex");
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

test.describe("Installierbare App", () => {
  // Chrome auf Android bietet "App installieren" nur an, wenn ein Manifest
  // mit Namen, Start-URL, standalone und Icons in 192 und 512 Pixeln
  // verlinkt ist — sonst bleibt es beim Lesezeichen auf dem Startbildschirm.
  test("das Manifest ist vorhanden und vollstaendig", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/manifest+json");

    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBe("cipher");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");

    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("jedes Icon im Manifest ist ein PNG in der angegebenen Groesse", async ({ request, page }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");

      await page.goto("/index.html");
      const size = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image.naturalWidth + "x" + image.naturalHeight;
      }, icon.src);
      expect(size, icon.src).toBe(icon.sizes);
    }
  });

  test("jede Seite verweist auf das Manifest", async ({ page }) => {
    for (const path of PAGES.concat(["/404.html"])) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    }
  });
});

test.describe("Icons auf Verdacht", () => {
  // Browser nehmen das Favicon aus der Daten-URI im HTML. Crawler,
  // Link-Vorschauen und iOS fragen die klassischen Pfade trotzdem ab —
  // die Netlify-Statistik führte sie als "Top resources not found".
  const ICONS = {
    "/favicon.ico": "image/x-icon",
    "/apple-touch-icon.png": "image/png",
    "/apple-touch-icon-precomposed.png": "image/png"
  };

  for (const [icon, type] of Object.entries(ICONS)) {
    test(`${icon} ist vorhanden`, async ({ request }) => {
      const response = await request.get(icon);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe(type);
      expect((await response.body()).length).toBeGreaterThan(500);
    });
  }

  test("jede Seite verweist auf das Apple-Touch-Icon", async ({ page }) => {
    for (const path of PAGES.concat(["/404.html"])) {
      await page.goto(path);
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
    }
  });
});
