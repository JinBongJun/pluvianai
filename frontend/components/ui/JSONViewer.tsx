import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface JSONViewerProps {
    data: any;
    searchable?: boolean;
    className?: string;
}

interface JSONNodeProps {
    value: any;
    label?: string;
    depth?: number;
}

const JSONNode: React.FC<JSONNodeProps> = ({ value, label, depth = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(depth < 2);

    if (value === null) return <span className="text-slate-500">null</span>;
    if (value === undefined) return <span className="text-slate-500">undefined</span>;
    if (typeof value === 'boolean') return <span className="text-orange-400">{value.toString()}</span>;
    if (typeof value === 'number') return <span className="text-blue-400">{value}</span>;
    if (typeof value === 'string') return <span className="text-green-400">&quot;{value}&quot;</span>;

    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-slate-400">[]</span>;
        return (
            <div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span className="text-slate-400">[{value.length}]</span>
                </button>
                {isExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-4 mt-1">
                        {value.map((item, index) => (
                            <div key={index} className="py-0.5 text-xs">
                                <span className="text-slate-500">{index}: </span>
                                <JSONNode value={item} depth={depth + 1} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return <span className="text-slate-400">{'{}'}</span>;
        return (
            <div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span className="text-slate-400">{`{${keys.length}}`}</span>
                </button>
                {isExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-4 mt-1">
                        {keys.map((k) => (
                            <div key={k} className="py-0.5 text-xs">
                                <span className="text-cyan-400">{k}</span>
                                <span className="text-slate-500">: </span>
                                <JSONNode value={value[k]} label={k} depth={depth + 1} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <span className="text-slate-300">{String(value)}</span>;
};

const JSONViewer: React.FC<JSONViewerProps> = ({ data, className = '' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={clsx('relative rounded-lg bg-[#0d0d12] border border-white/10 p-4', className)}>
            <button
                onClick={handleCopy}
                className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Copy JSON"
            >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <div className="font-mono text-sm overflow-auto max-h-[600px] text-white">
                <JSONNode value={data} />
            </div>
        </div>
    );
};

export default JSONViewer;
