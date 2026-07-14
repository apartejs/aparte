/**
 * orchestrate.ts — pure TypeScript, zero Angular dependencies.
 *
 * Core routing logic: receives a classified route + context, applies it to a
 * chat request (injects system messages, strips tools, adds RAG context, builds
 * artifact generation prompts) and returns the modified request.
 *
 * This is intentionally framework-agnostic so it can be:
 *   - Used by the Angular OrchestratorService (thin shell)
 *   - Imported directly in Node.js eval scripts / tests
 *   - Used by future adapters (React, Vue, server-side…)
 *
 * Angular-specific concerns (ConversationManager, RagService, window events,
 * AbortController guards) live exclusively in orchestrator.service.ts.
 */

import { planArtifact } from './planner';
import type { OrchestratorContext, OrchestratorRoute, ArtifactKind } from './routes';
import type { AparteChatRequest, AparteChatMessage } from '@aparte/core';

// ────────────────────────────────────────────────────────────────────────────
// Pipeline phase type — mirrors the local type inside _streamLoop in aparte-client.
// ────────────────────────────────────────────────────────────────────────────

export type PipelinePhase =
    | { mode: 'text';     system: string }
    | { mode: 'artifact'; system: string; mimeType: string; kind: string };

// ────────────────────────────────────────────────────────────────────────────
// MIME mapping (Anthropic vendor namespace convention)
// ────────────────────────────────────────────────────────────────────────────

export const ARTIFACT_MIME: Record<ArtifactKind, string> = {
    react:      'application/vnd.ant.react',
    html:       'text/html',
    js:         'application/javascript',
    css:        'text/css',
    svg:        'image/svg+xml',
    text:       'text/plain',
    markdown:   'text/markdown',
    json:       'application/json',
    csv:        'text/csv',
    python:     'text/x-python',
    typescript: 'application/x-typescript',
    bash:       'application/x-sh',
    sql:        'application/x-sql',
    // Binary file kinds — vendor MIME signals the post-stream sandbox handler
    // to execute the artifact body and emit a downloadable file.
    pdf:        'application/x-aparte-sandbox-pdf',
    xlsx:       'application/x-aparte-sandbox-xlsx',
    docx:       'application/x-aparte-sandbox-docx',
};

/** Kinds whose body is content-driven — planner step is skipped. */
export const CONTENT_DRIVEN_KINDS: ReadonlySet<ArtifactKind> = new Set([
    'text', 'markdown', 'json', 'csv', 'python', 'typescript', 'bash', 'sql',
    // Binary file kinds: planner is skipped — generator writes JS lib code directly.
    'pdf', 'xlsx', 'docx',
] as const);

// ────────────────────────────────────────────────────────────────────────────
// RAG adapter interface
//
// Decouples the pure orchestrate() from Angular's RagService so the function
// can be used in Node.js evals or any other context.
// ────────────────────────────────────────────────────────────────────────────

export interface RagResult {
    chunks: Array<{ text: string; metadata: Record<string, any> }>;
    scores: number[];
    summaries?: Record<string, string>;
}

export interface RagAdapter {
    /** Query relevant chunks from the user's documents. */
    query(queryText: string): Promise<RagResult | null>;
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

export interface OrchestrateOptions {
    request: AparteChatRequest;
    ctx: OrchestratorContext;
    route: OrchestratorRoute;
    rag: RagAdapter | null;
    /** Pass an AbortSignal to cancel the planner call when the user clicks stop. */
    signal?: AbortSignal;
    /** Set to false to suppress all [Orchestrator] console logs. */
    verbose?: boolean;
}

export type OrchestrateResult = AparteChatRequest;

/**
 * Apply the routing decision to the chat request.
 *
 * Returns a new (mutated-copy) AparteChatRequest ready to be sent to the provider.
 * Never throws — falls back to a direct (tool-stripped) request on unexpected errors.
 */
export async function orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
    const { request, ctx, route, rag, signal, verbose = false } = opts;
    const log = verbose
        ? (...args: unknown[]) => console.log('[Orchestrate]', ...args)
        : () => undefined;
    const warn = (...args: unknown[]) => console.warn('[Orchestrate]', ...args);

