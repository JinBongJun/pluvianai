"use client";

import { useEffect, useMemo, useState } from "react";
import { adminAPI, internalBillingAPI } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { logger } from "@/lib/logger";

type AdminUser = {
  id: number;
  email: string;
  full_name?: string | null;
};

type BillingTimelineEvent = {
  id: number;
  provider_event_id: string;
  event_type: string;
  processing_status: string;
  processing_error?: string | null;
  provider_environment?: string;
  event_created_at?: string | null;
  received_at?: string | null;
  processed_at?: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
};

type EntitlementRow = {
  id: number;
  effective_plan_id: string;
  entitlement_status: string;
  effective_from?: string | null;
  effective_to?: string | null;
  source?: string;
  created_at?: string | null;
};

type ProviderLiveSubscription = {
  id?: string | null;
  status?: string;
  customer_id?: string | null;
  next_billed_at?: string | null;
  current_period_starts_at?: string | null;
  current_period_ends_at?: string | null;
};

type ProviderLiveState = {
  customer_id?: string | null;
  subscription_id?: string | null;
  blocking?: boolean;
  blocking_subscription_ids?: string[];
  blocking_subscription_count?: number;
  subscriptions?: ProviderLiveSubscription[];
  lookup_error?: string | null;
  stored_subscription_found?: boolean;
  has_untracked_blocking_subscription?: boolean;
};

