# Build-Release.ps1
#
# Local release gate for YoutubeAdblock. Regenerates generated files, runs
# syntax checks and tests, validates versions and generated outputs, then
# writes fresh install artifacts to dist/. Optional XPI output is unsigned and
# intended for development only; persistent Firefox installs require AMO/web-ext
# signing outside this local gate.

[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutputDir = 'dist',
    [ValidateSet('Userscript', 'Zip', 'Xpi', 'Crx')]
    [string[]]$Artifacts = @('Userscript', 'Zip', 'Crx'),
    [string]$BrowserPath,
    [switch]$VerifyPublication
)

if ([string]::IsNullOrEmpty($RepoRoot)) {
    if ($PSScriptRoot) {
        $RepoRoot = $PSScriptRoot
    } else {
        $RepoRoot = (Get-Location).Path
    }
}

$ErrorActionPreference = 'Stop'

function Resolve-AbsolutePath([string]$Base, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
    return (Join-Path $Base $Value)
}

function Remove-DirectoryIfPresent([string]$TargetPath) {
    if (Test-Path -LiteralPath $TargetPath) {
        Remove-Item -LiteralPath $TargetPath -Recurse -Force
    }
}

function Invoke-Checked([scriptblock]$Block, [string]$FailureMessage) {
    & $Block
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Get-UserscriptVersion([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    $header = [regex]::Match($text, '(?m)^//\s*@version\s+(\S+)')
    $runtime = [regex]::Match($text, "const SCRIPT_VERSION = '([^']+)'")
    if (-not $header.Success) { throw "Userscript @version missing in $Path" }
    if (-not $runtime.Success) { throw "Userscript SCRIPT_VERSION missing in $Path" }
    if ($header.Groups[1].Value -ne $runtime.Groups[1].Value) {
        throw "Userscript @version and SCRIPT_VERSION differ."
    }
    return $header.Groups[1].Value
}

function Test-JsonEqual([string]$ActualPath, [string]$ExpectedJson, [string]$Label) {
    $actual = Get-Content -LiteralPath $ActualPath -Raw | ConvertFrom-Json
    $actualJson = $actual | ConvertTo-Json -Depth 30 -Compress
    if ($actualJson -ne $ExpectedJson) {
        throw "$Label is stale or does not match its source."
    }
}

function Copy-ExtensionPayload([string]$SourceDir, [string]$TargetDir) {
    Remove-DirectoryIfPresent $TargetDir
    Copy-Item -LiteralPath $SourceDir -Destination $TargetDir -Recurse
    $readme = Join-Path $TargetDir 'README.md'
    if (Test-Path -LiteralPath $readme) {
        Remove-Item -LiteralPath $readme -Force
    }
}

function Write-ZipArtifact([string]$SourceDir, [string]$DestinationPath) {
    $tar = 'C:\Windows\System32\tar.exe'
    if (-not (Test-Path -LiteralPath $tar)) {
        throw 'Windows tar.exe not found; cannot create zip-compatible artifact.'
    }
    if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Force
    }
    Invoke-Checked { & $tar -a -c -f $DestinationPath -C $SourceDir . } "tar.exe failed while writing $DestinationPath"
}

$repoRootAbs = (Resolve-Path -LiteralPath $RepoRoot).Path
$outputDirAbs = Resolve-AbsolutePath $repoRootAbs $OutputDir
$sourcePath = Join-Path $repoRootAbs 'YoutubeAdblock.user.js'
$manifestPath = Join-Path $repoRootAbs 'extension\manifest.json'
$mainPath = Join-Path $repoRootAbs 'extension\main.js'
$networkSourcePath = Join-Path $repoRootAbs 'extension\rules\network-rules-source.json'
$networkOutputPath = Join-Path $repoRootAbs 'extension\rules\network-blocks.json'
$filterSignScriptPath = Join-Path $repoRootAbs 'tools\sign-filter-manifest.mjs'
$storePolicyScriptPath = Join-Path $repoRootAbs 'tools\verify-store-policy.mjs'
$artifactVerifyScriptPath = Join-Path $repoRootAbs 'tools\verify-release-artifacts.mjs'

if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing userscript: $sourcePath" }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Missing manifest: $manifestPath" }
if (-not (Test-Path -LiteralPath $networkSourcePath)) { throw "Missing network source: $networkSourcePath" }

if (-not (Test-Path -LiteralPath $outputDirAbs)) {
    New-Item -ItemType Directory -Path $outputDirAbs | Out-Null
}

$keyPath = Join-Path $outputDirAbs 'YoutubeAdblock-extension.pem'
Get-ChildItem -LiteralPath $outputDirAbs -File | Where-Object { $_.FullName -ne $keyPath } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}

& (Join-Path $repoRootAbs 'Build-Extension.ps1') -RepoRoot $repoRootAbs
if ($LASTEXITCODE -ne 0) { throw 'Build-Extension.ps1 failed.' }

$version = Get-UserscriptVersion $sourcePath
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]$manifest.version -ne $version) {
    throw "Manifest version $($manifest.version) does not match userscript version $version."
}

$readme = [System.IO.File]::ReadAllText((Join-Path $repoRootAbs 'README.md'))
if ($readme -notmatch "version-$([regex]::Escape($version))-58A6FF") {
    throw "README version badge does not match $version."
}

$generatedMain = [System.IO.File]::ReadAllText($mainPath)
if ($generatedMain -notmatch "const SCRIPT_VERSION = '$([regex]::Escape($version))'") {
    throw "extension/main.js is stale for version $version."
}

