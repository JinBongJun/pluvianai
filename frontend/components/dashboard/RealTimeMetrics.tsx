// Dashboard - RealTimeMetrics
import React from "react";

interface RealTimeMetricsProps {
  projectId: number;
  period?: string;
}

const RealTimeMetrics: React.FC<RealTimeMetricsProps> = ({ projectId, period }) => {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-xs text-slate-400">Requests/min (Project: {projectId})</p>
        <p className="text-2xl font-bold text-white mt-1">0</p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-xs text-slate-400">Avg Latency</p>
        <p className="text-2xl font-bold text-white mt-1">0ms</p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-xs text-slate-400">Error Rate</p>
        <p className="text-2xl font-bold text-white mt-1">0%</p>
      </div>
    </div>
  );
};

export default RealTimeMetrics;
