# Get Railway DATABASE_URL using Railway CLI
Write-Host "Getting Railway DATABASE_URL..." -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Railway CLI is not installed." -ForegroundColor Yellow
    Write-Host "Install it with: npm install -g @railway/cli" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or manually get DATABASE_URL from Railway dashboard:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://railway.com/project/7b200a75-0c0b-44bc-ac94-da14171db012"
    Write-Host "2. Click PostgreSQL service"
    Write-Host "3. Click Variables tab"
    Write-Host "4. Look for DATABASE_URL (should NOT contain 'railway.internal')"
    exit 0
}

Write-Host "Fetching DATABASE_URL from Railway..." -ForegroundColor Cyan
$dbUrl = railway variables | Select-String "DATABASE_URL"

if ($dbUrl) {
    Write-Host ""
    Write-Host "Found DATABASE_URL:" -ForegroundColor Green
    Write-Host $dbUrl -ForegroundColor Gray
    Write-Host ""
    Write-Host "If it contains 'railway.internal', you need the PUBLIC URL instead." -ForegroundColor Yellow
    Write-Host "Check Railway dashboard -> PostgreSQL -> Connect tab for Public Network URL" -ForegroundColor Yellow
} else {
    Write-Host "Could not find DATABASE_URL. Please check Railway dashboard manually." -ForegroundColor Red
}
