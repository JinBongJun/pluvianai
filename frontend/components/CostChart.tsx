// CostChart
import React from "react";

interface ChartProps {
  projectId: number;
  days?: number;
  period?: string;
}

const CostChart: React.FC<ChartProps> = ({ projectId, days, period }) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 h-64 flex items-center justify-center">
      <p className="text-sm text-slate-400">Cost chart placeholder (Project: {projectId})</p>
    </div>
  );
};

export default CostChart;
