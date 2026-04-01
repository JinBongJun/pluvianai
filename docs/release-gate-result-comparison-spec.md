# Release Gate Result Comparison Spec

## Purpose

Release Gate result should be a comparison-first review surface, not a long-form report.

The user should be able to answer these three questions in under 5 seconds:

1. What changed vs the base run?
2. How did those changes affect eval results?
3. How did the actual output change?

This spec replaces the current "read a lot of text to understand what happened" experience with a compact, scan-friendly comparison flow.

---

## Product Principles

- Put comparison before explanation.
- Show all configured eval checks again.
- Reduce prose; prefer rows, badges, counts, and deltas.
- Separate config/runtime changes from output changes.
- Keep tool-related information in one place.
- Show detail on demand, not by default.
- Make the page feel closer to LangSmith / Braintrust / GitHub review patterns:
  - change summary first
  - scoreboard second
  - diff last

---

## Core User Story

As a user reviewing a failed or changed Release Gate run, I want to quickly see:

- what inputs or replay settings changed,
- which eval checks passed or failed,
- and exactly how the candidate response differs from the baseline,

so I can judge whether the change is acceptable without reading repeated explanatory text.

---

## Screen Information Architecture

The result screen should follow this order:

1. `Change Summary`
2. `Eval Scoreboard`
3. `Output Diff`
4. `Expandable Details`
5. `Diagnostics`

User-facing mental model:

`You changed these inputs -> the run evaluated like this -> the output changed like this`

---

## Wireframe: Review Tab

This section defines the intended first-screen layout for the main review experience.

### Desktop layout

Recommended top-to-bottom structure:

1. `Attempt header`
2. `Change Summary`
3. `Eval Scoreboard`
4. `Output Diff`
5. `Expandable Details`

Avoid a split-screen layout where multiple explanatory blocks compete for attention above the fold.

### Attempt header

Keep this compact. It should establish context, not explain the result.

Show:

- overall decision: `Passed` / `Failed`
- attempt label: `Attempt 2 of 5`
- small meta chips:
  - model pair if useful
  - input index
  - trace / snapshot count if useful
- one short sentence only:
  - `Base vs replay comparison for this selected input.`

Do not place long intro copy here.

### Above-the-fold priority

The first screen without scrolling should ideally contain:

- attempt header
- top half of `Change Summary`
- at least the first rows of `Eval Scoreboard`

The user should not need to scroll before understanding what changed and what failed.

### Visual hierarchy

Use this priority:

1. changed values
2. failed eval rows
3. output diff access
4. details
5. diagnostics

This means:

- stronger contrast for changed rows
- strongest contrast for failed eval rows
- quieter styling for unchanged / passing rows
- details and diagnostics visually lower priority

---

## Wireframe: Section Breakdown

### 1. Attempt header block

Example wireframe:

```text
[Failed]  Attempt 2 of 5
Base vs replay comparison for this selected input.
[Input #4] [Repeat 2/3] [5 logs]
```

Rules:

- keep to one short subtitle line
- do not repeat reasons already shown in lower sections
- do not put "what changed" prose here

### 2. Change Summary block

Example wireframe:

```text
What changed from base

Model                 gpt-4.1 -> claude-3.7              Run-wide
Output tokens         420 -> 690                         +64%
Latency               3.2s -> 5.8s                       Slower
Tool calls            1 -> 4                             Mixed
Extra request JSON    Shared changed, 3 logs customized  Mixed
Extra system context  Append enabled, 4 logs customized  Per-log
System prompt         Override applied                   Run-wide
Sampling              temperature, max_tokens changed    Run-wide
```

Preferred row columns:

- left: label
- middle: summary
- right: scope / impact badge

Row interactions:

- clicking a row scrolls to or opens the matching detail section
- rows with no meaningful change may be hidden behind `Show unchanged`

### 3. Eval Scoreboard block

Example wireframe:

```text
Evaluation results

Required fields    Fail   missing refund_deadline        Jump to diff
Format             Pass   -
Length             Fail   18 lines -> 42 lines           Jump to diff
JSON validity      Pass   -
Tool use policy    Fail   extra tool call detected       Jump to tool
Groundedness       Pass   -
```

Preferred row columns:

- check label
- result badge
- short evidence
- action

Rules:

- all configured eval checks visible by default
- no separate "passed checks" card above the fold
- fail rows grouped naturally by visual emphasis, not by moving pass rows far away

Optional controls at the section top:

- `All`
- `Failed only`
- `Changed only`

Default view should remain `All`.

