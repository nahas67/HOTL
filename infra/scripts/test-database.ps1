# Creates a new disposable PostgreSQL cluster. Never uses DATABASE_URL or an existing cluster.
[CmdletBinding()]
param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$drillId = [Guid]::NewGuid().ToString('N')
$drillRoot = Join-Path $tempRoot "hotl-sql-drill-$drillId"
$dataDir = Join-Path $drillRoot 'data'
$markerPath = Join-Path $drillRoot '.hotl-disposable'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
$initdb = Join-Path $PostgresBin 'initdb.exe'
foreach ($binary in @($pgCtl, $psql, $initdb)) {
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "PostgreSQL binary missing: $binary" }
}

function Invoke-Checked {
    param([string]$Binary, [string[]]$Arguments)
    & $Binary @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Binary" }
}

# Ask Windows for an unused loopback port. Startup fails safely if another process takes it.
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$sqlArgs = @('-X', '-w', '-h', '127.0.0.1', '-p', [string]$port, '-U', 'hotl_drill', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
$started = $false
$passed = $false
$raceProcesses = @()
New-Item -ItemType Directory -Path $drillRoot | Out-Null
Set-Content -LiteralPath $markerPath -Value $drillId -Encoding ascii
Write-Output "Disposable PostgreSQL drill: $drillRoot (loopback port $port)"
try {
    Invoke-Checked $initdb @('-D', $dataDir, '-U', 'hotl_drill', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C')
    Invoke-Checked $pgCtl @('-D', $dataDir, '-l', (Join-Path $drillRoot 'postgres.log'), '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
    $started = $true
    foreach ($sqlFile in @('infra/postgres/bootstrap.sql', 'infra/supabase/migrations/202609070001_hotl.sql', 'infra/scripts/test-database.sql')) {
        Invoke-Checked $psql ($sqlArgs + @('-f', (Join-Path $repoRoot $sqlFile)))
    }

    # Independent connections contend for the same owner's $100 daily ceiling.
    foreach ($suffix in @('a', 'b')) {
        $raceSql = Join-Path $drillRoot "race-$suffix.sql"
        $statement = "set role hotl_guardrail; select public.reserve_ad_spend('00000000-0000-0000-0000-000000000002','marketing_agent','race-$suffix',6000,'USD','concurrent-key-$suffix');"
        Set-Content -LiteralPath $raceSql -Value $statement -Encoding ascii
        # Start-Process joins ArgumentList, so quote the generated file path explicitly.
        $arguments = $sqlArgs + @('-f', ('"' + $raceSql + '"'))
        $raceProcesses += Start-Process -FilePath $psql -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $drillRoot "race-$suffix.out") -RedirectStandardError (Join-Path $drillRoot "race-$suffix.err")
    }
    foreach ($process in $raceProcesses) {
        $process.WaitForExit()
        $process.Refresh()
        if ($process.ExitCode -ne 0) { throw "Concurrent reservation process failed. Inspect $drillRoot" }
    }
    Invoke-Checked $psql ($sqlArgs + @('-f', (Join-Path $repoRoot 'infra/scripts/test-database-concurrency.sql')))
    $passed = $true
    Write-Output '[OK] Migration, owner isolation, write denial, audit immutability, refund escrow, kill latch, and concurrent spend tests passed.'
}
finally {
    # Stop only the new cluster identified by our freshly created data directory.
    # If startup partially failed, pg_ctl status determines whether cleanup must stop it.
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
        $expectedRoot = [IO.Path]::GetFullPath((Join-Path $tempRoot "hotl-sql-drill-$drillId"))
        $insideTemp = $resolvedRoot.StartsWith(($tempRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)
        if (-not $insideTemp -or $resolvedRoot -ne $expectedRoot -or (Get-Content -LiteralPath $markerPath -Raw).Trim() -ne $drillId) {
            throw "Cleanup target verification failed; retained at $drillRoot"
        }
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
    }
    else {
        Write-Warning "Failed drill artifacts retained at $drillRoot"
    }
}
