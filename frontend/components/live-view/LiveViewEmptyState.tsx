"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Copy } from "lucide-react";

export function LiveViewEmptyState({ projectId }: { projectId?: number }) {
  const [copied, setCopied] = useState(false);
  const snippet =
    projectId && !Number.isNaN(projectId)
      ? `# Python (backend)\nimport requests\n\nrequests.post(\n  "https://api.pluvianai.com/api/v1/projects/${projectId}/api-calls",\n  headers={\n    "Authorization": "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json",\n  },\n  json={\n    "agent_name": "quick-test",\n    "request_data": {\n      "model": "gpt-4",\n      "messages": [{"role": "user", "content": "hello"}],\n    },\n    "response_data": {\n      "choices": [{"message": {"role": "assistant", "content": "hello"}}],\n    },\n    "latency_ms": 0,\n    "status_code": 200,\n  },\n)\n\n# Node (backend)\nawait fetch(\`https://api.pluvianai.com/api/v1/projects/${projectId}/api-calls\`, {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    agent_name: "quick-test",\n    request_data: {\n      model: "gpt-4",\n      messages: [{ role: "user", content: "hello" }],\n    },\n    response_data: {\n      choices: [{ message: { role: "assistant", content: "hello" } }],\n    },\n    latency_ms: 0,\n    status_code: 200,\n  }),\n});`
      : `# Python (backend)\nimport requests\n\nrequests.post(\n  "https://api.pluvianai.com/api/v1/projects/YOUR_PROJECT_ID/api-calls",\n  headers={\n    "Authorization": "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json",\n  },\n  json={\n    "agent_name": "quick-test",\n    "request_data": {\n      "model": "gpt-4",\n      "messages": [{"role": "user", "content": "hello"}],\n    },\n    "response_data": {\n      "choices": [{"message": {"role": "assistant", "content": "hello"}}],\n    },\n    "latency_ms": 0,\n    "status_code": 200,\n  },\n)\n\n# Node (backend)\nawait fetch("https://api.pluvianai.com/api/v1/projects/YOUR_PROJECT_ID/api-calls", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    agent_name: "quick-test",\n    request_data: {\n      model: "gpt-4",\n      messages: [{ role: "user", content: "hello" }],\n    },\n    response_data: {\n      choices: [{ message: { role: "assistant", content: "hello" } }],\n    },\n    latency_ms: 0,\n    status_code: 200,\n  }),\n});`;

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [snippet]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start pt-10 pb-20 px-8 text-center bg-[#030303] z-50 overflow-y-auto custom-scrollbar">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-70" />

        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent -rotate-[35deg] blur-[100px] mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent -rotate-[35deg] blur-[120px] mix-blend-screen" />

        <div
          className="absolute top-1/2 -left-[15%] w-[35%] h-[100%] -translate-y-1/2 rounded-[100%] opacity-40
            border-r-[2px] border-cyan-400/30 
            bg-gradient-to-l from-cyan-500/15 via-transparent to-transparent 
            shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen"
        />
        <div
          className="absolute top-1/2 -right-[15%] w-[35%] h-[100%] -translate-y-1/2 rounded-[100%] opacity-30
            border-l-[2px] border-emerald-400/30 
            bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent 
            shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen"
        />

        <div className="absolute top-[10%] left-[30%] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute top-[40%] right-[15%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-bounce duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        <div className="absolute top-[15%] right-[40%] w-1 h-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-30" />
      </div>

      <div className="text-center space-y-4 max-w-2xl px-6 relative z-10">
        <div className="flex flex-col items-center gap-6 p-10 rounded-[40px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl">
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
            className="p-6 rounded-[28px] bg-black/60 border border-white/10 backdrop-blur-2xl shadow-2xl inline-block"
          >
            <Activity
              className="w-12 h-12 text-emerald-400 mx-auto filter drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              strokeWidth={1}
            />
          </motion.div>

          <div className="space-y-3">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] animate-pulse">
              Waiting for Live Traffic
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] leading-tight">
              Connect your LLM calls — agents will show up here in real time.
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto font-medium">
              Take your existing backend where you call the LLM, send us a copy of each request and
              response, and this map will light up automatically.
            </p>
          </div>
        </div>

        <div className="w-full max-w-5xl grid gap-3 text-left md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 1</p>
            <p className="mt-2 text-sm font-semibold text-white">Copy project credentials</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Open Project Settings and copy your Project ID and server API key.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 2</p>
            <p className="mt-2 text-sm font-semibold text-white">Paste the snippet in your backend</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Use the exact place where your app calls an LLM. Keep this server-side.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 3</p>
            <p className="mt-2 text-sm font-semibold text-white">Run one request</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Trigger one test call and return here. Your first agent should appear in seconds.
            </p>
          </div>
        </div>

        <div className="w-full max-w-xl space-y-4 text-left p-1 rounded-[32px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden mx-auto">
          <div className="px-6 pt-6 pb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Quick start (Python or Node)
            </p>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Copy this snippet into the place where you call your LLM (backend or worker), then run
              one test request. Replace YOUR_PROJECT_ID and YOUR_API_KEY from Project Settings.
            </p>
          </div>
          <div className="relative mx-4 mb-4 rounded-[20px] bg-black/60 border border-white/5 p-5 font-mono text-xs text-emerald-300/90 whitespace-pre-wrap">
            <button
              type="button"
              onClick={onCopy}
              className="absolute top-3 right-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-400 border border-white/10 transition-all active:scale-95"
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            {copied && (
              <span className="absolute top-3 right-12 text-[10px] font-bold text-emerald-400 uppercase">
                Copied
              </span>
            )}
            {snippet}
          </div>
          <p className="text-[11px] text-slate-500 px-6 pb-6 font-bold uppercase tracking-widest opacity-50">
            Make one LLM call — you should see your first agent here within a few seconds.
          </p>
        </div>

        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Troubleshooting
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
            <li>401/403: verify Project ID and API key match the same project.</li>
            <li>
              No agents after 1-2 minutes: verify ingest reaches{" "}
              <code className="text-slate-400">POST /api/v1/projects/YOUR_PROJECT_ID/api-calls</code>{" "}
              (see Docs → Integrations).
            </li>
            <li>Still empty: open browser Network tab and confirm `live-view/agents` returns at least one agent.</li>
          </ul>
        </div>

        <div className="pt-2 space-y-3 p-6 rounded-[32px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl max-w-xl mx-auto">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Using n8n, MCP, or LangChain?
          </p>
          <Link
            href="/docs?section=integrations"
            className="inline-flex items-center gap-2 rounded-[20px] bg-white/5 hover:bg-white/10 border border-emerald-500/30 px-6 py-3 text-sm font-bold text-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] active:scale-95"
          >
            Open step-by-step guide (Docs)
          </Link>
        </div>
      </div>
    </div>
  );
}
