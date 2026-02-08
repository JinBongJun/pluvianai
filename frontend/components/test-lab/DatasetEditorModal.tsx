import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Plus, Trash2, AlertCircle, Table as TableIcon, Settings, Type, Image as ImageIcon } from 'lucide-react';
import { VariableDefinition, TestCase, VariableType } from './InputNode';
import { v4 as uuidv4 } from 'uuid';

interface DatasetEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (variables: VariableDefinition[], testCases: TestCase[]) => void;
    initialVariables?: VariableDefinition[];
    initialTestCases?: TestCase[];
}

export default function DatasetEditorModal({
    isOpen,
    onClose,
    onSave,
    initialVariables = [],
    initialTestCases = [],
}: DatasetEditorModalProps) {
    const [activeTab, setActiveTab] = useState<'schema' | 'data'>('data');
    const [variables, setVariables] = useState<VariableDefinition[]>([]);
    const [testCases, setTestCases] = useState<TestCase[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Initialize with provided data or defaults
            if (initialVariables.length > 0) {
                setVariables(initialVariables);
            } else {
                // Default schema if empty
                setVariables([{ id: uuidv4(), name: 'input', type: 'text' }]);
            }

            if (initialTestCases.length > 0) {
                setTestCases(initialTestCases);
            } else {
                setTestCases([]);
            }
        }
    }, [isOpen, initialVariables, initialTestCases]);

    const handleSave = () => {
        // Validate
        const cleanVariables = variables.filter(v => v.name.trim() !== '');
        if (cleanVariables.length === 0) {
            alert("At least one variable is required.");
            return;
        }
        onSave(cleanVariables, testCases);
        onClose();
    };

    const addVariable = () => {
        setVariables([...variables, { id: uuidv4(), name: `var_${variables.length + 1}`, type: 'text' }]);
    };

    const removeVariable = (id: string) => {
        if (variables.length <= 1) return; // Prevent deleting last var
        setVariables(variables.filter(v => v.id !== id));
        // Note: We keep the data in testCases even if column is hidden/deleted to prevent data loss?
        // Or cleaner to delete it? Let's keep it simple and just hide it from view for now, 
        // or actually delete it from objects if we want strict consistency.
        // For now, React won't render it in the table.
    };

    const updateVariable = (id: string, updates: Partial<VariableDefinition>) => {
        setVariables(variables.map(v => v.id === id ? { ...v, ...updates } : v));
    };

    const addTestCase = () => {
        const newCase: TestCase = { id: uuidv4() };
        variables.forEach(v => {
            newCase[v.name] = ''; // Default empty string
        });
        setTestCases([...testCases, newCase]);
    };

    const removeTestCase = (id: string) => {
        setTestCases(testCases.filter(t => t.id !== id));
    };

    const updateTestCase = (id: string, field: string, value: any) => {
        setTestCases(testCases.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    // Auto-switch to schema tab if no variables
    useEffect(() => {
        if (isOpen && variables.length === 0 && activeTab === 'data') {
            // setVariables calls generally happen on mount, but if it remains empty for some reason
        }
    }, [isOpen, variables, activeTab]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Dataset Editor" size="xl">
            <div className="flex flex-col h-[70vh]">
                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-white/10 mb-4">
                    <button
                        onClick={() => setActiveTab('data')}
                        className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'data'
                            ? 'border-emerald-500 text-emerald-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <TableIcon className="w-4 h-4" />
                        Data Table
                    </button>
                    <button
                        onClick={() => setActiveTab('schema')}
                        className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'schema'
                            ? 'border-violet-500 text-violet-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Settings className="w-4 h-4" />
                        Schema & Variables
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {activeTab === 'schema' && (
                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-white/5 text-xs uppercase text-slate-500 font-bold">
                                        <tr>
                                            <th className="px-4 py-3" scope="col">Variable Name</th>
                                            <th className="px-4 py-3" scope="col">Type</th>
                                            <th className="px-4 py-3 w-20" scope="col">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {variables.map((variable) => (
                                            <tr key={variable.id} className="hover:bg-white/[0.02]">
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-violet-400 font-mono text-xs">{'{{'}</span>
                                                        <input
                                                            type="text"
                                                            value={variable.name}
                                                            onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                                                            className="bg-transparent border border-transparent hover:border-white/20 focus:border-violet-500 rounded px-2 py-1 outline-none font-mono text-sm text-white w-full transition-all"
                                                            placeholder="variable_name"
                                                        />
                                                        <span className="text-violet-400 font-mono text-xs">{'}}'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => updateVariable(variable.id, { type: 'text' })}
                                                            className={`p-1.5 rounded flex items-center gap-1.5 text-xs font-medium transition-colors ${variable.type === 'text' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:bg-white/5'}`}
                                                        >
                                                            <Type className="w-3.5 h-3.5" /> Text
                                                        </button>
                                                        {/* Image type disabled for MVP simplicity unless needed */}
                                                        {/* <button
                                                            onClick={() => updateVariable(variable.id, { type: 'image' })}
                                                            className={`p-1.5 rounded flex items-center gap-1.5 text-xs font-medium transition-colors ${variable.type === 'image' ? 'bg-pink-500/20 text-pink-300' : 'text-slate-500 hover:bg-white/5'}`}
                                                        >
                                                            <ImageIcon className="w-3.5 h-3.5" /> Image
                                                        </button> */}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => removeVariable(variable.id)}
                                                        disabled={variables.length <= 1}
                                                        className="p-2 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Button variant="secondary" onClick={addVariable} className="w-full border-dashed">
                                <Plus className="w-4 h-4 mr-2" /> Add Variable
                            </Button>
                        </div>
                    )}

                    {activeTab === 'data' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-auto border border-white/10 rounded-lg bg-[#0d0d12]">
                                <table className="w-full text-left text-sm text-slate-300 relative">
                                    <thead className="bg-[#1a1a1e] text-xs uppercase text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 w-16 text-center border-b border-white/10">#</th>
                                            {variables.map(v => (
                                                <th key={v.id} className="px-4 py-3 border-b border-white/10 min-w-[200px]">
                                                    <div className="flex items-center gap-2 text-violet-400 normal-case">
                                                        <span className="font-mono bg-violet-500/10 px-1.5 py-0.5 rounded">{v.name}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 w-16 border-b border-white/10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {testCases.map((row, index) => (
                                            <tr key={row.id} className="hover:bg-white/[0.02] group">
                                                <td className="px-4 py-3 text-center text-slate-600 font-mono text-xs">{index + 1}</td>
                                                {variables.map(v => (
                                                    <td key={v.id} className="p-0 border-r border-white/5 last:border-0 relative">
                                                        <textarea
                                                            value={row[v.name] || ''}
                                                            onChange={(e) => updateTestCase(row.id, v.name, e.target.value)}
                                                            className="w-full h-full min-h-[48px] bg-transparent resize-y border-none focus:ring-1 focus:ring-violet-500/50 focus:bg-white/5 p-3 text-sm text-slate-200 placeholder:text-slate-700 block"
                                                            placeholder={`Value for ${v.name}...`}
                                                            rows={1}
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-2 py-3 text-center">
                                                    <button
                                                        onClick={() => removeTestCase(row.id)}
                                                        className="p-1.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {testCases.length === 0 && (
                                            <tr>
                                                <td colSpan={variables.length + 2} className="py-12 text-center text-slate-500">
                                                    No test cases yet. Add a row to get started.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                                <div className="text-xs text-slate-500">
                                    {testCases.length} row{testCases.length !== 1 ? 's' : ''}
                                </div>
                                <Button variant="secondary" onClick={addTestCase}>
                                    <Plus className="w-4 h-4 mr-2" /> Add Row
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-6 border-t border-white/10 mt-4">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </div>
            </div>
        </Modal>
    );
}