### 4. Output Diff block

Example wireframe:

```text
Response diff
[Changed lines only] [Show removed lines] [Wrap lines]

Baseline                              Candidate
-----------------------------------   -----------------------------------
...                                   ...
```

Rules:

- place after the scoreboard
- allow direct jump from failed eval rows
- keep helper copy very short

### 5. Expandable Details block

Example wireframe:

```text
Details

> Extra request JSON details
> Extra system context details
> Tool behavior details
> System prompt preview
> Sampling details
```

Rules:

- collapsed by default
- each drawer should open independently
- do not auto-expand all details on failed runs

### 6. Diagnostics block

Example wireframe:

```text
Diagnostics

> Raw payload
> Provider metadata
> Tool timeline
> Trace evidence
```

Rules:

- separate from the main review flow
- still available for debugging
- visually quieter than the review sections

---

## Wireframe: Mobile Layout

Mobile should preserve order, not parity of columns.

Recommended mobile order:

1. header
2. change summary rows
3. eval scoreboard rows
4. diff
5. details drawers
6. diagnostics drawers

### Mobile rules

- collapse multi-column rows into stacked label/value rows
- keep action buttons inline when possible:
  - `Diff`
  - `Details`
- avoid horizontal scrolling above the diff section
- keep the diff panes vertically stacked if side-by-side becomes unreadable

Example mobile change row:

```text
Extra request JSON
Shared changed, 3 logs customized
[Mixed]
```

Example mobile eval row:

```text
Length   [Fail]
18 lines -> 42 lines
[Jump to diff]
```

---

## Wireframe: Expansion Rules

### Default collapsed

- extra request raw JSON
- extra system context text preview
- tool timeline detail
- system prompt preview
- diagnostics payloads

### Default visible

- change summary rows
- all eval rows
- output diff shell

### Conditional auto-emphasis

Allowed:

- highlight a failed row
- show a badge such as `3 logs customized`
- show a badge such as `Policy failed`

Not allowed:

- opening multiple giant detail cards by default
- showing duplicated explanations in summary and detail at once

---

## Wireframe: Copy Placement

### Good placement

- one short sentence under a section title
- one short evidence snippet per eval row
- one scope badge per changed row

### Bad placement

- multiple paragraphs inside summary cards
- repeating the same explanation in header, section intro, and expanded detail
- placing "why it matters" prose before the user has seen what changed

---

## Section 1: Change Summary

### Goal

Show what changed relative to the baseline before showing eval failures.

This section should answer:

- Which inputs changed?
- Were the changes run-wide or only for specific logs?
- How large was the change?

### Layout

Use a compact vertical list or 2-column row grid. Avoid verbose cards.

Each row should use the following shape:

- `label`
- `status`
- `scope`
- `summary`
- `impact`
- optional `details anchor`

### Status values

- `same`
- `changed`
- `added`
- `removed`

### Scope values

- `run-wide`
- `per-log`
- `mixed`

### Recommended rows

- `Model`
- `Output tokens`
- `Latency`
- `Tool calls`
- `Extra request JSON`
- `Extra system context`
- `System prompt`
- `Sampling`
- `Tool behavior`

### Example copy

- `Model | changed | run-wide | gpt-4.1 -> claude-3.7`
- `Output tokens | changed | run-wide | 420 -> 690 | +64% vs base`
- `Latency | changed | run-wide | 3.2s -> 5.8s`
- `Tool calls | changed | mixed | 1 -> 4`
- `Extra request JSON | changed | mixed | shared changed, 3 logs customized`
- `Extra system context | changed | per-log | append enabled, 4 logs customized`
- `System prompt | changed | run-wide | override applied`
- `Sampling | changed | run-wide | temperature, max_tokens changed`

### Rules

- Lead with deltas, not explanations.
- Do not show raw JSON or long text inline by default.
- For mixed cases, summarize in one line and defer detail to the expandable panel.
- If a value is unchanged, either hide it or render it in a low-emphasis style.

---

## Section 2: Eval Scoreboard

### Goal

Show all configured eval checks again, like the previous behavior, but in a much lighter format.

This section should answer:

- What failed?
- What passed?
- What is the shortest useful evidence for each check?

### Layout

Use a table-like scoreboard with one row per eval check.

Each row should contain:

- `check name`
- `result`
- `short evidence`
- optional `delta / count / metric`
- optional `jump to diff`

### Result values

- `Pass`
- `Fail`
- `Warn` if needed for non-blocking heuristics

### Example rows

