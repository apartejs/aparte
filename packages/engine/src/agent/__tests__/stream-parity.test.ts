// @vitest-environment jsdom
//
// PARITY — `runStreamAgent` + the REAL core adapter reproduce `_streamLoop`.
//
// Drives the actual `AparteClient._streamLoop` (from @aparte/core) against a scripted
// transport with a recorder targetElement, capturing its exact call sequence.
// Then runs `runStreamAgent` (this package) + `createStreamAdapter` (@aparte/core —
// the production adapter, NOT a throwaway) against the SAME script, and asserts
// the two recorded sequences are identical (segment uuids normalized by
// first-appearance index so identity relationships are preserved).
//
// The engine drives the DOM-coupled `_streamLoop`, so this test runs in jsdom;
// `runStreamAgent` itself stays pure-Node (stream-run.test.ts). Engine → core is
// the allowed dependency direction (core never imports engine), so the parity
// test lives here and imports the core adapter.

import { describe, it, expect } from 'vitest';
import { AparteClient, AparteConfigClass, createStreamAdapter } from '@aparte/core';
import type { AparteStreamEvent } from '@aparte/core';
import { runStreamAgent } from '../stream-run';
import type { StreamChatEvent, StreamChatRequest } from '../stream-events';

// ─── recorder targetElement ──────────────────────────────────────────────────

type Call = { m: string; args: unknown[] };

