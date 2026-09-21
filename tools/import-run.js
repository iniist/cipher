/**
 * Faehrt tools/import.html in einem echten Browser und schreibt das JSON.
 *
 *   node tools/import-run.js [ziel.json]
 *
 * Das Importwerkzeug ist eine Seite, kein Skript: Es holt die Wiki-Seiten
 * per fetch, raeumt die Tabellen auf und legt das Ergebnis in `result`.
 * Diese Logik ein zweites Mal fuer die Kommandozeile zu schreiben hiesse,
 * zwei Fassungen auseinanderdriften zu lassen. Also wird stattdessen die
 * Seite ferngesteuert — derselbe Code, denselben Knopf gedrueckt.
 *
 * Aufgerufen wird sie ueber file://, genau wie von Hand: Das Wiki
 * antwortet mit CORS fuer jede Herkunft, ein Server ist nicht noetig (und
 * waere auch keiner zur Hand, weil tools/ bewusst nicht ausgeliefert wird).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const PAGE = "file://" + path.join(ROOT, "tools", "import.html");
const TARGET = path.resolve(process.argv[2] || path.join(ROOT, "lg-daten.json"));

// 49 Bauwerke mit 350 ms Pause, dazu die Antwortzeiten des Wikis. Zehn
// Minuten sind reichlich; laeuft es laenger, stimmt etwas nicht.
const TIMEOUT = 10 * 60 * 1000;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const problems = [];
  page.on("pageerror", (error) => problems.push("Seitenfehler: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("Konsole: " + message.text());
  });

  await page.goto(PAGE);
  await page.click("#btnAll");

  // Der Statustext ist das Signal der Seite: "Fertig." oder "Fertig. N
  // Seiten nicht gefunden".
  await page.waitForFunction(
    () => document.getElementById("status").textContent.startsWith("Fertig"),
    null,
    { timeout: TIMEOUT }
  );

  const status = await page.textContent("#status");
  const summary = (await page.textContent("#totals")).replace(/\s+/g, " ").trim();
  const result = await page.evaluate(() => result);

  await browser.close();

  if (!result || !Array.isArray(result.lg) || !result.lg.length) {
    process.stderr.write("Der Lauf hat keine Bauwerke geliefert.\n");
    problems.forEach((problem) => process.stderr.write("  " + problem + "\n"));
    process.exit(1);
  }

  fs.writeFileSync(TARGET, JSON.stringify(result, null, 2) + "\n");

  process.stdout.write(status + "\n");
  process.stdout.write(summary + "\n");
  process.stdout.write(`${result.lg.length} Bauwerke nach ${path.relative(ROOT, TARGET)}\n`);
  problems.forEach((problem) => process.stdout.write("Hinweis: " + problem + "\n"));

  // Fuer die Zusammenfassung des Arbeitsablaufs.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack || error) + "\n");
  process.exit(1);
});
