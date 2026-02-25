'use client';

import React from 'react';

// Minimalist domed robot/bird icon
const RobotBird = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {/* Flattened/Widened Dome Body */}
    <path d="M5 19v-5c0-3.31 3.13-6 7-6s7 2.69 7 6v5H5z" />
    {/* Solid Eye - Moved slightly left to balance the beak */}
    <circle cx="9.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
    {/* Laser/Beak crossing edge - Adjusted angle */}
    <path d="M22 10.5l-8 4.5" />
  </svg>
);

type PassRateGaugeProps = {
  passedRatio: number | null | undefined;
  totalRuns?: number;
  size?: number; // 원의 크기 (기본 140)
  strokeWidth?: number;
  isValidating?: boolean;
};

export function PassRateGauge({
  passedRatio,
  totalRuns = 0,
  size = 140,
  strokeWidth = 12,
  isValidating = false,
}: PassRateGaugeProps) {
  const hasResult = passedRatio != null && Number.isFinite(passedRatio);
  const ratio = hasResult ? Math.max(0, Math.min(1, passedRatio)) : 0;
  const percent = Math.round(ratio * 100);

  // SVG 계산
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (ratio * circumference);

  // 상태별 그라데이션 ID 결정
  let gradientId = 'grad-fail';
  if (ratio >= 0.75) gradientId = 'grad-pass';
  else if (ratio >= 0.25) gradientId = 'grad-warn';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* SVG 게이지 */}
        <svg width={size} height={size} className="transform -rotate-90">
          <defs>
            {/* 1. 통과 (Green/Teal) */}
            <linearGradient id="grad-pass" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" /> {/* emerald-400 */}
              <stop offset="100%" stopColor="#2dd4bf" /> {/* teal-400 */}
            </linearGradient>

            {/* 2. 경고 (Amber/Orange) */}
            <linearGradient id="grad-warn" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" /> {/* amber-400 */}
              <stop offset="100%" stopColor="#fb923c" /> {/* orange-400 */}
            </linearGradient>

            {/* 3. 실패 (Rose/Purple - 요청하신 스타일) */}
            <linearGradient id="grad-fail" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" /> {/* rose-400 */}
              <stop offset="100%" stopColor="#a855f7" /> {/* purple-500 */}
            </linearGradient>

            {/* 4. 로딩 중 (Cyan/Blue - 레이더 느낌) */}
            <linearGradient id="grad-loading" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" /> {/* cyan-400 */}
              <stop offset="50%" stopColor="#3b82f6" /> {/* blue-500 */}
              <stop offset="100%" stopColor="#8b5cf6" /> {/* violet-500 */}
            </linearGradient>
          </defs>

          {/* 배경 원 (Track) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#334155" /* slate-700 */
            strokeWidth={strokeWidth}
            opacity={0.3}
          />

          {/* 진행 원 (Progress) 또는 로딩 원 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={`url(#${isValidating ? 'grad-loading' : (hasResult ? gradientId : 'none')})`} // 결과 없으면 투명, 로딩중엔 로딩 그라데이션
            strokeWidth={strokeWidth}
            strokeDasharray={isValidating ? `${circumference / 3} ${circumference * 2 / 3}` : circumference}
            strokeDashoffset={isValidating ? undefined : (hasResult ? offset : circumference)}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${isValidating ? 'animate-spin origin-center' : (!hasResult ? 'stroke-slate-600' : '')}`}
          />
        </svg>

        {/* 중앙 텍스트 & 심볼 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isValidating ? (
            <div className="flex flex-col items-center justify-center -mt-2">
              <RobotBird className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] mb-2 animate-bounce hover:animate-pulse" />
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest animate-pulse">
                Analyzing
                <span className="inline-flex w-4 text-left ml-0.5">
                  <span className="animate-[ping_1.5s_infinite] inline-block">.</span>
                  <span className="animate-[ping_1.5s_infinite_0.3s] inline-block">.</span>
                  <span className="animate-[ping_1.5s_infinite_0.6s] inline-block">.</span>
                </span>
              </span>
            </div>
          ) : hasResult ? (
            <div className="flex flex-col items-center justify-center -mt-2">
              <RobotBird
                className={`w-10 h-10 mb-2 transition-all duration-1000 ${ratio >= 0.75 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]' :
                  ratio >= 0.25 ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' : 'text-rose-400 drop-shadow-[0_0_12px_rgba(244,114,182,0.6)]'
                  }`}
              />
              <span className={`text-3xl font-black tracking-tight leading-none ${ratio >= 0.75 ? 'text-emerald-400' :
                ratio >= 0.25 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                {percent}%
              </span>
              <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Passed
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <RobotBird className="w-12 h-12 text-slate-600 mb-2 animate-[pulse_3s_ease-in-out_infinite]" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ready</span>
            </div>
          )}
        </div>
      </div>

      {/* 하단 보조 텍스트 */}
      {hasResult && totalRuns > 0 && (
        <div className="mt-3 text-xs text-slate-500 font-mono">
          {Math.round(ratio * totalRuns)} / {totalRuns} runs
        </div>
      )}
    </div>
  );
}
