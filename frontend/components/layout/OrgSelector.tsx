// Layout - OrgSelector
import React from 'react';

interface OrgSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    organizations?: { id: string | number; name: string }[];
}

const OrgSelector: React.FC<OrgSelectorProps> = ({ value, onChange, organizations = [] }) => {
    return (
        <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
            <option value="">Select Organization</option>
            {organizations.map((org) => (
                <option key={org.id} value={org.id.toString()}>
                    {org.name}
                </option>
            ))}
        </select>
    );
};

export const getLastSelectedOrgId = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('last_org_id');
};

export default OrgSelector;
