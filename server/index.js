// Guardian marketing/download site — static file server.
// No framework, no database: this site has nothing to redeem or store,
// just a page and an installer to hand out. Keeps the image tiny and the
// attack surface near zero.

"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".exe": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
};

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  return resolved.startsWith(base) ? resolved : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safeJoin(PUBLIC_DIR, reqPath);
  if (!filePath) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Guardian site listening on http://${HOST}:${PORT}`);
});
