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

# Cache honesty: a turbo cache hit proves nothing about the current tree. The 2026-10-09
# QA audit found this harness ran plain `pnpm typecheck` and archived a log reading
# "11 cached, 11 total / FULL TURBO" while the checkpoint row claimed "--force / 0 cached".
# Typecheck and the turbo tests are therefore forced, so the archived log matches the claim.
Invoke-Step 'pnpm lint'        'pnpm lint'                                        'lint.log'
Invoke-Step 'typecheck forced' 'pnpm exec turbo run typecheck --force'           'typecheck.log'
Invoke-Step 'test forced'      'pnpm exec turbo run test --concurrency=2 --force' 'test.log'
Invoke-Step 'test root'        'node --test tests/dev-env.test.mjs tests/staging-readiness.test.mjs tests/repository-hygiene.test.mjs' 'test-root.log'
Invoke-Step 'pnpm build'       'pnpm build'                                       'build.log'
Invoke-Step 'pnpm test:e2e'    'pnpm test:e2e'                                    'e2e.log'

$results | ForEach-Object { "{0,-16} exit={1,-4} {2,7}s  -> {3}" -f $_.Step, $_.ExitCode, $_.Seconds, $_.Log }
Write-Output "=== SUITE COMPLETE ==="
