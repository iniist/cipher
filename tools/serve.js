/**
 * Winziger statischer Server fuer die Entwicklung und die Browsertests.
 * Bewusst ohne Abhaengigkeiten — cipher selbst braucht keinerlei Laufzeit.
 *
 *   node tools/serve.js [port]
 *
 * Antwort-Header und Weiterleitungen werden aus netlify.toml gelesen, damit
 * die Tests gegen dieselben Vorgaben laufen wie die ausgelieferte Seite. Ein
 * kaputter Content-Security-Policy oder eine wirkungslose 404-Regel faellt
 * so hier auf und nicht erst live.
 *
 * Der Importer unter tools/ ist damit hier genauso unerreichbar wie auf
 * Netlify. Zum Arbeiten oeffnet man ihn direkt als Datei im Browser — er
 * braucht keinen Server, das Wiki antwortet mit CORS fuer jede Herkunft.
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
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

/**
 * Die [[headers]]- und [[redirects]]-Bloecke aus netlify.toml einlesen.
 *
 * Bewusst ein Mini-Parser statt einer Abhaengigkeit: er versteht genau die
 * Form, die netlify.toml in diesem Projekt verwendet — je Block einzeilige
 * Zuweisungen, bei Headern darunter ein `[headers.values]`. Werte sind
 * entweder in Anfuehrungszeichen (Strings) oder nackt (Zahlen, true/false).
 *
 * @returns {{headers: Array<{pattern: string, values: Object<string, string>}>,
 *            redirects: Array<{from: string, to: string, status: number, force: boolean}>}}
 */
function readNetlifyConfig() {
  const file = path.join(ROOT, "netlify.toml");
  const config = { headers: [], redirects: [] };
  if (!fs.existsSync(file)) return config;

  let block = null;   // { kind: "headers"|"redirects", ... }
  let inValues = false;

  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "[[headers]]") {
      block = { kind: "headers", pattern: null, values: {} };
      config.headers.push(block);
      inValues = false;
      continue;
    }
    if (line === "[[redirects]]") {
      block = { kind: "redirects", from: null, to: null, status: 301, force: false };
      config.redirects.push(block);
      inValues = false;
      continue;
    }
    if (line.startsWith("[")) {
      // Jeder andere Abschnitt beendet den Block, ausser der Werte-
      // Unterabschnitt eines Header-Blocks.
      inValues = block !== null && block.kind === "headers" && line === "[headers.values]";
      if (!inValues) block = null;
      continue;
    }
    if (!block) continue;

    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(?:"(.*)"|(\S+))$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];

    if (block.kind === "headers") {
      if (inValues) block.values[key] = value;
      else if (key === "for") block.pattern = value;
    } else if (key === "from" || key === "to") {
      block[key] = value;
    } else if (key === "status") {
      block.status = Number(value);
    } else if (key === "force") {
      block.force = value === "true";
    }
  }

  config.headers = config.headers.filter((rule) => rule.pattern && Object.keys(rule.values).length);
  config.redirects = config.redirects.filter((rule) => rule.from && rule.to);
  return config;
}

/** Netlifys Pfadmuster: ein abschliessendes /* deckt alles darunter ab. */
function matches(pattern, pathname) {
  if (pattern.endsWith("/*")) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

const CONFIG = readNetlifyConfig();

function headersFor(pathname) {
  const headers = {};
  for (const rule of CONFIG.headers) {
    if (matches(rule.pattern, pathname)) Object.assign(headers, rule.values);
  }
  return headers;
}

/**
 * Die erste passende Weiterleitung — mit Netlifys Vorbehalt: ohne `force`
 * gilt eine Regel nur, wenn unter dem Pfad keine Datei liegt. Genau dieses
 * "Shadowing" hatte die 404-Regeln fuer /tools/ und /test/ wirkungslos
 * gemacht, weil dort ja Dateien liegen.
 */
function redirectFor(pathname, fileExists) {
  for (const rule of CONFIG.redirects) {
    if (!matches(rule.from, pathname)) continue;
    if (rule.force || !fileExists) return rule;
  }
  return null;
}

function localFile(pathname) {
  const file = path.join(ROOT, pathname);
  // Kein Ausbrechen aus dem Projektverzeichnis
  return file.startsWith(ROOT + path.sep) ? file : null;
}

function send(response, status, file, pathname) {
  fs.readFile(file, (error, content) => {
    if (error) {
      serveNotFound(response);
      return;
    }
    response.writeHead(status, Object.assign({
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    }, headersFor(pathname))).end(content);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = localFile(pathname);
  if (!file) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  const redirect = redirectFor(pathname, exists);
  if (redirect) {
    const target = localFile(redirect.to);
    if (target) send(response, redirect.status, target, redirect.to);
    else serveNotFound(response);
    return;
  }

  if (!exists) {
    serveNotFound(response);
    return;
  }
  send(response, 200, file, pathname);
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
