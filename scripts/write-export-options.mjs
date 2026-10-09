#!/usr/bin/env node
/**
 * Write the xcodebuild -exportArchive options plist.
 * Kept in a script so shell/heredoc quoting can never corrupt the plist.
 *
 * Usage: node scripts/write-export-options.mjs <outputPath>
 * Reads: APPLE_TEAM_ID, IOS_BUNDLE_ID, PROFILE_NAME
 */
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'exportOptions.plist';
const teamId = process.env.APPLE_TEAM_ID || '';
const bundleId = process.env.IOS_BUNDLE_ID || 'com.orbit.habits';
const profileName = process.env.PROFILE_NAME || '';

if (!teamId) {
  console.error('[export-options] APPLE_TEAM_ID is required.');
  process.exit(1);
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundleId}</key>
    <string>${profileName}</string>
  </dict>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
`;

writeFileSync(out, plist, 'utf8');
console.log('[export-options] wrote ' + out + ' for team ' + teamId + ' / ' + bundleId + ' / profile "' + profileName + '"');
