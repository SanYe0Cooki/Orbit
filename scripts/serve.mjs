#!/usr/bin/env node
/**
 * Local static server for testing the web app (and for `cap run` style flows).
 * Usage: node scripts/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || process.env.PORT || 4173);
// fileURLToPath is required: on Windows the URL pathname is "/C:/..." which is
// not a valid filesystem path and makes every subdirectory lookup fail.
const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const testRoot = fileURLToPath(new URL('../tests/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

    // /tests/* is served from the repo's tests folder so the browser harness can
    // reach the app at /web/* on the same origin.
    let root = webRoot;
    if (pathname === '/tests' || pathname.indexOf('/tests/') === 0) {
      root = testRoot;
      pathname = pathname.replace(/^\/tests/, '') || '/';
    } else if (pathname === '/web' || pathname.indexOf('/web/') === 0) {
      pathname = pathname.replace(/^\/web/, '') || '/';
    }

    if (pathname.endsWith('/')) pathname += 'app.html';

    const target = normalize(join(root, pathname));
    if (!target.startsWith(normalize(root + sep))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: pathname.replace(/\/?$/, '/') + 'app.html' }).end();
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/'
    }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, () => {
  console.log('Orbit web app  →  http://localhost:' + port + '/web/app.html');
  console.log('Privacy page   →  http://localhost:' + port + '/web/privacy.html');
  console.log('Test harness   →  http://localhost:' + port + '/tests/_test.html');
  console.log('web root:  ' + webRoot);
  console.log('test root: ' + testRoot);
});
