"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { renameOrganization, deleteOrganization } from "@/lib/orgProjectMutations";
import { useToast } from "@/components/ToastContainer";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import {
  Settings,
  Trash2,
  AlertTriangle,
  Save,
  Fingerprint,
  Users,
  Shield,
  Scale,
  FileText,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { H1, Text } from "@/components/ui/Typography";

export default function OrgSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { orgId } = useOrgProjectParams();
  const { mutate } = useSWRConfig();

  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: org, mutate: refetchOrg } = useSWR(
    orgId ? orgKeys.detail(orgId) : null,
    async () => {
      try {
        const data = await organizationsAPI.get(orgId, { includeStats: false });
        setOrgName(data.name || "");
        return data;
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

  const handleSave = async () => {
    if (!orgName.trim()) {
      toast.showToast("Environment designation cannot be empty.", "warning");
      return;
    }

    setSaving(true);
    try {
      await renameOrganization(orgId, { name: orgName }, { mutate });
      toast.showToast("Environment configuration updated successfully.", "success");
      refetchOrg();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || "Failed to update configuration.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== org?.name) {
      toast.showToast("Authorization phrase mismatch. Revocation aborted.", "warning");
      return;
    }

    try {
      await deleteOrganization(orgId, {
        mutate,
        router,
        toast: { showToast: toast.showToast },
      });
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || "Failed to decommission environment.",
        "error"
      );
    }
  };

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "Settings" },
      ]}
    >
      <div className="max-w-4xl mx-auto pb-24 space-y-8">
        <div className="mb-8">
          <H1 className="mb-2">Organization Settings</H1>
          <Text>
            Configure core laboratory parameters, manage directory identity, and oversee critical
            infrastructure risks.
          </Text>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-500" />
              Core Configuration
            </CardTitle>
            <CardDescription>
              Update your organization name and view its identifier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 max-w-2xl">
              <Label>Organization name</Label>
              <Input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Enter organization name"
              />
            </div>

            <div className="space-y-2 max-w-2xl">
              <Label className="flex items-center gap-2">
                <Fingerprint className="w-3 h-3" />
                System Identifier (UUID)
              </Label>
              <Input type="text" value={orgId} disabled className="font-mono text-slate-500" />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || orgName === org?.name}
              isLoading={saving}
              variant="primary"
            >
              <Save className="w-4 h-4 mr-2" />
              Synchronize State
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" />
              Team & Access
            </CardTitle>
            <CardDescription>
              Invite members, review role capabilities, and manage organization access boundaries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/organizations/${orgId}/team`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-200">Open Team & Access page</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Open</span>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" />
                Legal & Security
              </CardTitle>
              <button
                type="button"
                onClick={() => setIsLegalOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
              >
                {isLegalOpen ? "Close" : "Open"}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${isLegalOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            <CardDescription>
              Review terms, privacy policy, and data retention/security details before inviting your
              full team.
            </CardDescription>
          </CardHeader>
          {isLegalOpen && (
            <CardContent className="space-y-3">
              <Link
                href="/terms"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <Scale className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-200">Terms of Service</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Open
                </span>
              </Link>
              <Link
                href="/privacy"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-200">Privacy Policy</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Open
                </span>
              </Link>
              <Link
                href="/security"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-200">
                    Security & Data Retention
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Open
                </span>
              </Link>
            </CardContent>
          )}
        </Card>

        <Card className="border-rose-500/30 bg-rose-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              Critical Override
            </CardTitle>
            <CardDescription className="text-rose-300/70">
              Deleting this organization archives it immediately and schedules permanent deletion
              after a safety grace period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showDeleteConfirm ? (
              <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete organization
              </Button>
            ) : (
              <div className="space-y-4 p-4 rounded-lg bg-black/40 border border-rose-500/30 max-w-2xl">
                <Label className="text-rose-300">
                  To confirm decommission, type the organization name: <br />
                  <strong className="text-white select-all mt-1 inline-block">{org?.name}</strong>
                </Label>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={org?.name}
                  className="border-rose-500/30 focus:border-rose-500 focus:ring-rose-500"
                />
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText("");
                    }}
                  >
                    Abort
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={deleteConfirmText !== org?.name}
                  >
                    Confirm Decommission
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}
