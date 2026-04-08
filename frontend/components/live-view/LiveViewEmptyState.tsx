"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ChevronDown, Copy } from "lucide-react";

type StackOption = "python" | "node";
type MethodOption = "sdk" | "http";

export function LiveViewEmptyState({
  projectId,
  orgId,
}: {
  projectId?: number;
  orgId?: string;
}) {
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<"projectId" | "apiUrl" | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<MethodOption>("sdk");
  const [selectedStack, setSelectedStack] = useState<StackOption>("python");
  const resolvedProjectId =
    projectId && !Number.isNaN(projectId) ? String(projectId) : "YOUR_PROJECT_ID";
  const apiBaseUrl = "https://api.pluvianai.com";
  const settingsHref =
    orgId && resolvedProjectId !== "YOUR_PROJECT_ID"
      ? `/organizations/${orgId}/projects/${resolvedProjectId}/settings/api-keys`
      : "/docs?section=integrations";

  const sdkInstallSnippet =
    selectedStack === "python" ? "pip install pluvianai openai" : "npm install pluvianai openai";

  const sdkEnvSnippet = `PLUVIANAI_API_KEY=ag_live_your_server_key
PLUVIANAI_PROJECT_ID=${resolvedProjectId}
PLUVIANAI_API_URL=${apiBaseUrl}
PLUVIANAI_AGENT_NAME=quick-test`;

  const pythonSdkSnippet = `import pluvianai
from openai import OpenAI

pluvianai.init()

client = OpenAI()
client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
)`;

  const nodeSdkSnippet = `import pluvianai from "pluvianai";
import OpenAI from "openai";

pluvianai.init();

const client = new OpenAI();

async function main() {
  await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
  });
}

main();`;

  const pythonHttpSnippet = `import requests

requests.post(
  "${apiBaseUrl}/api/v1/projects/${resolvedProjectId}/api-calls",
  headers={
    "Authorization": "Bearer ag_live_your_server_key",
    "Content-Type": "application/json",
  },
  json={
    "agent_name": "quick-test",
    "request_data": {
      "model": "gpt-4",
      "messages": [{"role": "user", "content": "hello"}],
    },
    "response_data": {
      "choices": [{"message": {"role": "assistant", "content": "hello"}}],
    },
    "latency_ms": 0,
    "status_code": 200,
  },
)`;

  const nodeHttpSnippet = `async function sendTestRequest() {
  await fetch("${apiBaseUrl}/api/v1/projects/${resolvedProjectId}/api-calls", {
    method: "POST",
    headers: {
      Authorization: "Bearer ag_live_your_server_key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_name: "quick-test",
      request_data: {
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
      },
      response_data: {
        choices: [{ message: { role: "assistant", content: "hello" } }],
      },
      latency_ms: 0,
      status_code: 200,
    }),
  });
}

sendTestRequest();`;

  const snippet =
    selectedMethod === "sdk"
      ? selectedStack === "python"
        ? pythonSdkSnippet
        : nodeSdkSnippet
      : selectedStack === "python"
        ? pythonHttpSnippet
        : nodeHttpSnippet;

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet).then(() => {
      setSnippetCopied(true);
      setTimeout(() => setSnippetCopied(false), 2000);
    });
  }, [snippet]);

  const handleCopyField = useCallback((field: "projectId" | "apiUrl", value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(current => (current === field ? null : current)), 2000);
    });
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-start overflow-y-auto bg-[#030303] px-8 pb-20 pt-10 text-center custom-scrollbar">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-70" />

        <div className="absolute top-[-10%] right-[-10%] h-[500px] w-[120%] -rotate-[35deg] bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent blur-[100px] mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] h-[600px] w-[150%] -rotate-[35deg] bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent blur-[120px] mix-blend-screen" />

        <div
          className="absolute top-1/2 -left-[15%] h-[100%] w-[35%] -translate-y-1/2 rounded-[100%] border-r-[2px]
            border-cyan-400/30 bg-gradient-to-l from-cyan-500/15 via-transparent to-transparent opacity-40
            shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen"
        />
        <div
          className="absolute top-1/2 -right-[15%] h-[100%] w-[35%] -translate-y-1/2 rounded-[100%] border-l-[2px]
            border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent opacity-30
            shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen"
        />

        <div className="absolute top-[10%] left-[30%] h-2 w-2 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
        <div className="absolute bottom-[20%] left-[10%] h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute top-[40%] right-[15%] h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        <div className="absolute top-[15%] right-[40%] h-1 w-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-30" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        <section className="rounded-[40px] border border-white/10 bg-[#121215]/60 p-10 shadow-2xl backdrop-blur-3xl">
          <div className="flex flex-col items-center gap-6">
            <motion.div
              animate={{
                scale: [1, 1.03, 1],
                boxShadow: [
                  "0 0 40px rgba(0,0,0,0.3)",
                  "0 0 60px rgba(0,0,0,0.4)",
                  "0 0 40px rgba(0,0,0,0.3)",
                ],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block rounded-[28px] border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-2xl"
            >
              <Activity
                className="mx-auto h-12 w-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                strokeWidth={1}
              />
            </motion.div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">
                Live View Setup
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:text-4xl">
                Send one request and see your first live node
              </h2>
              <p className="mx-auto max-w-xl text-sm font-medium text-slate-400">
                Use the SDK for the fastest setup, or send events directly with Raw HTTP if you
                need full control. After one real request, Live View will populate automatically.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 text-left md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
              Step 1
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Copy credentials</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Get your Project ID and server API key from Project Settings.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
              Step 2
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Add the snippet</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Paste it into the backend route or worker that calls your model.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
              Step 3
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Send one request</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Run one test call and come back here. Live View should update automatically.
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#121215]/60 p-6 text-left shadow-2xl backdrop-blur-3xl">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">What you need</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Project ID
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyField("projectId", resolvedProjectId)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-white/10"
                >
                  <Copy className="h-3 w-3" />
                  {copiedField === "projectId" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 break-all text-sm font-semibold text-white">{resolvedProjectId}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Server API key
              </p>
              <p className="mt-2 text-sm font-semibold text-white">Copy from Project Settings</p>
              <Link
                href={settingsHref}
                className="mt-3 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 transition-colors hover:bg-emerald-500/15"
              >
                Open Project Settings
              </Link>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  API URL
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyField("apiUrl", apiBaseUrl)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-white/10"
                >
                  <Copy className="h-3 w-3" />
                  {copiedField === "apiUrl" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 break-all text-sm font-semibold text-white">{apiBaseUrl}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)] xl:items-start">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#121215]/60 text-left shadow-2xl backdrop-blur-3xl">
            <div className="px-6 pb-2 pt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Integration method
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                SDK is the fastest path for most users. Raw HTTP is an advanced option that sends
                events directly to the ingest API.
              </p>
            </div>

            <div className="mx-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedMethod("sdk")}
                className={
                  selectedMethod === "sdk"
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
                }
              >
                SDK
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod("http")}
                className={
                  selectedMethod === "http"
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
                }
              >
                Raw HTTP (Advanced)
              </button>
            </div>

            <div className="mx-4 mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedStack("python")}
                className={
                  selectedStack === "python"
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
                }
              >
                Python
              </button>
              <button
                type="button"
                onClick={() => setSelectedStack("node")}
                className={
                  selectedStack === "node"
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
                }
              >
                Node
              </button>
            </div>

            {selectedMethod === "sdk" ? (
              <div className="mx-4 mt-4 grid gap-4">
                <div className="rounded-[20px] border border-white/5 bg-black/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    1. Add these to .env
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-emerald-300/90">
                    {sdkEnvSnippet}
                  </pre>
                </div>
                <div className="rounded-[20px] border border-white/5 bg-black/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    2. Install the packages
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-emerald-300/90">
                    {sdkInstallSnippet}
                  </pre>
                </div>
              </div>
            ) : null}

            <div className="px-6 pb-2 pt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {selectedMethod === "sdk" ? "3. Add this to your app" : "Send your first request"}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {selectedMethod === "sdk"
                  ? "Put this near app startup so it runs before your first model call."
                  : "Use a server API key with ingest access and send this from your backend."}
              </p>
            </div>

            <div className="relative mx-4 mb-4 mt-2 whitespace-pre-wrap rounded-[20px] border border-white/5 bg-black/60 p-5 font-mono text-xs text-emerald-300/90">
              <button
                type="button"
                onClick={onCopy}
                className="absolute right-3 top-3 rounded-xl border border-white/10 bg-white/5 p-2 text-emerald-400 transition-all hover:bg-white/10 active:scale-95"
                title="Copy snippet"
                aria-label="Copy snippet"
              >
                <Copy className="h-4 w-4" />
              </button>
              {snippetCopied ? (
                <span className="absolute right-12 top-3 text-[10px] font-bold uppercase text-emerald-400">
                  Copied
                </span>
              ) : null}
              {snippet}
            </div>

            <p className="px-6 pb-6 text-[11px] font-bold text-slate-500">
              {selectedMethod === "sdk"
                ? "After you add the SDK and run one real model call, your first live node should appear within a few seconds. If not, refresh this page once."
                : "After one successful ingest request, your first live node should appear within a few seconds. If not, refresh this page once."}
            </p>
          </div>

          <aside className="rounded-[32px] border border-white/10 bg-[#121215]/60 p-5 text-left shadow-2xl backdrop-blur-3xl xl:sticky xl:top-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sample node preview
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  Example only. Your real node will appear here after one successful request.
                </p>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                Sample
              </span>
            </div>

            <div className="mt-5 rounded-[28px] border border-emerald-500/15 bg-black/35 p-4 shadow-[0_0_40px_rgba(16,185,129,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">quick-test</p>
                  <p className="text-xs text-slate-400">OpenAI · gpt-4</p>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Healthy
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Latency
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">182 ms</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">200</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Messages
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">2</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Tool calls
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">0</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Example flow
                </p>
                <div className="mt-3 flex items-center gap-2 overflow-hidden">
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                    User
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-cyan-400/40 to-emerald-400/40" />
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    quick-test
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <details className="group mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-left">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            If nothing appears
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
            <li>Check that the Project ID matches this project.</li>
            <li>Check that your server API key belongs to the same project.</li>
            <li>
              {selectedMethod === "sdk"
                ? "Check that pluvianai.init() runs before your first real model call."
                : "Check that your server API key has ingest access."}
            </li>
          </ul>
        </details>

        <section className="mx-auto max-w-xl rounded-[32px] border border-white/10 bg-[#121215]/60 p-6 shadow-2xl backdrop-blur-3xl">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Need setup help?
          </p>
          <Link
            href="/docs?section=integrations"
            className="mt-4 inline-flex items-center gap-2 rounded-[20px] border border-emerald-500/30 bg-white/5 px-6 py-3 text-sm font-bold text-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:bg-white/10 active:scale-95"
          >
            Open integration guide
          </Link>
        </section>
      </div>
    </div>
  );
}
