# Build-CRX.ps1
#
# Packages the MV3 extension folder into a signed Chromium `.crx`.
# A repository with a pinned extension ID must be packed with its matching
# private key. Refuse to invent a replacement identity when that key is absent.

[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$ExtensionDir = 'extension',
    [string]$OutputDir = 'dist',
    [string]$KeyPath,
    [string]$BrowserPath,
    [switch]$SkipExtensionBuild
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

function Resolve-BrowserBinary([string]$PreferredPath) {
    if ($PreferredPath) {
        $resolved = Resolve-AbsolutePath $RepoRoot $PreferredPath
        if (-not (Test-Path -LiteralPath $resolved)) {
            throw "BrowserPath not found: $resolved"
        }
        return $resolved
    }

    $cmdCandidates = @('chrome', 'msedge')
    foreach ($cmd in $cmdCandidates) {
        $found = Get-Command -Name $cmd -ErrorAction SilentlyContinue
        if ($found) { return $found.Source }
    }

    $pathCandidates = @(
        'C:\Program Files\Google\Chrome\Application\chrome.exe',
        'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    )
    foreach ($candidate in $pathCandidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    throw 'Could not locate Chrome or Edge. Set -BrowserPath to a Chromium-family browser binary.'
}

function Remove-DirectoryIfPresent([string]$TargetPath) {
    if (-not (Test-Path -LiteralPath $TargetPath)) { return }
    Remove-Item -LiteralPath $TargetPath -Recurse -Force
}

$repoRootAbs = (Resolve-Path -LiteralPath $RepoRoot).Path
$extensionDirAbs = Resolve-AbsolutePath $repoRootAbs $ExtensionDir
$outputDirAbs = Resolve-AbsolutePath $repoRootAbs $OutputDir

if (-not (Test-Path -LiteralPath $extensionDirAbs)) {
    throw "Extension directory not found: $extensionDirAbs"
}

if (-not $SkipExtensionBuild) {
    & (Join-Path $repoRootAbs 'Build-Extension.ps1') -RepoRoot $repoRootAbs
    if ($LASTEXITCODE -ne 0) {
        throw 'Build-Extension.ps1 failed before CRX packaging.'
    }
}

if (-not (Test-Path -LiteralPath $outputDirAbs)) {
    New-Item -ItemType Directory -Path $outputDirAbs | Out-Null
}

$manifestPath = Join-Path $extensionDirAbs 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.version) {
    throw "Manifest version missing in $manifestPath"
}

if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    $KeyPath = Join-Path $outputDirAbs 'YoutubeAdblock-extension.pem'
} else {
    $KeyPath = Resolve-AbsolutePath $repoRootAbs $KeyPath
}

$expectedIdPath = Join-Path $extensionDirAbs 'extension-id.txt'
if ((Test-Path -LiteralPath $expectedIdPath) -and -not (Test-Path -LiteralPath $KeyPath)) {
    throw "Stable CRX key not found at $KeyPath. Supply the private key matching $expectedIdPath with -KeyPath. Refusing to generate a new extension identity."
}

$browserBinary = Resolve-BrowserBinary $BrowserPath
$version = [string]$manifest.version
$artifactName = "YoutubeAdblock-extension-v$version.crx"
$artifactPath = Join-Path $outputDirAbs $artifactName

$packRoot = Join-Path $outputDirAbs 'crx-pack'
$packDir = Join-Path $packRoot 'YoutubeAdblock-extension'
$generatedCrx = Join-Path $packRoot 'YoutubeAdblock-extension.crx'
$generatedPem = Join-Path $packRoot 'YoutubeAdblock-extension.pem'

Remove-DirectoryIfPresent $packRoot
New-Item -ItemType Directory -Path $packRoot | Out-Null
Copy-Item -LiteralPath $extensionDirAbs -Destination $packDir -Recurse

$devReadme = Join-Path $packDir 'README.md'
if (Test-Path -LiteralPath $devReadme) {
    Remove-Item -LiteralPath $devReadme -Force
}

if (Test-Path -LiteralPath $artifactPath) {
    Remove-Item -LiteralPath $artifactPath -Force
}

$args = @(
    "--pack-extension=$packDir",
    '--no-message-box'
)
if (Test-Path -LiteralPath $KeyPath) {
    $args += "--pack-extension-key=$KeyPath"
}

$process = Start-Process -FilePath $browserBinary -ArgumentList $args -Wait -PassThru
if (-not (Test-Path -LiteralPath $generatedCrx)) {
    throw "Chromium pack step failed (exit code $($process.ExitCode)); no CRX was generated."
}

$verifyScriptPath = Join-Path $repoRootAbs 'tools\verify-release-artifacts.mjs'
& node $verifyScriptPath --repo-root $repoRootAbs --crx-path $generatedCrx
if ($LASTEXITCODE -ne 0) {
    throw 'Generated CRX failed identity or signature verification.'
}

if (-not (Test-Path -LiteralPath $KeyPath) -and (Test-Path -LiteralPath $generatedPem)) {
    Move-Item -LiteralPath $generatedPem -Destination $KeyPath -Force
} elseif (Test-Path -LiteralPath $generatedPem) {
    Remove-Item -LiteralPath $generatedPem -Force
}

Move-Item -LiteralPath $generatedCrx -Destination $artifactPath -Force
Remove-DirectoryIfPresent $packRoot

Write-Host "Wrote $artifactPath"
Write-Host "Key  $KeyPath"
