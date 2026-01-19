# Update DATABASE_URL in .env file
param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

$envFile = ".env"

if (-not (Test-Path $envFile)) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    exit 1
}

# Backup existing .env
$backupName = "$envFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
Copy-Item $envFile $backupName
Write-Host "Backed up .env to $backupName" -ForegroundColor Green

# Read and update .env
$lines = Get-Content $envFile
$updated = $false
$newLines = @()

foreach ($line in $lines) {
    if ($line -match '^\s*DATABASE_URL\s*=') {
        $newLines += "DATABASE_URL=$DatabaseUrl"
        $updated = $true
        Write-Host "Updated DATABASE_URL" -ForegroundColor Green
    } else {
        $newLines += $line
    }
}

# If DATABASE_URL wasn't found, add it
if (-not $updated) {
    $newLines += "DATABASE_URL=$DatabaseUrl"
    Write-Host "Added DATABASE_URL" -ForegroundColor Green
}

# Write back to file
$newLines | Out-File -FilePath $envFile -Encoding utf8

Write-Host ""
Write-Host ".env file updated successfully!" -ForegroundColor Green
Write-Host "Next: Restart your backend server" -ForegroundColor Cyan
