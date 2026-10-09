#!/usr/bin/env node
/**
 * Pre-release checks that do not need a browser:
 *   - the manifest references only files that actually exist
 *   - app.html references only scripts that exist
 *   - the app id / bundle id / package name agree across every configuration file
 *   - no secret (service_role key) leaked into frontend code
 *
 * Usage: node scripts/verify.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor every path to the repository root so the script works from CI and from
// any shell, regardless of the current working directory.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const problems = [];
const notes = [];
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));

function check(label, ok, detail) {
  if (ok) notes.push('ok   ' + label + (detail ? '  (' + detail + ')' : ''));
  else problems.push('FAIL ' + label + (detail ? '  -> ' + detail : ''));
}

// ---------------------------------------------------------------- manifest --
const manifest = JSON.parse(read('web/manifest.webmanifest'));
for (const icon of manifest.icons || []) {
  check('manifest icon exists: ' + icon.src, exists(join('web', icon.src)), icon.src);
}
check('manifest start_url points at the app', /app\.html$/.test(manifest.start_url), manifest.start_url);

// ---------------------------------------------------------------- app.html --
const appHtml = read('web/app.html');
const scriptSrcs = Array.from(appHtml.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
check('app.html loads at least one local script', scriptSrcs.length > 0, scriptSrcs.join(', '));
for (const src of scriptSrcs) {
  check('app.html script exists: ' + src, exists(join('web', src)), src);
}
const linkHrefs = Array.from(appHtml.matchAll(/<link[^>]+href="([^"]+)"/g)).map((m) => m[1]);
for (const href of linkHrefs) {
  if (/^https?:/.test(href)) continue;
  check('app.html link target exists: ' + href, exists(join('web', href)), href);
}
check('app.html has a viewport meta with viewport-fit=cover',
  /name="viewport"[^>]*viewport-fit=cover/.test(appHtml), 'notch support');
check('app.html declares apple-mobile-web-app-capable',
  /apple-mobile-web-app-capable/.test(appHtml), 'standalone install');

// -------------------------------------------------------------- identifiers --
const config = JSON.parse(read('capacitor.config.json'));
const appId = config.appId;
check('capacitor.config.json has a non-placeholder appId', !!appId && appId !== 'com.getcapacitor.app', appId);

const androidGradle = read('android/app/build.gradle');
check('android applicationId matches capacitor appId',
  androidGradle.includes('applicationId "' + appId + '"'), appId);
check('android namespace matches capacitor appId',
  androidGradle.includes('namespace "' + appId + '"'), appId);

const iosPbx = read('ios/App/App.xcodeproj/project.pbxproj');
check('ios PRODUCT_BUNDLE_IDENTIFIER matches capacitor appId',
  iosPbx.includes('PRODUCT_BUNDLE_IDENTIFIER = ' + appId + ';'), appId);

const exportOptions = read('scripts/write-export-options.mjs');
check('export options default bundle id matches capacitor appId',
  exportOptions.includes("'" + appId + "'"), appId);

const androidManifest = read('android/app/src/main/AndroidManifest.xml');
check('android has deep-link intent filters for auth links',
  /android:scheme="orbit"/.test(androidManifest), 'email confirmation / reset');
const iosPlist = read('ios/App/App/Info.plist');
check('ios declares CFBundleURLSchemes',
  /CFBundleURLSchemes/.test(iosPlist), 'email confirmation / reset');

// ------------------------------------------------------------------ secrets --
const appJs = read('web/app.js');
check('no service_role key in frontend code', !/service_role/.test(appJs), 'frontend must only hold the publishable key');
check('no Apple/Google client secret in frontend code',
  !/client_secret|private_key/i.test(appJs), 'provider secrets stay server-side');
check('supabase url is https', /supabaseUrl:\s*'https:\/\//.test(appJs), 'TLS');
check('support email looks like a real address',
  /supportEmail:\s*'[^']+@[^']+\.[^']+'/.test(appJs),
  (appJs.match(/supportEmail:\s*'([^']+)'/) || [])[1]);
if (/support@example\.com/.test(appJs)) {
  problems.push('FAIL support email is still the placeholder support@example.com — change CONFIG.supportEmail in web/app.js before release');
}

// -------------------------------------------------------------------- assets --
for (const [label, path] of [
  ['android launcher icon', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'],
  ['android adaptive foreground', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'],
  ['android 12 splash icon', 'android/app/src/main/res/drawable/splash_icon.png'],
  ['ios app icon', 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'],
  ['play store icon', 'store/play-store-icon-512.png']
]) {
  check(label + ' installed', exists(path), path);
}

// -------------------------------------------------------------------- report --
console.log('');
console.log('Orbit pre-release verification');
console.log('='.repeat(72));
for (const line of notes) console.log(line);
if (problems.length) {
  console.log('');
  for (const line of problems) console.log(line);
}
console.log('');
console.log(problems.length
  ? problems.length + ' problem(s) found.'
  : 'All ' + notes.length + ' checks passed.');
process.exit(problems.length ? 1 : 0);
