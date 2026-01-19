# AgentGuard Monitoring Startup Script (PowerShell)
# This script starts the monitoring stack and opens Grafana dashboard

Write-Host "🚀 Starting AgentGuard Monitoring..." -ForegroundColor Cyan

# Check if backend is running
Write-Host "📡 Checking backend status..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Backend is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend is not running at http://localhost:8000" -ForegroundColor Red
    Write-Host "Please start the backend first:"
    Write-Host "  cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    exit 1
}

# Check if metrics endpoint is accessible
Write-Host "📊 Checking metrics endpoint..." -ForegroundColor Yellow
try {
    $metricsResponse = Invoke-WebRequest -Uri "http://localhost:8000/metrics" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Metrics endpoint is accessible" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Metrics endpoint not accessible, but continuing..." -ForegroundColor Yellow
}

# Check if Docker is running
Write-Host "🐳 Checking Docker..." -ForegroundColor Yellow
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Start monitoring stack
Write-Host "🐳 Starting monitoring stack..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check Prometheus
Write-Host "🔍 Checking Prometheus..." -ForegroundColor Yellow
$prometheusReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9090/-/healthy" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        Write-Host "✅ Prometheus is ready" -ForegroundColor Green
        $prometheusReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $prometheusReady) {
    Write-Host "⚠️  Prometheus might not be ready yet" -ForegroundColor Yellow
}

# Check Grafana
Write-Host "📈 Checking Grafana..." -ForegroundColor Yellow
$grafanaReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        Write-Host "✅ Grafana is ready" -ForegroundColor Green
        $grafanaReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $grafanaReady) {
    Write-Host "⚠️  Grafana might not be ready yet" -ForegroundColor Yellow
}

# Display URLs
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ Monitoring started successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Grafana Dashboard:" -ForegroundColor Cyan
Write-Host "   URL: http://localhost:3001"
Write-Host "   Username: admin"
Write-Host "   Password: admin"
Write-Host ""
Write-Host "📈 Prometheus:" -ForegroundColor Cyan
Write-Host "   URL: http://localhost:9090"
Write-Host ""
Write-Host "🔍 Metrics Endpoint:" -ForegroundColor Cyan
Write-Host "   URL: http://localhost:8000/metrics"
Write-Host ""

# Open browser
Write-Host "🌐 Opening Grafana in browser..." -ForegroundColor Yellow
Start-Process "http://localhost:3001"

Write-Host ""
Write-Host "To stop monitoring:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml down"
