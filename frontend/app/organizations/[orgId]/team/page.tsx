"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { organizationsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Users, Mail, Trash2, UserPlus, Shield, Activity, Fingerprint, Lock } from "lucide-react";

interface Member {
  id: number;
  user_id: number;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
}

export default function TeamPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<number | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

  const { data: org, isValidating: isOrgValidating } = useSWR(
    orgId ? ["organization", orgId] : null,
    () => organizationsAPI.get(orgId, { includeStats: false })
  );

  const {
    data: members,
    mutate: refetchMembers,
    isValidating: isMembersValidating,
  } = useSWR<Member[]>(orgId ? ["organization-members", orgId] : null, () =>
    organizationsAPI.listMembers(orgId)
  );

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.showToast("Please enter a valid operator signal (email).", "warning");
      return;
    }

    setInviting(true);
    try {
      await organizationsAPI.inviteMember(orgId, { email: inviteEmail, role: inviteRole });
      toast.showToast("Access invitation dispatched successfully.", "success");
      setInviteEmail("");
      refetchMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || "Failed to dispatch invitation.", "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    setConfirmRemoveMemberId(memberId);
  };

  const executeRemoveMember = async () => {
    if (confirmRemoveMemberId == null) return;
    setRemovingMemberId(confirmRemoveMemberId);
    try {
      await organizationsAPI.removeMember(orgId, confirmRemoveMemberId);
      toast.showToast("Operator clearance revoked.", "success");
      setConfirmRemoveMemberId(null);
      refetchMembers();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(msg || "Failed to revoke clearance.", "error");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
              Director
            </span>
          </div>
        );
      case "admin":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30">
            <Shield className="w-3 h-3 text-indigo-400" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
              Admin
            </span>
          </div>
        );
      case "member":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/30">
            <Fingerprint className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Operator
            </span>
          </div>
        );
      case "viewer":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
            <Activity className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
              Observer
            </span>
          </div>
        );
      default:
        return (
          <div className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {role}
            </span>
          </div>
        );
    }
  };

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "Settings", href: `/organizations/${orgId}/settings` },
        { label: "Team & Access" },
      ]}
    >
      <div className="max-w-5xl mx-auto pb-24 relative">
        {/* Background glow effects */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)] animate-pulse" />
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
              Access Control
            </p>
          </div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">
            Team & Access
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm max-w-2xl leading-relaxed">
            Manage organization members, assign security clearance levels, and oversee operational
            access to team resources.
          </p>
        </div>

        {/* Invite Form */}
        <div className="rounded-[32px] border border-white/10 bg-white/[0.02] backdrop-blur-xl p-8 mb-12 relative overflow-hidden group">
          <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <UserPlus className="w-4 h-4" />
              </div>
              Authorize New Clearance
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Operator Signal (Email)
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="Enter email address..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 h-14 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all duration-300"
                  />
                </div>
              </div>

              <div className="w-full sm:w-48 relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Clearance Level
                </label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 h-14 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all duration-300 appearance-none cursor-pointer"
                >
                  <option value="member">Operator (Member)</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Observer (Viewer)</option>
                </select>
                <div className="absolute right-4 top-[38px] pointer-events-none text-slate-500">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <button
                onClick={handleInvite}
                disabled={inviting}
                className={`h-14 px-8 rounded-2xl flex items-center justify-center text-xs font-black uppercase tracking-widest transition-all duration-300 w-full sm:w-auto mt-4 sm:mt-0
                  ${
                    inviting
                      ? "bg-emerald-500/50 text-emerald-200 cursor-wait"
                      : "bg-emerald-500 text-black shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
                  }`}
              >
                {inviting ? "Dispatching..." : "Dispatch Invite"}
              </button>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <Users className="w-5 h-5 text-emerald-400" />
              Active Roster
            </h2>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {isMembersValidating ? "Scanning..." : `${members?.length || 0} Operators`}
              </span>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

            <div className="relative z-10 divide-y divide-white/5">
              {members?.map((member, i) => (
                <div
                  key={member.id}
                  className="p-6 flex items-center justify-between hover:bg-white/[0.04] transition-colors group"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      {/* Avatar Glow */}
                      <div
                        className={`absolute inset-0 rounded-xl blur-md opacity-0 group-hover:opacity-50 transition-opacity duration-500
                        ${member.role === "owner" ? "bg-emerald-500" : member.role === "admin" ? "bg-indigo-500" : "bg-slate-500"}
                      `}
                      />

                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center text-lg font-black relative z-10 border
                        ${
                          member.role === "owner"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : member.role === "admin"
                              ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                              : member.role === "viewer"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-white/5 text-slate-300 border-white/10"
                        }
                      `}
                      >
                        {member.full_name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-white font-black tracking-tight text-lg">
                          {member.full_name || "Unidentified Operator"}
                        </div>
                        {member.role === "owner" && (
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]"
                            title="Director Online"
                          />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                        <span>{member.email}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span className="opacity-60">ID: {String(member.id).padStart(4, "0")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {getRoleBadge(member.role)}

                    {member.role !== "owner" ? (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-300 opacity-50 group-hover:opacity-100"
                        title="Revoke Clearance"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="w-10 h-10" /> // Placeholder to maintain alignment
                    )}
                  </div>
                </div>
              ))}

              {(!members || members.length === 0) && !isMembersValidating && (
                <div className="p-16 text-center">
                  <Fingerprint className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-50" />
                  <h3 className="text-white font-black uppercase tracking-widest mb-2">
                    No Active Operators
                  </h3>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
                    Dispatch an invitation to construct your roster.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmRemoveMemberId != null}
        onClose={() => !removingMemberId && setConfirmRemoveMemberId(null)}
        onConfirm={executeRemoveMember}
        title="Revoke operator access"
        description="Are you sure you want to revoke this member's access? They will no longer be able to access organization resources."
        confirmLabel="Revoke access"
        cancelLabel="Cancel"
        variant="danger"
        loading={removingMemberId != null}
      />
    </OrgLayout>
  );
}
