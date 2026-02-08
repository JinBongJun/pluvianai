import React from 'react';
import { ContentBlock, BLOCK_TYPES } from '@/types/test-lab/content-blocks';
import { Textarea } from '@/components/ui/Textarea'; // Match file name case
import { Button } from '@/components/ui/Button'; // Fixed casing
import { X, Image as ImageIcon } from 'lucide-react';
import DOMPurify from 'dompurify'; // Security: Sanitization

// --- Sub-components (Strategy Implementations) ---

interface BlockProps<T extends ContentBlock> {
    block: T;
    onChange: (updated: T) => void;
    onRemove: () => void;
    readOnly?: boolean;
}

const TextBlockRenderer: React.FC<BlockProps<Extract<ContentBlock, { type: 'text' }>>> = ({
    block,
    onChange,
    onRemove,
    readOnly,
}) => {
    return (
        <div className="relative group">
            <Textarea
                value={block.text}
                onChange={(e) => onChange({ ...block, text: e.target.value })}
                placeholder="Enter text..."
                className="min-h-[80px] w-full pr-8"
                readOnly={readOnly}
            />
            {!readOnly && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-6 w-6 !p-0 !min-h-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={onRemove}
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
};

const ImageBlockRenderer: React.FC<BlockProps<Extract<ContentBlock, { type: 'image_url' }>>> = ({
    block,
    onChange,
    onRemove,
    readOnly,
}) => {
    return (
        <div className="relative group border rounded-md p-2 bg-slate-50 dark:bg-slate-900">
            <div className="flex gap-2 items-center mb-2">
                <ImageIcon className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-mono text-slate-500 truncate max-w-[200px]">
                    {block.image_url.url}
                </span>
            </div>

            {/* Image Preview with Error Handling */}
            <div className="relative aspect-video bg-slate-200 dark:bg-slate-800 rounded overflow-hidden flex items-center justify-center">
                {/* Security: Use standard img tag but we validate URL in Zod schema */}
                <img
                    src={block.image_url.url}
                    alt="Preview"
                    className="max-h-[200px] object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-image-error.png';
                    }}
                />
            </div>

            {!readOnly && (
                <div className="mt-2 flex gap-2">
                    <input
                        type="text"
                        value={block.image_url.url}
                        onChange={(e) => onChange({
                            ...block,
                            image_url: { ...block.image_url, url: e.target.value }
                        })}
                        className="flex-1 text-xs border rounded px-2 py-1 bg-white dark:bg-black"
                        placeholder="Image URL..."
                    />
                    <select
                        value={block.image_url.detail || 'auto'}
                        onChange={(e) => onChange({
                            ...block,
                            image_url: { ...block.image_url, detail: e.target.value as any }
                        })}
                        className="text-xs border rounded px-2 py-1 bg-white dark:bg-black"
                    >
                        <option value="auto">Auto</option>
                        <option value="low">Low</option>
                        <option value="high">High</option>
                    </select>
                </div>
            )}

            {!readOnly && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-6 w-6 !p-0 !min-h-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white"
                    onClick={onRemove}
                >
                    <X className="h-4 w-4 text-black" />
                </Button>
            )}
        </div>
    );
};

// --- Main Input Renderer (Strategy Context) ---

interface InputRendererProps {
    blocks: ContentBlock[];
    onChange: (blocks: ContentBlock[]) => void;
    readOnly?: boolean;
}

export const InputRenderer: React.FC<InputRendererProps> = ({
    blocks,
    onChange,
    readOnly,
}) => {
    const handleUpdate = (index: number, updatedBlock: ContentBlock) => {
        const newBlocks = [...blocks];
        newBlocks[index] = updatedBlock;
        onChange(newBlocks);
    };

    const handleRemove = (index: number) => {
        const newBlocks = [...blocks];
        newBlocks.splice(index, 1);
        onChange(newBlocks);
    };

    return (
        <div className="space-y-4">
            {blocks.map((block, index) => {
                // Strategy Selection based on block type (OCP)
                switch (block.type) {
                    case BLOCK_TYPES.TEXT:
                        return (
                            <TextBlockRenderer
                                key={block.id}
                                block={block}
                                onChange={(b) => handleUpdate(index, b)}
                                onRemove={() => handleRemove(index)}
                                readOnly={readOnly}
                            />
                        );
                    case BLOCK_TYPES.IMAGE:
                        return (
                            <ImageBlockRenderer
                                key={block.id}
                                block={block}
                                onChange={(b) => handleUpdate(index, b)}
                                onRemove={() => handleRemove(index)}
                                readOnly={readOnly}
                            />
                        );
                    // Add new block types here without modifying existing renderers!
                    default:
                        return <div key={block.id} className="text-red-500">Unknown block type</div>;
                }
            })}
        </div>
    );
};
