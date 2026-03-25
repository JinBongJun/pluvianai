import { LIVE_VIEW_SWRS_DEDUPE_MS } from "./liveViewPolling.constants";

/**
 * Shared SWR options for Live View (avoid duplicate literals in page.tsx).
 * Agents list adds `refreshInterval` + `shouldRetryOnError: false` on top.
 */
export const LIVE_VIEW_SWR_DEFAULT_OPTIONS = {
  dedupingInterval: LIVE_VIEW_SWRS_DEDUPE_MS,
  revalidateOnFocus: false,
} as const;
