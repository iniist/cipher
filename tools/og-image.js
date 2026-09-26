/**
 * Vorschaubild fuer Link-Vorschauen und Suchmaschinen (bilder/og-cipher.png).
 *
 *   node tools/og-image.js
 *
 * Zeichnet eine kleine HTML-Seite in 1200 x 630 — Blaupause als Grund,
 * Wortmarke, Claim und ein Ausschnitt aus dem Foerderplan — und fotografiert
 * sie mit Chromium. Schrift und Bild kommen als Daten-URI aus fonts/ und
 * bilder/, damit nichts von aussen geladen wird. Aendert sich Claim oder
 * Oberflaeche, einfach erneut laufen lassen.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "bilder", "og-cipher.png");
const WIDTH = 1200;
const HEIGHT = 630;

function dataUri(file, type) {
  return `data:${type};base64,` + fs.readFileSync(path.join(ROOT, file)).toString("base64");
}

function font(weight) {
  const src = dataUri(`fonts/barlow-semi-condensed-latin-${weight}-normal.woff2`, "font/woff2");
  return `@font-face{font-family:"Barlow Semi Condensed";font-weight:${weight};src:url("${src}") format("woff2")}`;
}

const PLAN = dataUri("bilder/plan-sichern.webp", "image/webp");

// Dasselbe Zeichen wie das Favicon: blaues Quadrat, gelbes C.
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="3" fill="#1f4a7a"/><path d="M22 10.5a7.5 7.5 0 1 0 0 11" fill="none" stroke="#f0c24f" stroke-width="3.2" stroke-linecap="square"/></svg>`;

const HTML = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
${font(400)}${font(600)}${font(700)}
* { box-sizing: border-box }
html, body { margin: 0 }
body {
  width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative;
  font-family: "Barlow Semi Condensed", sans-serif; color: #fff;
  background-color: #1f4a7a;
  background-image:
    linear-gradient(rgba(255, 255, 255, .16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .16) 1px, transparent 1px),
    linear-gradient(rgba(255, 255, 255, .06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .06) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
  background-position: -1px -1px, -1px -1px, -1px -1px, -1px -1px;
}
.text { position: absolute; left: 72px; top: 64px; width: 600px }
.brand { display: flex; align-items: center; gap: 22px }
.brand svg {
  width: 96px; height: 96px; flex: none;
  border-radius: 10px; box-shadow: 0 0 0 2px rgba(255, 255, 255, .85), 0 10px 24px rgba(0, 0, 0, .35);
}
.brand b { font-size: 132px; line-height: .8; font-weight: 700; letter-spacing: -.035em }
h1 { margin: 44px 0 0; font-size: 43px; white-space: nowrap; line-height: 1.05; font-weight: 700 }
h2 { margin: 10px 0 0; font-size: 36px; line-height: 1.1; font-weight: 600; color: #f0c24f }
ul { list-style: none; padding: 0; margin: 30px 0 0; display: flex; flex-wrap: wrap; gap: 10px }
li {
  font-size: 22px; font-weight: 600; padding: 6px 14px; border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, .7); background: rgba(14, 36, 64, .55);
}
.foot {
  position: absolute; left: 72px; bottom: 36px; right: 72px;
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 20px; color: rgba(255, 255, 255, .78);
}
.foot strong { color: #fff; font-weight: 600; font-size: 22px }
.shot {
  position: absolute; left: 756px; top: 92px; width: 396px; height: 400px;
  border-radius: 14px; overflow: hidden;
  transform: rotate(3deg);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, .85), 0 24px 48px rgba(0, 0, 0, .45);
  background: #3e2410;
}
/* Den gruenen Rand des Bildschirmfotos abschneiden: nur die Karte. */
.shot img { display: block; width: 422px; height: auto; margin: -12px 0 0 -11px }
</style></head><body>
  <div class="text">
    <div class="brand">${LOGO}<b>cipher</b></div>
    <h1>Förderrechner für Forge of Empires</h1>
    <h2>Arche &amp; Legendäre Bauwerke</h2>
    <ul>
      <li>Mäzenplätze P1–P5 sichern</li>
      <li>Arche-Faktor 1,80–2,00</li>
      <li>FP-Einsatz planen</li>
      <li>Chat-Zeile fertig</li>
    </ul>
  </div>
  <figure class="shot" style="margin:0"><img src="${PLAN}" alt=""></figure>
  <div class="foot">
    <strong>foe-foerderrechner.com</strong>
    <span>Inoffizielles Fan-Projekt · keine Verbindung zu InnoGames</span>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: "png" });
  await browser.close();
  const size = fs.statSync(OUT).size;
  console.log(`  bilder/og-cipher.png  ${WIDTH}x${HEIGHT}  ${Math.round(size / 1024)} KB`);
})();
