// Dashboard - TrendChart
import React from 'react';

interface TrendChartProps {
    projectId: number;
    period?: string;
    groupBy?: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ projectId, period, groupBy }) => {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 h-64 flex items-center justify-center">
            <p className="text-sm text-slate-400">Trend chart placeholder (Project: {projectId})</p>
        </div>
    );
};

export default TrendChart;
