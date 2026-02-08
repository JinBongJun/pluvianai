// Shared components - RenameModal
import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRename?: (newName: string) => void;
    onSave?: (newName: string) => void;
    currentName?: string;
    initialValue?: string;
    title?: string;
}

const RenameModal: React.FC<RenameModalProps> = ({
    isOpen,
    onClose,
    onRename,
    onSave,
    currentName = '',
    initialValue,
    title = 'Rename',
}) => {
    const [name, setName] = useState(initialValue || currentName);

    useEffect(() => {
        if (isOpen) {
            setName(initialValue || currentName);
        }
    }, [isOpen, initialValue, currentName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            if (onSave) onSave(name.trim());
            else if (onRename) onRename(name.trim());
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Enter new name"
                    autoFocus
                />
                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="secondary" onClick={onClose} type="button">
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit">
                        Rename
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default RenameModal;
