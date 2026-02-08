import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ContentBlock } from '@/types/test-lab/content-blocks';

interface ManualInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: (input: string) => void;
    onSave?: (blocks: ContentBlock[]) => void;
    initialBlocks?: ContentBlock[];
}

const ManualInputModal: React.FC<ManualInputModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    onSave,
    initialBlocks = []
}) => {
    const [input, setInput] = useState(
        initialBlocks.length > 0 && initialBlocks[0].type === 'text'
            ? (initialBlocks[0] as any).text
            : ''
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            if (onSave) {
                onSave([{ type: 'text', id: Math.random().toString(), text: input.trim() }]);
            } else if (onSubmit) {
                onSubmit(input.trim());
            }
            setInput('');
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manual Input">
            <form onSubmit={handleSubmit}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="w-full h-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Enter your input..."
                />
                <div className="flex justify-end gap-3 mt-4">
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit">Submit</Button>
                </div>
            </form>
        </Modal>
    );
};


export default ManualInputModal;
