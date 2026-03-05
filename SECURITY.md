## Security Overview

This document captures the **practical security baseline** for PluvianAI as of the current MVP. It focuses on three areas that are both high‑impact and low‑friction for us to maintain:

- **1. Secret handling / API key exposure**
- **2. LLM gateway + PII / system prompt handling**
- **3. Audit events and traceability**

This file is intentionally short and operational – it should be easy to skim during development and vendor reviews.

---

## 1. Secret Handling and API Keys

### 1.1. General rules

- **Never commit real API keys or credentials** to this repo (including `.env`, test fixtures, screenshots, etc.).
- **All environment‑specific secrets** (OpenAI / Anthropic / Google keys, DB passwords, Sentry DSNs, etc.) live in:
  - Local development: `.env` / `.env.local` (git‑ignored)
  - Deployed environments: the platform’s secret manager (Railway/Render/etc.)
- **User‑provided API keys** for replay/judge are stored only in the backend DB using the `UserAPIKey` model and are:
  - Encrypted with Fernet using `ENCRYPTION_KEY` (`backend/app/models/user_api_key.py`).
  - Never logged in plaintext.

### 1.2. GitHub / CI protections

- **Secret scanning CI**
  - GitHub Actions workflow: `.github/workflows/secret-scan.yml`
  - Runs `trufflehog` on:
    - Every push to `main` / `master` / `develop`
    - Every pull request
  - Scans the full git history (`fetch-depth: 0`) and fails the job on **verified** secrets.
- **Recommended GitHub settings (manual)**
  - Enable **GitHub Secret Scanning** and **Push Protection** for the organization/repo.
  - Treat a blocked push as a hard failure – never “override” for convenience.

### 1.3. Minimum local checklist

Before pushing:

- `.env`, `.env.local`, keyfiles (`*.pem`, `*.pfx`, `*.key`) are all **git‑ignored**.
- Test data and fixtures must only contain **synthetic or anonymized** values (no customer PII, no real API keys).

---

## 2. LLM Gateway, PII, and System Prompt Handling

### 2.1. Single LLM entry point: `/api/v1/proxy`

- **All production LLM traffic** is expected to go through the FastAPI proxy endpoint:
  - Implementation: `backend/app/api/v1/endpoints/proxy.py`
  - Providers: `openai`, `anthropic`, `google` (see `PROVIDER_URLS`)
  - Responsibilities:
    - Enforce **project panic mode** and **API call limits**.
    - Validate outbound URLs with **SSRF protection** (`validate_provider_url`).
    - Capture request snapshots via `SnapshotService` (background task).
    - Stream responses through **Firewall** for PII/toxicity/hallucination checks.

**Rule of thumb:**  
If new product features need to call OpenAI/Anthropic/Gemini, they should do so by hitting the **proxy endpoint** – not by talking directly to provider SDKs from the backend.

### 2.2. PII sanitization and logging

- **PII Sanitizer**
  - Implementation: `backend/app/services/pii_sanitizer.py` (`PIISanitizer`)
  - Used by:
    - `SnapshotService` (`save_snapshot`) – sanitizes payloads before storing them.
    - `FirewallService` (`_check_pii`) – detects PII in live streaming responses.
- **Snapshot behavior**
  - Before a snapshot is stored:
    - `PIISanitizer.sanitize_payload(...)` runs on the full payload, including:
      - `system_prompt`
      - `messages[]` content
      - `response` fields
    - The sanitized payload + derived fields (`system_prompt`, `user_message`, `response`) are what we persist.
  - The **raw provider request body is not stored**; only the sanitized version is.

### 2.3. System prompt handling

- System prompts are:
  - Extracted in `SnapshotService._extract_prompt_fields`.
  - Stored **in sanitized form** as part of the snapshot (never raw if sanitizer modifies anything).
- **Design intent going forward**
  - Treat system prompts as **sensitive architecture**:
    - Do not log raw system prompts outside sanitized snapshots.
    - If extra logging/debug is needed, log only **hashes or truncated snippets**, not the full content.
  - Future extension (if/when needed):
    - Optionally add a per‑project setting to **mask or strip system prompts entirely** from snapshots while keeping hashes for behavior diffing.

### 2.4. Input vs. output protection

- **Outputs (model responses)**:
  - Streamed through `FirewallService.scan_streaming_response` (PII, toxicity, hallucination, and custom rules).
  - Can be blocked mid‑stream with a structured error (`firewall_blocked`).
