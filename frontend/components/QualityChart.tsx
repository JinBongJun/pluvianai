'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { qualityAPI } from '@/lib/api';

interface QualityScore {
  id: number;
  overall_score: number;
  created_at: string;
}

export default function QualityChart({ projectId }: { projectId: number }) {
  const [data, setData] = useState<QualityScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const scores = await qualityAPI.getScores(projectId, { limit: 100 });
      setData(scores);
    } catch (error) {
      console.error('Failed to load quality scores:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-500">No quality data available</div>;
  }

  // Format data for chart
  const chartData = data.map((score) => ({
    date: new Date(score.created_at).toLocaleDateString(),
    score: score.overall_score.toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0, 100]} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="score" stroke="#0ea5e9" strokeWidth={2} name="Quality Score" />
      </LineChart>
    </ResponsiveContainer>
  );
}



