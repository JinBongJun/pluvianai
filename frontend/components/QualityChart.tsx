// QualityChart
import React from 'react';

interface QualityChartProps {
    projectId: number;
}

const QualityChart: React.FC<QualityChartProps> = ({ projectId }) => {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 h-64 flex items-center justify-center">
            <p className="text-sm text-slate-400">Quality chart placeholder (Project: {projectId})</p>
        </div>
    );
};

export default QualityChart;
