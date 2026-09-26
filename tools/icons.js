/**
 * Die Icons fuer die installierbare App (manifest.webmanifest).
 *
 *   node tools/icons.js
 *
 * Zeichnet das Zeichen aus dem Favicon — das goldene C auf Blau — in den
 * Groessen, die Android zum Installieren verlangt, und legt die PNGs in
 * icons/ ab. Gerendert wird mit dem Chromium aus Playwright, so braucht es
 * kein Grafikwerkzeug. Die Bilder werden eingecheckt; aendert sich das
 * Zeichen, einfach erneut laufen lassen.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");

const OUT = path.resolve(__dirname, "..", "icons");

/** Dieselben Farben und derselbe Pfad wie das Favicon in index.html. */
const BACKGROUND = "#1f4a7a";
const GOLD = "#f0c24f";
const MARK = "M22 10.5a7.5 7.5 0 1 0 0 11";

/**
 * Das Zeichen als SVG.
 *
 * `scale` verkleinert das C um die Mitte. Fuer "maskable" braucht es Luft:
 * Android schneidet solche Icons je nach Geraet rund, eckig oder als
 * Tropfen zu, und sicher sichtbar ist nur ein Kreis mit 80 % Durchmesser.
 */
function svg(scale) {
  const shift = 16 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${BACKGROUND}"/>` +
    `<path d="${MARK}" transform="translate(${shift} ${shift}) scale(${scale})" ` +
    `fill="none" stroke="${GOLD}" stroke-width="3.2" stroke-linecap="square"/>` +
    `</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.8 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg(icon.scale)}`
      );
      await page.screenshot({ path: path.join(OUT, icon.file) });
      await page.close();
      console.log("icons/" + icon.file);
    }
  } finally {
    await browser.close();
  }
})();
