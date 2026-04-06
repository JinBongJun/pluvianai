# Live View Issues-First UX Plan

## Goal

Live View should stop behaving like a log browser and start behaving like an issue discovery surface.

Primary user job:

1. Find a case that needs attention
2. Decide whether it can be rerun immediately
3. Send setup-heavy or fix-heavy cases to Release Gate

Core principle:

`Show the problem and the next action first. Hide engine internals by default.`

## UX Audit Notes

Based on the current implementation review and the Web Interface Guidelines focus/typography rules, the most important cleanup items are:

- reduce 10px/11px all-caps labels in the primary surface
- keep visible focus treatment on all filters, action buttons, and drawer controls
- prefer semantic buttons and links over clickable `div` wrappers
- keep number-heavy labels (`latency`, timestamps, counts) on tabular numerals
- avoid corrupted separators or placeholder copy in issue rows and request context panels

The current Live View should optimize for:

- one primary action per row
- readable summary text before raw diagnostics
- details only after explicit selection
- consistent button copy in Title Case

## Product Role

Live View is for:

- detecting suspicious cases
- scanning recent problem cases quickly
- rerunning replay-ready cases
- handing off setup-heavy cases to Release Gate

Live View is not for:

- full request configuration editing
- tool wiring setup
- deep payload inspection as the default experience
- ship/no-ship judgment

## Layout Decision

Use a full-width issues list as the default layout.

Do not keep a permanently open right-side detail panel.

Instead:

- default state: list only
- row selected: open a right-side drawer
- drawer closed: list returns to full width

Reason:

- the main problem today is lack of horizontal space
- the current always-open side panel makes the page feel like an internal diagnostics console
- row density improves immediately if the list owns the width

## Tab Naming

Rename the current `Live Logs` tab to `Issues`.

Reason:

- `Live Logs` describes internal data collection
- `Issues` describes the user job on this screen
- the screen should feel like a triage surface, not a log browser

Accepted wording:

- primary tab label: `Issues`

Not recommended as the main label:

- `Live Logs`
- `Evaluation`
- `Diagnostics`

## Tab Structure

The current tab model mixes different classification axes and should be simplified.

Current tabs:

- `Live Logs`
- `Evaluation`
- `Saved Data`
- `Settings`

Problem:

- one tab is about data source
- one tab is about analysis
- one tab is about persistence
- one tab is about configuration

This makes the top-level navigation feel heavier than necessary.

Recommended tab structure:

- `Issues`
- `Saved`

Move out of the main tab bar:

- `Evaluation`
- `Settings`

Decision:

- `Evaluation` should not remain a first-class top-level tab in Live View
- `Settings` should not remain a first-class top-level tab in Live View

Replacement model:

- `Evaluation` content moves into the issue detail drawer as part of:
  - `Checks`
  - `Why this needs attention`
  - recent result context
- `Settings` becomes a top-right button that opens:
  - a modal
  - or a slide-over panel

`Saved Data` should be simplified and renamed, but it should remain available as a first-class workflow if users use it to build case sets for Release Gate.

Recommended replacement:

- rename `Saved Data` to `Saved`
- treat it as a saved-case workspace, not a raw storage tab

Saved tab role:

- collect selected cases from `Issues`
- let users review and curate saved cases
- serve as a staging area for Release Gate input selection
- support handoff into Gate

Source filtering can still exist inside `Issues`, but it does not replace the `Saved` workflow.

Recommended source filter inside `Issues`:

- `All`
- `Live`
- `Saved`

Default recommendation:

- keep `Issues` and `Saved` as the only primary Live View tabs
- rename `Saved Data` to `Saved`
- remove `Evaluation` and `Settings` from the tab row
- treat `Saved` as a case-set workflow for Release Gate, not as a generic storage browser

## Surface Status Model

User-facing row status should stay simple:

- `Needs attention`
- `Looks good`

Do not expose the full internal state model as primary UI.

Internal evaluation states can still exist, but they should map into the simple surface model:

- failed -> `Needs attention`
- flaky -> `Needs attention`
- tool/setup required -> `Needs attention`
- stable/healthy -> `Looks good`

Small secondary reason text can explain why:

- `Flaky · 3/10 failed`
- `Tool setup required`
- `10/10 passed`

## Toolbar Structure

The top toolbar should be simplified around triage, not record management.

Recommended structure:

- left: result count summary
  - example: `Showing 2 of 2 issues`
