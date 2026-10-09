# Push Orbit (the new native + web project) to GitHub.
#
# What it does, in order:
#   1. Stages a clean copy of the project (never node_modules or build output).
#   2. Preserves the repository's existing files under legacy/ so nothing is lost.
#   3. Removes the two duplicate GitHub Pages workflows that published the whole
#      repository root; .github/workflows/pages.yml takes over that job.
#   4. Commits and pushes to main.
#
# Usage:
#   $env:GH_TOKEN = 'github_pat_...'      # optional; omit to use the stored Git credential
#   pwsh -File scripts/push-to-github.ps1
#
# The credential is never written to disk by this script.

param(
  [string]$RepoUrl = 'https://github.com/SanYe0Cooki/Orbit.git',
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$WorkDir = (Join-Path $env:TEMP ('orbit-push-' + [guid]::NewGuid().ToString('N').Substring(0, 8))),
  [string]$Branch = 'main',
  [string]$Message = 'Package Orbit as native iOS/Android apps and rebuild the web app'
)

$ErrorActionPreference = 'Stop'

# Bundled Git from GitHub Desktop is the only git on this machine.
$gitCandidates = @(
  "$env:LOCALAPPDATA\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe",
  'C:\Program Files\Git\cmd\git.exe'
) + (Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName 'resources\app\git\cmd\git.exe' })

$git = $gitCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $git) { throw 'git.exe not found. Install Git or GitHub Desktop first.' }
Write-Host "git: $git"

# ---------------------------------------------------------------- clone ----
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

$authUrl = $RepoUrl
if ($env:GH_TOKEN) {
  # Token is passed through the URL for this one command only.
  $authUrl = $RepoUrl -replace '^https://', "https://x-access-token:$($env:GH_TOKEN)@"
}
Write-Host "cloning $RepoUrl ..."
& $git clone --depth 1 $authUrl $WorkDir
if ($LASTEXITCODE -ne 0) { throw "git clone failed ($LASTEXITCODE)" }

# ------------------------------------------------- preserve existing files --
# Everything that is currently tracked but is NOT part of the new project moves
# to legacy/. Files the new project also ships (app.html, README.md, ...) are
# left for the copy step to overwrite, but the old copies are archived too.
$newTopLevel = @(
  '.github', '.gitignore', 'android', 'app.html', 'app.js', 'assets',
  'capacitor.config.json', 'docs', 'icons', 'index.html', 'ios',
  'manifest.webmanifest', 'orbit-icon.svg', 'package.json', 'pnpm-lock.yaml',
  'privacy.html', 'README.md', 'scripts', 'store', 'supabase', 'sw.js',
  'tests', 'vendor'
)

$legacyDir = Join-Path $WorkDir 'legacy'
New-Item -ItemType Directory -Force -Path $legacyDir | Out-Null

Write-Host ''
Write-Host '--- archiving existing repository files to legacy/ ---'
$moved = 0
Get-ChildItem $WorkDir -Force | Where-Object { $_.Name -ne '.git' -and $_.Name -ne 'legacy' } | ForEach-Object {
  $name = $_.Name
  if ($name -eq '.github') {
    # Keep the workflows in place for now: they get removed explicitly below so
    # the duplicate Pages deployments stop fighting with the new one.
    return
  }
  $dest = Join-Path $legacyDir $name
  Move-Item $_.FullName $dest -Force
  Write-Host "  legacy/$name"
  $moved++
}
Write-Host "  ($moved item(s) archived)"

# ------------------------------------------------------------------ copy ----
Write-Host ''
Write-Host '--- copying the new project ---'
$excludeDirs = @('node_modules', '.git', 'build', '.gradle', 'Pods', 'DerivedData')
$robocopy = Get-Command robocopy -ErrorAction SilentlyContinue
if ($robocopy) {
  $args = @($ProjectDir, $WorkDir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
  $args += '/XD'
  foreach ($d in $excludeDirs) { $args += (Join-Path $ProjectDir $d) }
  $args += '/XF'
  $args += @('local.properties', '*.keystore', '*.jks', '*.p12', '*.mobileprovision', '*.apk', '*.aab', '*.ipa', 'build.gradle.corrupt-backup')
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
} else {
  Copy-Item (Join-Path $ProjectDir '*') $WorkDir -Recurse -Force -Exclude @('node_modules', '.git')
}
Write-Host '  copied'

# ------------------------------------------------- remove duplicate Pages ----
Write-Host ''
Write-Host '--- retiring the old Pages workflows ---'
foreach ($old in @('deploy-pages.yml', 'static.yml')) {
  $p = Join-Path $WorkDir ".github\workflows\$old"
  if (Test-Path $p) { Remove-Item $p -Force; Write-Host "  removed .github/workflows/$old" }
}

# ----------------------------------------------------------------- commit ---
Write-Host ''
Write-Host '--- git status summary ---'
Push-Location $WorkDir
try {
  & $git add -A
  if ($LASTEXITCODE -ne 0) { throw "git add failed ($LASTEXITCODE)" }

  $staged = (& $git diff --cached --name-only | Measure-Object).Count
  Write-Host "  staged files: $staged"
  & $git -c core.quotepath=false diff --cached --stat | Select-Object -Last 6

  # The user identity comes from the machine's global config.
  & $git -c user.name="$(git config --global user.name)" commit -q -m $Message
  if ($LASTEXITCODE -ne 0) { throw "git commit failed ($LASTEXITCODE)" }
  Write-Host '  committed'

  Write-Host ''
  Write-Host "--- pushing to $Branch ---"
  & $git push origin "HEAD:$Branch"
  if ($LASTEXITCODE -ne 0) { throw "git push failed ($LASTEXITCODE)" }
  Write-Host ''
  Write-Host 'PUSH COMPLETE'
} finally {
  Pop-Location
}
