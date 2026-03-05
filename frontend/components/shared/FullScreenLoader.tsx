import React from "react";
import { RobotBirdIcon } from "./RobotBirdIcon";

export function FullScreenLoader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#0B0C10]">
      <div className="relative flex flex-col items-center justify-center">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-fuchsia-500/10 rounded-full blur-[50px] pointer-events-none" />

        {/* Icon */}
        <div className="relative z-10 w-24 h-24 rounded-full border border-white/5 bg-black/40 flex items-center justify-center mb-6 shadow-2xl">
          <div className="absolute inset-0 rounded-full border border-fuchsia-500/20 animate-ping opacity-20" />
          <RobotBirdIcon className="w-10 h-10 text-slate-300 animate-[pulse_2s_ease-in-out_infinite]" />
        </div>

        {/* Text */}
        <div className="relative z-10 text-sm font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
          {text}
          <span className="inline-flex w-4 text-left">
            <span className="animate-[ping_1.5s_infinite] inline-block">.</span>
            <span className="animate-[ping_1.5s_infinite_0.3s] inline-block">.</span>
            <span className="animate-[ping_1.5s_infinite_0.6s] inline-block">.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
