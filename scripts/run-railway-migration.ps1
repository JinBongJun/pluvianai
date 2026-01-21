# Run Alembic migrations on Railway database
Write-Host "Running Alembic migrations on Railway database..." -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Railway CLI is not installed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installing Railway CLI..." -ForegroundColor Cyan
    npm install -g @railway/cli
    
    if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Failed to install Railway CLI" -ForegroundColor Red
        Write-Host "Please install manually: npm install -g @railway/cli" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "✅ Railway CLI found" -ForegroundColor Green
Write-Host ""

# Check if logged in
Write-Host "Checking Railway login status..." -ForegroundColor Cyan
$loginCheck = railway whoami 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Please login:" -ForegroundColor Yellow
    Write-Host "  railway login" -ForegroundColor Gray
    Write-Host ""
    Write-Host "After login, run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Logged in to Railway" -ForegroundColor Green
Write-Host ""

# Link to project if not already linked
Write-Host "Linking to Railway project..." -ForegroundColor Cyan
railway link

Write-Host ""
Write-Host "Getting Railway DATABASE_URL..." -ForegroundColor Cyan
$dbUrl = railway variables --json | ConvertFrom-Json | Where-Object { $_.name -eq "DATABASE_URL" } | Select-Object -ExpandProperty value

if (-not $dbUrl) {
    Write-Host "❌ DATABASE_URL not found in Railway variables" -ForegroundColor Red
    Write-Host "Please set DATABASE_URL in Railway project settings" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found DATABASE_URL" -ForegroundColor Green
Write-Host ""

# Set environment variable for Alembic
$env:DATABASE_URL = $dbUrl

# Change to backend directory
Push-Location backend

Write-Host "Running Alembic upgrade..." -ForegroundColor Cyan
Write-Host ""

# Run Alembic upgrade
alembic upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Migration failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

Write-Host ""
Write-Host "Migration complete! Your Railway database is now up to date." -ForegroundColor Green
