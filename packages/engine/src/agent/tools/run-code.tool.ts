/**
 * run-code.tool.ts — Tool factory : agent executes JavaScript in a sandbox.
 *
 * Aligned with Anthropic Code Execution + OpenAI Agents SDK 2026 norms :
 *   - Single `code` parameter (no separate `lib` param — all globals pre-injected)
 *   - Returns Uint8Array → auto-attached as file ; string/object → text response
 *   - Sandbox is provider-specific :
 *       apps/home     → Web Worker (sandbox-worker.ts)
 *       tests-node    → MockSandbox (Node eval direct, dev only)
 *
 * The tool exposes available globals (XLSX, PDFDocument, JSZip, files API)
 * in its description so the LLM knows what's usable without retrieving a skill.
 */

import type { Tool } from '../tool';

/**
 * Result of running code in the sandbox.
 *   kind: 'binary'  → data is Uint8Array, will be attached as file
 *   kind: 'text'    → data is string, fed back to LLM
 *   kind: 'json'    → data is object, JSON.stringify fed back to LLM
 *   kind: 'void'    → no return value (success silent)
 *
 * Errors throw or return kind: 'error' with msg.
 */
export type SandboxResult =
    | { kind: 'binary'; data: Uint8Array; mimeType?: string; filename?: string }
    | { kind: 'text'; data: string }
    | { kind: 'json'; data: unknown }
    | { kind: 'void' }
    | { kind: 'error'; message: string };

/**
 * Files API exposed to sandbox code (read/write conversation files).
 * Consumer provides a concrete implementation.
 */
export interface SandboxFilesApi {
    list(): Promise<Array<{ id: string; name: string; type: string; binarySize: number }>>;
    read(fileId: string): Promise<Uint8Array>;
    write(name: string, data: Uint8Array): Promise<{ id: string; name: string }>;
}

/**
 * Sandbox adapter — consumer implements this.
 */
export interface SandboxAdapter {
    /**
     * Execute JS code in an isolated context. Should NOT throw on user-code
     * errors — return kind: 'error' instead.
     */
    run(opts: {
        code: string;
        filesApi: SandboxFilesApi;
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<SandboxResult>;
}

/**
 * Track files created during a tool call (so the agent loop / UI can
 * surface them as artifacts). Consumer can pass a tracker to collect them.
 */
export interface FileTracker {
    track(file: { id: string; name: string; size: number }): void;
}

/**
 * Build the run_code Tool.
 *
 * @param sandbox    SandboxAdapter implementation
 * @param filesApi   FilesApi exposed to sandbox code
 * @param tracker    Optional tracker for created files
 */
export function buildRunCodeTool(
    sandbox: SandboxAdapter,
    filesApi: SandboxFilesApi,
    tracker?: FileTracker,
): Tool {
    return {
        marker: { mode: 'mandatory_always' },
        descriptor: {
            name: 'run_code',
            description: `Execute JavaScript in an isolated sandbox (NOT Python, no pandas, no matplotlib).

Globals available in your code (don't import, they're ready) :
  • XLSX (SheetJS) : XLSX.read(buf, {type:'array'}), XLSX.write(wb, {bookType:'xlsx', type:'array'}), XLSX.utils.sheet_to_json / json_to_sheet
  • PDFDocument, StandardFonts, rgb, PageSizes (pdf-lib) : PDFDocument.create(), .load(buf), .copyPages(), .save()
  • Document, Packer, Paragraph, TextRun, Table, HeadingLevel (docx)
  • JSZip : new JSZip(), zip.loadAsync(buf), zip.generateAsync({type:'uint8array'})
  • TextEncoder, TextDecoder
  • files : API for conversation files
      await files.list()                   → [{id, name, type, binarySize}]
      await files.read(fileId)              → Uint8Array of source file
      await files.write(name, uint8Array)   → {id, name} ; attached to conv

UNAVAILABLE (will crash) : Python, pandas, fetch, document/window/DOM, import/require.

Your code MUST be valid async JavaScript. You can return :
  • Uint8Array → auto-attached as new file
  • string → returned to LLM as text result
  • object/number → JSON.stringify returned to LLM
  • undefined → silent success (typical after files.write)

If user asks for something this sandbox CANNOT do (matplotlib chart, pandas pivot, etc.), DO NOT call this tool — respond in text explaining the limit.

Typical OK use cases : anonymize XLSX, filter rows, extract PDF pages, merge files, CSV↔XLSX conversion, ZIP compress, sum/average calc.`,
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'Body of an async JavaScript function. Use the listed globals. Must return Uint8Array | string | object | undefined.',
                    },
                },
                required: ['code'],
            },
        },

        handler: async (args, ctx) => {
            const code = String(args['code'] ?? '');
            if (!code || code.length < 5) {
                return `FAILED: code is required (got empty or trivial code)`;
            }
            try {
                const result = await sandbox.run({
                    code,
                    filesApi,
                    timeoutMs: 10000,
                    signal: ctx.signal,
                });

                switch (result.kind) {
                    case 'binary': {
                        // Auto-attach to conversation files
                        const filename = result.filename ?? `output-${Date.now()}.bin`;
                        const file = await filesApi.write(filename, result.data);
                        tracker?.track({ id: file.id, name: file.name, size: result.data.length });
                        return `Files created : ${file.name} (id=${file.id}, ${result.data.length} bytes)${result.mimeType ? `, type=${result.mimeType}` : ''}`;
                    }
                    case 'text':
                        return result.data.slice(0, 4000);  // cap to avoid context overflow
                    case 'json':
                        return JSON.stringify(result.data).slice(0, 4000);
                    case 'void':
                        return 'OK (no return value)';
                    case 'error':
                        return `FAILED: sandbox error: ${result.message}`;
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `FAILED: run_code exception: ${msg}`;
            }
        },
    };
}