    // Skip-think prefill is supplied by the consumer via `ctx.capabilities` —
    // the engine stays model-agnostic and never sniffs `modelId`. When the model
    // has a skippable thinking block, the app sets `skipThinkingPrefill` (e.g.
    // `</think>\n\n`) so latency-sensitive routes skip it; otherwise it's unset
    // and no `prefill` is added (the worker treats missing prefill as empty).
    const skipThink: string | undefined = ctx.capabilities?.skipThinkingPrefill;
    const resolvePrefill = (): string | undefined => request.prefill ?? skipThink;

    const bare = (): AparteChatRequest => ({
        ...request,
        tools: undefined,
        toolChoice: 'none',
        ...(resolvePrefill() !== undefined ? { prefill: resolvePrefill() } : {}),
    });

    switch (route.type) {

        // ── direct ─────────────────────────────────────────────────────────
        case 'direct':
            return bare();

        // ── clarify ────────────────────────────────────────────────────────
        case 'clarify':
            return {
                ...request,
                toolChoice: {
                    name: 'ask_question',
                    input: {
                        question: route.question,
                        options: route.options,
                        multiple: route.multiple ?? false,
                    },
                },
                ...(resolvePrefill() !== undefined ? { prefill: resolvePrefill() } : {}),
            };

        // ── code (artifact generation) ──────────────────────────────────────
        case 'code': {
            const requestedKind = route.artifactType;

            const isContentDriven = CONTENT_DRIVEN_KINDS.has(requestedKind);

            // Step 1 — silent planner (skipped for data/text-only kinds)
            let plan: { type: ArtifactKind; components: string[]; layout: string } | null = null;
            if (!isContentDriven) {
                try {
                    plan = await planArtifact(ctx, requestedKind, signal);
                } catch {
                    // planArtifact never throws but guard anyway
                }
                if (!plan) {
                    warn('planner returned null — falling back to direct');
                    return bare();
                }
            }

            const finalKind: ArtifactKind = plan?.type ?? requestedKind;
            const mimeType = ARTIFACT_MIME[finalKind];

            // Step 2 — optional RAG augmentation
            let ragSystemMessage: AparteChatMessage | null = null;
            if (ctx.hasDocuments && rag) {
                try {
                    const ragResult = await rag.query(route.description);
                    if (ragResult && ragResult.chunks.length > 0) {
                        const lines = ragResult.chunks
                            .map((c, i) => `Source ${i + 1} (${c.metadata['source'] ?? '?'}):\n${c.text}`)
                            .join('\n\n---\n\n');
                        ragSystemMessage = {
                            role: 'system',
                            content: `Reference context from the user's uploaded documents — use it to inform the artifact.\n\n${lines}`,
                        };
                    }
                } catch (err) {
                    warn('RAG query failed:', err);
                }
            }

            // Step 3 — generation prompt: raw code only, no XML, no formatting.
            // The model's job is to write code. The client wraps it in an artifact
            // segment via _meta.artifactRaw — the model never knows about artifacts.
            const planJson = plan
                ? JSON.stringify({ type: finalKind, components: plan.components, layout: plan.layout })
                : null;
            const kindRules = generationRulesForKind(finalKind);

            const codeSystemContent = [
                // Optional no-think directive from the consumer's model caps
                // (e.g. `/no_think` for a thinking variant). Agnostic default: none.
                ...(ctx.capabilities?.noThinkDirective ? [ctx.capabilities.noThinkDirective] : []),
                `You are a code generator. Your response MUST contain ONLY raw code — nothing else.`,
                `Do not think about what you are going to write. Start writing the code immediately.`,
                `FORBIDDEN (any of these will break the output):`,
                `- Any text before the code (no intro, no "Here is", no "Voici", no "Sure!")`,
                `- Any text after the code (no explanation, no "This component…", no "Feel free to…")`,
                `- Markdown fences (\`\`\`jsx, \`\`\`python, etc.)`,
                `- XML or HTML wrapping tags`,
                `- Comments explaining what the code does (only inline code comments are allowed)`,
                `Your first character MUST be the first character of the code. Your last character MUST be the last character of the code.`,
                ...(planJson ? [`Plan: ${planJson}`] : []),
                ``,
                kindRules,
            ].join('\n');

            // User messages only — pipeline phases inject their own system per turn.
            const messages: AparteChatMessage[] = [
                ...(ragSystemMessage ? [ragSystemMessage] : []),
                ...request.messages,
            ];

            // ── Binary file kinds (xlsx, pdf, docx, csv) — legacy 2-phase ──
            //
            // We tried (2026-05-15) routing these through the `run_code` tool
            // (native LFM2.5 Pythonic format) with prefill forcing
            // `<|tool_call_start|>[run_code(`. Empirically the 1.2B-Instruct
            // base falls back to either :
            //   - markdown code fence  ```javascript\n const wb = …`
            //   - apology / refusal    "I'm sorry, but…"
            //
            // Root cause documented in aparte-training/RESEARCH-LFM2.5.md +
            // eval logs 2026-05-11 : Instruct's SFT/DPO mix targets chat/
            // creative output, NO tool-call curriculum. Only the Thinking
            // variant has it (5/6 tool eval pass). Switching to Thinking
            // would solve tool calls but introduce a <think> block on every
            // turn — we already paid the model-swap cost twice this V0.1.
            //
            // Pragmatic V0.1 path : keep the codegen-xlsx / codegen-pdf
            // skills (raw JS examples in the system prompt) and fall through
            // to the legacy 2-phase pipeline below (intro sentence + raw
            // code artifact). The `run_code` tool stays registered globally
            // for future use (RAG-retrievable, or Thinking variant).
            //
            // To re-enable : flip `useRunCodeTool` to true and validate that
            // the model actually emits the Pythonic tool call format.
            const BINARY_KINDS: ReadonlySet<ArtifactKind> = new Set(['xlsx', 'pdf', 'docx', 'csv']);
            void BINARY_KINDS;  // reserved — see comment above
            const useRunCodeTool = false;

            if (useRunCodeTool) {
                // Tool-call path disabled for V0.1 — see comment above.
                // Code preserved for future re-enable.
            }

            log(`code/${finalKind} → mimeType=${mimeType} plan=${!!plan} rag=${!!ragSystemMessage} [pipeline]`);

            return {
                ...request,
                messages,
                tools: undefined,
                toolChoice: 'none',
                ...(resolvePrefill() !== undefined ? { prefill: resolvePrefill() } : {}),
                _meta: {
                    // Single-phase codegen for V0.1 — the preamble text phase
                    // was removed 2026-05-16 because V3.2 ignored its system
                    // prompt ("No code. No markdown") and emitted code anyway,
                    // producing a duplicate bubble of leaked code before the
                    // real artifact. Net : -1 model call, -2s latency, cleaner
                    // UI. The artifact renderer already shows a "fichier XYZ
                    // généré" pill so no courtesy sentence is needed.
                    pipeline: [
                        {
                            mode: 'artifact',
                            system: codeSystemContent,
                            mimeType,
                            kind: finalKind,
                        },
                    ],
                },
            };
        }

        // ── rag ─────────────────────────────────────────────────────────────
        case 'rag': {
            if (!rag) return bare();

            const ragResult = await rag.query(route.queryText);

            if (!ragResult || ragResult.chunks.length === 0) {
                const noContextMsg: AparteChatMessage = {
                    role: 'system',
                    content: 'The user has uploaded documents but no relevant excerpts were found for this specific question. Let the user know that their question does not match the content of the uploaded files, and suggest they rephrase or ask something more specific to the document.',
                };
                return {
                    ...request,
                    messages: [noContextMsg, ...request.messages],
                    tools: undefined,
                    toolChoice: 'none',
                    ...(resolvePrefill() !== undefined ? { prefill: resolvePrefill() } : {}),
                };
            }

            // Summaries preamble
            let summaryBlock = '';
            if (ragResult.summaries && Object.keys(ragResult.summaries).length > 0) {
                const lines = Object.entries(ragResult.summaries)
                    .map(([name, s]) => `• ${name}: ${s}`)
                    .join('\n');
                summaryBlock = `## Document Summaries\n${lines}\n\n`;
            }

            // Chunk citations with page, position, score
            const contextText = ragResult.chunks
                .map((c, i) => {
                    const score = ragResult.scores[i];
                    const parts: string[] = [`Source ${i + 1}: ${c.metadata['source'] ?? '?'}`];
                    if (c.metadata['page']) {
                        const pageInfo = c.metadata['totalPages']
                            ? `p.${c.metadata['page']}/${c.metadata['totalPages']}`
                            : `p.${c.metadata['page']}`;
                        parts.push(pageInfo);
                    } else if (c.metadata['positionPct'] !== undefined) {
                        parts.push(`~${Math.round(c.metadata['positionPct'] * 100)}%`);
                    }
                    if (score !== undefined) parts.push(`${Math.round(score * 100)}% match`);
                    return `[${parts.join(' | ')}]\n${c.text}`;
                })
                .join('\n\n---\n\n');

            const ragSystemMessage: AparteChatMessage = {
                role: 'system',
                content: `You have access to the following document context extracted from files the user uploaded. Use this context to answer the user's question accurately.\n\n${summaryBlock}## Relevant Excerpts\n${contextText}`,
            };

            return {
                ...request,
                messages: [ragSystemMessage, ...request.messages],
                tools: undefined,
                toolChoice: 'none',
                ...(resolvePrefill() !== undefined ? { prefill: resolvePrefill() } : {}),
            };
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-kind generation rules
// ────────────────────────────────────────────────────────────────────────────

export function generationRulesForKind(kind: ArtifactKind): string {
    switch (kind) {
        case 'react':
            return [
                '- Define ONE functional component named `App` (no imports — assume React, ReactDOM and Babel-standalone are already loaded in the host iframe).',
                '- Use only React 18 hooks (`useState`, `useEffect`, `useMemo`, `useReducer`, `useRef`, `useCallback`).',
                '- Render with Tailwind utility classes (Tailwind play CDN is preloaded). No custom <style> tags unless strictly needed.',
                '- The last line MUST be: `ReactDOM.createRoot(document.getElementById("root")).render(<App />);`',
                '- ABSOLUTELY NO fetch(), XHR, axios or any network call. Use hardcoded mock data instead.',
                '- ABSOLUTELY NO markdown fences (no ```). Output raw code only.',
            ].join('\n');
        case 'html':
            return [
                '- Output a complete `<!doctype html>` document.',
                '- Inline all CSS in a `<style>` tag and all JS in a `<script>` tag — no external files.',
                '- Tailwind CDN may be referenced via `https://cdn.tailwindcss.com` if needed.',
                '- No remote API calls.',
            ].join('\n');
        case 'svg':
            return [
                '- Output a single `<svg>` root element with explicit `viewBox` and `xmlns="http://www.w3.org/2000/svg"`.',
                '- No `<script>` tags inside the SVG.',
                '- Inline styles only.',
            ].join('\n');
        case 'js':
            return [
                '- Output a single self-contained JavaScript module/snippet — no imports.',
                '- The code must be runnable in a fresh iframe with `<script>` tag wrapping (the host adds it).',
                '- No remote network calls.',
            ].join('\n');
        case 'css':
            return [
                '- Output a single self-contained CSS stylesheet (no imports, no @import).',
                '- The host wraps it inside `<style>` of a demo page; assume a `<div class="demo">…</div>` exists.',
            ].join('\n');
        case 'text':
            return [
                '- Output plain text only — no markdown syntax, no HTML tags, no code fences.',
                '- Use natural line breaks; preserve any list structure as plain text.',
            ].join('\n');
        case 'markdown':
            return [
                '- Output a single complete Markdown document (CommonMark + GFM).',
                '- Use proper heading hierarchy (start at `#` for the document title).',
                '- No HTML except where strictly needed; prefer Markdown syntax.',
            ].join('\n');
        case 'json':
            return [
                '- Output a SINGLE syntactically valid JSON value (object or array).',
                '- No comments, no trailing commas, no leading prose.',
                '- Use 2-space indentation for readability.',
            ].join('\n');
        case 'csv':
            return [
                '- Output a single CSV table.',
                '- First line MUST be the header row.',
                '- Use commas as separators; quote fields containing commas, quotes or newlines.',
                '- No leading/trailing prose, no markdown.',
            ].join('\n');
        case 'python':
            return [
                '- Output a single self-contained Python script.',
                '- Use standard library or common third-party packages (e.g. reportlab, pandas, requests).',
                '- Include all necessary imports at the top.',
                '- No interactive input() calls; use hardcoded examples or argparse.',
                '- No leading/trailing prose, no markdown fences.',
            ].join('\n');
        case 'typescript':
            return [
                '- Output a single self-contained TypeScript file.',
                '- Include all necessary imports at the top.',
                '- Use explicit types where helpful.',
                '- No leading/trailing prose, no markdown fences.',
            ].join('\n');
        case 'bash':
            return [
                '- Output a single self-contained Bash script.',
                '- Start with `#!/usr/bin/env bash` and `set -euo pipefail`.',
                '- No leading/trailing prose, no markdown fences.',
            ].join('\n');
        case 'sql':
            return [
                '- Output valid SQL (ANSI compatible unless the user specifies a dialect).',
                '- Include CREATE TABLE statements if schema is needed.',
                '- No leading/trailing prose, no markdown fences.',
            ].join('\n');

        // ── Binary file kinds — output is JS code executed in a sandbox ─────
        case 'pdf':
            return [
                '- Output a JavaScript snippet — NO markdown fences, NO HTML, NO comments outside the code.',
                '- Globals AVAILABLE in scope: PDFDocument, StandardFonts, rgb, cmyk, grayscale, degrees, PageSizes (from pdf-lib).',
                '- DO NOT use `import` or `require` — the globals are already injected.',
                '- The code MUST be a series of statements ending with `return await doc.save();` (returns Uint8Array).',
                '- Use `await PDFDocument.create()` to start. Use `await pdfDoc.embedFont(StandardFonts.Helvetica)` for text.',
                '- Add pages via `pdfDoc.addPage([width, height])` (e.g. `PageSizes.A4`).',
                '- Draw text via `page.drawText(str, { x, y, size, font, color: rgb(r,g,b) })`.',
                '- NO fetch, NO network. Use only literal data the user provided.',
                '- The body is wrapped inside an async function — use `await` freely.',
            ].join('\n');
        case 'xlsx':
            return [
                '- Output a JavaScript snippet — NO markdown fences, NO HTML, NO prose.',
                '- Global AVAILABLE in scope: XLSX (the SheetJS module).',
                '- DO NOT use `import` or `require` — `XLSX` is already injected.',
                '- Build sheets with `XLSX.utils.aoa_to_sheet([[...]])` or `XLSX.utils.json_to_sheet([...])`.',
                '- Build a workbook with `XLSX.utils.book_new()` and `XLSX.utils.book_append_sheet(wb, ws, "SheetName")`.',
                '- The code MUST end with `return XLSX.write(wb, { type: "array", bookType: "xlsx" });` (returns Uint8Array).',
                '- NO fetch, NO network. Use only literal data the user provided.',
                '- The body is wrapped inside an async function — `await` is allowed but not required here.',
            ].join('\n');
        case 'docx':
            return [
                '- Output a JavaScript snippet — NO markdown fences, NO HTML, NO prose.',
                '- Globals AVAILABLE in scope: Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, ImageRun (from docx).',
                '- DO NOT use `import` or `require` — the globals are already injected.',
                '- Build a Document like: `const doc = new Document({ sections: [{ properties: {}, children: [ new Paragraph(...), ... ] }] });`',
                '- The code MUST end with `return await Packer.toBlob(doc);` (returns Blob, auto-converted).',
                '- NO fetch, NO network. Use only literal data the user provided.',
                '- The body is wrapped inside an async function — use `await` freely.',
            ].join('\n');
    }
}
