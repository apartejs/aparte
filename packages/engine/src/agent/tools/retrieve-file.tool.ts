/**
 * retrieve-file.tool.ts — Tool factory : agent retrieves content from an
 * attached file (top-K passages via RAG, or deep-analyze re-parse).
 *
 *   apps/home     → wraps rag.service.ts + VLM for images
 *   tests-node    → wraps lib/file-rag.mjs + lib/file-parser.mjs
 *
 * Two retrieval modes :
 *   - Fast (deep_analyze=false) : cosine top-K chunks already indexed
 *   - Deep (deep_analyze=true)  : re-load binary, full re-parse / re-VLM
 *     (slower, ~5s, only when user asks for a detail not in indexed chunks)
 */

import type { Tool } from '../tool';

export interface AttachedFile {
    id: string;
    name: string;
    type?: string;
    summary?: string;
}

/**
 * Adapter — consumer implements this.
 */
export interface FileAdapter {
    /**
     * List currently attached files. Used to inject enum + descriptions.
     */
    listFiles(): Promise<AttachedFile[]> | AttachedFile[];

    /**
     * Retrieve top-K chunks from a file via semantic similarity (fast mode).
     */
    retrieve(fileId: string, query: string, topK?: number): Promise<string>;

    /**
     * Deep re-analyze : reload original binary, re-parse / re-VLM, focused
     * on the query. Optional — fall back to retrieve() if not implemented.
     */
    deepAnalyze?(fileId: string, query: string): Promise<string>;
}

/**
 * Build the retrieve_file Tool. Returns null if no files attached
 * (the tool shouldn't be exposed to the LLM in that case).
 */
export async function buildRetrieveFileTool(
    adapter: FileAdapter,
    files?: AttachedFile[],
): Promise<Tool | null> {
    const attached = files ?? await adapter.listFiles();
    if (!attached.length) return null;

    const enumValues = attached.map(f => f.id);
    const fileList = attached.map(f => {
        const typeLabel = f.type && f.type !== 'text' ? ` [${f.type}]` : '';
        const summary = (f.summary ?? '').slice(0, 120);
        return `  - id="${f.id}" ("${f.name}")${typeLabel}: ${summary}`;
    }).join('\n');

    return {
        marker: { mode: 'auto_when_available', reason: 'When at least one file is attached to the conversation' },
        // Built only when files attached; once built, available for the conv lifetime.
        descriptor: {
            name: 'retrieve_file',
            description: `Retrieve content from an attached file. Fast mode (deep_analyze=false) : returns top-K semantically relevant passages via cosine. Deep mode (deep_analyze=true) : re-loads the original binary — re-runs VLM for images, full re-parse for text/PDF. Use deep_analyze ONLY when the question demands a specific detail not covered by the indexed chunks.

Attached files :
${fileList}

Call ONCE per file with a focused query. Don't call retrieve_file on a file unrelated to the user's question.`,
            parameters: {
                type: 'object',
                properties: {
                    file_id: {
                        type: 'string',
                        enum: enumValues,
                        description: 'File identifier to query. One of the attached file ids.',
                    },
                    query: {
                        type: 'string',
                        description: 'Focused sub-question to retrieve from the file (3-15 words).',
                    },
                    deep_analyze: {
                        type: 'boolean',
                        description: 'If true, full re-analyze of the binary (slow ~5s). For images : re-call VLM. For text : full re-parse. Default false.',
                    },
                },
                required: ['file_id', 'query'],
            },
        },

        handler: async (args, _ctx) => {
            const fileId = String(args['file_id'] ?? '');
            const query = String(args['query'] ?? '');
            const deep = args['deep_analyze'] === true;

            if (!fileId || !enumValues.includes(fileId)) {
                return `FAILED: unknown file_id "${fileId}". Available: ${enumValues.join(', ')}`;
            }
            if (!query || query.length < 2) {
                return `FAILED: query is required (got "${query}")`;
            }
            try {
                if (deep && adapter.deepAnalyze) {
                    return await adapter.deepAnalyze(fileId, query);
                }
                return await adapter.retrieve(fileId, query, 3);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `FAILED: retrieve_file error: ${msg}`;
            }
        },
    };
}
