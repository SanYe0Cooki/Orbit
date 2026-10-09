#!/usr/bin/env node
/**
 * Local smoke-test runner for the Orbit web app.
 *
 * Drives a headless Chrome/Edge against tests/_test.html and prints the report.
 * Start the dev server first:  node scripts/serve.mjs
 *
 * Usage: node scripts/run-smoke-test.mjs [port] [chromePath]
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.argv[2] || '4173';
const candidates = [
  process.argv[3],
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Edge binary found. Pass the path as the second argument.');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'orbit-smoke-'));
const url = 'http://localhost:' + port + '/tests/_test.html';
const domFile = join(profile, 'dom.html');

console.log('Running: ' + url);
console.log('Browser: ' + chrome);

let dom = '';
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--virtual-time-budget=20000',
    '--window-size=430,932', '--user-data-dir=' + profile, '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (error) {
  // Chrome exits non-zero on some platforms even when the dump succeeded.
  dom = (error.stdout || '').toString();
  if (!dom) {
    console.error('Could not run the browser: ' + error.message);
    process.exit(2);
  }
}
writeFileSync(domFile, dom, 'utf8');

// The harness's own inline source contains the literal marker, so anchor on the
// shape of the real payload rather than the bare marker.
let payload = null;
const patterns = [
  /<pre[^>]*>\s*TESTRESULT=(\{"total".*?\})\s*<\/pre>/s,
  /<title>TESTRESULT=(\{"total".*?\})<\/title>/s
];
for (const pattern of patterns) {
  const match = dom.match(pattern);
  if (match) { payload = match[1]; break; }
}

if (!payload) {
  console.error('FAILED: no TESTRESULT payload found (the harness did not finish).');
  console.error('  dump size: ' + dom.length + ' bytes');
  const title = dom.match(/<title>([^<]*)<\/title>/);
  console.error('  title: ' + (title ? title[1].slice(0, 160) : 'n/a'));
  process.exit(1);
}

const unescapeHtml = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const data = JSON.parse(unescapeHtml(payload));
const total = data.total || 0;
const failed = data.failed || 0;

console.log('');
console.log('='.repeat(72));
console.log('Orbit smoke test: ' + total + ' checks, ' + (total - failed) + ' passed, ' + failed + ' failed');
console.log('='.repeat(72));

for (const item of data.results || []) {
  if (!item.pass) {
    console.log('FAIL  ' + item.name);
    console.log('      -> ' + (item.detail || ''));
  }
}

const errors = data.errors || [];
if (errors.length) {
  console.log('');
  console.log('RUNTIME ERRORS');
  for (const err of errors) console.log('  * ' + err);
}

console.log('');
process.exit(failed || errors.length ? 1 : 0);
