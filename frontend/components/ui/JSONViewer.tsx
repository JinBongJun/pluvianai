'use client';

import { useState } from 'react';
import { Copy, Check, Search } from 'lucide-react';
import { clsx } from 'clsx';

interface JSONViewerProps {
  data: any;
  title?: string;
  searchable?: boolean;
  className?: string;
}

export default function JSONViewer({ data, title, searchable = true, className }: JSONViewerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderValue = (value: any, path: string, depth: number = 0): JSX.Element => {
    if (value === null) {
      return <span className="text-gray-500">null</span>;
    }

    if (value === undefined) {
      return <span className="text-gray-500">undefined</span>;
    }

    if (typeof value === 'string') {
      const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
      return (
        <span className="text-green-700">
          "{displayValue}"
          {value.length > 100 && (
            <span className="text-gray-500 text-xs ml-2">({value.length} chars)</span>
          )}
        </span>
      );
    }

    if (typeof value === 'number') {
      return <span className="text-blue-600">{value}</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-purple-600">{value.toString()}</span>;
    }

    if (Array.isArray(value)) {
      const isExpanded = expanded.has(path);
      return (
        <div>
          <button
            onClick={() => toggleExpand(path)}
            className="text-gray-600 hover:text-gray-900 mr-1"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span className="text-gray-600">[</span>
          <span className="text-gray-500 text-xs ml-1">{value.length} items</span>
          {isExpanded && (
            <div className="ml-4 mt-1 border-l-2 border-gray-200 pl-2">
              {value.map((item, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500">{index}:</span>{' '}
                  {renderValue(item, `${path}[${index}]`, depth + 1)}
                </div>
              ))}
            </div>
          )}
          <span className="text-gray-600">]</span>
        </div>
      );
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const isExpanded = expanded.has(path);
      return (
        <div>
          <button
            onClick={() => toggleExpand(path)}
            className="text-gray-600 hover:text-gray-900 mr-1"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span className="text-gray-600">{'{'}</span>
          <span className="text-gray-500 text-xs ml-1">{keys.length} keys</span>
          {isExpanded && (
            <div className="ml-4 mt-1 border-l-2 border-gray-200 pl-2">
              {keys.map((key) => {
                const keyPath = path ? `${path}.${key}` : key;
                const matches = searchable && searchTerm
                  ? key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    JSON.stringify(value[key]).toLowerCase().includes(searchTerm.toLowerCase())
                  : true;

                if (!matches) return null;

                return (
                  <div key={key} className="mb-1">
                    <span className="text-blue-800 font-medium">"{key}"</span>
                    <span className="text-gray-600">: </span>
                    {renderValue(value[key], keyPath, depth + 1)}
                  </div>
                );
              })}
            </div>
          )}
          <span className="text-gray-600">{'}'}</span>
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const filteredData = searchable && searchTerm
    ? (() => {
        // Simple search filter - in production, use a more sophisticated approach
        try {
          const jsonStr = JSON.stringify(data).toLowerCase();
          if (jsonStr.includes(searchTerm.toLowerCase())) {
            return data;
          }
          return null;
        } catch {
          return data;
        }
      })()
    : data;

  return (
    <div className={clsx('bg-gray-50 rounded-lg border border-gray-200', className)}>
      {(title || searchable) && (
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          {title && <h3 className="text-sm font-medium text-gray-900">{title}</h3>}
          <div className="flex items-center gap-2">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>
            )}
            <button
              onClick={copyToClipboard}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <div className="p-4 overflow-auto max-h-[600px] font-mono text-sm">
        {filteredData ? (
          <div className="whitespace-pre-wrap">
            {renderValue(filteredData, '')}
          </div>
        ) : (
          <div className="text-gray-500">No results found</div>
        )}
      </div>
    </div>
  );
}