- `Required fields | Fail | missing refund_deadline`
- `Format | Pass`
- `Length | Fail | 18 lines -> 42 lines`
- `JSON validity | Pass`
- `Tool use policy | Fail | extra tool call detected`
- `Groundedness | Fail | unsupported claim added`

### Rules

- All configured eval checks must be visible.
- Do not hide passing rows behind a separate block by default.
- Failing rows get strong emphasis.
- Passing rows remain visible with low emphasis.
- Detailed why/fix text should be expandable, not always open.
- The scoreboard should be scannable without reading paragraphs.

### Optional per-row interactions

- `Show details`
- `Jump to diff`
- `Jump to tool detail`

### Expanded row content

Only when opened:

- `What changed`
- `Why it matters`
- `Relevant example`

Example:

- `Length`
  - `What changed: candidate is much longer than the baseline.`
  - `Why it matters: may indicate over-generation or repetition.`

---

## Section 3: Output Diff

### Goal

Provide the final evidence of how the candidate output changed.

This section should answer:

- What content was added?
- What content was removed?
- How different is the final answer?

### Layout

Use side-by-side baseline vs candidate panes.

Support:

- `Changed lines only`
- `Show removed lines`
- `Wrap lines`

### Top copy

- `Response diff`
- `Compare the baseline and replayed output side by side.`
- `Green marks added or changed candidate output.`
- `Red marks removed baseline content.`

### Rules

- Keep explanatory text short.
- Let the diff UI do most of the work.
- This is the final confirmation area, not the place to explain the entire run.

---

## Section 4: Expandable Details

### Goal

Preserve power-user detail without making the main review surface heavy.

These sections should be collapsed by default:

- `Extra request JSON details`
- `Extra system context details`
- `Tool behavior details`
- `System prompt preview`
- `Sampling detail`

---

## Detail Spec: Extra Request JSON

### Why it matters

Users can set both shared and per-log request-body overrides. The result UI must reflect that split.

### Current data model

Already supported in result metadata:

- `replay_overrides_applied`
- `replay_overrides_by_snapshot_id_applied`
- `baseline_snapshot_excerpt`

### Summary row behavior

Example summary:

- `Extra request JSON | changed | mixed | shared changed, 3 logs customized`

### Expanded content

#### Shared extras

Show:

- changed key count
- representative changed keys
- baseline excerpt
- applied excerpt

Example:

- `Shared extras`
- `attachments, metadata changed`

#### Per-log extras

Show only logs with custom overrides.

Example:

- `Log 182 | attachments changed`
- `Log 205 | metadata, documents changed`
- `Log 233 | custom override applied`

### Rules

- Never dump every log by default if there are many.
- Show changed-log count first.
- Raw JSON should be behind `View JSON`.

---

## Detail Spec: Extra System Context

### Why it matters

The tool UI allows:

- recorded only mode
- append to system prompt mode
- shared context
- per-log context
- fallback text

The result view should make those differences visible.

### Current data reality

This structure exists in the replay payload / experiment metadata, even if it is not yet summarized in the current result comparison UI.

Relevant concepts:

- `mode`: recorded vs inject
- `inject.scope`: global vs per_snapshot
- `inject.global_text`
- `inject.by_snapshot_id`

### Summary row behavior

Example summary:

- `Extra system context | changed | per-log | append enabled, 4 logs customized`

Other valid states:

- `Extra system context | same | run-wide | recorded only`
- `Extra system context | changed | run-wide | shared appended text added`
- `Extra system context | changed | mixed | per-log context with fallback`

### Expanded content

Show:

- `Mode | Recorded only` or `Append to system prompt`
- `Scope | Shared` or `Per-log`
- `Fallback | Present / Missing`
- `Customized logs | N`

Then list only affected logs:

- `Log 182 | custom context present`
- `Log 205 | custom context present`
- `Log 233 | uses fallback`

### Rules

- Do not show full appended text by default.
- Show presence, scope, and count first.
- Text preview should be behind `Preview text`.

---

## Detail Spec: System Prompt

### Summary row behavior

- `System prompt | changed | run-wide | override applied`
- `System prompt | same | run-wide | no override`

### Expanded content

Show:

- `override present`
- preview snippet
- optional baseline preview if available

### Rules

- Preview only; do not open with a giant text block by default.

---

## Detail Spec: Sampling

### Summary row behavior

- `Sampling | changed | run-wide | temperature, max_tokens changed`

### Expanded content

Show exact deltas:

- `temperature 0.2 -> 0.7`
- `max_tokens 512 -> 1024`
- `top_p 1.0 -> 0.9`

