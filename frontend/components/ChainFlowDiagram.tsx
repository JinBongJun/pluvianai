'use client';

import { useMemo } from 'react';
import { ArrowRight, Clock, CheckCircle, XCircle, Activity } from 'lucide-react';
import Badge from './ui/Badge';
import { clsx } from 'clsx';
import { toFixedSafe } from '@/lib/format';

interface AgentStats {
  agent_name: string;
  call_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  failure_count: number;
  failure_rate: number;
  avg_quality_score: number;
}

interface ChainFlowDiagramProps {
  agents: AgentStats[];
  totalLatency: number;
  successRate: number;
  className?: string;
}

export default function ChainFlowDiagram({
  agents,
  totalLatency,
  successRate,
  className,
}: ChainFlowDiagramProps) {
  // Sort agents by call order (first agent typically has lower latency due to sequential processing)
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      // Sort by call count first (more calls = earlier in chain usually)
      if (a.call_count !== b.call_count) {
        return b.call_count - a.call_count;
      }
      // Then by latency (lower latency = earlier in chain)
      return a.avg_latency_ms - b.avg_latency_ms;
    });
  }, [agents]);

  if (sortedAgents.length === 0) {
    return (
      <div className={clsx('text-center py-8 text-slate-400', className)}>
        <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No agent data available</p>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Chain Overview */}
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Chain Latency</p>
            <p className="text-xl font-bold text-white">
              {toFixedSafe(totalLatency / 1000, 2)}s
            </p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="text-xs text-slate-400 mb-1">Success Rate</p>
            <p className={clsx(
              'text-xl font-bold',
              successRate >= 90 ? 'text-green-400' :
              successRate >= 70 ? 'text-yellow-400' : 'text-red-400'
            )}>
              {toFixedSafe(successRate, 1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Agent Flow */}
      <div className="relative">
        <div className="flex items-center gap-2 flex-wrap">
          {sortedAgents.map((agent, index) => {
            const isBottleneck = agent.avg_latency_ms === Math.max(...sortedAgents.map(a => a.avg_latency_ms));
            const hasFailures = agent.failure_count > 0;
            
            return (
              <div key={agent.agent_name} className="flex items-center gap-2">
                {/* Agent Node */}
                <div
                  className={clsx(
                    'relative p-4 rounded-lg border-2 transition-all duration-200 min-w-[200px]',
                    isBottleneck
                      ? 'bg-yellow-500/10 border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                      : hasFailures
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                  )}
                >
                  {/* Bottleneck Badge */}
                  {isBottleneck && (
                    <div className="absolute -top-2 -right-2">
                      <Badge variant="warning" className="text-xs">
                        Bottleneck
                      </Badge>
                    </div>
                  )}

                  {/* Agent Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className={clsx(
                      'h-4 w-4',
                      isBottleneck ? 'text-yellow-400' :
                      hasFailures ? 'text-red-400' : 'text-purple-400'
                    )} />
                    <span className="font-semibold text-white text-sm">{agent.agent_name}</span>
                  </div>

                  {/* Agent Stats */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Calls</span>
                      <span className="text-white font-medium">{agent.call_count}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Avg Latency</span>
                      <span className="text-white font-medium">
                        {toFixedSafe(agent.avg_latency_ms / 1000, 2)}s
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Quality</span>
                      <Badge
                        variant={
                          agent.avg_quality_score >= 80 ? 'success' :
                          agent.avg_quality_score >= 60 ? 'warning' : 'error'
                        }
                        className="text-xs"
                      >
                        {toFixedSafe(agent.avg_quality_score, 0)}%
                      </Badge>
                    </div>
                    {hasFailures && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                        <span className="text-red-400">Failures</span>
                        <span className="text-red-400 font-medium">{agent.failure_count}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <div className="absolute top-2 right-2">
                    {hasFailures ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    )}
                  </div>
                </div>

                {/* Arrow Connector */}
                {index < sortedAgents.length - 1 && (
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-6 w-6 text-slate-400" />
                    <span className="text-xs text-slate-500 mt-1">
                      {toFixedSafe(sortedAgents[index + 1].avg_latency_ms / 1000, 1)}s
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Flow Timeline (below) */}
        <div className="mt-6 relative h-8 bg-white/5 rounded-lg overflow-hidden">
          {sortedAgents.map((agent, index) => {
            const widthPercent = (agent.avg_latency_ms / totalLatency) * 100;
            const leftPercent = sortedAgents.slice(0, index).reduce((sum, a) => 
              sum + (a.avg_latency_ms / totalLatency) * 100, 0
            );
            
            return (
              <div
                key={agent.agent_name}
                className={clsx(
                  'absolute h-full transition-all duration-300 flex items-center justify-center',
                  agent.failure_count > 0
                    ? 'bg-red-500/30 border-r border-red-500/50'
                    : 'bg-purple-500/30 border-r border-purple-500/50'
                )}
                style={{
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={`${agent.agent_name}: ${toFixedSafe(agent.avg_latency_ms / 1000, 2)}s`}
              >
                {widthPercent > 10 && (
                  <span className="text-xs font-medium text-white">
                    {agent.agent_name} ({toFixedSafe(agent.avg_latency_ms / 1000, 1)}s)
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400 px-2">
          <span>0s</span>
          <span>Total: {toFixedSafe(totalLatency / 1000, 2)}s</span>
        </div>
      </div>
    </div>
  );
}
