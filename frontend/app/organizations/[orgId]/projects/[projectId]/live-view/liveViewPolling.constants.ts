/**
 * Live View polling / SWR / SSE timing. Keep light enough to avoid 429 under multi-tab / multi-user load.
 * @see docs/live-view-rg-polling-inventory.md
 */
export const LIVE_VIEW_BASE_POLL_MS = 10_000;
export const LIVE_VIEW_MAX_POLL_MS = 60_000;
export const LIVE_VIEW_FOCUSED_POLL_MS = 5_000;
export const LIVE_VIEW_SWRS_DEDUPE_MS = 5_000;
export const LIVE_VIEW_SSE_MUTATE_DEBOUNCE_MS = 1_000;
export const LIVE_VIEW_SSE_POLL_BACKOFF_MS = 30_000;

/** Desync tabs so GET /live-view/agents requests do not align on the same tick. */
const LIVE_VIEW_POLL_JITTER_MS_MAX = 800;

/** Returns `baseMs` plus random jitter, capped at {@link LIVE_VIEW_MAX_POLL_MS}. */
export function withLiveViewPollJitter(baseMs: number): number {
  const out = baseMs + Math.floor(Math.random() * LIVE_VIEW_POLL_JITTER_MS_MAX);
  return Math.min(out, LIVE_VIEW_MAX_POLL_MS);
}
