"use client";

import React from "react";
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
  projectId: _projectId,
  title,
  description,
  children,
}: ProjectSettingsShellProps) {
  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-8 pt-10 pb-32 relative z-10">
          <div className="">
            <div className="mb-12">
              <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none mb-6">
                Project <span className="text-emerald-500">Settings</span>
              </h1>
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
