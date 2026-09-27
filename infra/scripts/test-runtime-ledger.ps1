# Creates a new disposable cluster. Never reads DATABASE_URL or an existing cluster.
[CmdletBinding()]
param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$drillId = [Guid]::NewGuid().ToString('N')
$drillRoot = Join-Path $tempRoot "hotl-runtime-drill-$drillId"
$dataDir = Join-Path $drillRoot 'data'
$markerPath = Join-Path $drillRoot '.hotl-disposable'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
$initdb = Join-Path $PostgresBin 'initdb.exe'
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
foreach ($binary in @($pgCtl, $psql, $initdb, $pgDump, $pgRestore)) {
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "PostgreSQL binary missing: $binary" }
}

function Invoke-Checked {
    param([string]$Binary, [string[]]$Arguments)
    if ($Binary -eq $pgCtl) {
        # Detached PostgreSQL descendants must not inherit the tool's output pipe.
        # Start-Process -Wait waits for descendants on Windows; wait on pg_ctl only.
        $quotedArgs = $Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
        $process = Start-Process -FilePath $Binary -ArgumentList $quotedArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $drillRoot 'pgctl-output.log') -RedirectStandardError (Join-Path $drillRoot 'pgctl-error.log')
        if (-not $process.WaitForExit(45000)) { throw 'Disposable pg_ctl exceeded its timeout; inspect retained drill files.' }
        if ($process.ExitCode -ne 0) { throw "pg_ctl failed ($($process.ExitCode)); inspect retained drill logs." }
        return
    }
    & $Binary @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Binary" }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$baseSqlArgs = @('-X', '-w', '-h', '127.0.0.1', '-p', [string]$port, '-U', 'hotl_runtime_drill', '-v', 'ON_ERROR_STOP=1')
$sqlArgs = $baseSqlArgs + @('-d', 'hotl_runtime_drill')
$started = $false
$passed = $false
$priorTestUrl = $env:HOTL_RUNTIME_TEST_DATABASE_URL
$priorAllow = $env:HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE
New-Item -ItemType Directory -Path $drillRoot | Out-Null
Set-Content -LiteralPath $markerPath -Value $drillId -Encoding ascii
Write-Output "Disposable runtime ledger drill: $drillRoot (loopback port $port)"
try {
    Invoke-Checked $initdb @('-D', $dataDir, '-U', 'hotl_runtime_drill', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C')
    Invoke-Checked $pgCtl @('-D', $dataDir, '-l', (Join-Path $drillRoot 'postgres.log'), '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
    $started = $true
    Invoke-Checked $psql ($baseSqlArgs + @('-d', 'postgres', '-c', 'CREATE DATABASE hotl_runtime_drill'))
    Invoke-Checked $psql ($sqlArgs + @('-f', (Join-Path $repoRoot 'infra/supabase/migrations/202609090002_runtime_ledger.sql')))
    $env:HOTL_RUNTIME_TEST_DATABASE_URL = "postgresql://hotl_runtime_drill@127.0.0.1:$port/hotl_runtime_drill"
    $env:HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE = '1'
    Push-Location -LiteralPath $repoRoot
    try { Invoke-Checked 'pnpm' @('--filter', '@hotl/guardrail-service', 'exec', 'vitest', 'run', 'test/postgres-store.test.ts') }
    finally { Pop-Location }

    # Real database restart, followed by a deterministic digest of all committed
    # state and ledger rows. Includes the deliberately corrupt tamper fixture.
    $digestSql = "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(s) ORDER BY workspace_id) FROM hotl_runtime.workspace_state s),(SELECT jsonb_agg(to_jsonb(a) ORDER BY workspace_id,sequence) FROM hotl_runtime.audit_entries a))::text)"
    $before = (& $psql @sqlArgs -t -A -c $digestSql | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $before -notmatch '^[0-9a-f]{32}$') { throw 'Could not capture pre-restart persistence digest.' }
    Invoke-Checked $pgCtl @('-D', $dataDir, '-m', 'fast', '-w', 'restart')
    $after = (& $psql @sqlArgs -t -A -c $digestSql | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $after -ne $before) { throw 'Persisted ledger changed across PostgreSQL restart.' }
    Write-Output "Runtime ledger state/audit MD5 before and after restart: $before"
    # Restore a real logical backup into a second disposable database. The source
    # stays intact; the existing cluster roles allow the restored grants/bindings
    # to be exercised without exporting any application credentials.
    $backupPath = Join-Path $drillRoot 'runtime-ledger.dump'
    Invoke-Checked $pgDump @('-w', '-h', '127.0.0.1', '-p', [string]$port, '-U', 'hotl_runtime_drill', '-d', 'hotl_runtime_drill', '-Fc', '-f', $backupPath)
    $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
    Invoke-Checked $psql ($baseSqlArgs + @('-d', 'postgres', '-c', 'CREATE DATABASE hotl_runtime_restored'))
    Invoke-Checked $pgRestore @('-w', '-h', '127.0.0.1', '-p', [string]$port, '-U', 'hotl_runtime_drill', '-d', 'hotl_runtime_restored', '--exit-on-error', $backupPath)
    $restoreArgs = $baseSqlArgs + @('-d', 'hotl_runtime_restored')
    $restored = (& $psql @restoreArgs -t -A -c $digestSql | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $restored -ne $before) { throw 'Restored state/audit differs from its backup source.' }
    if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash -ne $backupHash) { throw 'Backup changed during restoration.' }
    Write-Output "Restored runtime ledger state/audit MD5: $restored"
    Write-Output "Custom-format backup SHA-256: $backupHash"
    Invoke-Checked $psql ($restoreArgs + @('-f', (Join-Path $repoRoot 'infra/scripts/verify-runtime-restore.sql')))
    $passed = $true
    Write-Output '[OK] Runtime ledger integration tests, database restart, backup/restore digest and restored authorization checks passed.'
}
finally {
    $env:HOTL_RUNTIME_TEST_DATABASE_URL = $priorTestUrl
    $env:HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE = $priorAllow
    if (-not $started) {
        & $pgCtl -D $dataDir status *> $null
        $started = $LASTEXITCODE -eq 0
    }
    if ($started) {
        & $pgCtl -D $dataDir -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw "Could not stop disposable cluster; retained at $drillRoot" }
    }
    if ($passed) {
        $resolvedRoot = (Resolve-Path -LiteralPath $drillRoot).Path
        $expectedRoot = [IO.Path]::GetFullPath((Join-Path $tempRoot "hotl-runtime-drill-$drillId"))
        $insideTemp = $resolvedRoot.StartsWith(($tempRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)
        if (-not $insideTemp -or $resolvedRoot -ne $expectedRoot -or (Get-Content -LiteralPath $markerPath -Raw).Trim() -ne $drillId) {
            throw "Cleanup target verification failed; retained at $drillRoot"
        }
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
    }
    else { Write-Warning "Failed drill artifacts retained at $drillRoot" }
}
