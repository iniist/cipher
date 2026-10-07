/**
 * Meldet geaenderte Seiten per IndexNow (Bing, Yandex, Seznam, Naver …).
 *
 *   node tools/indexnow.js --since <commit>   was seit dem Commit anders ist
 *   node tools/indexnow.js --all              alle Adressen der Sitemap
 *   … --wait                                  erst melden, wenn es live ist
 *   … --dry                                   nur zeigen, nichts senden
 *
 * Geaendert ist eine Adresse, wenn sich ihr lastmod in sitemap.xml geaendert
 * hat oder eine ihrer Dateien (siehe tools/sitemap.js) im Commitbereich
 * vorkommt. Laeuft im Workflow „Suchmaschinen benachrichtigen“ nach jedem
 * Push auf main.
 *
 * Netlify veroeffentlicht unabhaengig von GitHub Actions. Mit --wait fragt
 * das Skript die Website ab, bis Sitemap und Seiten dem Stand im Repo
 * entsprechen — eine Suchmaschine, die sofort kommt, soll schon das Neue
 * sehen. Nach 15 Minuten meldet es trotzdem.
 *
 * Der Schluessel liegt als <schluessel>.txt im Wurzelverzeichnis; so prueft
 * IndexNow, dass die Meldung von dieser Domain kommt. Er ist kein Geheimnis.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ENTRIES } = require("./sitemap.js");
const { SITE } = require("./build-pages.js");

const ROOT = path.resolve(__dirname, "..");
const ENDPOINT = "https://api.indexnow.org/indexnow";
const WAIT_LIMIT_MS = 15 * 60 * 1000;
const WAIT_STEP_MS = 20 * 1000;

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const wait = args.includes("--wait");
const sinceFlag = args.indexOf("--since");
const since = sinceFlag >= 0 ? args[sinceFlag + 1] : null;

function git(gitArgs) {
  try {
    return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    return null;
  }
}

function findKey() {
  const file = fs.readdirSync(ROOT).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
  if (!file) throw new Error("Kein IndexNow-Schluessel (<32 Hex-Zeichen>.txt) im Wurzelverzeichnis.");
  const key = fs.readFileSync(path.join(ROOT, file), "utf8").trim();
  if (key + ".txt" !== file) throw new Error(`${file} enthaelt nicht seinen eigenen Namen.`);
  return key;
}

function lastmods(xml) {
  const result = {};
  for (const match of (xml || "").matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

/** Adressen, die seit `ref` anders sind; null, wenn `ref` unbekannt ist. */
function changedSince(ref) {
  if (!ref || /^0+$/.test(ref) || git(["cat-file", "-e", ref + "^{commit}"]) === null) return null;
  const files = new Set((git(["diff", "--name-only", ref, "HEAD"]) || "").split("\n").filter(Boolean));
  const before = lastmods(git(["show", ref + ":sitemap.xml"]));
  const now = lastmods(fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8"));
  return ENTRIES.filter((entry) => {
    const loc = SITE + entry.loc;
    return before[loc] !== now[loc] || entry.sources.some((file) => files.has(file));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  try {
    const response = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
    return response.ok ? await response.text() : null;
  } catch (error) {
    return null;
  }
}

/**
 * HTML ohne Linkziele. Netlify schreibt beim Ausliefern die Links um
 * ("./impressum.html" wird zu '/impressum'); ohne das hier stimmte keine
 * Seite je mit dem Repo ueberein, und --wait liefe immer bis zur Grenze.
 */
const withoutLinks = (html) => html == null ? null : html.replace(/href=(["'])[^"']*\1/g, "href");

/** Ob die Website schon den Stand im Repo ausliefert. */
async function isLive(entries) {
  const local = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  if (await fetchText(SITE + "/sitemap.xml") !== local) return false;
  for (const entry of entries) {
    const page = entry.sources[0];
    if (!page.endsWith(".html")) continue;
    const live = withoutLinks(await fetchText(SITE + entry.loc));
    if (live !== withoutLinks(fs.readFileSync(path.join(ROOT, page), "utf8"))) return false;
  }
  return true;
}

async function main() {
  const key = findKey();
  let entries = args.includes("--all") ? ENTRIES : changedSince(since);
  if (entries === null) {
    process.stdout.write(`Commit ${since || "(keiner)"} unbekannt, melde alle Adressen.\n`);
    entries = ENTRIES;
  }
  if (!entries.length) {
    process.stdout.write("Keine Seite geaendert, nichts zu melden.\n");
    return;
  }
  const urlList = entries.map((entry) => SITE + entry.loc);
  process.stdout.write("Zu melden:\n" + urlList.map((url) => "  " + url).join("\n") + "\n");
  if (dry) return;

  if (wait) {
    const start = Date.now();
    while (!(await isLive(entries))) {
      if (Date.now() - start > WAIT_LIMIT_MS) {
        process.stdout.write("Website nach 15 Minuten noch nicht auf dem Stand, melde trotzdem.\n");
        break;
      }
      await sleep(WAIT_STEP_MS);
    }
  }

  const host = new URL(SITE).host;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${SITE}/${key}.txt`, urlList })
  });
  // 200 und 202 heissen angenommen; alles andere ist ein Fehler im Lauf,
  // aber kein Grund, den Push als kaputt zu markieren — Google und Co.
  // finden die Seiten ueber die Sitemap ohnehin.
  process.stdout.write(`IndexNow antwortet ${response.status}.\n`);
  if (response.status !== 200 && response.status !== 202) {
    process.stdout.write((await response.text()).slice(0, 500) + "\n");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exit(1);
});
