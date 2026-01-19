'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { driftAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';

interface DriftDetection {
  id: number;
  detection_type: string;
  change_percentage: number;
  severity: string;
  detected_at: string;
}

export default function DriftChart({ projectId }: { projectId: number }) {
  const [data, setData] = useState<DriftDetection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const detections = await driftAPI.list(projectId, { limit: 50 });
      setData(detections);
    } catch (error) {
      console.error('Failed to load drift detections:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-slate-400">No drift detections</div>;
  }

  // Group by detection type
  const typeGroups: Record<string, number> = {};
  data.forEach((detection) => {
    if (!typeGroups[detection.detection_type]) {
      typeGroups[detection.detection_type] = 0;
    }
    typeGroups[detection.detection_type]++;
  });

  const chartData = Object.entries(typeGroups).map(([type, count]) => ({
    type: type.charAt(0).toUpperCase() + type.slice(1),
    count,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#313035" />
          <XAxis 
            dataKey="type" 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#0B0C15', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff'
            }}
          />
          <Legend 
            wrapperStyle={{ color: '#9ca3af' }}
          />
          <Bar dataKey="count" fill="#ef4444" name="Detections" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      
      {/* Recent detections list */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Recent Detections</h3>
        <div className="space-y-2">
          {data.slice(0, 5).map((detection) => (
            <div key={detection.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
              <div>
                <span className="font-medium text-white">{detection.detection_type}</span>
                <span className="ml-2 text-sm text-slate-400">
                  {toFixedSafe(detection.change_percentage, 1)}% change
                </span>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                detection.severity === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                detection.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                detection.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>
                {detection.severity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



