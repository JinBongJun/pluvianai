## Summary
- What problem does this PR solve?
- Why is this change needed now?

## Scope
- Backend:
- Frontend:
- Docs/Runbook:
- Infra/Config:

## User Impact
- Expected behavior change:
- Risk level: low / medium / high
- Rollback plan:

## Test Plan
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E/manual checks
- [ ] Dry-run in staging (if applicable)
- [ ] Release Gate hydration / merge contract ([ADR-0001](../docs/adr/ADR-0001-release-gate-hydration-contract.md)) — applies only if this PR changes stacked results, history hydration, or related delete/dismiss flows

Commands run:
```bash
# e.g.
# python -m pytest -q backend/tests/unit/test_x.py
# npm run qa:rg-warn-ui
```

## Ops & Observability
- Alerts/metrics impacted:
- Dashboard updates needed:
- Runbook link:

## Security & Privacy
- [ ] No secrets or credentials committed
- [ ] Auth/RBAC paths reviewed
- [ ] Sensitive fields are redacted/sanitized

## Data & Migration
- [ ] No schema/data migration
- [ ] Migration included and reversible
- [ ] Backfill required

**If this PR changes `app/models/` or database behavior:**

- [ ] New/changed tables or columns have an **Alembic revision** in `backend/alembic/versions/`
- [ ] New models are imported in **`backend/alembic/env.py`** (so `alembic check` sees them)
- [ ] Ran **`python -m alembic upgrade head`** and **`python -m alembic check`** against an **empty Postgres** with the same `DATABASE_URL` pattern as CI (see [`backend/README.md`](../backend/README.md#reproduce-ci-locally-recommended-before-merging-db-changes))

## Deployment Notes
- Feature flags:
- Required env vars:
- Order of deployment:

## Checklist
- [ ] PR title clearly describes intent
- [ ] Change is scoped and reviewable
- [ ] Backward compatibility considered
- [ ] Documentation updated (`docs/*`, runbooks, `.env.example`)
