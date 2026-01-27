'use client';

import { X, Clock, CheckCircle, XCircle, MessageSquare, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '@/components/ui/Modal';

interface RecentMessage {
  content: string;
  timestamp?: string;
}

interface NodeMetrics {
  call_count: number;
  avg_latency: number;
  success_rate: number;
  avg_score: number;
}

interface NodeDetailProps {
  nodeId: string;
  nodeName: string;
  metrics: NodeMetrics;
  recentMessages: RecentMessage[];
  isOpen: boolean;
  onClose: () => void;
}

export default function NodeDetail({
  nodeId,
  nodeName,
  metrics,
  recentMessages,
  isOpen,
  onClose,
}: NodeDetailProps) {
  const getScoreColor = (score: number) => {
    if (score >= 4.0) return 'text-green-600';
    if (score >= 3.0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 4.0) return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (score >= 3.0) return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Agent: ${nodeName}`}>
      <div className="space-y-6">
        {/* Metrics */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Average Score</div>
              <div className={clsx('text-2xl font-bold', getScoreColor(metrics.avg_score))}>
                {metrics.avg_score.toFixed(1)}/5.0
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Average Latency</div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.avg_latency.toFixed(0)}ms
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Total Calls</div>
              <div className="text-2xl font-bold text-gray-900">{metrics.call_count}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Success Rate</div>
              <div className="text-2xl font-bold text-gray-900">
                {(metrics.success_rate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Recent Messages */}
        {recentMessages.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Recent Messages
            </h3>
            <div className="space-y-2">
              {recentMessages.map((msg, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <p className="text-sm text-gray-700 mb-1">{msg.content}</p>
                  {msg.timestamp && (
                    <p className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {recentMessages.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent messages available</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
