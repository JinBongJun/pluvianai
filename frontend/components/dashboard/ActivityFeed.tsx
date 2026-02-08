// Dashboard - ActivityFeed
import React from 'react';

interface ActivityFeedProps {
    projectId: number;
    period?: string;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ projectId, period }) => {
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-400">No recent activity for Project: {projectId}</p>
        </div>
    );
};

export default ActivityFeed;
