# SDK Timeout Guide

This guide documents timeout settings and Circuit Breaker configuration for PluvianAI SDKs.

## Overview

PluvianAI SDKs implement timeouts and Circuit Breaker patterns to ensure reliability and prevent blocking operations.

## Timeout Configuration

### Proxy Timeout

**Default**: 30 seconds

The proxy timeout controls how long the SDK waits for PluvianAI's proxy to respond before timing out.

```python
# Python SDK
import PluvianAI

PluvianAI.init(
    api_key="ag_live_xxxxx",
    project_id=123,
    proxy_timeout=30.0  # seconds
)
```

```typescript
// Node.js SDK
import PluvianAI from '@PluvianAI/sdk';

PluvianAI.init({
  apiKey: 'ag_live_xxxxx',
  projectId: 123,
  proxyTimeout: 30000  // milliseconds
});
```

### Firewall Timeout

**Default**: 1 second

The firewall timeout controls how long the SDK waits for Production Guard (firewall) checks before allowing the request to proceed.

```python
PluvianAI.init(
    firewall_timeout=1.0  # seconds
)
```

```typescript
PluvianAI.init({
  firewallTimeout: 1000  // milliseconds
});
```

### PII Sanitization Timeout

**Default**: 100 milliseconds

The PII sanitization timeout controls how long the SDK waits for PII sanitization to complete before proceeding.

```python
PluvianAI.init(
    pii_timeout=0.1  # seconds (100ms)
)
```

```typescript
PluvianAI.init({
  piiTimeout: 100  // milliseconds
});
```

## Circuit Breaker Configuration

PluvianAI SDKs implement a Circuit Breaker pattern to prevent cascading failures.

### Configuration

```python
PluvianAI.init(
    circuit_breaker={
        "failure_threshold": 5,  # Open circuit after 5 failures
        "recovery_time_seconds": 30,  # Try again after 30 seconds
        "half_open_max_calls": 3,  # Allow 3 calls in half-open state
    }
)
```

```typescript
PluvianAI.init({
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeSeconds: 30,
    halfOpenMaxCalls: 3
  }
});
```

### Behavior

- **Closed**: Normal operation, requests pass through
- **Open**: Circuit is open, requests fail immediately (fail-fast)
- **Half-Open**: Testing recovery, limited requests allowed

## Health Check Endpoint

PluvianAI provides a health check endpoint that SDKs can monitor:

```
GET /api/v1/health
```

### Response

```json
{
  "status": "healthy",
  "app": "PluvianAI API",
  "version": "0.1.0",
  "database": "ok",
  "redis": "ok"
}
```

### SDK Health Check

SDKs should periodically check the health endpoint (every 30 seconds) and update Circuit Breaker state accordingly.

```python
# Python SDK automatically monitors health
PluvianAI.init(
    health_check_interval=30.0  # seconds
)
```

```typescript
// Node.js SDK automatically monitors health
PluvianAI.init({
  healthCheckInterval: 30000  // milliseconds
});
```

## Fail-Open Strategy

When PluvianAI is unavailable, SDKs implement a fail-open strategy:

1. **Circuit Breaker Open**: If health checks fail, circuit opens
2. **Bypass Proxy**: Requests bypass PluvianAI and go directly to original LLM provider
3. **Log Warning**: SDK logs a warning but doesn't block the request

### Example

```python
# If PluvianAI is down, requests go directly to OpenAI
try:
    response = PluvianAI.openai.chat.completions.create(...)
except PluvianAIUnavailable:
    # Fallback to direct OpenAI call
    response = openai.chat.completions.create(...)
```

## Best Practices

1. **Set Appropriate Timeouts**: Don't set timeouts too low (causes false failures) or too high (blocks requests)
2. **Monitor Circuit Breaker**: Log circuit state changes for debugging
3. **Health Check Frequency**: Check health every 30 seconds (not too frequent, not too slow)
4. **Fail-Open**: Always implement fail-open to prevent blocking user requests

## Error Handling

SDKs should handle timeout errors gracefully:

```python
try:
    response = PluvianAI.openai.chat.completions.create(...)
except TimeoutError:
    logger.warning("PluvianAI proxy timeout, retrying...")
    # Retry with exponential backoff
except CircuitBreakerOpen:
    logger.warning("PluvianAI circuit open, bypassing proxy")
    # Bypass and go directly to LLM provider
```

## Performance Targets

- **Proxy Overhead**: < 200ms (P95)
- **Firewall Check**: < 100ms (P95)
- **PII Sanitization**: < 50ms (P95)

If these targets are not met, consider adjusting timeout values or investigating performance issues.
