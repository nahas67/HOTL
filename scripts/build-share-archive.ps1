<#
.SYNOPSIS
  Build a shareable HOTL archive that cannot embed secrets or local simulation state.

.DESCRIPTION
  The 2026-10-08 supply-chain review found that three snapshot ZIPs were committed to
  the public repository. Each embedded the full `.git` directory and the `.data`
  simulation/browser-test state. A separate local review found a live GitHub
  fine-grained PAT serialized into `apps/cockpit/.next/cache/turbopack` by the build.

  This script exists so that "share a snapshot" is a safe, repeatable action:

    Mode Committed   (default) archives the tracked tree via `git archive`. Ignored
                     state cannot be included because it is not in the index.
    Mode WorkingTree archives the working directory with an explicit exclusion list,
                     so uncommitted work can be shared deliberately and visibly.

  Evidence: evidence/supply-chain-review-2026-10-08/README.md

.EXAMPLE
  pwsh -File scripts/build-share-archive.ps1
  pwsh -File scripts/build-share-archive.ps1 -Mode WorkingTree -OutFile ..\HOTL-share.zip
#>
[CmdletBinding()]
param(
  [ValidateSet('Committed', 'WorkingTree')]
  [string]$Mode = 'Committed',
  [string]$OutFile,
  [string[]]$ExtraExclude = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $repoRoot

# Never copy these into a shareable archive, in either mode.
$NeverInclude = @(
  '.git', '.next', '.data', '.medusa', '.turbo', 'node_modules', 'dist',
  'artifacts', 'test-results', 'playwright-report', '.sites-checkout',
  '.repowise', '.secrets'
)

$stamp = Get-Date -Format 'yyyy-MM-dd'
if (-not $OutFile) {
  $OutFile = Join-Path ([IO.Path]::GetTempPath()) "HOTL-share-$stamp.zip"
}
$OutFile = [IO.Path]::GetFullPath($OutFile)

Write-Output "mode        : $Mode"
Write-Output "repository  : $repoRoot"
Write-Output "output      : $OutFile"

if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }

if ($Mode -eq 'Committed') {
  # Only indexed content can reach the archive; ignored state is excluded by construction.
  & git archive --format=zip --output=$OutFile HEAD
  if ($LASTEXITCODE -ne 0) { throw "git archive failed with exit code $LASTEXITCODE" }
  $source = 'git archive HEAD (tracked tree only)'
} else {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $exclude = @($NeverInclude + $ExtraExclude)
  $zip = [IO.Compression.ZipFile]::Open($OutFile, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $root = (Resolve-Path '.').Path
    $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force |
      Where-Object {
        $relative = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
        $segment = $relative.Split('/')[0]
        -not ($exclude -contains $segment) -and
          -not ($_.FullName -match '\\(node_modules|\.git|\.next|\.data|\.medusa|\.turbo)\\' -or $_.Extension -in '.zip', '.pem', '.key', '.p12', '.pfx')
      }
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relative,
        [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    $count = ($files | Measure-Object).Count
    Write-Output "entries     : $count"
  } finally { $zip.Dispose() }
  $source = 'working tree with explicit exclusions'
}

# Post-condition: prove the archive does not carry the state that caused the review.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$verify = [IO.Compression.ZipFile]::OpenRead($OutFile)
try {
  $entries = $verify.Entries.FullName
  $forbidden = $entries | Where-Object {
    $segment = $_.Split('/')[0]
    ($NeverInclude -contains $segment) -or $_ -match '^(apps|packages|infra)/.*/(\.next|\.data|\.medusa)/' -or $_ -match '\.zip$'
  }
  $size = (Get-Item -LiteralPath $OutFile).Length
  Write-Output "bytes       : $size"
  if ($forbidden) {
    Write-Output "FAILED post-check; forbidden entries present:"
    $forbidden | Select-Object -First 20 | ForEach-Object { Write-Output "  $_" }
    throw 'Archive contains ignored or generated state and must not be shared.'
  }
  Write-Output "post-check  : PASS - no .git, .data, .next, .medusa, node_modules or nested .zip"
} finally { $verify.Dispose() }

Write-Output "source      : $source"
Write-Output "OK          : $OutFile"
