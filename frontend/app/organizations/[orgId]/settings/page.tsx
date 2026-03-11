"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { organizationsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Settings, Trash2, AlertTriangle, Save, Fingerprint } from "lucide-react";
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
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: org, mutate: refetchOrg } = useSWR(
    orgId ? ["organization", orgId] : null,
    async () => {
      const data = await organizationsAPI.get(orgId, { includeStats: false });
      setOrgName(data.name || "");
      return data;
    }
  );

  const handleSave = async () => {
    if (!orgName.trim()) {
      toast.showToast("Environment designation cannot be empty.", "warning");
      return;
    }

    setSaving(true);
    try {
      await organizationsAPI.update(orgId, { name: orgName });
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
      await organizationsAPI.delete(orgId);
      toast.showToast("Environment permanently decommissioned.", "success");
      router.push("/organizations");
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

        <Card className="border-rose-500/30 bg-rose-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              Critical Override
            </CardTitle>
            <CardDescription className="text-rose-300/70">
              Deleting this organization will permanently remove all projects and data. This cannot
              be undone.
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
                  To confirm permanent deletion, type the organization name: <br />
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
                    Confirm Permanent Deletion
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
