# DTO Guidelines

This project treats API DTOs as part of the public backend contract. Keep DTOs in
`backend/app/schemas`, grouped by domain, and import them from endpoint modules.

## Goals

- Keep endpoint modules focused on routing, authorization, and orchestration.
- Make request and response contracts easy to find.
- Reduce frontend/backend drift by making OpenAPI the source of truth.
- Avoid leaking ORM concerns into request DTOs.

## Backend Layout

Use one schema module per domain:

```text
backend/app/schemas/
  common.py
  auth.py
  projects.py
  organizations.py
  settings.py
  api_calls.py
  billing.py
  user_api_keys.py
  live_view.py
  release_gate.py
```

Endpoint modules should import DTOs:

```python
from app.schemas.projects import ProjectCreateRequest, ProjectResponse
```

Do not define new `pydantic.BaseModel` classes in
`backend/app/api/v1/endpoints`. Move them into `backend/app/schemas`.

## Naming

For new API DTOs, use these names:

- Create request: `ProjectCreateRequest`
- Update request: `ProjectUpdateRequest`
- Delete or action request: `ProjectDeleteRequest`, `ProjectArchiveRequest`
- Single response: `ProjectResponse`
- Detail response: `ProjectDetailResponse`
- List item response: `ProjectListItemResponse`

When moving existing DTOs, keep the existing class name unless the API surface is
already being versioned or intentionally changed. This avoids noisy OpenAPI
schema title changes during mechanical moves.

## Request DTOs

Request DTOs should describe client input only.

- Use concrete field types whenever practical.
- Use `Field` constraints for basic validation: length, bounds, regex patterns,
  descriptions.
- Avoid ORM model names, SQLAlchemy types, database defaults, and persistence
  concerns.
- Avoid broad `dict` or `Any` fields unless the endpoint intentionally accepts
  provider-specific JSON.

## Response DTOs

Response DTOs should describe API output only.

- Use `ConfigDict(from_attributes=True)` only on response DTOs that are created
  from ORM objects.
- Keep backward-compatible fields when clients already depend on them.
- Prefer explicit nullable fields over omitted shape changes.

## Internal Service Inputs

Do not pass API request DTOs deep into business logic by default. If service
logic needs a structured input object, create an internal command or input model
near the service/domain layer, for example:

```python
ProjectCreateCommand
ReleaseGateRunInput
```

These are not API DTOs and should not live in `backend/app/schemas` unless they
are also part of the external API contract.

## Response Envelope

The preferred API envelope is:

```json
{ "data": {}, "meta": {} }
```

Errors should use:

```json
{ "error": { "code": "...", "message": "..." } }
```

Use `app.core.responses.success_response`, `error_response`, and
`paginated_response` when an endpoint returns the standard envelope.

## Frontend Types

The long-term source of truth for API types should be the backend OpenAPI schema.
Frontend hand-written interfaces should be limited to UI view models and runtime
validation schemas that are intentionally separate from the API contract.
