# Release Gate report context (A/B/C/D)

## Persisted (`BehaviorReport.summary_json`)

- `release_gate.experiment`: same shape as validate API `experiment` (tool_context + storage_policy).
- `release_gate.case_results[].context`:
  - **A** `A_captured_customer_material` — ingest `tool_events` tool_result text (preview + char count).
  - **B** `B_rg_injection` — resolved RG injection (applied, resolution, preview, sha256).
  - **C** `C_tool_inbound` — aggregates from `attempts[].tool_evidence` (recorded/simulated rows).
  - **D** `D_tool_outbound` — rows with `arguments_preview`.

## API job result (`ReleaseGate` validate response)

- `experiment` — run-level tool_context echo for UI without loading the report.
- `case_results[].context` — per-snapshot layers above.

## Follow-up (implementation plan)

| Phase | Work |
|-------|------|
| P0 | Done: backend `context` + `experiment` on report & API; minimal Results “Experiment” strip |
| P1 | Per-case A/B/C/D expandable cards; detail modal shows `context` previews |
| P2 | `storage_policy`: redaction, hash-only, omit full `tool_context` text |
| P3 | Outbound vs baseline `tool_events` field comparison scores |
| P4 | CSV export columns for `experiment` + context flags |
