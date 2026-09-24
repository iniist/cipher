/**
 * Bildschirmfotos fuer die Vorstellungsseite (rundgang.html).
 *
 *   node tools/screenshots.js
 *
 * Startet den Testserver, oeffnet cipher im Schmiede-Theme und fotografiert
 * die Stellen, die rundgang.html zeigt. Die Bilder landen als WebP in bilder/ und
 * werden eingecheckt — die Seite selbst braucht zur Laufzeit nichts davon.
 * Aendert sich die Oberflaeche, einfach erneut laufen lassen.
 */
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, devices } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "bilder");
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

/** Ein ruhiger, gut lesbarer Ausgangszustand. */
const STATE = {
  building: "The_Arc",
  level: 80,
  factor: 190,
  name: "Maren",
  theme: "forge",
  enabled: [true, true, true, true, true]
};

/**
 * Ein PNG als WebP ablegen. Chromium kodiert selbst — so braucht es kein
 * zusaetzliches Werkzeug, und die Bilder sind gut ein Drittel so gross.
 */
let encoder = null;
async function save(buffer, name) {
  const data = "data:image/png;base64," + buffer.toString("base64");
  const webp = await encoder.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/webp", 0.86);
  }, data);
  fs.writeFileSync(path.join(OUT, name + ".webp"), Buffer.from(webp.split(",")[1], "base64"));
  console.log("  " + name + ".webp");
}

function startServer() {
  const server = spawn(process.execPath, [path.join(__dirname, "serve.js"), String(PORT)], { stdio: "ignore" });
  return new Promise((resolve) => setTimeout(() => resolve(server), 600));
}

/** Seite mit gesetztem Speicher oeffnen. */
async function open(context, storage, theme) {
  const page = await context.newPage();
  await page.addInitScript(([items]) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.clear();
    for (const key of Object.keys(items)) localStorage.setItem(key, JSON.stringify(items[key]));
    sessionStorage.setItem("seeded", "1");
  }, [Object.assign({ "cipher:state": Object.assign({}, STATE, theme ? { theme } : {}) }, storage || {})]);
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  return page;
}

/** Ein Element mit etwas Luft drumherum fotografieren. */
async function shoot(page, selector, name, pad) {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  // boundingBox misst ab dem sichtbaren Ausschnitt, clip mit fullPage ab
  // dem Seitenanfang.
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  box.x += scroll.x;
  box.y += scroll.y;
  const p = pad == null ? 10 : pad;
  const size = page.viewportSize();
  await save(await page.screenshot({
    clip: {
      x: Math.max(0, box.x - p),
      y: Math.max(0, box.y - p),
      width: Math.min(size.width, box.width + 2 * p),
      height: box.height + 2 * p
    },
    fullPage: true
  }), name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  encoder = await browser.newPage();
  const phone = { ...devices["Pixel 5"], viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 };

  try {
    const favorites = [
      { id: "The_Arc", level: 80 },
      { id: "Arctic_Orangery", level: 64 },
      { id: "Observatory", level: 112 },
      { id: "Innovation_Tower", level: 35 },
      { id: "Atomium", level: 90 }
    ];

    // ---- Der erste Blick: Bauwerk, Stufe, Faktor
    let context = await browser.newContext(phone);
    let page = await open(context, { "cipher:favorites": favorites });
    await save(await page.screenshot(), "ueberblick");

    // ---- Stufe: aktuell oder naechste
    await page.click('[data-level-mode="current"]');
    await shoot(page, ".row", "stufe");
    await page.click('[data-level-mode="next"]');

    // ---- Favoriten
    await shoot(page, "#favs", "favoriten");

    // ---- Faktor und eigene Werte je Platz
    await page.locator("#slots summary").click();
    const firstSlot = page.locator("#slotList input").nth(2);
    if (await firstSlot.count()) {
      await firstSlot.fill("1,85");
      await firstSlot.blur();
    }
    await shoot(page, ".factor-block", "faktor");
    await context.close();

    // ---- Foerderplan in beiden Lesarten
    context = await browser.newContext(phone);
    page = await open(context);
    await shoot(page, "section.panel:nth-of-type(2)", "plan-sichern");
    await page.click("#secureMode");
    await page.waitForTimeout(100);
    await shoot(page, "section.panel:nth-of-type(2)", "plan-summe");
    await context.close();

    // ---- Foerderchat mit Sammlung
    context = await browser.newContext({ ...phone, permissions: ["clipboard-read", "clipboard-write"] });
    page = await open(context, { "cipher:state": Object.assign({}, STATE, { useAbbr: true }) });
    for (const [id, level] of [["Arctic_Orangery", 64], ["Observatory", 112], ["The_Arc", 80]]) {
      await page.locator("#building").selectOption(id, { force: true });
      await page.fill("#level", String(level));
      await page.locator("#level").blur();
      await page.click('button[data-copy="chatPlain"]');
      await page.waitForTimeout(80);
    }
    // Neu laden: die Knoepfe sagen sonst noch „Kopiert“.
    await page.reload({ waitUntil: "networkidle" });
    await shoot(page, "section.panel:nth-of-type(3)", "chat");
    await context.close();

    // ---- Auswahl
    context = await browser.newContext(phone);
    page = await open(context);
    await page.click("#buildingPick");
    await page.waitForTimeout(400);
    await page.fill("#pickerFilter", "zukunft");
    await page.waitForTimeout(200);
    await save(await page.screenshot(), "auswahl");
    await context.close();

    // ---- Sechs Darstellungen
    for (const theme of ["dark", "light", "contrast", "writer", "space", "forge"]) {
      context = await browser.newContext({ ...phone, viewport: { width: 393, height: 620 } });
      page = await open(context, null, theme);
      await save(await page.screenshot(), "theme-" + theme);
      await context.close();
    }

    // ---- Telefon quer
    context = await browser.newContext({ ...devices["iPhone 14 landscape"], deviceScaleFactor: 2 });
    page = await open(context);
    await save(await page.screenshot(), "quer");
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
