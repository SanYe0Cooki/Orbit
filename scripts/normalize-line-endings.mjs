#!/usr/bin/env node
/**
 * Force every text file in the repository to be stored with LF line endings.
 *
 * Why this exists: on Windows, git's `core.autocrlf` converts text files to CRLF
 * on checkout, and depending on configuration those CRLF bytes can end up stored
 * in the repository. That breaks tools that are strict about it — notably Xcode,
 * which refuses to open a `project.pbxproj` that contains CRLF and reports the
 * project as "damaged ... due to a parse error", and `android/gradlew`, which
 * fails on Linux with "bad interpreter".
 *
 * Binary files are never touched: the extension allow-list below is explicit.
 *
 * Usage: node scripts/normalize-line-endings.mjs [--check]
 *   --check  report offending files and exit non-zero instead of rewriting
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK_ONLY = process.argv.includes('--check');

const TEXT_EXT = new Set([
  '.md', '.markdown', '.txt', '.json', '.webmanifest', '.yml', '.yaml',
  '.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.svg',
  '.sh', '.bat', '.cmd', '.ps1', '.py',
  '.gradle', '.properties', '.pro', '.java', '.kt',
  '.xml', '.plist', '.pbxproj', '.xcworkspacedata', '.xcscheme', '.storyboard', '.xcsettings',
  '.swift', '.podspec', '.sql', '.gitignore', '.gitattributes'
]);
const TEXT_NAMES = new Set(['Podfile', 'Podfile.lock', 'gradlew', 'gemfile', 'Procfile', '.nojekyll', '.gitignore']);

// Never rewrite these: native dependency trees and build output.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'Pods', 'DerivedData', 'build', '.gradle',
  'Debug-iphonesimulator', 'Release-iphoneos', 'xcuserdata'
]);

function isTextFile(name) {
  if (TEXT_NAMES.has(name)) return true;
  const ext = extname(name).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  // Files with no extension that are not on the name list (e.g. a PNG in icons/)
  // are treated as binary.
  return false;
}

const offenders = [];
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(dir, entry.name);
    if (!isTextFile(entry.name)) continue;
    // Size guard: a text file this large is almost certainly mis-typed.
    if (statSync(full).size > 8 * 1024 * 1024) continue;

    scanned++;
    const raw = readFileSync(full, 'utf8');
    if (!raw.includes('\r\n')) continue;

    offenders.push(full.slice(ROOT.length + 1).replace(/\\/g, '/'));
    if (!CHECK_ONLY) {
      // Also strip a UTF-8 BOM: Xcode and several parsers choke on it.
      const cleaned = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      writeFileSync(full, cleaned, 'utf8');
    }
  }
}

walk(ROOT);

console.log('[normalize-line-endings] scanned ' + scanned + ' text file(s)');
if (!offenders.length) {
  console.log('[normalize-line-endings] all text files already use LF');
  process.exit(0);
}

if (CHECK_ONLY) {
  console.log('[normalize-line-endings] ' + offenders.length + ' file(s) stored with CRLF:');
  for (const f of offenders) console.log('  ' + f);
  process.exit(1);
}

console.log('[normalize-line-endings] rewrote ' + offenders.length + ' file(s) to LF:');
for (const f of offenders.slice(0, 40)) console.log('  ' + f);
if (offenders.length > 40) console.log('  ... and ' + (offenders.length - 40) + ' more');