- center: primary filters
  - `All`
  - `Needs attention`
  - `Looks good`
- right: sort and density controls
  - `Source: All / Live / Saved`
  - `Newest`
  - `Most flaky`
  - `Most recent failures`
  - optional row count control such as `Show 30`

Do not keep `Save` and `Delete` as visually primary controls in this toolbar.

If they remain on the page, move them to lower-priority actions such as:

- overflow menu
- secondary toolbar
- item-level management flows

## Row Design

Each row should show only the minimum information required for triage.

Recommended row structure:

- `Issue`
- `Case preview`
- `Status`
- `Quick action`

Recommended example:

- Issue: `Empty answer`
- Case: `"Summarize refund request..."`
- Status: `Needs attention · Flaky · 3/10 failed`
- Action:
  - `Run 10x` when replay-ready
  - `Open in Gate` when setup is required

Current table columns that should be replaced:

- `Time`
- `Model`
- `Eval`
- `Prompt / User Input`
- `Latency`

Recommended replacement columns:

- `Issue`
- `Case`
- `Status`
- `Action`

The list can still visually resemble a table, but the information model must shift from log metadata to issue triage.

Recommended status formatting inside the row:

- `Needs attention · 1/1 failed`
- `Needs attention · Flaky · 3/10 failed`
- `Needs attention · Tool setup required`
- `Looks good · 10/10 passed`

The row should not try to explain everything.

It should answer only:

1. what is wrong
2. what case is this
3. does it need action
4. what is the next action

## Row Content To Remove From Default View

Do not keep these as primary row columns:

- model
- provider
- result button
- fields button
- latency dropdown
- raw metadata
- payload/config summaries

These are not removed from the product.

They are moved behind the detail drawer or an advanced section.

Items that should also leave the default row action area:

- `RESULT`
- `FIELDS`
- latency dropdowns
- model/provider visibility

These compete with the actual next action and should move into the drawer.

## Detail Drawer

The drawer is for selected-case context and action, not for becoming a second full page.

Default drawer content:

- issue title
- case preview
- current status
- why this case needs attention
- recent run summary
- latest failure reason
- primary actions
  - `Run 10x`
  - `Run 50x`
  - `Open in Gate`

Collapsed advanced sections:

- raw response
- fields
- model/provider details
- latency details
- payload/config details
- tool details

Information order inside the drawer:

1. problem
2. evidence
3. action
4. internals

This means the drawer replaces the current always-open diagnostics side panel.

Default page behavior:

- no drawer open -> full-width issues list
- row selected -> drawer opens
- drawer closed -> list regains full width

Recommended drawer information order:

1. selected issue summary
2. case preview
3. why it needs attention
4. recent run evidence
5. primary actions
6. advanced details

## Run Policy

Live View rerun should only be available for replay-ready cases.

Allow Live View rerun only when:

- the case can be reproduced without missing tools or missing runtime dependencies
- the replay environment is already sufficient

Do not allow direct rerun when:

- the case depends on tools that are not configured
- required context or attachments are missing
- the replay environment cannot reproduce the original path reliably

In those cases:

- disable `Run 10x`
- show secondary reason text like `Tool setup required`
- use `Open in Gate` as the primary action

Reason:

- a failed rerun caused by missing setup looks like product failure
- this is worse than not offering the rerun button

## Filtering

Top-level filters should use problem language, not engine language.

Recommended filter set:

- `All`
- `Needs attention`
- `Looks good`

Recommended sort options:

- `Newest`
- `Most flaky`
- `Most recent failures`

Avoid exposing `Flagged` as the main user-facing category unless the product defines it very clearly.

`Needs attention` is easier to understand.

## Button Priority

Primary action in Live View:

- `Run 10x`

Secondary action:

- `Open in Gate`

Low-priority actions:

- save
- delete

These should not visually compete with rerun and handoff actions.

## Vocabulary

Prefer user-facing terms:

- `Issues`
- `Run`
- `Checks`
- `Result`
- `Gate` or `Open in Gate`

Avoid leading with internal terms:

- logs
- eval
- payload
- config
- fields

If raw details still exist, label them explicitly as secondary:

- `Raw log`
- `Advanced details`

## Non-Goals

This plan does not require:

- removing existing deep diagnostics
- reducing engine fidelity
- removing tool-aware replay logic

This is a presentation and workflow simplification plan, not a backend capability reduction plan.

