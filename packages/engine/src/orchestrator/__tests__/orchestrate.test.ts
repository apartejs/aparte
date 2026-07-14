import { describe, it, expect } from 'vitest';
import {
    orchestrate,
    generationRulesForKind,
    ARTIFACT_MIME,
    CONTENT_DRIVEN_KINDS,
    type RagAdapter,
} from '../orchestrate';
import { isBinaryFileKind, type ArtifactKind, type OrchestratorContext, type OrchestratorRoute } from '../routes';

const ALL_KINDS: ArtifactKind[] = [
    'react', 'html', 'js', 'css', 'svg', 'text', 'markdown', 'json',
    'csv', 'python', 'typescript', 'bash', 'sql', 'pdf', 'xlsx', 'docx',
];

const ctx = (over: Partial<OrchestratorContext> = {}): OrchestratorContext => ({
    userMessage: 'hi', modelId: 'm', hasDocuments: false, ...over,
});
// Minimal request; orchestrate only reads/spreads these fields.
const req = (over: Record<string, unknown> = {}): any => ({
    messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 't' }], toolChoice: 'auto', ...over,
});

describe('constant maps', () => {
    it('ARTIFACT_MIME covers every ArtifactKind', () => {
        for (const k of ALL_KINDS) expect(ARTIFACT_MIME[k]).toBeTruthy();
    });
    it('CONTENT_DRIVEN_KINDS is a subset of the kinds and excludes react/html/svg', () => {
        for (const k of CONTENT_DRIVEN_KINDS) expect(ALL_KINDS).toContain(k);
        expect(CONTENT_DRIVEN_KINDS.has('react')).toBe(false);
        expect(CONTENT_DRIVEN_KINDS.has('markdown')).toBe(true);
    });
    it('isBinaryFileKind flags exactly pdf/xlsx/docx', () => {
        expect(isBinaryFileKind('pdf')).toBe(true);
        expect(isBinaryFileKind('xlsx')).toBe(true);
        expect(isBinaryFileKind('docx')).toBe(true);
        expect(isBinaryFileKind('markdown')).toBe(false);
    });
});

describe('generationRulesForKind', () => {
    it('returns non-empty rules for every kind', () => {
        for (const k of ALL_KINDS) expect(generationRulesForKind(k).length).toBeGreaterThan(0);
    });
    it('encodes the key constraint per kind', () => {
        expect(generationRulesForKind('react')).toContain('ReactDOM.createRoot');
        expect(generationRulesForKind('json')).toMatch(/valid JSON/i);
        expect(generationRulesForKind('pdf')).toContain('PDFDocument');
        expect(generationRulesForKind('xlsx')).toContain('XLSX');
        expect(generationRulesForKind('bash')).toContain('#!/usr/bin/env bash');
    });
});

describe('orchestrate — routing', () => {
    it("'direct' strips tools and applies the skip-think prefill", async () => {
        const out = await orchestrate({
            request: req(), route: { type: 'direct' }, rag: null,
            ctx: ctx({ capabilities: { skipThinkingPrefill: '</think>\n\n' } }),
        });
        expect(out.tools).toBeUndefined();
        expect(out.toolChoice).toBe('none');
        expect(out.prefill).toBe('</think>\n\n');
    });

    it("'direct' adds no prefill when the model has no skippable thinking", async () => {
        const out = await orchestrate({ request: req(), route: { type: 'direct' }, rag: null, ctx: ctx() });
        expect(out.prefill).toBeUndefined();
    });

    it("'clarify' forces a synthetic ask_question tool call", async () => {
        const route: OrchestratorRoute = {
            type: 'clarify', question: 'Which?', options: [{ title: 'a' }, { title: 'b' }], multiple: true,
        };
        const out = await orchestrate({ request: req(), route, rag: null, ctx: ctx() });
        expect(out.toolChoice).toEqual({
            name: 'ask_question',
            input: { question: 'Which?', options: [{ title: 'a' }, { title: 'b' }], multiple: true },
        });
    });

    it("'rag' injects a document-context system message when chunks are found", async () => {
        const rag: RagAdapter = {
            query: async () => ({
                chunks: [{ text: 'the answer is 42', metadata: { source: 'doc.pdf', page: 3 } }],
                scores: [0.87],
            }),
        };
        const out = await orchestrate({ request: req(), route: { type: 'rag', queryText: 'q' }, rag, ctx: ctx({ hasDocuments: true }) });
        const sys = out.messages[0];
        expect(sys.role).toBe('system');
        expect(sys.content).toContain('the answer is 42');
        expect(sys.content).toContain('doc.pdf');
        expect(out.tools).toBeUndefined();
    });

    it("'rag' explains the miss when no chunks match", async () => {
        const rag: RagAdapter = { query: async () => ({ chunks: [], scores: [] }) };
        const out = await orchestrate({ request: req(), route: { type: 'rag', queryText: 'q' }, rag, ctx: ctx({ hasDocuments: true }) });
        expect(out.messages[0].content).toMatch(/no relevant excerpts|does not match/i);
    });

    it("'code' with a content-driven kind builds an artifact pipeline without the planner", async () => {
        const out = await orchestrate({
            request: req(), route: { type: 'code', description: 'a report', artifactType: 'markdown' }, rag: null, ctx: ctx(),
        });
        expect(out.tools).toBeUndefined();
        expect(out.toolChoice).toBe('none');
        const pipeline = (out._meta as any).pipeline;
        expect(pipeline).toHaveLength(1);
        expect(pipeline[0].mode).toBe('artifact');
        expect(pipeline[0].mimeType).toBe(ARTIFACT_MIME.markdown);
        expect(pipeline[0].kind).toBe('markdown');
    });
});
