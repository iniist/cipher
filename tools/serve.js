/**
 * Winziger statischer Server fuer die Entwicklung und die Browsertests.
 * Bewusst ohne Abhaengigkeiten — cipher selbst braucht keinerlei Laufzeit.
 *
 *   node tools/serve.js [port]
 *
 * Die Antwort-Header werden aus netlify.toml gelesen, damit die Tests
 * gegen dieselben Vorgaben laufen wie die ausgelieferte Seite. Ein
 * kaputter Content-Security-Policy faellt so hier auf und nicht erst live.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".toml": "text/plain; charset=utf-8"
};

/**
 * Die [[headers]]-Bloecke aus netlify.toml einlesen.
 *
 * Bewusst ein Mini-Parser statt einer Abhaengigkeit: er versteht genau die
 * Form, die netlify.toml in diesem Projekt verwendet — je Block ein
 * `for = "<muster>"` und darunter `[headers.values]` mit einzeiligen
 * Zuweisungen. Mehr braucht es hier nicht.
 *
 * @returns {Array<{pattern: string, values: Object<string, string>}>}
 */
function readHeaderRules() {
  const file = path.join(ROOT, "netlify.toml");
  if (!fs.existsSync(file)) return [];

  const rules = [];
  let current = null;
  let inValues = false;

  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "[[headers]]") {
      current = { pattern: null, values: {} };
      rules.push(current);
      inValues = false;
      continue;
    }
    if (line.startsWith("[")) {
      // Jeder andere Abschnitt beendet den Header-Block, ausser dessen
      // eigener Werte-Unterabschnitt.
      inValues = current !== null && line === "[headers.values]";
      if (!inValues) current = null;
      continue;
    }
    if (!current) continue;

    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"(.*)"$/);
    if (!match) continue;
    if (inValues) current.values[match[1]] = match[2];
    else if (match[1] === "for") current.pattern = match[2];
  }

  return rules.filter((rule) => rule.pattern && Object.keys(rule.values).length);
}

/** Netlifys Pfadmuster: ein abschliessendes /* deckt alles darunter ab. */
function matches(pattern, pathname) {
  if (pattern.endsWith("/*")) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

const HEADER_RULES = readHeaderRules();

function headersFor(pathname) {
  const headers = {};
  for (const rule of HEADER_RULES) {
    if (matches(rule.pattern, pathname)) Object.assign(headers, rule.values);
  }
  return headers;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.join(ROOT, pathname);
  // Kein Ausbrechen aus dem Projektverzeichnis
  if (!file.startsWith(ROOT + path.sep)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  fs.readFile(file, (error, content) => {
    if (error) {
      serveNotFound(response);
      return;
    }
    response.writeHead(200, Object.assign({
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    }, headersFor(pathname))).end(content);
  });
});

function serveNotFound(response) {
  fs.readFile(path.join(ROOT, "404.html"), (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(404, Object.assign({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }, headersFor("/404.html"))).end(content);
  });
}

server.listen(PORT, () => {
  process.stdout.write(`cipher läuft auf http://localhost:${PORT}/\n`);
});
