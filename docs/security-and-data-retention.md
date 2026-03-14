# Security and Data Retention (Beta Baseline)

## Data Retention

- Free plan baseline retention: 30 days for snapshots and related logs.
- Project/organization delete requests use soft-delete first.
- Soft-deleted entities are hard-deleted after a 30-day grace window.

## Secret Handling

- Common secret-like fields (api keys, tokens, passwords) are redacted before persistence.
- API key values are shown once at creation/rotation time and are not fully re-displayed.

## Access Control

- Project and organization operations are role-gated.
- Permission errors should return action-level guidance, not only status code.

## Operations

- Scheduled jobs enforce lifecycle cleanup and soft-delete purge.
- Ops alerts are configured to detect error bursts and service health regressions.
