# Database migration script for PowerShell
# Usage: .\scripts\migrate.ps1 [upgrade|downgrade|revision] [args]

param(
    [Parameter(Position=0)]
    [string]$Action = "upgrade",
    
    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"

# Change to backend directory
$BackendDir = Split-Path -Parent $PSScriptRoot
Set-Location $BackendDir

switch ($Action) {
    "upgrade" {
        Write-Host "🔄 Running database migrations..." -ForegroundColor Cyan
        python -m alembic upgrade head
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Migrations applied successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Migration failed" -ForegroundColor Red
            exit 1
        }
    }
    "downgrade" {
        Write-Host "🔄 Downgrading database..." -ForegroundColor Cyan
        if ($Args.Count -eq 0) {
            Write-Host "❌ Please specify revision: .\scripts\migrate.ps1 downgrade -1" -ForegroundColor Red
            exit 1
        }
        python -m alembic downgrade $Args
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database downgraded successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Downgrade failed" -ForegroundColor Red
            exit 1
        }
    }
    "revision" {
        Write-Host "📝 Creating new migration..." -ForegroundColor Cyan
        if ($Args.Count -eq 0) {
            Write-Host "❌ Please specify message: .\scripts\migrate.ps1 revision 'add new field'" -ForegroundColor Red
            exit 1
        }
        $Message = $Args -join " "
        python -m alembic revision --autogenerate -m $Message
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Migration created successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Migration creation failed" -ForegroundColor Red
            exit 1
        }
    }
    default {
        Write-Host "Usage: .\scripts\migrate.ps1 [upgrade|downgrade|revision] [args]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Yellow
        Write-Host "  .\scripts\migrate.ps1 upgrade                    # Apply all pending migrations"
        Write-Host "  .\scripts\migrate.ps1 downgrade -1               # Rollback one migration"
        Write-Host "  .\scripts\migrate.ps1 revision 'add new field'   # Create new migration"
        exit 1
    }
}
