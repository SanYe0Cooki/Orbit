#!/usr/bin/env node
/**
 * Prepare the Android project for a build.
 *
 * - Always bumps versionCode / versionName.
 * - When signing secrets are present, injects a real release signingConfig.
 * - When they are absent, points `release` at the debug keystore so the build
 *   still produces an installable APK (clearly marked as not-for-store).
 *
 * The file is edited by anchoring on exact template strings rather than by
 * loose regular expressions: an earlier version matched the first `release {`
 * block (which belongs to signingConfigs) and injected `signingConfig` inside
 * it, which breaks the Gradle build.
 *
 * Usage: node scripts/prepare-android.mjs <versionCode> <versionName>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const buildGradlePath = resolve(ROOT, 'android/app/build.gradle');

if (!existsSync(buildGradlePath)) {
  console.error('[prepare-android] android/app/build.gradle not found. Run `npx cap add android` first.');
  process.exit(1);
}

const versionCode = String(process.argv[2] || process.env.GITHUB_RUN_NUMBER || '1');
const versionName = String(process.argv[3] || '2.0.0');

const hasSigningSecrets = Boolean(
  process.env.ORBIT_KEYSTORE_BASE64 &&
  process.env.ORBIT_KEYSTORE_PASSWORD &&
  process.env.ORBIT_KEY_ALIAS &&
  process.env.ORBIT_KEY_PASSWORD
);

let gradle = readFileSync(buildGradlePath, 'utf8');

// ---- 1. version ------------------------------------------------------------
if (!/versionCode\s+\d+/.test(gradle)) {
  console.error('[prepare-android] could not find versionCode in android/app/build.gradle.');
  process.exit(1);
}
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
gradle = gradle.replace(/versionName\s+"[^"]*"/, 'versionName "' + versionName + '"');

// ---- 2. signingConfigs block ----------------------------------------------
// Capacitor's template has no signingConfigs block, so insert one directly
// before `buildTypes {` (the only other place that token appears top-level).
const signingConfigs = hasSigningSecrets
  ? `    signingConfigs {
        release {
            storeFile file(System.getenv("ORBIT_KEYSTORE_PATH") ?: "orbit-release.keystore")
            storePassword System.getenv("ORBIT_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ORBIT_KEY_ALIAS")
            keyPassword System.getenv("ORBIT_KEY_PASSWORD")
        }
    }`
  : `    signingConfigs {
        release {
            // Debug keystore fallback: installable for testing only, NOT for the store.
            storeFile file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }`;

if (/^\s*signingConfigs\s*\{/m.test(gradle)) {
  // Replace the whole existing block (balanced-brace scan, not a lazy regex).
  const startMatch = /^\s*signingConfigs\s*\{/m.exec(gradle);
  const openBrace = gradle.indexOf('{', startMatch.index);
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < gradle.length; i++) {
    if (gradle[i] === '{') depth++;
    else if (gradle[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) {
    console.error('[prepare-android] unbalanced braces in signingConfigs block.');
    process.exit(1);
  }
  gradle = gradle.slice(0, startMatch.index) + signingConfigs.trimStart() + gradle.slice(end + 1);
} else {
  const anchor = /^(\s*)buildTypes\s*\{/m;
  if (!anchor.test(gradle)) {
    console.error('[prepare-android] could not find buildTypes block to anchor the signing config.');
    process.exit(1);
  }
  gradle = gradle.replace(anchor, signingConfigs + '\n$1buildTypes {');
}

// ---- 3. point the release build type at it ---------------------------------
// Only touch the `release` block nested inside `buildTypes`, not the one inside
// signingConfigs. Locate buildTypes first, then scan for its release child.
const btMatch = /^\s*buildTypes\s*\{/m.exec(gradle);
if (!btMatch) {
  console.error('[prepare-android] buildTypes block missing after edit.');
  process.exit(1);
}
const btOpen = gradle.indexOf('{', btMatch.index);
let depth = 0;
let btClose = -1;
for (let i = btOpen; i < gradle.length; i++) {
  if (gradle[i] === '{') depth++;
  else if (gradle[i] === '}') {
    depth--;
    if (depth === 0) { btClose = i; break; }
  }
}
const buildTypesBody = gradle.slice(btOpen + 1, btClose);
const relMatch = /release\s*\{/.exec(buildTypesBody);
if (!relMatch) {
  console.error('[prepare-android] no release block inside buildTypes.');
  process.exit(1);
}
const relOpenInBody = buildTypesBody.indexOf('{', relMatch.index);
let relDepth = 0;
let relCloseInBody = -1;
for (let i = relOpenInBody; i < buildTypesBody.length; i++) {
  if (buildTypesBody[i] === '{') relDepth++;
  else if (buildTypesBody[i] === '}') {
    relDepth--;
    if (relDepth === 0) { relCloseInBody = i; break; }
  }
}
let releaseBody = buildTypesBody.slice(relOpenInBody + 1, relCloseInBody);
if (/signingConfig\s+signingConfigs\./.test(releaseBody)) {
  releaseBody = releaseBody.replace(/signingConfig\s+signingConfigs\.\w+/, 'signingConfig signingConfigs.release');
} else {
  releaseBody = releaseBody.replace(/\s*$/, '\n            signingConfig signingConfigs.release\n        ');
}
const newBuildTypesBody = buildTypesBody.slice(0, relOpenInBody + 1) + releaseBody + buildTypesBody.slice(relCloseInBody);
gradle = gradle.slice(0, btOpen + 1) + newBuildTypesBody + gradle.slice(btClose);

writeFileSync(buildGradlePath, gradle, 'utf8');

// ---- report ----------------------------------------------------------------
const sha = createHash('sha256').update(readFileSync(buildGradlePath)).digest('hex').slice(0, 12);
console.log('[prepare-android] versionCode=' + versionCode + ' versionName=' + versionName);
console.log('[prepare-android] signing=' + (hasSigningSecrets ? 'release keystore' : 'debug keystore fallback'));
console.log('[prepare-android] build.gradle sha256:' + sha);
