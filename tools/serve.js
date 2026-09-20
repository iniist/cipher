/**
 * Winziger statischer Server fuer die Entwicklung und die Browsertests.
 * Bewusst ohne Abhaengigkeiten — cipher selbst braucht keinerlei Laufzeit.
 *
 *   node tools/serve.js [port]
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
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let relative = decodeURIComponent(url.pathname);
  if (relative.endsWith("/")) relative += "index.html";

  const file = path.join(ROOT, relative);
  // Kein Ausbrechen aus dem Projektverzeichnis
  if (!file.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    }).end(content);
  });
});

server.listen(PORT, () => {
  process.stdout.write(`cipher läuft auf http://localhost:${PORT}/\n`);
});
