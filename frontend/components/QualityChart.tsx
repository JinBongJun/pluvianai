'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, Dot } from 'recharts';
import { qualityAPI } from '@/lib/api';

interface QualityScore {
  id: number;
  overall_score: number;
  created_at: string;
}

export default function QualityChart({ projectId }: { projectId: number }) {
  const [data, setData] = useState<QualityScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [driftPoints, setDriftPoints] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const scores = await qualityAPI.getScores(projectId, { limit: 100 });
      const qualityScores: QualityScore[] = Array.isArray(scores) ? (scores as unknown as QualityScore[]) : [];
      setData(qualityScores);
      
      // Drift 감지: 점수가 10% 이상 떨어진 지점 찾기
      const driftIndices: number[] = [];
      for (let i = 1; i < qualityScores.length; i++) {
        const prev = qualityScores[i - 1].overall_score;
        const curr = qualityScores[i].overall_score;
        if (prev - curr > 10) {
          driftIndices.push(i);
        }
      }
      setDriftPoints(driftIndices);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load quality scores:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ag-accent border-t-transparent"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        No quality data available
      </div>
    );
  }

  const chartData = data.map((score, index) => ({
    date: new Date(score.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: score.overall_score,
    index,
    isDrift: driftPoints.includes(index),
  }));

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#313035" />
          <XAxis 
            dataKey="date" 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            domain={[0, 100]} 
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
          <Area 
            type="monotone" 
            dataKey="score" 
            stroke="#818cf8" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#qualityGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#818cf8' }}
          />
          {/* Drift 감지 영역 표시 */}
          {driftPoints.map((idx) => {
            if (idx > 0 && idx < chartData.length) {
              return (
                <ReferenceArea
                  key={`drift-area-${idx}`}
                  x1={chartData[idx - 1]?.date}
                  x2={chartData[idx]?.date}
                  fill="#ef4444"
                  fillOpacity={0.1}
                />
              );
            }
            return null;
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}



