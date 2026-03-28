# Billing webhook metrics quick checker (Windows/PowerShell)
# Pulls /metrics and prints error ratio for billing_webhook_events_total.

param(
    [string]$MetricsUrl = "http://localhost:8000/metrics",
    [double]$WarnErrorRatio = 0.05,
    [int]$TimeoutSec = 20
)

$ErrorActionPreference = "Stop"

try {
    $raw = (Invoke-WebRequest -Uri $MetricsUrl -UseBasicParsing -TimeoutSec $TimeoutSec).Content
} catch {
    Write-Error "Failed to fetch metrics from $MetricsUrl"
    exit 2
}

$lines = $raw -split "`n" | Where-Object { $_ -match '^billing_webhook_events_total\{' }

if (-not $lines -or $lines.Count -eq 0) {
    Write-Host "billing_webhook_events_total not found in metrics output."
    exit 0
}

$total = 0.0
$error = 0.0
$duplicate = 0.0

foreach ($line in $lines) {
    if ($line -match 'result="([^"]+)"[^ ]*\s+([0-9.eE+-]+)\s*$') {
        $result = $matches[1]
        $value = [double]$matches[2]
        $total += $value
        if ($result -eq "error") { $error += $value }
        if ($result -eq "duplicate") { $duplicate += $value }
    }
}

$ratio = 0.0
if ($total -gt 0) {
    $ratio = $error / $total
}

Write-Host "billing_webhook_events_total summary"
Write-Host ("total={0} error={1} duplicate={2} error_ratio={3:p2}" -f $total, $error, $duplicate, $ratio)

if ($ratio -ge $WarnErrorRatio) {
    Write-Host ("ALERT: error_ratio {0:p2} >= threshold {1:p2}" -f $ratio, $WarnErrorRatio)
    exit 1
}
