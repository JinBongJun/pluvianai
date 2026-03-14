"use client";

import React, { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import OrgLayout from "@/components/layout/OrgLayout";

interface ProjectSettingsShellProps {
  orgId: string;
  projectId: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function ProjectSettingsShell({
  orgId,
  projectId,
  title,
  description,
  children,
}: ProjectSettingsShellProps) {
  const [copied, setCopied] = useState(false);

  const copyProjectId = useCallback(() => {
    void navigator.clipboard.writeText(String(projectId)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [projectId]);

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-8 pt-10 pb-32 relative z-10">
          <div className="">
            <div className="mb-12">
              <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none mb-6">
                Project <span className="text-emerald-500">Settings</span>
              </h1>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-slate-500 text-sm font-medium">
                  Project ID (for SDK / .env):{" "}
                  <span className="text-emerald-400 font-mono font-semibold">{projectId}</span>
                </span>
                <button
                  type="button"
                  onClick={copyProjectId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/20 bg-white/5 text-slate-400 hover:text-white hover:border-emerald-500/40 transition-colors text-xs font-medium"
                  title="Copy project ID"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              {description ? (
                <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-xl">
                  {description}
                </p>
              ) : null}
            </div>
            {children}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
