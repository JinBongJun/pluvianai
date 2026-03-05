// Streaming - PulseIndicator
import React from "react";

interface PulseIndicatorProps {
  projectId: number;
  show5m?: boolean;
}

const PulseIndicator: React.FC<PulseIndicatorProps> = ({ projectId, show5m = false }) => {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span>Live</span>
      {show5m && <span className="text-slate-500">· Last 5 min</span>}
    </div>
  );
};

export default PulseIndicator;
