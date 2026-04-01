"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { useSWRConfig } from "swr";
import { organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { inviteOrganizationMember, removeOrganizationMember } from "@/lib/orgProjectMutations";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { useToast } from "@/components/ToastContainer";
import { Users, Mail, Trash2, UserPlus } from "lucide-react";
import { ProjectRoleBadge } from "@/components/project-access/AccessBadges";
import { ProjectAccessPolicyPanel } from "@/components/project-access/ProjectAccessPolicyPanel";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/projectAccess";

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
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { orgId } = useOrgProjectParams();
  const isAuthenticated = useRequireAuth();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [planError, setPlanError] = useState<PlanLimitError | null>(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<number | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

  const { data: org, isValidating: isOrgValidating } = useSWR(
    orgId ? orgKeys.detail(orgId) : null,
    async () => {
      try {
        return await organizationsAPI.get(orgId, { includeStats: false });
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) {
          toast.showToast("This organization has been archived or deleted.", "info");
          router.replace("/organizations");
          return null;
        }
        throw error;
      }
    }
  );

  const {
    data: members,
    mutate: refetchMembers,
    isValidating: isMembersValidating,
  } = useSWR<Member[]>(orgId ? orgKeys.members(orgId) : null, () =>
    organizationsAPI.listMembers(orgId)
  );

  useEffect(() => {
    if (!isAuthenticated) return;
  }, [isAuthenticated]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.showToast("Please enter a valid operator signal (email).", "warning");
      return;
    }

    setInviting(true);
    setPlanError(null);
    try {
      await inviteOrganizationMember(
        orgId,
        { email: inviteEmail, role: inviteRole },
        { mutate }
      );
      toast.showToast("Access invitation dispatched successfully.", "success");
      setInviteEmail("");
    } catch (error: any) {
      const parsed = parsePlanLimitError(error);
      if (parsed && parsed.code === "TEAM_MEMBER_LIMIT_REACHED") {
        setPlanError(parsed);
      } else {
        toast.showToast(error.response?.data?.detail || "Failed to dispatch invitation.", "error");
      }
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
      await removeOrganizationMember(orgId, confirmRemoveMemberId, { mutate });
      toast.showToast("Member access removed.", "success");
      setConfirmRemoveMemberId(null);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.showToast(msg || "Failed to remove member access.", "error");
    } finally {
      setRemovingMemberId(null);
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
            Manage workspace members, assign roles, and keep shared-project access consistent across
            the product.
          </p>
        </div>

        {planError && (
          <div className="mb-8">
            <PlanLimitBanner {...planError} context="team" />
          </div>
        )}

        <div className="mb-8">
          <ProjectAccessPolicyPanel accountBillingHref="/settings/billing" />
        </div>

        <div className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="mb-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.22em]">
            Role Access Guide
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(ROLE_LABELS) as Member["role"][]).map(role => (
              <div key={role} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <ProjectRoleBadge role={role} />
                </div>
                <p className="text-[11px] font-semibold text-slate-400 leading-relaxed">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Form */}
        <div className="rounded-[32px] border border-white/10 bg-white/[0.02] backdrop-blur-xl p-8 mb-12 relative overflow-hidden group">
          <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <UserPlus className="w-4 h-4" />
              </div>
              Invite Member
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Email
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
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 h-14 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all duration-300 appearance-none cursor-pointer"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
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
                <p className="mt-2 ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  Tip: Use Viewer for read-only monitoring and review.
                </p>
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
                {inviting ? "Inviting..." : "Send Invite"}
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Organization membership can make projects visible in the project list. Project roles
              still control whether a member can actually use Live View, Release Gate, and other
              project actions.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Shared projects currently follow each member&apos;s account plan limits. Members can
              review their active limits in{" "}
              <Link href="/settings/billing" className="text-emerald-300 hover:text-emerald-200">
                Billing
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Members List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
              <Users className="w-5 h-5 text-emerald-400" />
              Members
            </h2>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {isMembersValidating ? "Refreshing..." : `${members?.length || 0} Members`}
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
                          {member.full_name || "Unnamed Member"}
                        </div>
                        {member.role === "owner" && (
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]"
                            title="Workspace owner"
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
                    <ProjectRoleBadge role={member.role} />

                    {member.role !== "owner" ? (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-300 opacity-50 group-hover:opacity-100"
                        title="Remove member"
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
                  <Users className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-50" />
                  <h3 className="text-white font-black uppercase tracking-widest mb-2">
                    No Members Yet
                  </h3>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
                    Send an invite to start collaborating in this workspace.
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
        title="Remove member access"
        description="Are you sure you want to remove this member? They will lose workspace access, and any shared projects may remain visible only until project-level access is removed."
        confirmLabel="Remove member"
        cancelLabel="Cancel"
        variant="danger"
        loading={removingMemberId != null}
      />
    </OrgLayout>
  );
}
