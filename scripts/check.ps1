#Requires -Version 5.1
<#
.SYNOPSIS
    Runs every gate of a pull request locally and prints a compact summary.

.DESCRIPTION
    First, in parallel background jobs: npm run typecheck | lint | security |
    test:coverage (the unit, providers and integration projects, measured;
    coverage fails only on the floors of the safety-critical modules,
    tests/support/coverage-floors.ts). Then, alone, the end-to-end run: it
    builds the CLI and drives it in a real terminal, whose timings must not
    compete with the jobs above for the CPU.

    Renders status (OK/KO), per-job duration and parsed metrics, and tails the
    output of any failed job. Exit code is non-zero if any check failed.

.PARAMETER E2E
    smoke (default): the suites every pull request runs, no network.
    full: also the real providers of this machine (read-only) and the network.
    mutate: full, plus the sandboxed npm update and the gup-it-<random>
    scheduled task (GUP_MUTATE=1).
    none: skip the end-to-end run.

.EXAMPLE
    scripts\check.cmd
    scripts\check.cmd -E2E full
#>
param(
    [ValidateSet('smoke', 'full', 'mutate', 'none')]
    [string]$E2E = 'smoke'
)

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

$e2eScripts = @{ smoke = 'test:e2e:smoke'; full = 'test:e2e'; mutate = 'test:e2e:mutate' }

$parallelTasks = @(
    [pscustomobject]@{ Name = 'Typecheck'; Script = 'typecheck'     }
    [pscustomobject]@{ Name = 'Lint';      Script = 'lint'          }
    [pscustomobject]@{ Name = 'Security';  Script = 'security'      }
    [pscustomobject]@{ Name = 'Tests';     Script = 'test:coverage' }
)
$serialTasks = @()
if ($E2E -ne 'none') {
    $serialTasks = @([pscustomobject]@{ Name = 'E2E'; Script = $e2eScripts[$E2E] })
}

# Starts one background job per task, shows progress, returns the results by name.
function Invoke-Checks($tasks, $stopwatch) {
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
        $line    = "  [{0,5:N1}s]  running: {1,-40}  done: {2}" -f $stopwatch.Elapsed.TotalSeconds, $running, $done
        Write-Host -NoNewline ("`r" + $line.PadRight(110))
    }
    Write-Host -NoNewline ("`r" + (' ' * 110) + "`r")

    Wait-Job -Job $jobs | Out-Null
    $collected = [ordered]@{}
    foreach ($j in $jobs) {
        $collected[$j.Name] = Receive-Job -Job $j
        Remove-Job -Job $j -Force
    }
    return $collected
}

$globalSw = [Diagnostics.Stopwatch]::StartNew()

Write-Host ''
Write-Host '>>> Running in parallel: typecheck | lint | security | tests + coverage' -ForegroundColor Magenta
Write-Host ''
$results = Invoke-Checks $parallelTasks $globalSw

if ($serialTasks.Count -gt 0) {
    Write-Host ''
    Write-Host ">>> Then alone: end-to-end ($E2E) - build, then the built CLI in a real terminal" -ForegroundColor Magenta
    Write-Host ''
    $e2eResults = Invoke-Checks $serialTasks $globalSw
    foreach ($name in $e2eResults.Keys) { $results[$name] = $e2eResults[$name] }
}
$globalSw.Stop()
$tasks = @($parallelTasks) + @($serialTasks)

function Parse-Vitest($text) {
    $c = Strip-Ansi $text
    $counts = [ordered]@{ Passed = 0; Failed = 0; Skipped = 0; Files = 0 }
    $testsLine = ($c -split "`r?`n") | Where-Object { $_ -match '^\s*Tests\s+\d' } | Select-Object -Last 1
    if ($testsLine) {
        if ($testsLine -match '(\d+)\s+passed')  { $counts.Passed  = [int]$matches[1] }
        if ($testsLine -match '(\d+)\s+failed')  { $counts.Failed  = [int]$matches[1] }
        if ($testsLine -match '(\d+)\s+skipped') { $counts.Skipped = [int]$matches[1] }
    }
    if ($c -match '(?m)^\s*Test Files\s+.*\((\d+)\)') {
        $counts.Files = [int]$matches[1]
    }
    return [pscustomobject]$counts
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

function Write-TestCounts($output) {
    $v = Parse-Vitest $output
    $skip = if ($v.Skipped -gt 0) { ", $($v.Skipped) skipped" } else { '' }
    $failColor = if ($v.Failed -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("{0} passed" -f $v.Passed) -ForegroundColor Green -NoNewline
    Write-Host (", {0} failed{1}" -f $v.Failed, $skip) -ForegroundColor $failColor -NoNewline
    Write-Host ("  across {0} files" -f $v.Files) -ForegroundColor DarkCyan
}

function Write-Coverage($output) {
    $c = Parse-Coverage $output
    if (-not $c) {
        Write-Host '(coverage report not parsed)' -ForegroundColor DarkYellow
        return
    }
    $covColor = if ($c.Lines -ge 80) { 'Green' } elseif ($c.Lines -ge 50) { 'Yellow' } else { 'DarkYellow' }
    Write-Host ("stmts {0,5:N1}%" -f $c.Statements) -ForegroundColor $covColor -NoNewline
    Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
    Write-Host ("branch {0,5:N1}%" -f $c.Branches) -ForegroundColor $covColor -NoNewline
    Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
    Write-Host ("funcs {0,5:N1}%" -f $c.Functions) -ForegroundColor $covColor -NoNewline
    Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
    Write-Host ("lines {0,5:N1}%" -f $c.Lines) -ForegroundColor $covColor -NoNewline
    Write-Host '  (fails on the floors only)' -ForegroundColor DarkCyan
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
        'Typecheck' {
            Write-Host 'tsc: src, then tests + scripts' -ForegroundColor DarkCyan
        }
        'Lint' {
            Write-Host 'eslint: src, tests, scripts' -ForegroundColor DarkCyan
        }
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
            Write-TestCounts $r.Output
            Write-Host (' ' * 27) -NoNewline
            Write-Coverage $r.Output
        }
        'E2E' {
            Write-Host ("[{0}] " -f $E2E) -ForegroundColor DarkCyan -NoNewline
            Write-TestCounts $r.Output
        }
    }
}

$serialTotal = ($results.Values | ForEach-Object { $_.Duration.TotalSeconds } | Measure-Object -Sum).Sum
$saved       = [Math]::Max(0, $serialTotal - $globalSw.Elapsed.TotalSeconds)

Write-Host ''
Write-Host ('  wall clock            : {0,6:N1}s' -f $globalSw.Elapsed.TotalSeconds) -ForegroundColor DarkGray
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
