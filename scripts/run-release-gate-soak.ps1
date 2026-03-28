# Release Gate soak runner (Windows/PowerShell)
# Runs qualification suite repeatedly and records durations.

param(
    [int]$Iterations = 20,
    [string]$LogDir = "logs/soak",
    [int]$CooldownSec = 65,
    [string[]]$PytestArgs = @(
        "tests/integration/test_release_gate_preflight_guards.py",
        "tests/integration/test_release_gate_overrides_and_export.py",
        "tests/integration/test_release_gate_async_jobs.py",
        "tests/unit/test_release_gate_model_policy.py",
        "tests/unit/test_live_eval_service.py",
        "-q"
    )
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $LogDir "release-gate-soak-$timestamp.log"
$summaryPath = Join-Path $LogDir "release-gate-soak-$timestamp-summary.txt"

"Release Gate soak started at $(Get-Date -Format o)" | Out-File -FilePath $logPath -Encoding utf8
"Iterations: $Iterations" | Out-File -FilePath $logPath -Append -Encoding utf8
"CooldownSec: $CooldownSec" | Out-File -FilePath $logPath -Append -Encoding utf8
"Args: $($PytestArgs -join ' ')" | Out-File -FilePath $logPath -Append -Encoding utf8

$durations = @()
$failures = 0

Push-Location "backend"
try {
    for ($i = 1; $i -le $Iterations; $i++) {
        $start = Get-Date
        "[$(Get-Date -Format o)] Iteration $i/$Iterations started" | Out-File -FilePath "../$logPath" -Append -Encoding utf8

        python -m pytest -c pytest-ci.ini @PytestArgs | Out-File -FilePath "../$logPath" -Append -Encoding utf8
        $exitCode = $LASTEXITCODE

        $elapsed = [Math]::Round(((Get-Date) - $start).TotalSeconds, 2)
        $durations += $elapsed

        if ($exitCode -ne 0) {
            $failures += 1
            "[$(Get-Date -Format o)] Iteration $i failed (exit=$exitCode, duration=${elapsed}s)" | Out-File -FilePath "../$logPath" -Append -Encoding utf8
        } else {
            "[$(Get-Date -Format o)] Iteration $i passed (duration=${elapsed}s)" | Out-File -FilePath "../$logPath" -Append -Encoding utf8
        }

        if ($i -lt $Iterations -and $CooldownSec -gt 0) {
            "[$(Get-Date -Format o)] Cooldown ${CooldownSec}s before next iteration" | Out-File -FilePath "../$logPath" -Append -Encoding utf8
            Start-Sleep -Seconds $CooldownSec
        }
    }
}
finally {
    Pop-Location
}

$sorted = $durations | Sort-Object
$count = $sorted.Count
$p95Index = [Math]::Ceiling($count * 0.95) - 1
if ($p95Index -lt 0) { $p95Index = 0 }
$p95 = $sorted[$p95Index]
$avg = [Math]::Round((($durations | Measure-Object -Average).Average), 2)
$max = ($sorted | Select-Object -Last 1)

@(
    "Release Gate soak summary"
    "started_at=$(Get-Date -Format o)"
    "iterations=$Iterations"
    "failures=$failures"
    "avg_seconds=$avg"
    "p95_seconds=$p95"
    "max_seconds=$max"
    "log=$logPath"
) | Out-File -FilePath $summaryPath -Encoding utf8

Write-Host "Soak complete. Summary: $summaryPath"
if ($failures -gt 0) {
    exit 1
}
