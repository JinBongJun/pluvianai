import React from "react";
import TopHeader from "./TopHeader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import useSWR from "swr";
import { authAPI, organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api/types";
import { useRouter, usePathname } from "next/navigation";
import { clsx } from "clsx";
import { logger } from "@/lib/logger";

type AccountLayoutProps = {
  children: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  activeTab?: "profile" | "usage" | "billing";
  isWide?: boolean;
};

const AccountLayout: React.FC<AccountLayoutProps> = ({ children, breadcrumb, activeTab, isWide }) => {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [userName, setUserName] = React.useState("");
  const [userEmail, setUserEmail] = React.useState("");

  React.useEffect(() => {
    if (!hasToken) return;
    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserName(user.full_name || "");
        setUserEmail(user.email || "");
      } catch (error) {
        logger.error("Failed to load user info in AccountLayout", error);
      }
    };
    void loadUser();
  }, [hasToken]);

  const { data: organizations } = useSWR<OrganizationSummary[]>(
    hasToken ? orgKeys.list() : null,
    () => organizationsAPI.list({ includeStats: false }),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  );

  const { data: projects } = useSWR<OrganizationProject[]>(
    null,
    null as any
  );

  const tabs = [
    { id: "profile" as const, label: "Profile", href: "/settings/profile" },
    { id: "usage" as const, label: "Usage", href: "/settings/usage" },
    { id: "billing" as const, label: "Billing", href: "/settings/billing" },
  ];

  const resolvedActiveTab =
    activeTab ||
    (tabs.find(tab => pathname?.startsWith(tab.href))?.id ?? "profile");

  return (
    <div className="min-h-screen text-white selection:bg-emerald-500/30 font-sans relative overflow-hidden bg-[#030303]">
      {/* Background similar to OrgLayout but without sidebar */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -rotate-[35deg] blur-[100px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -rotate-[35deg] blur-[120px] pointer-events-none mix-blend-screen" />
        <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
      </div>

      <TopHeader
        userName={userName}
        userEmail={userEmail}
        organizations={organizations}
        projects={projects}
      />

      <main className="relative z-10 pt-[90px]">
        <div className={clsx(
          "w-full mx-auto px-8 lg:px-10 xl:px-12 pb-20",
          isWide ? "max-w-[1750px]" : "max-w-5xl"
        )}>
          {/* Breadcrumb */}
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="mb-6 text-xs font-bold uppercase tracking-[0.25em] text-slate-500 flex flex-wrap gap-1 items-center">
              {breadcrumb.map((item, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <span className="opacity-40">/</span>}
                  {item.href ? (
                    <button
                      type="button"
                      onClick={() => router.push(item.href!)}
                      className="hover:text-emerald-400 transition-colors"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span className="text-slate-300">{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {/* Account header + tabs */}
          <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.25em]">
                Account Console
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                Profile, Usage & Billing
              </h1>
              <p className="text-xs md:text-sm text-slate-400 font-semibold uppercase tracking-[0.25em]">
                Manage your identity, quotas, and plan across all organizations.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 p-1.5 rounded-full border border-white/10 bg-[#050507]/80 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => router.push(tab.href)}
                  className={clsx(
                    "px-4 py-2 rounded-full text-[11px] font-black tracking-[0.2em] uppercase transition-all",
                    resolvedActiveTab === tab.id
                      ? "bg-emerald-500 text-black shadow-[0_0_24px_rgba(16,185,129,0.6)]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page content */}
          <div className="relative">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AccountLayout;

