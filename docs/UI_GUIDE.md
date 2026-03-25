# PluvianAI UI Mini Guide v1

This guide defines practical UI standards for the current MVP.

References:
- Component API style: `shadcn/ui`
- Typography and spacing baseline: `GitHub Primer`

---

## 1) Design Principles

- Keep one primary action per section.
- Favor clarity over decoration; use visual emphasis sparingly.
- Reuse a small set of tokens (button sizes, type scale, spacing, colors).
- Use consistent copy patterns for actions and statuses.

---

## 2) Typography Scale

- Font families
  - Base: `Inter` (`font-sans`)
  - Code/numeric: `JetBrains Mono` (`font-mono`)

- Type hierarchy
  - Page title (`H1`): `text-3xl md:text-4xl font-bold text-white`
  - Section title (`H2`): `text-2xl font-semibold text-white`
  - Block title (`H3`): `text-lg font-semibold text-slate-200`
  - Body: `text-sm` to `text-base text-slate-300`
  - Helper/meta: `text-xs text-slate-500`

---

## 3) Button System

Use `frontend/components/ui/Button.tsx` as the single source of truth.

- Variants
  - `primary`: main CTA only
  - `secondary`: supporting actions
  - `outline`: neutral alternative actions
  - `ghost`: low-emphasis toolbar/link-like actions
  - `danger`: destructive actions only

- Sizes
  - `sm`: compact inline actions
  - `md`: default form/page action
  - `lg`: hero or high-priority CTA

- Usage rules
  - Max one `primary` button per section/panel.
  - Destructive action labels must start with clear verbs: `Delete`, `Remove`, `Revoke`.
  - Prefer icon+text for discoverability; icon-only only in dense toolbars.

---

## 4) Form Patterns

- Label: `text-sm text-slate-400 mb-1`
- Input base:
  - `rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white`
  - `placeholder-slate-500 focus:border-emerald-500 focus:outline-none`
- Layout
  - Vertical stack: `space-y-3`
  - Multi-column forms: `grid md:grid-cols-2/3 gap-3`
- Validation messaging
  - Inline field errors: `text-xs text-rose-400 mt-1`
  - Section-level status box:
    - Success: emerald tint/border
    - Error: rose tint/border

---

## 5) Layout and Spacing

- Page shell
  - `min-h-screen bg-[#0a0a0c] text-slate-200`
  - Content container: `max-w-6xl mx-auto px-6 py-8`
- Section card
  - `rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4`
- Vertical rhythm
  - Between sections: `space-y-8`
  - Inside cards: `space-y-4` or `space-y-5`

---

## 6) Copy Guidelines

- Tone: precise, calm, operational (avoid hype in product surfaces).
- Action labels: verb + object
  - Good: `Save profile`, `Create API key`, `Run validation`
- Secondary labels:
  - `Cancel`, `Back to ...`, `View details`
- Feedback messages:
  - Success: short and direct (`Changes saved.`)
  - Error: actionable and neutral (`We couldn't save changes. Please try again.`)

---

## 7) Accessibility Baseline

- Maintain clear contrast for text and controls on dark surfaces.
- Ensure focus visibility (`focus:ring-*`) on all interactive controls.
- Avoid unsupported ARIA attributes on implicit roles.
- Keep button hit area at least ~40px height for primary interactions.

---

## 8) Scope and Adoption

- This guide is MVP-oriented and intentionally lightweight.
- New pages should follow these standards by default.
- Existing pages should be aligned incrementally when touched.

---

## 9) Baseline Size Tokens (Required)

Use these defaults unless there is a clear product reason to deviate:

- Typography
  - Page title: `text-3xl md:text-4xl font-bold`
  - Section title: `text-2xl font-semibold`
  - Body copy: `text-base` (or `text-sm` for dense metadata)
  - Meta labels: `text-xs`

- Controls
  - Primary/secondary form buttons: `h-12`
  - Hero CTA only: `h-16`
  - Search inputs: `h-12`
  - Icon-only round buttons: `w-10 h-10`

- Containers
  - Main content wrapper: `max-w-6xl mx-auto px-6 py-8`
  - Settings/detail wrappers: `max-w-4xl`
  - Standard card: `rounded-xl border border-white/10 bg-white/[0.03] p-6`

- Rule of thumb
  - Prefer `Button`, `Input`, `Label`, `Card`, `Typography` primitives first.
  - Avoid ad-hoc one-off sizes (custom `h-*`, `text-*`) when an existing token fits.

---

## 8) Live View — Snapshot detail modal (`SnapshotDetailModal`)

- **Release Gate CTA**: When `releaseGateHref` is passed (e.g. from Live View with `orgId`), a short **pre-deploy verification** strip links to Release Gate. Omit the prop inside Release Gate-only UIs if the link is redundant.
- **Tool activity**: The section is **always** shown with three sub-areas:
  - **Tool calls (provider summary)** — or dashed empty state explaining missing `tool_calls_summary`.
  - **Tool timeline (calls & I/O)** — `ToolTimelinePanel` when rows exist; otherwise a matching header + empty hint (ingest `tool_events`, provider tool_calls, etc.).
  - **Actions (side effects)** — same pattern for outbound `action` rows.
- **Evaluation**: Cards reflect **rows stored on the snapshot** (capture time). A footnote clarifies this when no `evalContextLabel` override is present. Re-eval / override flows may expand rows from current settings.
- **Execution steps**: Empty state lists payload keys we scan (`steps`, `step_log`, `trajectory.steps`, `events`).