type BillingTimelineResponse = {
  user: {
    id: number;
    email: string;
    full_name?: string | null;
    paddle_customer_id?: string | null;
  };
  subscription?: {
    id: number;
    plan_type: string;
    status: string;
    provider?: string;
    provider_environment?: string;
    paddle_subscription_id?: string | null;
    paddle_customer_id?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    canceled_at?: string | null;
    cancel_effective_at?: string | null;
    last_provider_event_at?: string | null;
    last_reconciled_at?: string | null;
  } | null;
  current_entitlement?: EntitlementRow | null;
  recent_entitlements: EntitlementRow[];
  events: BillingTimelineEvent[];
  provider_live?: ProviderLiveState;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function InternalBillingPage() {
  const isAuthenticated = useRequireAuth();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<BillingTimelineResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find(user => user.id === selectedUserId) || timeline?.user || null,
    [selectedUserId, timeline, users]
  );
  const providerLive = timeline?.provider_live;
  const providerLiveWarnings = useMemo(() => {
    if (!providerLive) return [];
    const warnings: string[] = [];
    if (providerLive.lookup_error) {
      warnings.push(`Paddle live lookup failed: ${providerLive.lookup_error}`);
    }
    if (providerLive.blocking) {
      warnings.push("Paddle has a billable or period-active subscription for this user.");
    }
    if (providerLive.has_untracked_blocking_subscription) {
      warnings.push("A blocking Paddle subscription is not the subscription currently stored in the local DB.");
    }
    if (timeline?.subscription?.paddle_subscription_id && providerLive.stored_subscription_found === false) {
      warnings.push("The local subscription id was not found in Paddle live subscriptions.");
    }
    return warnings;
  }, [providerLive, timeline?.subscription?.paddle_subscription_id]);

  const loadTimelineForUser = async (userId: number) => {
    setLoadingTimeline(true);
    setTimelineError(null);
    try {
      const data = (await internalBillingAPI.getUserBillingTimeline(userId, 25)) as BillingTimelineResponse;
      setTimeline(data);
    } catch (err: any) {
      logger.error("Failed to load billing timeline", err);
      setTimeline(null);
      setTimelineError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to load billing timeline."
      );
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !selectedUserId) return;
    void loadTimelineForUser(selectedUserId);
  }, [isAuthenticated, selectedUserId]);

  const searchUsers = async () => {
    if (!isAuthenticated) return;
    const term = query.trim();
    if (!term) {
      setUsers([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const items = (await adminAPI.listUsers({ search: term, limit: 10, offset: 0 })) as AdminUser[];
      setUsers(items);
      if (items.length === 1) setSelectedUserId(items[0].id);
    } catch (err: any) {
      logger.error("Failed to search users for billing timeline", err);
      setSearchError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to search users."
      );
    } finally {
      setSearching(false);
    }
  };

  const runReconcile = async () => {
    if (!selectedUserId || actionBusy) return;
    setActionBusy("reconcile");
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await internalBillingAPI.reconcileUserBilling(selectedUserId);
      const driftFixed = result?.drift_fixed ? " Drift fixed." : "";
      const status = result?.status ? `Status: ${result.status}.` : "Reconcile completed.";
      setActionMessage(`${status}${driftFixed}`);
      await loadTimelineForUser(selectedUserId);
    } catch (err: any) {
      logger.error("Failed to reconcile billing user", err);
      setActionError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to reconcile this user."
      );
    } finally {
      setActionBusy(null);
    }
  };

  const retryWebhookEvent = async (eventId: string) => {
    if (!selectedUserId || actionBusy) return;
    const normalized = String(eventId || "").trim();
    if (!normalized) return;
    setActionBusy(`retry:${normalized}`);
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await internalBillingAPI.retryWebhookEvent(normalized);
      const status = result?.status ? `Status: ${result.status}.` : "Webhook retry completed.";
      setActionMessage(`${status} Event ${normalized} retried.`);
      await loadTimelineForUser(selectedUserId);
    } catch (err: any) {
      logger.error("Failed to retry billing webhook event", err);
      setActionError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to retry this webhook event."
      );
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Billing timeline</h1>
          <p className="text-sm text-slate-400">
            Internal operator view for subscription state, entitlements, and recent billing events.
          </p>
        </header>

        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void searchUsers();
              }}
              placeholder="Search user by email or name"
              className="flex-1 rounded-md border border-white/10 bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={() => void searchUsers()}
              disabled={searching}
              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {searchError && (
            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {searchError}
            </div>
          )}
          {users.length > 0 && (
            <div className="mt-4 grid gap-2">
              {users.map(user => {
                const isSelected = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="font-medium text-slate-100">{user.email}</div>
                    <div className="text-xs text-slate-500">
                      User ID {user.id}
                      {user.full_name ? ` • ${user.full_name}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedUser && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Selected user</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">{selectedUser.email}</div>
              <div className="text-sm text-slate-500">User ID {selectedUser.id}</div>
              <button
                type="button"
                onClick={() => void runReconcile()}
                disabled={!selectedUserId || !!actionBusy}
                className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionBusy === "reconcile" ? "Reconciling..." : "Reconcile this user"}
              </button>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Subscription</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {timeline?.subscription?.plan_type || "free"}
              </div>
              <div className="text-sm text-slate-500">
                {timeline?.subscription?.status || "no active subscription row"}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Entitlement</div>
              <div className="mt-2 text-lg font-semibold text-sky-300">
                {timeline?.current_entitlement?.effective_plan_id || "free"}
              </div>
              <div className="text-sm text-slate-500">
                {timeline?.current_entitlement?.entitlement_status || "not computed"}
              </div>
            </div>
          </section>
        )}

        {timelineError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {timelineError}
          </div>
        )}
        {actionMessage && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {actionMessage}
          </div>
        )}
        {actionError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {actionError}
          </div>
        )}

        {loadingTimeline && (
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
            Loading billing timeline...
          </div>
        )}

        {timeline && !loadingTimeline && (
          <>
            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">Current billing state</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Provider</div>
                  <div className="mt-1 text-sm text-slate-100">
                    {timeline.subscription?.provider || "—"} / {timeline.subscription?.provider_environment || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Paddle customer</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-200">
                    {timeline.subscription?.paddle_customer_id ||
                      timeline.user.paddle_customer_id ||
                      "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Subscription id</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-200">
                    {timeline.subscription?.paddle_subscription_id || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Current period end</div>
                  <div className="mt-1 text-sm text-slate-100">
                    {formatDateTime(timeline.subscription?.current_period_end)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Paddle live state</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Provider truth used to detect stale local billing records and duplicate subscriptions.
                  </p>
                </div>
                <span
                  className={`self-start rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                    providerLive?.lookup_error
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                      : providerLive?.blocking
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {providerLive?.lookup_error ? "Lookup failed" : providerLive?.blocking ? "Blocking" : "Clear"}
                </span>
              </div>

              {providerLiveWarnings.length > 0 ? (
                <div className="mb-4 space-y-2">
                  {providerLiveWarnings.map(message => (
                    <div
                      key={message}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                    >
                      {message}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Live customer</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-200">
                    {providerLive?.customer_id || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Live local subscription</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-200">
                    {providerLive?.subscription_id || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Blocking count</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {providerLive?.blocking_subscription_count ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Stored id found live</div>
                  <div className="mt-1 text-sm text-slate-100">
                    {providerLive?.stored_subscription_found ? "yes" : "no"}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {(providerLive?.subscriptions || []).length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-500">
                    No Paddle live subscriptions returned.
                  </div>
                ) : (
                  (providerLive?.subscriptions || []).map((sub, idx) => {
                    const subId = sub.id || `live-sub-${idx}`;
                    const isBlocking = (providerLive?.blocking_subscription_ids || []).includes(String(sub.id || ""));
                    return (
                      <div key={subId} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="break-all font-mono text-xs text-slate-200">{sub.id || "unknown"}</div>
                          <span
                            className={`self-start rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                              isBlocking
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                : "border-white/10 bg-white/[0.03] text-slate-300"
                            }`}
                          >
                            {sub.status || "unknown"}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-slate-400 md:grid-cols-2">
                          <div>Next billed: {formatDateTime(sub.next_billed_at)}</div>
                          <div>Period ends: {formatDateTime(sub.current_period_ends_at)}</div>
                          <div className="break-all">Customer: {sub.customer_id || "—"}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">Recent entitlements</h2>
                  <span className="text-xs text-slate-500">{timeline.recent_entitlements.length} rows</span>
                </div>
                <div className="space-y-3">
                  {timeline.recent_entitlements.length === 0 ? (
                    <div className="text-sm text-slate-500">No entitlement snapshots found.</div>
                  ) : (
                    timeline.recent_entitlements.map(row => (
                      <div key={row.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-100">
                            {row.effective_plan_id} / {row.entitlement_status}
                          </div>
                          <div className="text-xs text-slate-500">{row.source || "system"}</div>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          Effective: {formatDateTime(row.effective_from)} → {formatDateTime(row.effective_to)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Snapshot created: {formatDateTime(row.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">Recent billing events</h2>
                  <span className="text-xs text-slate-500">{timeline.events.length} events</span>
                </div>
                <div className="space-y-3">
                  {timeline.events.length === 0 ? (
                    <div className="text-sm text-slate-500">No billing events recorded.</div>
                  ) : (
                    timeline.events.map(event => (
                      <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-100">{event.event_type}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs uppercase tracking-wider text-sky-300">
                              {event.processing_status}
                            </div>
                            {event.processing_status === "error" ? (
                              <button
                                type="button"
                                onClick={() => void retryWebhookEvent(event.provider_event_id)}
                                disabled={!!actionBusy}
                                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {actionBusy === `retry:${event.provider_event_id}` ? "Retrying..." : "Retry"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-slate-400">
                          <div>Event ID: <span className="font-mono text-slate-300">{event.provider_event_id}</span></div>
                          <div>Received: {formatDateTime(event.received_at)}</div>
                          <div>Processed: {formatDateTime(event.processed_at)}</div>
                          <div>Created: {formatDateTime(event.event_created_at)}</div>
                          <div>Env: {event.provider_environment || "—"}</div>
                          {event.processing_error ? (
                            <div className="text-rose-300">Error: {event.processing_error}</div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
