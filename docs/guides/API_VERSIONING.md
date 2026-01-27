# API Versioning

## Overview

- **v1**: `/api/v1` — current stable API. No breaking changes.
- **v2**: `/api/v2` — future iterations. New features and breaking changes go here first.

## Policy

1. **Backward compatibility**: v1 endpoints remain supported. We do not change request/response shapes in place.
2. **Deprecation**: Before removing a v1 behavior, we announce deprecation and provide a migration path via v2.
3. **v2 adoption**: New consumers should prefer v2 when possible. v1 is maintained for existing integrations.
4. **Deprecation Notice**: When v1 endpoints are deprecated, they will include `X-API-Deprecation` header with migration information.

## Versioning Strategy

- **URL versioning**: `/api/v1`, `/api/v2`.
- **No version in headers** for now; the path is the source of truth.
- **Deprecation headers**: Deprecated endpoints include `X-API-Deprecation` header with deprecation date and migration guide URL.

## Deprecation Notice Format

When an endpoint is deprecated, responses will include:
```
X-API-Deprecation: v1 endpoint will be deprecated on YYYY-MM-DD. Migrate to v2: /api/v2/...
X-API-Deprecation-Date: YYYY-MM-DD
X-API-Migration-Guide: https://docs.agentguard.dev/api/migration/v1-to-v2
```

## Migration Guide (v1 → v2)

When v2 introduces breaking changes:

1. Check release notes and `API_VERSIONING.md` for affected endpoints.
2. Check `X-API-Deprecation` headers in API responses.
3. Update base URL from `/api/v1` to `/api/v2`.
4. Adapt requests/responses to v2 schemas as documented.
5. Test against staging before switching production traffic.

## Adding v2 Routes

1. Implement routers under `app.api.v2` (or submodules).
2. Include them in `app.api.v2.__init__.py` with `api_router_v2`.
3. Document changes in this file and in release notes.
4. Add deprecation notice to v1 equivalent (if applicable).

## Current Status

- **v1**: Stable, fully supported
- **v2**: In development, not yet available for production use
