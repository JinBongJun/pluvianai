"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { authAPI, settingsAPI } from "@/lib/api";
import { clearFrontendAuthSession } from "@/lib/api/client";
import { Key, Trash2, Copy, UserCircle2, Pencil, Check, X } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import AccountLayout from "@/components/layout/AccountLayout";
import { logger } from "@/lib/logger";

type UserProfile = {
  id: number;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  primary_auth_provider: string;
  password_login_enabled: boolean;
  google_login_enabled: boolean;
  has_recent_google_delete_reauth?: boolean;
  created_at: string;
};

type UserApiKey = {
  id: number;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
  key_prefix?: string | null;
};

type CreatedApiKey = {
  id: number;
  name?: string | null;
  api_key: string;
  message?: string;
};

type NoticeTone = "success" | "error" | "warning";

type AccountUsage = {
  plan_type?: string;
  subscription_status?: string;
  current_period_end?: string | null;
};

export default function ProfileSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [fullName, setFullName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [renameBusyId, setRenameBusyId] = useState<number | null>(null);
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
  const [editingKeyName, setEditingKeyName] = useState("");
  const [notice, setNotice] = useState<string>("");
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("success");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreatedApiKey | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const hasToken = useRequireAuth();

  useEffect(() => {
    if (!hasToken) return;

    const load = async () => {
      try {
        const [p, keys, usage] = await Promise.all([
          settingsAPI.getProfile(),
          settingsAPI.getAPIKeys(),
          authAPI.getMyUsage().catch(() => null),
        ]);
        setProfile(p);
        setFullName((p?.full_name || "").trim());
        setApiKeys(Array.isArray(keys) ? keys : []);
        setAccountUsage(usage);
      } catch (err) {
        logger.error("Failed to load profile or API keys", err);
        setNoticeTone("error");
        setNotice("Failed to load profile settings.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [hasToken]);

  useEffect(() => {
    if (!hasToken) return;

    const refreshUsage = async () => {
      try {
        const usage = await authAPI.getMyUsage();
        setAccountUsage(usage);
      } catch {
        // Keep the last known state; backend still blocks unsafe deletions.
      }
    };

    const onFocus = () => {
      void refreshUsage();
    };

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [hasToken]);

  const canSaveName = useMemo(() => {
    const current = (profile?.full_name || "").trim();
    return fullName.trim() !== current;
  }, [fullName, profile?.full_name]);

  const canChangePassword = !!profile?.password_login_enabled;
  const canChangeEmail = !!profile?.password_login_enabled && !profile?.google_login_enabled;
  const signInMethodLabel = useMemo(() => {
    if (profile?.password_login_enabled && profile?.google_login_enabled) return "Email/password + Google";
    if (profile?.google_login_enabled) return "Google";
    return "Email/password";
  }, [profile?.google_login_enabled, profile?.password_login_enabled]);

  const hasBlockingSubscription = useMemo(() => {
    const planType = String(accountUsage?.plan_type || "free").toLowerCase();
    const subscriptionStatus = String(accountUsage?.subscription_status || "free").toLowerCase();
    if (planType === "free") return false;
    if (subscriptionStatus === "cancelled" || subscriptionStatus === "canceled" || subscriptionStatus === "free") {
      return false;
    }
    return true;
  }, [accountUsage?.plan_type, accountUsage?.subscription_status]);

  const subscriptionDeletionNotice = useMemo(() => {
    if (!hasBlockingSubscription) return null;
    const periodEnd = accountUsage?.current_period_end;
    if (!periodEnd) {
      return "Active subscription found. Account deletion becomes available after the current billing period ends.";
    }

    const parsed = new Date(periodEnd);
    if (Number.isNaN(parsed.getTime())) {
      return "Active subscription found. Account deletion becomes available after the current billing period ends.";
    }

    return `Active subscription found. Your plan remains active until ${parsed.toLocaleString()}. Account deletion becomes available after that date.`;
  }, [accountUsage?.current_period_end, hasBlockingSubscription]);

  const deleteRequiresPassword = !!profile?.password_login_enabled;
  const hasRecentGoogleDeleteReauth = !!profile?.has_recent_google_delete_reauth;

  const canSubmitDeleteAccount =
    !deleteAccountBusy &&
    !hasBlockingSubscription &&
    deleteConfirmation.trim().toUpperCase() === "DELETE" &&
    (deleteRequiresPassword
      ? deletePassword.trim().length > 0
      : hasRecentGoogleDeleteReauth);

  useEffect(() => {
    const oauthError = searchParams?.get("oauth_error_message");
    if (!oauthError) return;
    setNoticeTone("warning");
    setNotice(oauthError);
  }, [searchParams]);

  const handleSaveProfile = async () => {
    if (!canSaveName) return;
    setSaveBusy(true);
    setNotice("");
    try {
      const updated = await settingsAPI.updateProfile({ full_name: fullName.trim() || undefined });
      setProfile(updated);
      setFullName((updated?.full_name || "").trim());
      setNoticeTone("success");
      setNotice("Profile updated.");
    } catch (err) {
      logger.error("Failed to update profile", err);
      setNoticeTone("error");
      setNotice("Failed to update profile.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleCreateApiKey = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setKeyBusy(true);
    setNotice("");
    try {
      const created = await settingsAPI.createAPIKey(name);
      const payload = (created?.data || created) as CreatedApiKey;
      setNewlyCreatedKey(payload);
      setNewKeyName("");
      const keys = await settingsAPI.getAPIKeys();
      setApiKeys(Array.isArray(keys) ? keys : []);
      setNoticeTone("success");
      setNotice("API key created. Copy it now - it will not be shown again.");
    } catch (err) {
      logger.error("Failed to create API key", err);
      setNoticeTone("error");
      setNotice("Failed to create API key.");
    } finally {
      setKeyBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
      setNoticeTone("error");
      setNotice("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 12) {
      setNoticeTone("error");
      setNotice("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setNoticeTone("error");
      setNotice("New password confirmation does not match.");
      return;
    }

    setPasswordBusy(true);
    setNotice("");
    try {
      await settingsAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNoticeTone("success");
      setNotice("Password changed. Existing signed-in sessions stay active until they sign out.");
    } catch (err) {
      logger.error("Failed to change password", err);
      setNoticeTone("error");
      setNotice("Failed to change password. Check your current password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail.trim() || !emailPassword.trim()) {
      setNoticeTone("error");
      setNotice("Enter your new email and current password.");
      return;
    }
    setEmailBusy(true);
    setNotice("");
    try {
      await settingsAPI.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailPassword("");
      setNewEmail("");
      setNoticeTone("success");
      setNotice("Confirmation email sent. Open the link in that inbox to finish the change.");
    } catch (err) {
      logger.error("Failed to request email change", err);
      setNoticeTone("error");
      setNotice("Failed to send email change confirmation. Check your password and try again.");
    } finally {
      setEmailBusy(false);
    }
  };

  const handleDeleteApiKey = async (keyId: number) => {
    setDeleteBusyId(keyId);
    setNotice("");
    try {
      await settingsAPI.deleteAPIKey(keyId);
      setApiKeys(prev => prev.filter(k => k.id !== keyId));
      setNoticeTone("success");
      setNotice("API key removed.");
    } catch (err) {
      logger.error("Failed to delete API key", err);
      setNoticeTone("error");
      setNotice("Failed to remove API key.");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const startRename = (key: UserApiKey) => {
    setEditingKeyId(key.id);
    setEditingKeyName((key.name || "").trim());
  };

  const cancelRename = () => {
    setEditingKeyId(null);
    setEditingKeyName("");
  };

  const handleRenameApiKey = async (keyId: number) => {
    const nextName = editingKeyName.trim();
    if (!nextName) {
      setNoticeTone("error");
      setNotice("API key name cannot be empty.");
      return;
    }

    setRenameBusyId(keyId);
    setNotice("");
    try {
      await settingsAPI.updateAPIKey(keyId, nextName);
      setApiKeys(prev => prev.map(k => (k.id === keyId ? { ...k, name: nextName } : k)));
      setEditingKeyId(null);
      setEditingKeyName("");
      setNoticeTone("success");
      setNotice("API key name updated.");
    } catch (err) {
      logger.error("Failed to rename API key", err);
      setNoticeTone("error");
      setNotice("Failed to rename API key.");
    } finally {
      setRenameBusyId(null);
    }
  };

  const handleCopy = async () => {
    if (!newlyCreatedKey?.api_key) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedKey.api_key);
      setNoticeTone("success");
      setNotice("Copied API key to clipboard.");
    } catch {
      setNoticeTone("warning");
      setNotice("Could not copy automatically. Please copy manually.");
    }
  };

  const handleDeleteAccount = async () => {
    if (hasBlockingSubscription) {
      setNoticeTone("warning");
      setNotice(subscriptionDeletionNotice || "Active subscription found. Account deletion becomes available after the current billing period ends.");
      return;
    }
    if (deleteRequiresPassword && !deletePassword.trim()) {
      setNoticeTone("error");
      setNotice("Enter your password to delete this account.");
      return;
    }
    if (!deleteRequiresPassword && !hasRecentGoogleDeleteReauth) {
      setNoticeTone("warning");
      setNotice("Confirm this deletion with Google first, then try again.");
      return;
    }
    if (deleteConfirmation.trim().toUpperCase() !== "DELETE") {
      setNoticeTone("error");
      setNotice("Type DELETE to confirm account deletion.");
      return;
    }

    setDeleteAccountBusy(true);
    setNotice("");
    try {
      await settingsAPI.deleteAccount(deletePassword, deleteConfirmation);
      await authAPI.logout().catch(() => undefined);
      await clearFrontendAuthSession().catch(() => undefined);
      router.replace("/");
    } catch (err: any) {
      logger.error("Failed to delete account", err);
      const code =
        err?.response?.data?.detail?.code ??
        err?.response?.data?.error?.code ??
        err?.response?.data?.error?.details?.code;
      const message =
        err?.response?.data?.detail?.message ??
        err?.response?.data?.error?.message ??
        err?.response?.data?.detail ??
        "Failed to delete account.";

      if (code === "ACTIVE_SUBSCRIPTION") {
        setNoticeTone("warning");
        setNotice(subscriptionDeletionNotice || "Active subscription found. Account deletion becomes available after the current billing period ends.");
      } else if (code === "LAST_OWNER_OF_SHARED_ORG") {
        setNoticeTone("warning");
        setNotice("Transfer ownership of your shared organization before deleting your account.");
      } else if (code === "GOOGLE_REAUTH_REQUIRED") {
        setNoticeTone("warning");
        setNotice("Confirm this deletion with Google again, then retry within 10 minutes.");
      } else if (code === "PASSWORD_CONFIRMATION_FAILED") {
        setNoticeTone("error");
        setNotice("Incorrect password. Please try again.");
      } else if (code === "DELETE_CONFIRMATION_MISMATCH") {
        setNoticeTone("error");
        setNotice("Type DELETE to confirm account deletion.");
      } else if (typeof message === "string" && message.trim()) {
        setNoticeTone("error");
        setNotice(message);
      } else {
        setNoticeTone("error");
        setNotice("Failed to delete account.");
      }
    } finally {
      setDeleteAccountBusy(false);
    }
  };

  if (loading) {
    return (
      <AccountLayout activeTab="profile" breadcrumb={[{ label: "Account" }, { label: "Profile" }]}>
        <div className="min-h-[50vh] flex items-center justify-center text-slate-300 text-sm">
          Loading profile settings...
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout
      activeTab="profile"
      breadcrumb={[
        { label: "Account" },
        { label: "Profile" },
      ]}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <UserCircle2 className="w-8 h-8 text-emerald-400" />
            Profile & API Keys
          </h1>
        </div>

        {notice ? (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              noticeTone === "error"
                ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                : noticeTone === "warning"
                  ? "border border-amber-500/30 bg-amber-500/10 text-amber-100"
                  : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {notice}
          </div>
        ) : null}

        <section
          id="service-api-keys"
          className="scroll-mt-24 rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-white">Profile</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-200">
                {profile?.email || "-"}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {profile?.is_email_verified ? "Verified" : "Verification pending"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Sign-in method: {signInMethodLabel}</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="Your name"
              />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={!canSaveName || saveBusy}>
            {saveBusy ? "Saving..." : "Save profile"}
          </Button>
          {canChangeEmail ? (
            <>
              <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">New email</label>
                  <input
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="new-email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Current password</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={e => setEmailPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="Current password"
                  />
                </div>
              </div>
              <Button onClick={handleRequestEmailChange} disabled={emailBusy}>
                {emailBusy ? "Sending..." : "Change email"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              {profile?.google_login_enabled
                ? "Your email is managed through your Google sign-in and can't be changed here."
                : "Email changes are unavailable for this account."}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Security</h2>
          <p className="text-sm text-slate-400">
            {canChangePassword
              ? "Update your account password. For security, use at least 12 characters."
              : "Password sign-in is not enabled for this account yet."}
          </p>
          {canChangePassword ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Changing your password does not automatically sign out other devices. Existing signed-in
              sessions stay active until they sign out.
            </div>
          ) : null}
          {canChangePassword ? <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="Current password"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="At least 12 characters"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="Re-enter new password"
              />
            </div>
          </div> : null}
          <Button onClick={handleChangePassword} disabled={passwordBusy || !canChangePassword}>
            {passwordBusy ? "Changing..." : canChangePassword ? "Change password" : "Password unavailable"}
          </Button>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            Service API Keys
          </h2>
          <p className="text-sm text-slate-400">
            Create keys for SDK/API access. Full key values are shown only once at creation.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. Local SDK key)"
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <Button onClick={handleCreateApiKey} disabled={keyBusy || !newKeyName.trim()}>
              {keyBusy ? "Creating..." : "Create API key"}
            </Button>
          </div>

          {newlyCreatedKey?.api_key ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <p className="text-xs uppercase tracking-widest font-bold text-amber-300">
                Save This Key Now (Shown Once)
              </p>
              <div className="font-mono text-sm break-all text-amber-100">
                {newlyCreatedKey.api_key}
              </div>
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" />
                Copy key
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            {apiKeys.length === 0 ? (
              <p className="text-sm text-slate-500">No API keys yet.</p>
            ) : (
              apiKeys.map(key => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    {editingKeyId === key.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingKeyName}
                          onChange={e => setEditingKeyName(e.target.value)}
                          placeholder="API key name"
                          className="w-56 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameApiKey(key.id)}
                          disabled={renameBusyId === key.id}
                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          title="Save name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={renameBusyId === key.id}
                          className="text-slate-400 hover:text-white disabled:opacity-50"
                          title="Cancel rename"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-white font-medium">{key.name || `Key #${key.id}`}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      {key.key_prefix || "ag_live_****"} · created{" "}
                      {key.created_at ? new Date(key.created_at).toLocaleString() : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => startRename(key)}
                      disabled={editingKeyId === key.id || renameBusyId === key.id}
                      className="text-slate-300 hover:text-white"
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleDeleteApiKey(key.id)}
                      disabled={deleteBusyId === key.id}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {deleteBusyId === key.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Danger Zone</h2>
          <p className="text-sm text-slate-300">
            Deleting your account signs you out, revokes your API keys, and removes access to your
            personal workspace. If you have an active subscription, cancel it in Billing first.
          </p>
          <p className="text-xs text-slate-500">
            Shared organizations require ownership transfer before deletion.
          </p>
          {hasBlockingSubscription ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {subscriptionDeletionNotice}
            </div>
          ) : null}
          {!deleteRequiresPassword ? (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {hasRecentGoogleDeleteReauth
                ? "Google deletion check complete. You can delete this account for the next 10 minutes."
                : "Google sign-in account detected. Confirm with Google first, then return here to finish deletion."}
            </div>
          ) : null}
          <div className="grid md:grid-cols-2 gap-4">
            {deleteRequiresPassword ? (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Current password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                  placeholder="Current password"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-400">
                Password confirmation is not required for this Google sign-in account.
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type DELETE to confirm</label>
              <input
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="DELETE"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={handleDeleteAccount} disabled={!canSubmitDeleteAccount}>
              {deleteAccountBusy ? "Deleting..." : "Delete account"}
            </Button>
            {!deleteRequiresPassword && !hasRecentGoogleDeleteReauth ? (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = authAPI.getGoogleOAuthStartUrl("reauth_delete", {
                    next: "/settings/profile",
                  });
                }}
              >
                Verify with Google
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => router.push("/settings/billing")}>
              Open billing
            </Button>
          </div>
        </section>
      </div>
    </AccountLayout>
  );
}
