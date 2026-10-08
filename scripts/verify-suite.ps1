# HOTL local verification harness (2026-10-08).
# Runs each release-validation step, records status, never aborts the whole run.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$outDir = Join-Path $root 'artifacts\verify-2026-10-08'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$results = @()

function Invoke-Step {
  param([string]$Name, [string]$Command, [string]$LogName)
  $log = Join-Path $outDir $LogName
  Write-Output "=== STEP START: $Name ==="
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  cmd /c "$Command > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $sw.Stop()
  $script:results += [pscustomobject]@{
    Step = $Name; ExitCode = $code; Seconds = [math]::Round($sw.Elapsed.TotalSeconds,1); Log = $LogName
  }
  Write-Output "=== STEP END: $Name exit=$code secs=$($script:results[-1].Seconds) ==="
}

Invoke-Step 'pnpm lint'        'pnpm lint'        'lint.log'
Invoke-Step 'pnpm typecheck'   'pnpm typecheck'   'typecheck.log'
Invoke-Step 'pnpm test'        'pnpm test'        'test.log'
Invoke-Step 'pnpm build'       'pnpm build'       'build.log'
Invoke-Step 'pnpm test:e2e'    'pnpm test:e2e'    'e2e.log'

$results | ForEach-Object { "{0,-16} exit={1,-4} {2,7}s  -> {3}" -f $_.Step, $_.ExitCode, $_.Seconds, $_.Log }
Write-Output "=== SUITE COMPLETE ==="
