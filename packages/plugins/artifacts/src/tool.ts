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
import type { AparteMessage, AparteTool, AparteToolCall, AparteToolContext, AparteToolResult } from '@aparte/core';
import type { ArtifactInput } from './segment.js';
import { artifactDocuments, ARTIFACT_TOOL_NAMES } from './documents.js';
import { documentIdOf, newDocumentId } from './ids.js';

/** What the model is told, when the app does not say otherwise. */
export const ARTIFACT_SYSTEM_PROMPT =
    'When the user asks for a document, a page, a component, a diagram or a file — anything '
    + 'they will keep, edit or run rather than read once — produce it with the create_artifact '
    + 'tool, with a MIME type that names what it is, rather than pasting it into your reply. '
    + 'Keep your reply short: say what you made, not what it contains. '
    + 'To change a document you already made, call create_artifact again with its id and the '
    + 'complete new content.';

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
                id: { type: 'string', description: 'Only to replace a document you already created: its id, as the tool result gave it. Omit it for a new document.' },
            },
            required: ['mimeType', 'content'],
        },
    };
    if (options.systemPrompt !== false) tool.systemPrompt = options.systemPrompt ?? ARTIFACT_SYSTEM_PROMPT;
    return tool;
}

/**
 * The conversation a handler is running in, when it can be reached: the chat element the
 * loop passes as `context.target`, or the viewport inside it. `undefined` on a server or in
 * a worker, where there is no element to ask.
 */
export function conversationOf(context: AparteToolContext | undefined): readonly AparteMessage[] | undefined {
    type Source = { getMessages?: () => AparteMessage[]; querySelector?: (selector: string) => Source | null };
    const target = context?.target as Source | undefined;
    if (!target) return undefined;
    const source = typeof target.getMessages === 'function' ? target : target.querySelector?.('aparte-chat-viewport');
    return typeof source?.getMessages === 'function' ? source.getMessages() : undefined;
}

/**
 * The handler: the document IS the result. The prose tells the model what happened and
 * gives it the document's id; the structured twin carries the document for the renderer,
 * verbatim, with that id.
 *
 * A call with no `id` creates a document and gives it one. A call that passes an id back
 * is a new version of that document (see `artifactDocuments` for why nothing needs
 * validating: an id seen again adds a version, an unknown one opens a document).
 */
export async function artifactHandler(call: AparteToolCall, _signal?: AbortSignal, context?: AparteToolContext): Promise<AparteToolResult> {
    const input = (call.input ?? {}) as Partial<ArtifactInput> & { id?: unknown };
    const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim() ? input.mimeType.trim() : 'text/plain';
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const content = typeof input.content === 'string' ? input.content : '';
    const given = documentIdOf(input.id);
    const documentId = given ?? newDocumentId();
    const structured: ArtifactInput = { documentId, mimeType, content, ...(title ? { title } : {}) };

    // Which version this is, when the conversation can be read: the ones already there, plus this one.
    const messages = conversationOf(context);
    const earlier = messages
        ? artifactDocuments(messages, { tools: [...ARTIFACT_TOOL_NAMES, call.name] }).find((d) => d.id === documentId)?.versions.length ?? 0
        : undefined;
    const version = earlier === undefined ? '' : `version ${earlier + 1}, `;

    return {
        toolCallId: call.id,
        content: `Artifact ${given ? 'updated' : 'created'}${title ? `: ${title}` : ''} (id: ${documentId}, ${version}${mimeType}, ${content.length} characters). `
            + 'It is shown to the user; do not repeat its content. '
            + `To change it, call ${call.name} again with this id and the complete new content.`,
        structuredContent: structured,
    };
}
