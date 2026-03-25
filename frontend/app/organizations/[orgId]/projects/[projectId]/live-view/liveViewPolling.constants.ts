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
