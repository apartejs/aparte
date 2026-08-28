/**
 * The `create_artifact` tool: a real `AparteTool` the app registers, with a handler that
 * returns the document as its structured result.
 *
 * It used to be a string compared in the engine (`event.name === 'create_artifact'`)
 * with no tool behind it: no app declared it to the model, no approval policy could
 * rule on it, and its result skipped the generic path. As a tool it goes through
 * everything a tool goes through — the schema the model sees, the approval gate (a
 * policy may well class writing a document as a `write`), the handler, the envelope —
 * and the card is a tool renderer on its result.
 */
import type { AparteTool, AparteToolCall, AparteToolResult } from '@aparte/core';
import type { ArtifactInput } from './segment.js';

/** What the model is told, when the app does not say otherwise. */
export const ARTIFACT_SYSTEM_PROMPT =
    'When the user asks for a document, a page, a component, a diagram or a file — anything '
    + 'they will keep, edit or run rather than read once — produce it with the create_artifact '
    + 'tool, with a MIME type that names what it is, rather than pasting it into your reply. '
    + 'Keep your reply short: say what you made, not what it contains.';

export interface ArtifactToolOptions {
    /** The tool's name as the model sees it. Default `create_artifact`. */
    name?: string;
    /**
     * The system prompt the tool carries — how the model learns when to produce a
     * document. A string of your own replaces the default; `false` sends none.
     */
    systemPrompt?: string | false;
}

/** The tool definition — name, description, input schema, system prompt. */
export function createArtifactTool(options: ArtifactToolOptions = {}): AparteTool {
    const tool: AparteTool = {
        name: options.name ?? 'create_artifact',
        description: 'Create a self-contained document the user can keep, edit, run or download: a page, a '
            + 'component, a script, a stylesheet, an SVG, a JSON document, a Markdown note, a CSV. '
            + 'Give it a MIME type (text/html, application/vnd.ant.react, image/svg+xml, text/markdown, '
            + 'application/json, text/csv, application/javascript, text/css) and a short title.',
        inputSchema: {
            type: 'object',
            properties: {
                mimeType: { type: 'string', description: 'The MIME type of the document, e.g. text/html or application/vnd.ant.react.' },
                title: { type: 'string', description: 'A short human title for the document.' },
                content: { type: 'string', description: 'The complete document.' },
            },
            required: ['mimeType', 'content'],
        },
    };
    if (options.systemPrompt !== false) tool.systemPrompt = options.systemPrompt ?? ARTIFACT_SYSTEM_PROMPT;
    return tool;
}

/**
 * The handler: the document IS the result. The prose tells the model what happened;
 * the structured twin carries the artifact for the renderer, verbatim.
 */
export async function artifactHandler(call: AparteToolCall): Promise<AparteToolResult> {
    const input = (call.input ?? {}) as Partial<ArtifactInput>;
    const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim() ? input.mimeType.trim() : 'text/plain';
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const content = typeof input.content === 'string' ? input.content : '';
    const structured: ArtifactInput = { mimeType, content, ...(title ? { title } : {}) };
    return {
        toolCallId: call.id,
        content: `Artifact created${title ? `: ${title}` : ''} (${mimeType}, ${content.length} characters). It is shown to the user; do not repeat its content.`,
        structuredContent: structured,
    };
}
