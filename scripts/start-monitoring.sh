#!/bin/bash
# AgentGuard Monitoring Startup Script
# This script starts the monitoring stack and opens Grafana dashboard

set -e

echo "🚀 Starting AgentGuard Monitoring..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if backend is running
echo "📡 Checking backend status..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend is not running at http://localhost:8000${NC}"
    echo "Please start the backend first:"
    echo "  cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    exit 1
fi
echo -e "${GREEN}✅ Backend is running${NC}"

# Check if metrics endpoint is accessible
echo "📊 Checking metrics endpoint..."
if ! curl -s http://localhost:8000/metrics > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Metrics endpoint not accessible, but continuing...${NC}"
else
    echo -e "${GREEN}✅ Metrics endpoint is accessible${NC}"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Start monitoring stack
echo "🐳 Starting monitoring stack..."
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check Prometheus
echo "🔍 Checking Prometheus..."
for i in {1..30}; do
    if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Prometheus is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  Prometheus might not be ready yet${NC}"
    fi
    sleep 1
done

# Check Grafana
echo "📈 Checking Grafana..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Grafana is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  Grafana might not be ready yet${NC}"
    fi
    sleep 1
done

# Display URLs
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Monitoring started successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Grafana Dashboard:"
echo "   URL: http://localhost:3001"
echo "   Username: admin"
echo "   Password: admin"
echo ""
echo "📈 Prometheus:"
echo "   URL: http://localhost:9090"
echo ""
echo "🔍 Metrics Endpoint:"
echo "   URL: http://localhost:8000/metrics"
echo ""

# Try to open browser (platform-specific)
if command -v xdg-open > /dev/null; then
    echo "🌐 Opening Grafana in browser..."
    xdg-open http://localhost:3001 > /dev/null 2>&1 &
elif command -v open > /dev/null; then
    echo "🌐 Opening Grafana in browser..."
    open http://localhost:3001 > /dev/null 2>&1 &
elif command -v start > /dev/null; then
    echo "🌐 Opening Grafana in browser..."
    start http://localhost:3001 > /dev/null 2>&1 &
else
    echo "💡 Please open http://localhost:3001 in your browser"
fi

echo ""
echo "To stop monitoring:"
echo "  docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml down"