## Immediate Implementation Order

1. Replace the always-open right panel with an on-demand drawer
2. Convert the default table into an issues-first list
3. Collapse surface status into `Needs attention` / `Looks good`
4. Gate Live View rerun behind replay-readiness
5. Move model/provider/payload/tool details into the drawer advanced sections

## Expected Outcome

After this change, Live View should read as:

`These are the cases that need attention. Pick one, rerun it if ready, or open it in Gate.`

It should no longer read as:

`Here is a table of internal logs and diagnostics.`

## Large Snapshot Handling

Live View must not try to load every snapshot for a node at once.

Reason:

- plan limits can be large enough to make full-list loading unrealistic
- Live View is a recent-first triage surface, not a full archive browser
- rendering thousands of rows at once would increase network cost, client memory, filter latency, and selection-state complexity

### Product Rule

Use recent-first append pagination.

Default behavior:

- load only the most recent page
- let users request older pages explicitly
- keep the initial page fast and focused on recent incidents

This means:

- first page = recent snapshots only
- more history = `Load older`
- never offer `Load all`

### Backend Contract

The existing snapshots list API already supports the required pagination shape.

Use:

- `limit`
- `offset`
- `total_count`

Do not change the backend API in phase 1.

Phase 1 should only change frontend state management and UX.

### Frontend Model

Treat the current `Show 30 / 50 / 100 / 200` control as page size, not total list size.

Required state:

- `pageSize`
- `loadedSnapshots`
- `totalSnapshots`
- `isLoadingMore`
- `hasMore`
- `loadMoreError`

Behavior:

- first request:
  - `limit = pageSize`
  - `offset = 0`
- `Load older` request:
  - `limit = pageSize`
  - `offset = loadedSnapshots.length`

### Merge Rules

Appending older pages must not create duplicate rows.

Required merge rule:

- dedupe by snapshot `id`

Required ordering rule:

- keep server recency ordering
- apply the existing UI filter/sort layer on top of the loaded set

### Polling Rule

Polling must only refresh the newest page.

Do not re-fetch every previously loaded page.

Safe merge behavior:

1. refresh the first page
2. merge it into `loadedSnapshots`
3. keep previously loaded older pages
4. dedupe by `id`

This keeps recent data fresh without erasing older pages the user already loaded.

### Reset Rules

Reset pagination state when:

- `projectId` changes
- `agentId` changes
- `pageSize` changes

Do not reset pagination state when:

- risk/status filter changes
- sort mode changes

Those should only re-derive the currently loaded set.

### Toolbar Copy

The toolbar should tell the truth about partial loading.

Recommended copy:

- `Showing 200 of 10,000 snapshots`
- `Recent snapshots first`

If needed, add a small secondary note:

- `Sorting applies to loaded snapshots`

### Bottom Pagination UI

Add a dedicated bottom pagination control.

Recommended states:

- `Load older`
- `Loading older snapshots...`
- `Loaded 200 of 10,000`
- `All snapshots loaded`
- `Could not load older snapshots`

This should be a list-footer control, not a floating action.

### Delete And Selection Safety

Selection and delete flows must stay consistent with append pagination.

Rules:

- deleting snapshots must remove them from `loadedSnapshots`
- deleting snapshots must also remove them from selection state
- after delete, revalidate the first page

This prevents stale rows, stale counts, and ghost selections.

### Non-Goals For Phase 1

Do not add in phase 1:

- cursor pagination
- date-range filtering
- full archive search
- `Load all`
- backend schema changes

Those can be revisited later if usage proves they are necessary.

### Safe Implementation Order

1. keep the current first-page UX intact
2. add accumulated snapshot state behind it
3. add `Load older`
4. dedupe and merge by `id`
5. merge polling into the first page only
6. integrate delete/selection cleanup
7. update count copy in the toolbar

### Validation Checklist

Required checks before rollout:

- first load still behaves like the current recent-only view
- `Load older` appends without replacing the current list
- duplicate rows do not appear
- polling refreshes the latest page without dropping older loaded pages
- delete removes rows and clears selection state correctly
- changing page size resets the accumulated list correctly
- switching project or agent resets the accumulated list correctly

### Intended Outcome

Even when a node has thousands of snapshots, Live View should still feel like:

- a fast recent-first triage surface
- a controlled history browser when needed

It should not behave like:

- an unbounded full-table dump
- a page that attempts to render the entire archive at once
