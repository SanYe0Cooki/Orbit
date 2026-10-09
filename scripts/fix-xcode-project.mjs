#!/usr/bin/env node
/**
 * Make the committed Xcode project usable by current toolchains.
 *
 * Two problems this solves
 * ------------------------
 * 1. The project Capacitor generates uses `objectVersion = 48` with
 *    `compatibilityVersion = "Xcode 8.0"` (the template is old). Current Xcode
 *    refuses to open it on a clean checkout and reports:
 *      "JSON text did not start with array or object..."
 *      "The project 'App' is damaged and cannot be opened due to a parse error."
 *    Upgrading to the widely supported Xcode 14+ format (objectVersion 56, no
 *    compatibilityVersion) is what Xcode itself writes on save, so it is the
 *    same migration Xcode would perform — just done where we can verify it.
 *
 * 2. Sets MARKETING_VERSION / CURRENT_PROJECT_VERSION without perl, which the
 *    workflow previously used. Doing it here keeps the build number step
 *    cross-platform and testable.
 *
 * Usage:
 *   node scripts/fix-xcode-project.mjs                     normalise format only
 *   node scripts/fix-xcode-project.mjs --version 2.0.0 7   also set version
 *   node scripts/fix-xcode-project.mjs --check             report only
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK_ONLY = process.argv.includes('--check');

const versionFlag = process.argv.indexOf('--version');
const versionName = versionFlag !== -1 ? process.argv[versionFlag + 1] : null;
const buildNumber = versionFlag !== -1 ? process.argv[versionFlag + 2] : null;

// Text files Xcode parses strictly: LF only, no BOM.
const TEXT_TARGETS = [
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App.xcworkspace/contents.xcworkspacedata',
  'ios/App/App.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist',
  'ios/App/App/Info.plist',
  'ios/App/App/Base.lproj/LaunchScreen.storyboard',
  'ios/App/App/Base.lproj/Main.storyboard',
  'ios/App/Podfile'
];

const problems = [];

for (const rel of TEXT_TARGETS) {
  const full = resolve(ROOT, rel);
  if (!existsSync(full)) continue;
  const raw = readFileSync(full, 'utf8');
  const crlf = (raw.match(/\r\n/g) || []).length;
  const bom = raw.charCodeAt(0) === 0xfeff;
  if (crlf || bom) {
    problems.push(rel + ' (CRLF ' + crlf + ', BOM ' + bom + ')');
    if (!CHECK_ONLY) {
      writeFileSync(full, raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8');
    }
  }
}

const pbxPath = resolve(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');
if (!existsSync(pbxPath)) {
  console.error('[fix-xcode-project] not found: ' + pbxPath);
  process.exit(1);
}

let pbx = readFileSync(pbxPath, 'utf8');
const before = pbx;

// ---- 1. modern project format ---------------------------------------------
const objectVersionBefore = (pbx.match(/objectVersion = (\d+);/) || [])[1];
// 56 == Xcode 14+ project format; Xcode 15/16 write 56 or 77 depending on
// features used. 56 is the safe, widely accepted value.
pbx = pbx.replace(/objectVersion = \d+;/, 'objectVersion = 56;');
// Newer formats omit compatibilityVersion entirely.
pbx = pbx.replace(/\n\t*compatibilityVersion = "[^"]*";/, '');

// Refresh the "last upgraded" markers so Xcode does not try to migrate again.
pbx = pbx.replace(/LastUpgradeCheck = \d+;/g, 'LastUpgradeCheck = 1600;');
pbx = pbx.replace(/LastSwiftUpdateCheck = \d+;/g, 'LastSwiftUpdateCheck = 1600;');

// ---- 2. version numbers ----------------------------------------------------
let versionNote = 'unchanged';
if (versionName && buildNumber) {
  const m = /MARKETING_VERSION = [^;]+;/;
  const c = /CURRENT_PROJECT_VERSION = [^;]+;/;
  if (!m.test(pbx) || !c.test(pbx)) {
    console.error('[fix-xcode-project] could not find version keys in project.pbxproj');
    process.exit(1);
  }
  const marketingCount = (pbx.match(/MARKETING_VERSION = /g) || []).length;
  const buildCount = (pbx.match(/CURRENT_PROJECT_VERSION = /g) || []).length;
  pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, 'MARKETING_VERSION = ' + versionName + ';');
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, 'CURRENT_PROJECT_VERSION = ' + buildNumber + ';');
  versionNote = versionName + ' (' + marketingCount + ' configs) / build ' + buildNumber + ' (' + buildCount + ' configs)';
}

if (CHECK_ONLY) {
  const ok = problems.length === 0 && objectVersionBefore === '56' && !/compatibilityVersion/.test(pbx);
  console.log('[fix-xcode-project] objectVersion=' + objectVersionBefore +
              ' compatibilityVersion=' + (/compatibilityVersion/.test(pbx) ? 'present' : 'absent') +
              ' LF issues=' + problems.length);
  process.exit(ok ? 0 : 1);
}

if (pbx !== before) writeFileSync(pbxPath, pbx, 'utf8');

console.log('[fix-xcode-project] project.pbxproj:');
console.log('  objectVersion      : ' + objectVersionBefore + ' -> 56');
console.log('  compatibilityVersion: ' + (/compatibilityVersion/.test(pbx) ? 'still present (!)' : 'removed'));
console.log('  LF normalised      : ' + (problems.length ? problems.join(', ') : 'nothing to do'));
console.log('  versions           : ' + versionNote);
console.log('  IPHONEOS_DEPLOYMENT_TARGET=' +
  ((pbx.match(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/) || [])[1] || 'n/a'));