- **Inputs (prompts / user messages)**:
  - Currently:
    - Logged/stored only in **sanitized** form via `SnapshotService`.
    - Not blocked at gateway yet (i.e., we don’t currently reject requests with PII in the prompt).
  - Future option:
    - Add a **“Prompt Firewall”** rule type to reject or mask high‑risk inputs before they reach external providers.

---

## 3. Audit Events and Traceability

### 3.1. Where audit logs live

- **Model:** `backend/app/models/audit_log.py`
- **Service:** `backend/app/services/audit_service.py`
- The service is wired into high‑value endpoints (e.g. `projects.py`, some admin operations).

Audit logs are intended for **security‑relevant events**, not general metrics.

### 3.2. Critical events to log (current + target)

The following event types are either:
- **Already logged** in code, or
- **Designated as “must log”** going forward.

- **Authentication / Account**
  - Login success / failure / rate‑limit (see `auth.py` – extensive logging already exists).
  - Registration success / failure.
- **Organization / Project lifecycle**
  - Organization create / update / delete (`organizations.py`).
  - Project create / update / delete (`projects.py`).
- **API key management**
  - User API key create / update / delete (`user_api_keys.py`).
  - Any failures while encrypting/decrypting user keys.
- **Validation / Replay / Release Gate**
  - Release Gate run created (org, project, node, dataset, model, replay provider).
  - Gate result summary (pass/fail counts, behavior diff band) – **without** logging raw payloads.
- **Security & Limits**
  - Panic mode enabled/disabled for a project.
  - Firewall rule changes (add/edit/delete).
  - Hard quota / credit limit violations (once implemented via `GuardCredit`).

### 3.4. Admin endpoint hardening (MVP baseline)

- High-risk operational routes must require superuser privileges.
- Current baseline:
  - Access checks are centralized with `require_admin(...)` in `backend/app/core/permissions.py`.
  - `POST /api/v1/admin/init-db` requires `current_user.is_superuser`.
  - `POST /api/v1/admin/generate-sample-data` requires `current_user.is_superuser`.
  - `POST /api/v1/admin/upgrade-user-subscription` requires `current_user.is_superuser`.
  - `GET /api/v1/internal/usage/credits/by-project` requires `current_user.is_superuser`.
- Product policy:
  - Billing remains read-only for standard users during MVP.
  - Any plan mutation endpoint must stay operator-only until paid plans are officially enabled.

### 3.5. Project role boundary (owner/admin/member/viewer)

- Role model is defined at project scope:
  - Owner: project owner (`projects.owner_id`)
  - Admin / Member / Viewer: `project_members.role`
- Access check baseline:
  - Shared helper: `check_project_access(...)` in `backend/app/core/permissions.py`.
  - Management actions must explicitly set `required_roles=[owner, admin]`.
- Current MVP intent:
  - **Owner/Admin**: project mutation and team-management operations.
  - **Member/Viewer**: read and execution flows explicitly intended for non-admin collaboration.
- Additional hardened case:
  - Behavior dataset deletion route (`POST /api/v1/projects/{project_id}/behavior-datasets/{dataset_id}/delete`) now requires owner/admin.
- Canonical reference:
  - See `docs/mvp-endpoint-access-matrix.md` for the current endpoint-level access table.
- Bootstrap guard:
  - Project creation with `generate_sample_data=true` is operator-only and returns `403` for non-superusers.

> If you add a new feature that materially affects **data access, permissions, or model behavior in production**, it should generally write an `AuditLog` entry.

### 3.3. Minimal operational expectations

- **Retention**: Audit logs should be kept for at least the same duration as business logs (subject to infra limits and legal requirements).
- **Access**: Only operators with admin privileges should have direct DB access to raw audit logs.
- **Next step (nice‑to‑have)**:
  - Add a simple internal `/internal/audit` page for filtered viewing of recent security‑relevant events (admin‑only).

---

## 4. How to Propose Changes

- For any change that:
  - Touches authentication, authorization, or API keys
  - Introduces new external integrations (providers, plugins, webhooks)
  - Alters how prompts or snapshots are stored
- …please update this `SECURITY.md` file in the same PR with:
  - A brief note of the new behavior.
  - Any new assumptions or limits.

This keeps the security story **discoverable and realistic**, instead of drifting away from the actual code.

