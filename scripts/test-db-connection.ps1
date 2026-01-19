# Test database connection
Write-Host "Testing database connection..." -ForegroundColor Cyan
Write-Host ""

cd backend
.\.venv\Scripts\Activate.ps1

python -c @"
import sys
from app.core.config import settings
from app.core.database import engine
from sqlalchemy import text

try:
    print(f'Connecting to: {settings.DATABASE_URL[:50]}...')
    with engine.connect() as conn:
        result = conn.execute(text('SELECT version()'))
        version = result.fetchone()[0]
        print(f'✅ Database connection successful!')
        print(f'PostgreSQL version: {version[:50]}...')
        sys.exit(0)
except Exception as e:
    print(f'❌ Database connection failed: {e}')
    sys.exit(1)
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Database connection test passed!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Database connection test failed!" -ForegroundColor Red
    Write-Host "Please check your DATABASE_URL in .env file" -ForegroundColor Yellow
}
