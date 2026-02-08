import { z } from 'zod';

// --- Zod Schemas for Runtime Validation (Security) ---

export const TextBlockSchema = z.object({
    type: z.literal('text'),
    id: z.string(),
    text: z.string(),
});

export const ImageBlockSchema = z.object({
    type: z.literal('image_url'),
    id: z.string(),
    image_url: z.object({
        url: z.string().url(), // Basic URL validation
        detail: z.enum(['low', 'high', 'auto']).optional(),
    }),
});

export const ToolBlockSchema = z.object({
    type: z.literal('tool_result'),
    id: z.string(),
    tool_call_id: z.string(),
    tool_name: z.string(),
    content: z.string(), // The output of the tool
});

export const ContentBlockSchema = z.union([
    TextBlockSchema,
    ImageBlockSchema,
    ToolBlockSchema,
]);

export const TestInputSchema = z.object({
    id: z.string(),
    system_prompt: z.string().optional(),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.union([
            z.string(), // Simple text only
            z.array(ContentBlockSchema) // Multimodal blocks
        ]),
        tool_calls: z.array(z.any()).optional(), // For assistant messages calling tools
        tool_call_id: z.string().optional(), // For tool messages
    })),
});

// --- TypeScript Types ---

export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type ToolBlock = z.infer<typeof ToolBlockSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type TestInput = z.infer<typeof TestInputSchema>;

// --- Constants ---

export const BLOCK_TYPES = {
    TEXT: 'text',
    IMAGE: 'image_url',
    TOOL: 'tool_result',
} as const;
