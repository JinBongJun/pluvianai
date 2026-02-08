// Streaming - LiveStreamView
import React from 'react';

interface LiveStreamViewProps {
    projectId: number;
    limit?: number;
    linkToCalls?: boolean;
}

const LiveStreamView: React.FC<LiveStreamViewProps> = ({ projectId, limit = 10, linkToCalls = true }) => {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Live Stream</h3>
            <p className="text-xs text-slate-400">No recent activity</p>
        </div>
    );
};

export default LiveStreamView;
