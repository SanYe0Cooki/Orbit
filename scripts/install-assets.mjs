#!/usr/bin/env node
/**
 * Copy the generated icon and splash assets out of ./assets into the Android
 * and iOS native projects.
 *
 * Run this after regenerating assets/make-icons.py and after `cap add`/`cap sync`.
 * The `cap sync` step only copies the web/ folder, so app icons must be
 * installed here.
 *
 * Usage: node scripts/install-assets.mjs
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve everything against the repository root, never the current working
// directory, so the script behaves the same from CI and from any shell.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const ASSETS = join(ROOT, 'assets');
const ANDROID_RES = join(ROOT, 'android/app/src/main/res');
const IOS_APPICON = join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const IOS_SPLASH = join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');

let installed = 0;
let missing = [];

function need(name) {
  const path = join(ASSETS, name);
  if (!existsSync(path)) { missing.push(name); return null; }
  return path;
}

function put(srcName, dest) {
  const src = need(srcName);
  if (!src) return;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  installed++;
}

// ---------------------------------------------------------------- Android ---
// Legacy launcher icon per density (uses the pre-rounded variant so it still
// looks intentional on Android 7 and older).
const ANDROID_ICONS = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];
for (const [folder, size] of ANDROID_ICONS) {
  const file = 'icon-' + size + '-android.png';
  put(file, join(ANDROID_RES, folder, 'ic_launcher.png'));
  put(file, join(ANDROID_RES, folder, 'ic_launcher_round.png'));
  // Adaptive-icon foreground layer: 108dp canvas whose inner 72dp is visible,
  // so the source is scaled to ~66% before being placed on the canvas.
  put('icon-foreground.png', join(ANDROID_RES, folder, 'ic_launcher_foreground.png'));
}

// Android 12+ splash icon (centred on the launch background colour).
put('icon-512.png', join(ANDROID_RES, 'drawable', 'splash_icon.png'));

// ---------------------------------------------------------------- iOS -------
// Capacitor's template ships a single 1024x1024 universal marketing icon.
put('icon-1024.png', join(IOS_APPICON, 'AppIcon-512@2x.png'));

[['splash-2732x2732.png', 'splash-2732.png'],
 ['splash-2732x2732-1.png', 'splash-2732.png'],
 ['splash-2732x2732-2.png', 'splash-2732.png']].forEach(([dest, src]) => {
  put(src, join(IOS_SPLASH, dest));
});
put('splash-dark-2732.png', join(IOS_SPLASH, 'splash-2732x2732-dark.png'));

// A dark-appearance entry so the splash matches the dark UI.
const splashContents = {
  images: [
    { idiom: 'universal', filename: 'splash-2732x2732-2.png', scale: '1x' },
    { idiom: 'universal', filename: 'splash-2732x2732-1.png', scale: '2x' },
    { idiom: 'universal', filename: 'splash-2732x2732.png', scale: '3x' },
    { idiom: 'universal', filename: 'splash-2732x2732-dark.png', scale: '1x', appearances: [{ appearance: 'luminosity', value: 'dark' }] }
  ],
  info: { version: 1, author: 'xcode' }
};
writeFileSync(join(IOS_SPLASH, 'Contents.json'), JSON.stringify(splashContents, null, 2) + '\n', 'utf8');
installed++;

// ------------------------------------------------------- store listing ------
mkdirSync(join(ROOT, 'store'), { recursive: true });
put('play-store-icon-512.png', join(ROOT, 'store/play-store-icon-512.png'));

// ---------------------------------------------------------------- report ----
console.log('[install-assets] installed ' + installed + ' files into ' + ROOT);
if (missing.length) {
  console.warn('[install-assets] MISSING source assets: ' + [...new Set(missing)].join(', '));
  console.warn('[install-assets] run: python assets/make-icons.py && python assets/derive-missing-icons.py');
  process.exitCode = 1;
} else {
  console.log('[install-assets] android: ' + readdirSync(ANDROID_RES).filter((d) => d.startsWith('mipmap')).join(', '));
  console.log('[install-assets] ios: AppIcon + Splash imagesets updated');
}
