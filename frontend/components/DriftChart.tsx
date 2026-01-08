'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { driftAPI } from '@/lib/api';

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
    return <div className="h-64 flex items-center justify-center">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-500">No drift detections</div>;
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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="type" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#ef4444" name="Detections" />
        </BarChart>
      </ResponsiveContainer>
      
      {/* Recent detections list */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Detections</h3>
        <div className="space-y-2">
          {data.slice(0, 5).map((detection) => (
            <div key={detection.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <div>
                <span className="font-medium">{detection.detection_type}</span>
                <span className="ml-2 text-sm text-gray-600">
                  {detection.change_percentage.toFixed(1)}% change
                </span>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                detection.severity === 'critical' ? 'bg-red-100 text-red-800' :
                detection.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                detection.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
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



