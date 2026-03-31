"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { settingsAPI } from "@/lib/api";
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

export default function ProfileSettingsPage() {
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
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreatedApiKey | null>(null);
  const hasToken = useRequireAuth();

  useEffect(() => {
    if (!hasToken) return;

    const load = async () => {
      try {
        const [p, keys] = await Promise.all([settingsAPI.getProfile(), settingsAPI.getAPIKeys()]);
        setProfile(p);
        setFullName((p?.full_name || "").trim());
        setApiKeys(Array.isArray(keys) ? keys : []);
      } catch (err) {
        logger.error("Failed to load profile or API keys", err);
        setNotice("Failed to load profile settings.");
      } finally {
        setLoading(false);
      }
    };

    void load();
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

  const handleSaveProfile = async () => {
    if (!canSaveName) return;
    setSaveBusy(true);
    setNotice("");
    try {
      const updated = await settingsAPI.updateProfile({ full_name: fullName.trim() || undefined });
      setProfile(updated);
      setFullName((updated?.full_name || "").trim());
      setNotice("Profile updated.");
    } catch (err) {
      logger.error("Failed to update profile", err);
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
      setNotice("API key created. Copy it now - it will not be shown again.");
    } catch (err) {
      logger.error("Failed to create API key", err);
      setNotice("Failed to create API key.");
    } finally {
      setKeyBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
      setNotice("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 12) {
      setNotice("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
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
      setNotice("Password changed successfully.");
    } catch (err) {
      logger.error("Failed to change password", err);
      setNotice("Failed to change password. Check your current password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail.trim() || !emailPassword.trim()) {
      setNotice("Enter your new email and current password.");
      return;
    }
    setEmailBusy(true);
    setNotice("");
    try {
      await settingsAPI.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailPassword("");
      setNewEmail("");
      setNotice("Confirmation email sent. Open the link in that inbox to finish the change.");
    } catch (err) {
      logger.error("Failed to request email change", err);
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
      setNotice("API key removed.");
    } catch (err) {
      logger.error("Failed to delete API key", err);
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
      setNotice("API key name updated.");
    } catch (err) {
      logger.error("Failed to rename API key", err);
      setNotice("Failed to rename API key.");
    } finally {
      setRenameBusyId(null);
    }
  };

  const handleCopy = async () => {
    if (!newlyCreatedKey?.api_key) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedKey.api_key);
      setNotice("Copied API key to clipboard.");
    } catch {
      setNotice("Could not copy automatically. Please copy manually.");
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
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            {notice}
          </div>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
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
      </div>
    </AccountLayout>
  );
}
