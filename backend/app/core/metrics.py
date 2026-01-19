"""
Prometheus metrics for monitoring
"""
from prometheus_client import Counter, Histogram, Gauge, Info, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import CollectorRegistry, REGISTRY
from fastapi import Response
from typing import Optional
import time

# Create a custom registry to avoid conflicts
registry = CollectorRegistry()

# API Metrics
api_requests_total = Counter(
    'api_requests_total',
    'Total number of API requests',
    ['method', 'endpoint', 'status_code'],
    registry=registry
)

api_request_duration_seconds = Histogram(
    'api_request_duration_seconds',
    'API request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=registry
)

api_request_size_bytes = Histogram(
    'api_request_size_bytes',
    'API request size in bytes',
    ['method', 'endpoint'],
    buckets=[100, 500, 1000, 5000, 10000, 50000],
    registry=registry
)

api_response_size_bytes = Histogram(
    'api_response_size_bytes',
    'API response size in bytes',
    ['method', 'endpoint'],
    buckets=[100, 500, 1000, 5000, 10000, 50000, 100000],
    registry=registry
)

# Database Metrics
db_queries_total = Counter(
    'db_queries_total',
    'Total number of database queries',
    ['operation', 'table'],
    registry=registry
)

db_query_duration_seconds = Histogram(
    'db_query_duration_seconds',
    'Database query duration in seconds',
    ['operation', 'table'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5],
    registry=registry
)

db_connection_pool_size = Gauge(
    'db_connection_pool_size',
    'Current database connection pool size',
    registry=registry
)

db_connection_pool_active = Gauge(
    'db_connection_pool_active',
    'Active database connections',
    registry=registry
)

# Cache Metrics
cache_operations_total = Counter(
    'cache_operations_total',
    'Total number of cache operations',
    ['operation', 'status'],  # operation: get, set, delete, status: hit, miss, error
    registry=registry
)

cache_operation_duration_seconds = Histogram(
    'cache_operation_duration_seconds',
    'Cache operation duration in seconds',
    ['operation'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1],
    registry=registry
)

# Business Metrics
active_users = Gauge(
    'active_users',
    'Number of active users',
    registry=registry
)

active_projects = Gauge(
    'active_projects',
    'Number of active projects',
    registry=registry
)

api_calls_total = Counter(
    'llm_api_calls_total',
    'Total number of LLM API calls',
    ['provider', 'model', 'status'],
    registry=registry
)

api_call_cost_usd = Counter(
    'llm_api_call_cost_usd',
    'Total cost of LLM API calls in USD',
    ['provider', 'model'],
    registry=registry
)

quality_score = Histogram(
    'quality_score',
    'Quality score distribution',
    ['project_id'],
    buckets=[0.0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0],
    registry=registry
)

# Error Metrics
errors_total = Counter(
    'errors_total',
    'Total number of errors',
    ['type', 'endpoint'],
    registry=registry
)

# Application Info
app_info = Info(
    'app_info',
    'Application information',
    registry=registry
)


def update_app_info(version: str, environment: str):
    """Update application info metrics"""
    app_info.info({
        'version': version,
        'environment': environment,
    })


def get_metrics_response() -> Response:
    """Generate Prometheus metrics response"""
    return Response(
        content=generate_latest(registry),
        media_type=CONTENT_TYPE_LATEST
    )


class MetricsMiddleware:
    """Middleware to collect API metrics"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        method = scope["method"]
        path = scope["path"]
        
        # Skip metrics endpoint
        if path == "/metrics":
            await self.app(scope, receive, send)
            return
        
        # Normalize path (remove IDs, etc.)
        normalized_path = self._normalize_path(path)
        
        start_time = time.time()
        status_code = 200
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            
            # Record metrics
            api_requests_total.labels(
                method=method,
                endpoint=normalized_path,
                status_code=str(status_code)
            ).inc()
            
            api_request_duration_seconds.labels(
                method=method,
                endpoint=normalized_path
            ).observe(duration)
    
    def _normalize_path(self, path: str) -> str:
        """Normalize path by replacing IDs with placeholders"""
        import re
        # Replace UUIDs
        path = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '{id}', path)
        # Replace numeric IDs
        path = re.sub(r'/\d+', '/{id}', path)
        return path