$networkSource = Get-Content -LiteralPath $networkSourcePath -Raw | ConvertFrom-Json
$expectedDnrJson = @($networkSource.dnrRules) | ConvertTo-Json -Depth 30 -Compress
Test-JsonEqual $networkOutputPath $expectedDnrJson 'extension/rules/network-blocks.json'

$node = Get-Command -Name node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required for release checks.' }
Invoke-Checked { & node $storePolicyScriptPath --repo-root $repoRootAbs } 'Store-policy preflight failed.'
Invoke-Checked { & node $filterSignScriptPath --repo-root $repoRootAbs } 'Filter manifest signing/verification failed.'
Invoke-Checked { & node $filterSignScriptPath --repo-root $repoRootAbs --filter webpack-ad-signatures.json --manifest webpack-ad-signatures.manifest.json --signature webpack-ad-signatures.json.sig } 'Webpack signature manifest signing/verification failed.'
Invoke-Checked { & node --check $sourcePath } 'node --check failed on YoutubeAdblock.user.js'
Invoke-Checked { & node --check $mainPath } 'node --check failed on extension/main.js'
Invoke-Checked { & node --check (Join-Path $repoRootAbs 'extension\background.js') } 'node --check failed on extension/background.js'
Invoke-Checked { & node --check (Join-Path $repoRootAbs 'extension\bridge.js') } 'node --check failed on extension/bridge.js'
$playwrightCorePath = Join-Path $repoRootAbs 'node_modules\playwright-core'
if (-not (Test-Path -LiteralPath $playwrightCorePath)) {
    throw 'Browser smoke dependencies are missing. Run npm ci before Build-Release.ps1.'
}
Invoke-Checked { & node --test (Join-Path $repoRootAbs 'tests\*.mjs') } 'Node test suite failed.'

$artifactSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($artifact in $Artifacts) { [void]$artifactSet.Add($artifact) }

if ($artifactSet.Contains('Userscript')) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $outputDirAbs "YoutubeAdblock-v$version.user.js") -Force
}

$packRoot = Join-Path $outputDirAbs 'release-pack'
$packDir = Join-Path $packRoot 'YoutubeAdblock-extension'
if ($artifactSet.Contains('Zip') -or $artifactSet.Contains('Xpi')) {
    Copy-ExtensionPayload (Join-Path $repoRootAbs 'extension') $packDir
    if ($artifactSet.Contains('Zip')) {
        Write-ZipArtifact $packDir (Join-Path $outputDirAbs "YoutubeAdblock-extension-v$version.zip")
    }
    if ($artifactSet.Contains('Xpi')) {
        $unsignedXpiPath = Join-Path $outputDirAbs "YoutubeAdblock-extension-v$version.unsigned.xpi"
        Write-ZipArtifact $packDir $unsignedXpiPath
        Write-Warning "Wrote unsigned development XPI only: $unsignedXpiPath. Persistent Firefox installs require AMO/web-ext signing."
    }
    Remove-DirectoryIfPresent $packRoot
}

if ($artifactSet.Contains('Crx')) {
    $crxArgs = @{
        RepoRoot = $repoRootAbs
        OutputDir = $outputDirAbs
        SkipExtensionBuild = $true
    }
    if ($BrowserPath) { $crxArgs.BrowserPath = $BrowserPath }
    & (Join-Path $repoRootAbs 'Build-CRX.ps1') @crxArgs
    if ($LASTEXITCODE -ne 0) { throw 'Build-CRX.ps1 failed.' }
}

$provenancePath = Join-Path $outputDirAbs "YoutubeAdblock-v$version.provenance.json"
$gitSha = & git -C $repoRootAbs rev-parse HEAD 2>$null
$gitDirty = if ((& git -C $repoRootAbs status --porcelain 2>$null)) { $true } else { $false }
$nodeVersion = & node --version 2>$null
$npmVersion = & npm --version 2>$null
$playwrightVersion = (Get-Content (Join-Path $repoRootAbs 'node_modules\playwright-core\package.json') -Raw | ConvertFrom-Json).version
$provenance = [ordered]@{
    schemaVersion = 1
    version = $version
    commitSha = if ($gitSha) { $gitSha.Trim() } else { 'unknown' }
    dirty = $gitDirty
    nodeVersion = if ($nodeVersion) { $nodeVersion.Trim() } else { 'unknown' }
    npmVersion = if ($npmVersion) { $npmVersion.Trim() } else { 'unknown' }
    playwrightVersion = if ($playwrightVersion) { $playwrightVersion } else { 'unknown' }
    builtAt = (Get-Date -Format 'o')
    testCommand = 'node --test tests/*.mjs'
}
$provenance | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provenancePath -Encoding UTF8

$staleArtifacts = Get-ChildItem -LiteralPath $outputDirAbs -File | Where-Object {
    $_.Name -ne 'YoutubeAdblock-extension.pem' -and $_.Name -notmatch [regex]::Escape("v$version")
}
if ($staleArtifacts) {
    throw "Stale artifact(s) remain in ${outputDirAbs}: $($staleArtifacts.Name -join ', ')"
}

Invoke-Checked { & node $artifactVerifyScriptPath --repo-root $repoRootAbs --output-dir $outputDirAbs } 'Release artifact verification failed.'

if ($VerifyPublication) {
    Invoke-Checked { & node $artifactVerifyScriptPath --repo-root $repoRootAbs --output-dir $outputDirAbs --verify-publication } 'Release publication verification failed.'
}

Write-Host "Release gate passed for v$version"
Get-ChildItem -LiteralPath $outputDirAbs -File | ForEach-Object {
    Write-Host "Artifact $($_.FullName)"
}
