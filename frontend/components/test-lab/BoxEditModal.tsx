'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import ManualInputModal from '@/components/test-lab/ManualInputModal';
import { ContentBlock, BLOCK_TYPES } from '@/types/test-lab/content-blocks';
import { Plus, Trash2, FileText, Image as ImageIcon } from 'lucide-react';

const PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'custom', label: 'Custom' },
] as const;

const MODEL_OPTIONS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-4', label: 'GPT-4' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus', label: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  ],
  google: [
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-pro', label: 'Gemini Pro' },
  ],
  custom: [],
};

// Updated BoxData with multimodal inputs support
export type BoxData = {
  id: string;
  label: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  inputs?: ContentBlock[][]; // Array of multimodal input sets
};

interface BoxEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  box: BoxData | null;
  onSave: (box: BoxData) => void;
}

export default function BoxEditModal({ isOpen, onClose, box, onSave }: BoxEditModalProps) {
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState<string>('openai');
  const [model, setModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [inputs, setInputs] = useState<ContentBlock[][]>([]);

  // State for Manual Input Modal
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [editingInputIndex, setEditingInputIndex] = useState<number | null>(null);

  useEffect(() => {
    if (box) {
      setLabel(box.label || '');
      setProvider(box.provider || 'openai');
      setModel(box.model || '');
      setSystemPrompt(box.systemPrompt || '');
      // Handle legacy string inputs or new block inputs
      const rawInputs = box.inputs || [];
      // TODO: Migration logic if needed, for now assume new structure or empty
      setInputs(rawInputs);
    }
  }, [box]);

  const handleSave = () => {
    if (!box) return;
    onSave({
      ...box,
      label,
      provider,
      model,
      systemPrompt,
      inputs,
    });
    onClose();
  };

  const handleAddInput = (newBlocks: ContentBlock[]) => {
    if (editingInputIndex !== null) {
      const newInputs = [...inputs];
      newInputs[editingInputIndex] = newBlocks;
      setInputs(newInputs);
      setEditingInputIndex(null);
    } else {
      setInputs([...inputs, newBlocks]);
    }
  };

  const openAddInputModal = () => {
    setEditingInputIndex(null);
    setIsInputModalOpen(true);
  };

  const handleEditInput = (index: number) => {
    setEditingInputIndex(index);
    setIsInputModalOpen(true);
  };

  const handleDeleteInput = (index: number) => {
    const newInputs = [...inputs];
    newInputs.splice(index, 1);
    setInputs(newInputs);
  };

  const availableModels = MODEL_OPTIONS[provider] || [];

  // Helper to preview input content
  const getInputPreview = (blocks: ContentBlock[]) => {
    const textBlock = blocks.find(b => b.type === BLOCK_TYPES.TEXT) as any;
    const hasImage = blocks.some(b => b.type === BLOCK_TYPES.IMAGE);

    let preview = textBlock?.text || '(No text)';
    if (preview.length > 30) preview = preview.substring(0, 30) + '...';

    return (
      <div className="flex items-center gap-2">
        {hasImage && <ImageIcon className="h-3 w-3 text-blue-400" />}
        <span className="text-xs text-slate-300 truncate max-w-[200px]">{preview}</span>
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Edit Agent Box">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 focus:outline-none transition-all"
              placeholder="Agent name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  const firstModel = MODEL_OPTIONS[e.target.value]?.[0]?.id;
                  if (firstModel) setModel(firstModel);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-all appearance-none"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Model</label>
              {provider === 'custom' ? (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none transition-all"
                  placeholder="Custom model ID"
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-all appearance-none"
                >
                  <option value="">Select model</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none font-mono resize-none transition-all"
              placeholder="You are a helpful assistant..."
            />
          </div>

          <div className="border-t border-white/10 pt-4 mt-2">
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Test Inputs ({inputs.length})
              </label>
              <Button
                variant="secondary"
                size="sm"
                onClick={openAddInputModal}
                className="h-7 text-xs px-2"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Input
              </Button>
            </div>

            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
              {inputs.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-6 bg-black/20 rounded-xl border border-white/5 border-dashed">
                  No inputs added yet.
                  <br />
                  <span className="text-slate-500">Add test cases to validate this agent.</span>
                </div>
              ) : (
                inputs.map((inputBlocks, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2.5 bg-black/40 rounded-lg border border-white/5 hover:border-violet-500/30 transition-colors group">
                    {getInputPreview(inputBlocks)}
                    <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={() => handleEditInput(idx)}>
                        <FileText className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-red-500/20 text-red-400" onClick={() => handleDeleteInput(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" size="md" onClick={onClose} className="px-5">
              Cancel
            </Button>
            <Button
              size="md"
              onClick={handleSave}
              disabled={!label || !model}
              className="px-8 bg-violet-600 hover:bg-violet-500 border-none shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {isInputModalOpen && (
        <ManualInputModal
          isOpen={isInputModalOpen}
          onClose={() => setIsInputModalOpen(false)}
          onSave={handleAddInput}
          initialBlocks={editingInputIndex !== null ? inputs[editingInputIndex] : []}
        />
      )}
    </>
  );
}
