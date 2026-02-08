// Firewall - FirewallRules
import React from 'react';

interface FirewallRulesProps {
    projectId: number;
}

const FirewallRules: React.FC<FirewallRulesProps> = ({ projectId }) => {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Firewall Rules (Project: {projectId})</h3>
            <p className="text-xs text-slate-400">No rules configured</p>
        </div>
    );
};

export default FirewallRules;
