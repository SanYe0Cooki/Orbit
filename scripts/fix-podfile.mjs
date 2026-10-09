#!/usr/bin/env node
/**
 * Make ios/App/Podfile portable.
 *
 * `cap sync ios` rewrites the Podfile and, when the local install used pnpm, it
 * hard-codes pnpm store paths such as:
 *   ../../node_modules/.pnpm/@capacitor+ios@7.6.9_@capacitor+core@7.6.9/node_modules/@capacitor/ios
 * Those paths exist on that one machine only. CI installs with npm, so
 * `pod install` then fails with "no such file or directory".
 *
 * This script rewrites the require_relative and every pod :path back to the
 * plain node_modules layout that both npm and pnpm's hoisted symlinks provide.
 *
 * Usage: node scripts/fix-podfile.mjs        (run after `cap sync ios`)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const podfilePath = resolve(ROOT, 'ios/App/Podfile');

if (!existsSync(podfilePath)) {
  console.error('[fix-podfile] ios/App/Podfile not found. Run `npx cap add ios` first.');
  process.exit(1);
}

const before = readFileSync(podfilePath, 'utf8');
let after = before;

// require_relative '../../node_modules/.pnpm/.../node_modules/@capacitor/ios/scripts/pods_helpers'
after = after.replace(
  /require_relative\s+'[^']*\.pnpm[^']*?'/g,
  "require_relative '../../node_modules/@capacitor/ios/scripts/pods_helpers'"
);

// pod 'X', :path => '../../node_modules/.pnpm/<pkg>@<ver>.../node_modules/<pkg>'
after = after.replace(
  /(:path\s*=>\s*')(?:\.\.\/)+node_modules\/\.pnpm\/[^']*?\/node_modules\/([^']+)'/g,
  (_match, prefix, pkgPath) => prefix + '../../node_modules/' + pkgPath + "'"
);

if (after === before) {
  console.log('[fix-podfile] Podfile already portable');
} else {
  writeFileSync(podfilePath, after, 'utf8');
  const remaining = (after.match(/\.pnpm/g) || []).length;
  console.log('[fix-podfile] rewrote pnpm store paths to the plain node_modules layout');
  if (remaining) console.warn('[fix-podfile] WARNING: ' + remaining + ' .pnpm reference(s) remain');
}

// Report the resolved pod paths so a broken checkout is obvious immediately.
const pods = [...after.matchAll(/pod\s+'([^']+)',\s*:path\s*=>\s*'([^']+)'/g)];
console.log('[fix-podfile] ' + pods.length + ' pod path(s):');
for (const [, name, path] of pods) console.log('  ' + name.padEnd(26) + path);

// Verify each referenced pod actually exists on disk (helps catch a wrong
// layout before spending CI minutes on `pod install`).
const missing = [];
for (const [, name, path] of pods) {
  const abs = resolve(ROOT, 'ios/App', path.replace(/^\.\.\/\.\.\//, '../../'));
  if (!existsSync(abs)) missing.push(name + ' -> ' + path);
}
if (missing.length) {
  console.warn('[fix-podfile] not found on disk (expected until `npm install`/`pnpm install` runs):');
  for (const m of missing) console.warn('  ' + m);
}
