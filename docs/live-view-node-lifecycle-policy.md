# Live View Node Lifecycle Policy

This document explains how Live View node removal, restore, and permanent cleanup work.

## Summary

- Live View node removal is a **soft delete**.
- Removing a node hides it from the Live View canvas immediately.
- If the **same node identity** appears again through new traffic, the node can be **auto-restored**.
- Soft-deleted node settings can later be **hard-deleted** by scheduled cleanup.

## What counts as "the same node"

Live View uses the node `agent_id` as the stable identity for a node.

- If the same `agent_id` appears again, the system treats it as the same node.
- If model, system prompt, code path, or other identity inputs change enough to produce a different `agent_id`, the system treats it as a new node.

## Removal behavior

When an admin removes a node from Live View:

- the node is hidden from normal Live View lists,
- its `AgentDisplaySetting` is marked `is_deleted = true`,
- the delete timestamp is recorded,
- historical snapshots and logs are **not deleted**.

This means removal is reversible during the soft-delete period.

## Auto-restore behavior

If new traffic arrives for the same node identity:

- the system checks whether the matching node was soft-deleted,
- if the node is still within the configured auto-restore window,
- the node is restored automatically and starts showing new logs again.

Current repository default:

- `AGENT_AUTO_RESTORE_DAYS = 30`

If a deployment overrides this setting through environment configuration, that deployment value wins.

## Manual restore behavior

Admins can also restore a deleted node manually from the UI or via API.

API:

- `POST /api/v1/projects/{project_id}/live-view/agents/{agent_id}/restore`

Manual restore:

- clears `is_deleted`,
- clears `deleted_at`,
- makes the node visible again in Live View.

## Permanent cleanup behavior

Soft-deleted node settings are not kept forever.

Scheduled cleanup can permanently delete old soft-deleted `AgentDisplaySetting` rows after the grace period expires.

Current repository default:

- `AGENT_SOFT_DELETE_GRACE_DAYS = 30`

This cleanup removes the node display-setting row, not the historical snapshots themselves.

## Practical examples

### Example 1: Same node comes back

1. Admin removes node `support-bot`.
2. New traffic arrives with the same `agent_id = support-bot`.
3. If this happens inside the restore window, the node is auto-restored.
4. New logs continue under the same node identity.

### Example 2: Configuration changed

1. Admin removes node `support-bot-v1`.
2. A new deployment changes prompt/model/config and now emits `agent_id = support-bot-v2`.
3. Live View shows `support-bot-v2` as a new node.
4. The old node stays soft-deleted until restored or purged.

### Example 3: Grace period expires

1. Admin removes node `legacy-agent`.
2. No matching traffic returns before the grace period ends.
3. Scheduled cleanup deletes the old soft-deleted display-setting row.
4. If matching traffic later reappears, the system treats it as a fresh node setting state.

## Operator notes

- Use soft delete when you want to hide a node without losing history.
- Use restore when deletion was accidental or when you want the node back immediately.
- Expect auto-restore only when the returning traffic matches the same node identity.
- Document any deployment-specific overrides for restore and grace windows if they differ from repository defaults.