function makeRecorder(): { el: HTMLElement; calls: Call[] } {
    const el = document.createElement('div');
    const calls: Call[] = [];
    const methods = ['appendMessage', 'updateMessage', 'updateLastMessage', 'addSegment', 'updateSegment', 'removeSegment', 'typeName', 'setUsage'];
    for (const m of methods) (el as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => { calls.push({ m, args }); };
    (el as unknown as Record<string, unknown>)['getMessages'] = () => [];
    const orig = el.dispatchEvent.bind(el);
    el.dispatchEvent = (ev: Event) => { calls.push({ m: 'dispatchEvent', args: [{ type: ev.type, detail: (ev as CustomEvent).detail }] }); return orig(ev); };
    return { el, calls };
}

/** Normalize to strings, remapping every uuid (wherever it appears in an id) to a
 *  stable first-appearance index so old/new differ only by uuid, not structure. */
function normalize(calls: Call[]): string[] {
    const idMap = new Map<string, string>();
    let n = 0;
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const remap = (s: string) => s.replace(UUID, (full) => {
        if (!idMap.has(full)) idMap.set(full, `#${n++}`);
        return idMap.get(full)!;
    });
    return calls.map(c => `${c.m} ${remap(JSON.stringify(c.args))}`);
}

// ─── transport plumbing ──────────────────────────────────────────────────────

function readableOf(events: AparteStreamEvent[]): ReadableStream<AparteStreamEvent> {
    return new ReadableStream({ start(ctrl) { for (const e of events) ctrl.enqueue(e); ctrl.close(); } });
}
async function* iterableOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

/** A config with the tools the scenarios use (search=HITL, save=plain). */
function makeConfig(streamFactory: (turn: number) => unknown): AparteConfigClass {
    let ti = 0;
    const cfg = new AparteConfigClass();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.setTransport({ chat: async () => streamFactory(ti++) } as never);
    cfg.registerTool({ name: 'search', description: '', parameters: { type: 'object', properties: {} }, needsApproval: true } as never, (async () => ({ content: 'RESULT' })) as never);
    cfg.registerTool({ name: 'save', description: '', parameters: { type: 'object', properties: {} } } as never, (async () => ({ content: 'SAVED' })) as never);
    return cfg;
}

const toolLookup = (n: string) =>
    n === 'search' ? (async () => ({ content: 'RESULT' }))
    : n === 'save' ? (async () => ({ content: 'SAVED' }))
    : undefined;
const toolConfigLookup = (n: string) => (n === 'search' ? { needsApproval: true } : undefined);

// `_streamLoop` prefixes artifact ids (`artifact-raw-<uuid>`) but mints a BARE
// uuid for the synthetic tool call (`tool-<uuid>`). Match that per-type so the
// normalized structures line up; every uuid then collapses to `#n`.
const parityIdGen = (prefix: string): string =>
    prefix === 'synthetic-tool' ? crypto.randomUUID() : `${prefix}-${crypto.randomUUID()}`;

interface ParityOpts {
    streams: AparteStreamEvent[][];
    approve?: boolean;
    meta?: Record<string, unknown>;
    toolChoice?: unknown;
}

/** Run the same script through the real _streamLoop and through runStreamAgent+adapter. */
async function captureParity(opts: ParityOpts): Promise<{ old: string[]; knew: string[]; oldUsage: unknown; newUsage: unknown }> {
    const { streams, approve = true, meta, toolChoice } = opts;
    const baseReqExtras: Record<string, unknown> = {};
    if (meta) baseReqExtras['_meta'] = meta;
    if (toolChoice !== undefined) baseReqExtras['toolChoice'] = toolChoice;
    const artifactHint = meta?.['artifactHint'] as { mimeType: string; kind: string } | undefined;

    // ── OLD: drive the real _streamLoop directly (bypass _handleSend) ──
    let oti = 0;
    const oldCfg = makeConfig(() => readableOf(streams[oti++] ?? []));
    const oldRec = makeRecorder();
    const oldClient = new AparteClient({ config: oldCfg, autoRegister: false, targetResolver: () => oldRec.el, approvalResolver: async () => ({ approved: approve }) });
    const oldUsage = await (oldClient as unknown as { _streamLoop: (t: unknown, id: string, p: unknown, r: unknown, a: unknown) => Promise<unknown> })
        ._streamLoop(oldRec.el, 'assistant-1', oldCfg.getAIProvider('mock'), { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true, ...baseReqExtras }, 'k');

    // ── NEW: runStreamAgent + the real core adapter against the same script ──
    const newRec = makeRecorder();
    const adapter = createStreamAdapter({ target: newRec.el, config: oldCfg, messageId: 'assistant-1', artifactHint });
    let nti = 0;
    const newUsage = await runStreamAgent({
        messageId: 'assistant-1',
        baseRequest: { messages: [{ role: 'user', content: 'hi' }], ...baseReqExtras } as StreamChatRequest,
        transportCall: async () => iterableOf((streams[nti++] ?? []) as unknown as StreamChatEvent[]),
        toolLookup,
        toolConfigLookup,
        approvalResolver: async () => ({ approved: approve }),
        emitter: adapter,
        signal: new AbortController().signal,
        idGen: parityIdGen,
    });

    return { old: normalize(oldRec.calls), knew: normalize(newRec.calls), oldUsage, newUsage };
}

describe('runStreamAgent — call-sequence parity with real _streamLoop', () => {
    it('thinking → text → HITL tool (approved) → text → done', async () => {
        const r = await captureParity({ streams: [
            [{ type: 'thinking', delta: 'Th' }, { type: 'thinking', delta: 'ink' }, { type: 'text', delta: 'Hello world' }, { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Done.' }, { type: 'done', usage: { inputTokens: 9, outputTokens: 3 } }],
        ], approve: true });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('text → HITL tool (rejected) stops the loop identically', async () => {
        const r = await captureParity({ streams: [
            [{ type: 'text', delta: 'Trying a tool.' }, { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } }, { type: 'done' }],
        ], approve: false });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('plain text, no tools, single turn', async () => {
        const r = await captureParity({ streams: [
            [{ type: 'text', delta: 'Just ' }, { type: 'text', delta: 'answering.' }, { type: 'done', usage: { inputTokens: 4, outputTokens: 2 } }],
        ] });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('artifactRaw mode — whole stream into one artifact', async () => {
        const r = await captureParity({
            streams: [[{ type: 'text', delta: 'const ' }, { type: 'text', delta: 'x = 1;' }, { type: 'done', usage: { inputTokens: 3, outputTokens: 4 } }]],
            meta: { artifactRaw: { mimeType: 'text/javascript', kind: 'js' } },
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('create_artifact built-in — one-shot artifact then reply', async () => {
        const r = await captureParity({ streams: [
            [{ type: 'tool_use', id: 'c1', name: 'create_artifact', input: { mimeType: 'text/html', title: 'Page', content: '<h1>Hi</h1>' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Made it.' }, { type: 'done' }],
        ] });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('multi-phase pipeline — two text phases with a pipeline-waiting segment', async () => {
        const r = await captureParity({
            streams: [
                [{ type: 'text', delta: 'reply1' }, { type: 'done' }],
                [{ type: 'text', delta: 'reply2' }, { type: 'done', usage: { inputTokens: 4, outputTokens: 4 } }],
            ],
            meta: { pipeline: [{ mode: 'text', system: 'PHASE1' }, { mode: 'text', system: 'PHASE2' }] },
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('synthetic toolChoice bypass — forced tool then reply', async () => {
        const r = await captureParity({
            streams: [[{ type: 'text', delta: 'Saved.' }, { type: 'done', usage: { inputTokens: 2, outputTokens: 1 } }]],
            toolChoice: { name: 'save', input: { path: '/a' } },
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('artifactXml mode — inline <artifact> tags split from chat text', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Here: <artifact mimeType="text/html" title="Page">' },
                { type: 'text', delta: '<h1>Hi</h1></artifact> done' },
                { type: 'done', usage: { inputTokens: 5, outputTokens: 6 } },
            ]],
            meta: { artifactXml: { mimeType: 'text/html', kind: 'html' } },
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('artifactHint mode — first code fence promoted to an artifact', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: '```html\n' },
                { type: 'text', delta: '<h1>Hi</h1>\n' },
                { type: 'text', delta: '```' },
                { type: 'done' },
            ]],
            meta: { artifactHint: { mimeType: 'text/html', kind: 'html' } },
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });
});
