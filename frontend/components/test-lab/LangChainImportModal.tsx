'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Loader2 } from 'lucide-react';

interface LangChainImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (boxes: any[], connections: any[]) => void;
  projectId: number;
}

export default function LangChainImportModal({
  isOpen,
  onClose,
  onImport,
  projectId,
}: LangChainImportModalProps) {
  const [format, setFormat] = useState<'code' | 'json'>('code');
  const [code, setCode] = useState('');
  const [jsonConfig, setJsonConfig] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { testLabAPI } = await import('@/lib/api');

      let payload: any;
      if (format === 'code') {
        if (!code.trim()) {
          setError('Please enter LangChain code');
          setIsLoading(false);
          return;
        }
        payload = {
          format: 'code',
          code: code.trim(),
        };
      } else {
        if (!jsonConfig.trim()) {
          setError('Please enter agent configuration JSON');
          setIsLoading(false);
          return;
        }
        try {
          const parsed = JSON.parse(jsonConfig);
          payload = {
            format: 'json',
            agent_config: parsed,
          };
        } catch (e) {
          setError('Invalid JSON format');
          setIsLoading(false);
          return;
        }
      }

      const result = await testLabAPI.importLangChain(projectId, payload);

      if (result.boxes && result.boxes.length > 0) {
        onImport(result.boxes, result.connections || []);
        onClose();
        // Reset form
        setCode('');
        setJsonConfig('');
        setError(null);
      } else {
        setError('No boxes were extracted from the LangChain agent');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import LangChain agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import LangChain Agent">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
            Import Format
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat('code')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${format === 'code'
                ? 'bg-violet-600 border-violet-500 text-white shadow-[0_0_15px_rgba(124,58,237,0.2)]'
                : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
                }`}
            >
              Python Code
            </button>
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${format === 'json'
                ? 'bg-violet-600 border-violet-500 text-white shadow-[0_0_15px_rgba(124,58,237,0.2)]'
                : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
                }`}
            >
              JSON Config
            </button>
          </div>
        </div>

        {format === 'code' ? (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              LangChain Python Code
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none font-mono resize-none transition-all"
              placeholder={`# Example LangChain code...`}
            />
            <p className="mt-2 text-[10px] text-slate-400 italic">
              Paste your LangChain agent or chain code here. The system will extract
              the structure and convert it to Test Lab boxes.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Agent Configuration (JSON)
            </label>
            <textarea
              value={jsonConfig}
              onChange={(e) => setJsonConfig(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none font-mono resize-none transition-all"
              placeholder={`{ "agents": [...], "chains": [...] }`}
            />
            <p className="mt-2 text-[10px] text-slate-400 italic">
              Enter a pre-structured JSON configuration for your LangChain agent.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isLoading} className="px-5">
            Cancel
          </Button>
          <Button
            size="md"
            onClick={handleImport}
            disabled={isLoading}
            className="px-8 bg-violet-600 hover:bg-violet-500 border-none shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...
              </>
            ) : (
              'Start Import'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