---

## Detail Spec: Tool Behavior

### Goal

Keep all tool-related interpretation in one place.

### Summary row behavior

- `Tool behavior | changed | mixed | definitions changed, calls 1 -> 4`
- `Tool behavior | failed | mixed | policy failed, 2 logs diverged`

### Expanded content

Show:

- definitions changed or not
- recorded call count
- replay call count
- executed / skipped / failed
- policy violations
- per-log divergence count
- tool timeline link or embedded compact view

### Rules

- Do not repeat tool policy in multiple sections.
- Do not show both a tool card and separate scattered tool summaries.
- Tool detail belongs in one consolidated expandable block.

---

## Diagnostics

### Goal

Keep raw payloads and trace-oriented data available without polluting review mode.

Diagnostics may include:

- raw JSON payload
- provider metadata
- capture / replay warnings
- tool timeline raw details
- trace-level evidence

### Rules

- Diagnostics should remain a separate tab or lower-priority area.
- Main review should not require users to open diagnostics for common comparisons.

---

## Copy Style Guide

### Preferred tone

Use short judgment-oriented phrases:

- `changed`
- `added`
- `removed`
- `override applied`
- `3 logs customized`
- `missing refund_deadline`
- `response shape changed`

### Avoid

- long narrative paragraphs
- repeated explanation across sections
- abstract risk language when a concrete delta is available
- showing every raw value at the top level

### Good examples

- `Shared changed, 3 logs customized`
- `Append enabled, fallback present`
- `18 lines -> 42 lines`
- `extra tool call detected`

### Bad examples

- `There may be a meaningful behavioral regression that requires further review.`
- `This run appears to have changed in several ways, some of which may be important.`

---

## Visibility Rules

### Always visible

- top comparison summary
- full eval scoreboard
- output diff

### Collapsed by default

- raw JSON blocks
- system prompt preview
- tool timeline detail
- per-log custom text
- diagnostics payloads

### Optional filters

Useful future controls:

- `Changed only`
- `Failed only`
- `Customized logs only`
- `Show removed lines`

---

## Mapping to Current Data

### Already available

- baseline and candidate models
- token counts
- line counts / response text diff
- configured eval check ids
- signal pass/fail rows
- replay request meta:
  - shared overrides
  - per-log overrides
  - sampling overrides
  - system prompt override preview
- experiment tool context payload
- tool timeline and tool evidence

### Needs UI remapping

- show all eval checks in a scoreboard instead of separated fail/pass blocks
- move comparison summary to the top
- summarize shared vs per-log changes in compact rows
- summarize tool context in comparison-first language
- reduce repeated explanatory text

### Potential backend follow-up

If needed for a cleaner UI summary, add a small derived summary object for result rendering, for example:

- `comparison_summary.extra_request.changed_logs`
- `comparison_summary.extra_request.changed_keys_preview`
- `comparison_summary.tool_context.mode`
- `comparison_summary.tool_context.scope`
- `comparison_summary.tool_context.changed_logs`
- `comparison_summary.tool_context.has_fallback`

This is optional. The current payload structure appears sufficient for an initial implementation.

---

## Proposed Components

- `ReleaseGateChangeSummary`
- `ReleaseGateChangeSummaryRow`
- `ReleaseGateEvalScoreboard`
- `ReleaseGateEvalScoreRow`
- `ReleaseGateOutputDiff`
- `ReleaseGateExpandedExtraRequestDetail`
- `ReleaseGateExpandedToolContextDetail`
- `ReleaseGateExpandedToolBehaviorDetail`

Likely implementation surface:

- `frontend/components/release-gate/AttemptDetailOverlay.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateReplayRequestMetaPanel.tsx`
- supporting helpers for compact comparison summary generation

---

## Acceptance Criteria

The redesign is successful if:

1. A user can identify the top config/runtime changes in less than 5 seconds.
2. All configured eval checks are visible without opening another panel.
3. The meaning of shared vs per-log customization is obvious.
4. Tool-related information is shown in one place.
5. The response diff remains easy to reach and easy to interpret.
6. The main review tab can be scanned without reading long paragraphs.
7. Diagnostics become optional for normal review, not mandatory.

---

## Non-Goals

- Replacing raw diagnostics entirely
- Removing access to detailed JSON
- Hiding passing eval checks
- Turning Release Gate into a full experiment browser

---

## One-Sentence Product Definition

Release Gate result should say:

`These inputs changed, the run evaluated like this, and the output changed like this.`
