# Railway CLI tunnel for local database connection
Write-Host "Setting up Railway tunnel for local database access..." -ForegroundColor Cyan
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
Write-Host "Starting tunnel..." -ForegroundColor Cyan
Write-Host "This will create a local tunnel to Railway PostgreSQL" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
Write-Host ""

# Start tunnel (this will run in foreground)
railway connect postgres
