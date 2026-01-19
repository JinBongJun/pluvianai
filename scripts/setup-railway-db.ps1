# Railway DB Connection Setup Script
Write-Host "Railway DB Connection Setup" -ForegroundColor Cyan
Write-Host ""

$envFile = ".env"

Write-Host "Get DATABASE_URL from Railway:" -ForegroundColor Yellow
Write-Host "1. Go to: https://railway.com/project/7b200a75-0c0b-44bc-ac94-da14171db012"
Write-Host "2. Click PostgreSQL service"
Write-Host "3. Click Variables tab"
Write-Host "4. Copy DATABASE_URL or POSTGRES_URL"
Write-Host ""

$databaseUrl = Read-Host "Enter DATABASE_URL (or press Enter to skip)"

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Host "DATABASE_URL not entered. You can edit .env file manually later." -ForegroundColor Yellow
    exit 0
}

if (Test-Path $envFile) {
    Write-Host "Backing up existing .env file..." -ForegroundColor Yellow
    $backupName = "$envFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $envFile $backupName
}

$envContent = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            $envContent[$key] = $value
        }
    }
}

$envContent['DATABASE_URL'] = $databaseUrl

if (-not $envContent.ContainsKey('REDIS_URL')) {
    $envContent['REDIS_URL'] = 'redis://localhost:6379/0'
    Write-Host "Added default REDIS_URL" -ForegroundColor Green
}

if (-not $envContent.ContainsKey('SECRET_KEY')) {
    $secretKey = Read-Host "Enter SECRET_KEY (or press Enter for default)"
    if ([string]::IsNullOrWhiteSpace($secretKey)) {
        $envContent['SECRET_KEY'] = 'your-secret-key-change-in-production'
        Write-Host "Using default SECRET_KEY (change in production)" -ForegroundColor Yellow
    } else {
        $envContent['SECRET_KEY'] = $secretKey
    }
}

$envLines = @()
$envContent.GetEnumerator() | Sort-Object Name | ForEach-Object {
    $envLines += "$($_.Key)=$($_.Value)"
}

$envLines | Out-File -FilePath $envFile -Encoding utf8

Write-Host ""
Write-Host ".env file updated!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart backend:"
Write-Host "   cd backend"
Write-Host "   .\.venv\Scripts\Activate.ps1"
Write-Host "   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
Write-Host ""
Write-Host "2. Test login in frontend"
Write-Host ""
