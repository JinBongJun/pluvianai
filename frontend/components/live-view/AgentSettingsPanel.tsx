"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertCircle, KeyRound, Save, Trash2 } from "lucide-react";

import { liveViewAPI, projectUserApiKeysAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { getProjectPermissionToast } from "@/lib/projectAccess";

type ReplayProvider = "openai" | "anthropic" | "google";

const PROVIDER_LABEL: Record<ReplayProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

const PROVIDERS: ReplayProvider[] = ["openai", "anthropic", "google"];

type ProjectUserApiKeyItem = {
  id: number;
  provider: string;
  agent_id?: string | null;
  name?: string | null;
  is_active: boolean;
  created_at?: string | null;
  key_hint?: string | null;
};

function normalizeProvider(value: unknown): ReplayProvider | null {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === "openai" || v === "anthropic" || v === "google") return v;
  return null;
}

interface AgentSettingsPanelProps {
  projectId: number;
  agentId: string;
  onAgentUpdated?: () => void;
  onAgentDeleted?: () => void;
}

export function AgentSettingsPanel({
  projectId,
  agentId,
  onAgentUpdated,
  onAgentDeleted,
}: AgentSettingsPanelProps) {
  const toast = useToast();

  const {
    data: settingsData,
    mutate: mutateSettings,
    isLoading: settingsLoading,
  } = useSWR(
    projectId && agentId ? ["live-view-agent-settings-panel", projectId, agentId] : null,
    () => liveViewAPI.getAgentSettings(projectId, agentId),
    { revalidateOnFocus: false }
  );
  const { data: latestSnapshotData } = useSWR(
    projectId && agentId ? ["live-view-agent-settings-latest-snapshot", projectId, agentId] : null,
    () =>
      liveViewAPI.listSnapshots(projectId, { agent_id: agentId, limit: 1, offset: 0, light: true }),
    { revalidateOnFocus: false }
  );
  const {
    data: keysData,
    mutate: mutateKeys,
    isLoading: keysLoading,
  } = useSWR(
    projectId ? ["project-user-api-keys-settings-panel", projectId] : null,
    () => projectUserApiKeysAPI.list(projectId),
    { revalidateOnFocus: false }
  );

  const [displayNameDraft, setDisplayNameDraft] = useState(agentId);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeletingNode, setIsDeletingNode] = useState(false);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(false);

  const [providerDraft, setProviderDraft] = useState<ReplayProvider>("openai");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [deletingKeyProvider, setDeletingKeyProvider] = useState<ReplayProvider | null>(null);

  const latestSnapshot = useMemo(() => {
    const items = (latestSnapshotData as { items?: Record<string, unknown>[] } | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    return first && typeof first === "object" ? first : null;
  }, [latestSnapshotData]);

  const latestProvider = useMemo(
    () => normalizeProvider((latestSnapshot as Record<string, unknown> | null)?.provider),
    [latestSnapshot]
  );
  const latestModel = useMemo(() => {
    const snapshot = latestSnapshot as Record<string, unknown> | null;
    const directModel = snapshot?.model;
    if (typeof directModel === "string" && directModel.trim()) return directModel.trim();
    const payload = snapshot?.payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const payloadModel = (payload as Record<string, unknown>).model;
      if (typeof payloadModel === "string" && payloadModel.trim()) return payloadModel.trim();
    }
    return "";
  }, [latestSnapshot]);

  const keys = useMemo(
    () => (Array.isArray(keysData) ? (keysData as ProjectUserApiKeyItem[]) : []),
    [keysData]
  );

  const activeProjectKeyByProvider = useMemo(() => {
    const map = new Map<ReplayProvider, ProjectUserApiKeyItem>();
    for (const item of keys) {
      const provider = normalizeProvider(item.provider);
      if (!provider || !item.is_active || item.agent_id) continue;
      if (!map.has(provider)) map.set(provider, item);
    }
    return map;
  }, [keys]);
  const activeNodeKeyByProvider = useMemo(() => {
    const map = new Map<ReplayProvider, ProjectUserApiKeyItem>();
    const currentAgentId = (agentId || "").trim();
    if (!currentAgentId) return map;
    for (const item of keys) {
      const provider = normalizeProvider(item.provider);
      if (!provider || !item.is_active) continue;
      if ((item.agent_id || "").trim() !== currentAgentId) continue;
      if (!map.has(provider)) map.set(provider, item);
    }
    return map;
  }, [keys, agentId]);
  const targetProvider = latestProvider ?? providerDraft;
  const targetKey =
    activeNodeKeyByProvider.get(targetProvider) ?? activeProjectKeyByProvider.get(targetProvider);
  const targetHasKey = Boolean(targetKey);
  const targetKeyScope = activeNodeKeyByProvider.has(targetProvider)
    ? "Node override"
    : targetHasKey
      ? "Project default"
      : null;
  const showMissingKeyWarning = Boolean(latestProvider) && !targetHasKey;

  useEffect(() => {
    const displayName = (settingsData as { display_name?: string | null } | undefined)
      ?.display_name;
    setDisplayNameDraft(displayName?.trim() || agentId);
  }, [settingsData, agentId]);

  useEffect(() => {
    if (latestProvider) setProviderDraft(latestProvider);
  }, [latestProvider]);
  useEffect(() => {
    setApiKeyDraft("");
  }, [agentId]);

  const saveDisplayName = async () => {
    if (!projectId || !agentId) return;
    const nextName = displayNameDraft.trim();
    if (!nextName) {
      toast.showToast("Display name cannot be empty.", "error");
      return;
    }
    setIsSavingName(true);
    try {
      await liveViewAPI.updateAgentSettings(projectId, agentId, { display_name: nextName });
      await mutateSettings();
      onAgentUpdated?.();
      toast.showToast("Node name updated.", "success");
    } catch (err: unknown) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Renaming nodes",
        error: err,
      });
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(
        permissionToast?.message ?? (typeof msg === "string" ? msg : "Failed to update node name."),
        permissionToast?.tone ?? "error"
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const deleteNode = async () => {
    if (!projectId || !agentId) return;
    setIsDeletingNode(true);
    try {
      await liveViewAPI.deleteAgent(projectId, agentId);
      onAgentUpdated?.();
      onAgentDeleted?.();
      toast.showToast("Node removed from Live View.", "success");
    } catch (err: unknown) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Removing nodes from Live View",
        error: err,
      });
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(
        permissionToast?.message ?? (typeof msg === "string" ? msg : "Failed to remove node."),
        permissionToast?.tone ?? "error"
      );
    } finally {
      setIsDeletingNode(false);
      setConfirmDeleteNode(false);
    }
  };

  const saveProviderKey = async () => {
    if (!projectId || !apiKeyDraft.trim()) return;
    setIsSavingKey(true);
    try {
      await projectUserApiKeysAPI.create(projectId, {
        provider: targetProvider,
        api_key: apiKeyDraft.trim(),
        agent_id: agentId.trim() || undefined,
      });
      setApiKeyDraft("");
      await mutateKeys(undefined, true);
      toast.showToast(`${PROVIDER_LABEL[targetProvider]} key saved. Check the identifier below.`, "success");
      onAgentUpdated?.();
    } catch (err: unknown) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Saving project API keys",
        error: err,
      });
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(
        permissionToast?.message ?? (typeof msg === "string" ? msg : "Failed to save API key."),
        permissionToast?.tone ?? "error"
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const deleteProviderKey = async (item: ProjectUserApiKeyItem) => {
    if (!item || !projectId) return;
    const provider = normalizeProvider(item.provider);
    if (!provider) return;
    setDeletingKeyProvider(provider);
    try {
      await projectUserApiKeysAPI.delete(projectId, item.id);
      await mutateKeys(undefined, true);
      toast.showToast(`${PROVIDER_LABEL[provider]} key removed.`, "success");
      onAgentUpdated?.();
    } catch (err: unknown) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Removing project API keys",
        error: err,
      });
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(
        permissionToast?.message ?? (typeof msg === "string" ? msg : "Failed to remove API key."),
        permissionToast?.tone ?? "error"
      );
    } finally {
      setDeletingKeyProvider(null);
    }
  };

  return (
    <div className="h-0 flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
            Agent Settings
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Change agent name or remove this agent from Live View.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wide text-slate-500">Display name</label>
          <div className="flex items-center gap-2">
            <input
              value={displayNameDraft}
              onChange={e => setDisplayNameDraft(e.target.value)}
              placeholder="Agent display name"
              className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none"
            />
            <button
              type="button"
              onClick={saveDisplayName}
              disabled={isSavingName || settingsLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>
        {!confirmDeleteNode ? (
          <button
            type="button"
            onClick={() => setConfirmDeleteNode(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove agent
          </button>
        ) : (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-2">
            <p className="text-xs text-rose-200">Remove this agent from Live View?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={deleteNode}
                disabled={isDeletingNode}
                className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-50"
              >
                {isDeletingNode ? "Removing..." : "Confirm remove"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteNode(false)}
                disabled={isDeletingNode}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-emerald-200">
            Lifecycle Policy
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Removing a node hides it from Live View immediately. Matching traffic can auto-restore
            the same node during the configured restore window, and scheduled cleanup may permanently
            purge old soft-deleted node settings after the grace period.
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Check the repository docs for the current default values and operator guidance.
          <Link href="/docs" className="ml-1 text-emerald-300 hover:text-emerald-200">
            Open docs
          </Link>
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <KeyRound className="w-4 h-4 mt-0.5 text-fuchsia-300" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
                Provider API Keys
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Node key overrides project default. If no node key exists, project default key is
                used.
              </p>
            </div>
          </div>
          {latestProvider && (
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span
                className={
                  targetHasKey
                    ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-200"
                    : "rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm font-semibold text-rose-200"
                }
              >
                {targetHasKey ? "Registered" : "Not registered"}
              </span>
              {targetHasKey && targetKey?.key_hint && (
                <span className="text-[11px] font-mono text-slate-400" title="Key identifier (masked)">
                  {targetKey.key_hint}
                </span>
              )}
              {targetHasKey && !targetKey?.key_hint && (
                <span className="text-[10px] text-slate-500" title="Key was saved before identifier was added">
                  Re-save key to show identifier
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Node provider:{" "}
            <span className="font-semibold">
              {latestProvider ? PROVIDER_LABEL[latestProvider] : "Not detected yet"}
            </span>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Node model:{" "}
            <span className="font-semibold break-all">{latestModel || "Not detected yet"}</span>
          </div>
        </div>

        {latestProvider ? (
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Target provider for node key registration:{" "}
            <span className="font-semibold">{PROVIDER_LABEL[latestProvider]}</span>
            {targetKeyScope && <span className="ml-2 text-slate-400">({targetKeyScope})</span>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2">
            <select
              value={providerDraft}
              onChange={e => setProviderDraft(e.target.value as ReplayProvider)}
              className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500/50 outline-none"
            >
              {PROVIDERS.map(provider => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={e => setApiKeyDraft(e.target.value)}
              placeholder=""
              autoComplete="new-password"
              name={`provider-api-key-${agentId}`}
              className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none autofill:bg-black/40 autofill:text-slate-200"
            />
          </div>
        )}
        {latestProvider && (
          <input
            type="password"
            value={apiKeyDraft}
            onChange={e => setApiKeyDraft(e.target.value)}
            placeholder=""
            autoComplete="new-password"
            name={`provider-api-key-${agentId}`}
            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none autofill:bg-black/40 autofill:text-slate-200"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveProviderKey}
            disabled={isSavingKey || !apiKeyDraft.trim()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSavingKey ? "Saving..." : "Save key"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (targetKey) void deleteProviderKey(targetKey);
            }}
            disabled={!targetHasKey || deletingKeyProvider === targetProvider}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingKeyProvider === targetProvider
              ? "Removing..."
              : "Remove selected provider key"}
          </button>
        </div>
        {(settingsLoading || keysLoading) && (
          <p className="text-xs text-slate-500">Loading settings...</p>
        )}
        {showMissingKeyWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Release Gate run is blocked before execution because the required provider key is not
              registered.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
