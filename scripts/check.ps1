#Requires -Version 5.1
<#
.SYNOPSIS
    Runs security audit, tests, and coverage in parallel and prints a compact summary.

.DESCRIPTION
    Spawns three background jobs (npm run security | test:run | test:coverage),
    streams progress while they execute, then renders a synthetic report:
    status (OK/KO), per-job duration, parsed metrics (vulns / passed-failed / coverage %),
    and tails the output of any failed job. Exit code is non-zero if any check failed.
#>

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    Write-Host "ERROR: package.json not found at $root" -ForegroundColor Red
    exit 2
}

function Strip-Ansi([string]$text) {
    if ($null -eq $text) { return '' }
    return ($text -replace '\x1b\[[0-9;?]*[a-zA-Z]', '')
}

$tasks = @(
    [pscustomobject]@{ Name = 'Security'; Script = 'security'      }
    [pscustomobject]@{ Name = 'Tests';    Script = 'test:run'      }
    [pscustomobject]@{ Name = 'Coverage'; Script = 'test:coverage' }
)

Write-Host ''
Write-Host '>>> Running in parallel: security | tests | coverage' -ForegroundColor Magenta
Write-Host ''

$globalSw = [Diagnostics.Stopwatch]::StartNew()

$jobs = foreach ($t in $tasks) {
    Start-Job -Name $t.Name -ScriptBlock {
        param($root, $script)
        Set-Location -LiteralPath $root
        $env:NO_COLOR    = '1'
        $env:FORCE_COLOR = '0'
        $env:CI          = '1'
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $out = & npm run $script 2>&1 | Out-String
        $code = $LASTEXITCODE
        $sw.Stop()
        [pscustomobject]@{
            ExitCode = $code
            Duration = $sw.Elapsed
            Output   = $out
        }
    } -ArgumentList $root, $t.Script
}

while ($jobs | Where-Object { $_.State -eq 'Running' }) {
    Start-Sleep -Milliseconds 750
    $running = ($jobs | Where-Object { $_.State -eq 'Running' } | ForEach-Object { $_.Name }) -join ', '
    $done    = ($jobs | Where-Object { $_.State -ne 'Running' } | ForEach-Object { $_.Name }) -join ', '
    $line    = "  [{0,5:N1}s]  running: {1,-40}  done: {2}" -f $globalSw.Elapsed.TotalSeconds, $running, $done
    Write-Host -NoNewline ("`r" + $line.PadRight(110))
}
Write-Host -NoNewline ("`r" + (' ' * 110) + "`r")

Wait-Job -Job $jobs | Out-Null
$globalSw.Stop()

$results = [ordered]@{}
foreach ($j in $jobs) {
    $results[$j.Name] = Receive-Job -Job $j
    Remove-Job -Job $j -Force
}

function Parse-Vitest($text) {
    $c = Strip-Ansi $text
    $passed = 0; $failed = 0; $skipped = 0; $files = 0
    if ($c -match '(?m)^\s*Tests\s+(?:(\d+)\s+failed[^|]*\|\s*)?(?:(\d+)\s+skipped[^|]*\|\s*)?(\d+)\s+passed') {
        if ($matches[1]) { $failed  = [int]$matches[1] }
        if ($matches[2]) { $skipped = [int]$matches[2] }
        $passed = [int]$matches[3]
    }
    if ($c -match '(?m)^\s*Test Files\s+(?:\d+\s+failed[^|]*\|\s*)?(\d+)\s+passed\s*\((\d+)\)') {
        $files = [int]$matches[2]
    }
    return [pscustomobject]@{ Passed = $passed; Failed = $failed; Skipped = $skipped; Files = $files }
}

function Parse-Coverage($text) {
    $c = Strip-Ansi $text
    foreach ($line in ($c -split "`r?`n")) {
        if ($line -match '^\s*All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)') {
            return [pscustomobject]@{
                Statements = [double]$matches[1]
                Branches   = [double]$matches[2]
                Functions  = [double]$matches[3]
                Lines      = [double]$matches[4]
            }
        }
    }
    return $null
}

function Parse-Audit($text) {
    $c = Strip-Ansi $text
    if ($c -match 'found\s+(\d+)\s+vulnerabilit') { return [int]$matches[1] }
    if ($c -match '(?i)passed\s+npm\s+audit') { return 0 }
    if ($c -match '(?im)^\s*0\s+vulnerabilities') { return 0 }
    return $null
}

$bar = ('=' * 72)
Write-Host ''
Write-Host $bar -ForegroundColor DarkGray
Write-Host '                              SYNTHESE'          -ForegroundColor White
Write-Host $bar -ForegroundColor DarkGray

$globalExitCode = 0
foreach ($t in $tasks) {
    $r = $results[$t.Name]
    if ($r.ExitCode -ne 0) { $globalExitCode = 1 }

    $statusText  = if ($r.ExitCode -eq 0) { '[OK]' } else { '[KO]' }
    $statusColor = if ($r.ExitCode -eq 0) { 'Green' } else { 'Red' }
    $dur         = "{0,6:N1}s" -f $r.Duration.TotalSeconds

    Write-Host ('  {0} ' -f $statusText)  -ForegroundColor $statusColor -NoNewline
    Write-Host ('{0,-10}' -f $t.Name)     -ForegroundColor White        -NoNewline
    Write-Host (' {0}  ' -f $dur)         -ForegroundColor DarkGray     -NoNewline

    switch ($t.Name) {
        'Security' {
            $vuln = Parse-Audit $r.Output
            if ($null -ne $vuln) {
                $vColor = if ($vuln -eq 0) { 'Green' } else { 'Yellow' }
                Write-Host ("vulns: {0}" -f $vuln) -ForegroundColor $vColor -NoNewline
                Write-Host '  |  audit + eslint-security + tests/security' -ForegroundColor DarkCyan
            } else {
                Write-Host 'audit + eslint-security + tests/security' -ForegroundColor DarkCyan
            }
        }
        'Tests' {
            $v = Parse-Vitest $r.Output
            $skip = if ($v.Skipped -gt 0) { ", $($v.Skipped) skipped" } else { '' }
            $failColor = if ($v.Failed -eq 0) { 'Green' } else { 'Red' }
            Write-Host ("{0} passed" -f $v.Passed) -ForegroundColor Green -NoNewline
            Write-Host (", {0} failed{1}" -f $v.Failed, $skip) -ForegroundColor $failColor -NoNewline
            Write-Host ("  across {0} files" -f $v.Files) -ForegroundColor DarkCyan
        }
        'Coverage' {
            $c = Parse-Coverage $r.Output
            if ($c) {
                $covColor = if ($c.Lines -ge 80) { 'Green' } elseif ($c.Lines -ge 50) { 'Yellow' } else { 'DarkYellow' }
                Write-Host ("stmts {0,5:N1}%" -f $c.Statements) -ForegroundColor $covColor -NoNewline
                Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
                Write-Host ("branch {0,5:N1}%" -f $c.Branches) -ForegroundColor $covColor -NoNewline
                Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
                Write-Host ("funcs {0,5:N1}%" -f $c.Functions) -ForegroundColor $covColor -NoNewline
                Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
                Write-Host ("lines {0,5:N1}%" -f $c.Lines) -ForegroundColor $covColor
            } else {
                Write-Host '(coverage report not parsed)' -ForegroundColor DarkYellow
            }
        }
    }
}

$serialTotal = ($results.Values | ForEach-Object { $_.Duration.TotalSeconds } | Measure-Object -Sum).Sum
$saved       = [Math]::Max(0, $serialTotal - $globalSw.Elapsed.TotalSeconds)

Write-Host ''
Write-Host ('  wall clock (parallel) : {0,6:N1}s' -f $globalSw.Elapsed.TotalSeconds) -ForegroundColor DarkGray
Write-Host ('  cumulative CPU        : {0,6:N1}s   (saved {1,5:N1}s vs serial)' -f $serialTotal, $saved) -ForegroundColor DarkGray
Write-Host $bar -ForegroundColor DarkGray

$failures = $tasks | Where-Object { $results[$_.Name].ExitCode -ne 0 }
if ($failures) {
    Write-Host ''
    Write-Host '>>> Failure output (last 30 non-empty lines per job)' -ForegroundColor Red
    foreach ($f in $failures) {
        $r = $results[$f.Name]
        Write-Host ''
        $header = ('--- {0}  (exit {1}) ' -f $f.Name, $r.ExitCode).PadRight(72, '-')
        Write-Host $header -ForegroundColor Red
        $cleaned = Strip-Ansi $r.Output
        $tail    = ($cleaned -split "`r?`n") | Where-Object { $_ -match '\S' } | Select-Object -Last 30
        $tail | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor Gray }
    }
    Write-Host ''
}

if ($globalExitCode -eq 0) {
    Write-Host '  ALL CHECKS PASSED' -ForegroundColor Green
} else {
    Write-Host '  ONE OR MORE CHECKS FAILED' -ForegroundColor Red
}
Write-Host ''

exit $globalExitCode
