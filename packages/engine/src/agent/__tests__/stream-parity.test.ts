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

import { describe, it, expect, vi } from 'vitest';
import { AparteClient, AparteConfig, createStreamAdapter } from '@aparte/core';
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

/**
 * Deliver `events` ONE PER READ, parking on the gate after `at` of them.
 *
 * A `pull` source, not an eager `start`, and the difference decides what the test
 * measures. Enqueueing everything up front leaves the events buffered but UNREAD
 * when the abort lands, and core deliberately discards buffered events at that
 * point (a documented guard: late events would otherwise mutate a message that may
 * now belong to a different conversation). Engine's side is an async generator,
 * which is lazy by nature — so an eager stream here compares a buffered-and-
 * discarded core against a token-by-token engine and reports a divergence that is
 * the harness's, not the library's. Pull on both sides, and both have genuinely
 * consumed `at` events before the stop.
 */
function gatedReadable(events: AparteStreamEvent[], at: number, gate: Gate): ReadableStream<AparteStreamEvent> {
    let i = 0;
    return new ReadableStream({
        async pull(ctrl) {
            if (i === at) { gate.arrive(); await gate.wait; }
            if (i >= events.length) { ctrl.close(); return; }
            ctrl.enqueue(events[i++] as AparteStreamEvent);
        },
    });
}

async function* gatedIterable(events: StreamChatEvent[], at: number, gate: Gate): AsyncIterable<StreamChatEvent> {
    for (let i = 0; i < events.length; i++) {
        if (i === at) { gate.arrive(); await gate.wait; }
        yield events[i] as StreamChatEvent;
    }
}

interface Gate { wait: Promise<void>; reached: Promise<void>; arrive: () => void; open: () => void }

function newGate(): Gate {
    let open!: () => void;
    let arrive!: () => void;
    const wait = new Promise<void>(r => { open = r; });
    const reached = new Promise<void>(r => { arrive = r; });
    return { wait, reached, arrive, open };
}
async function* iterableOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

/** A config with the tools the scenarios use (search=HITL, save=plain). */
function makeConfig(streamFactory: (turn: number) => unknown, o: ParityOpts = { streams: [] }): AparteConfig {
    let ti = 0;
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.setTransport({ chat: async () => streamFactory(ti++) } as never);
    cfg.registerTool(
        {
            name: 'search', description: '', inputSchema: { type: 'object', properties: {} },
            needsApproval: true,
            ...(o.searchMaxTurns !== undefined ? { maxTurns: o.searchMaxTurns } : {}),
        } as never,
        (async () => ({ content: 'RESULT' })) as never,
    );
    // `save` is the knob for the missing-handler and tool-timeout scenarios.
    if (!o.withoutSave) {
        cfg.registerTool(
            { name: 'save', description: '', inputSchema: { type: 'object', properties: {} } } as never,
            (o.hangingSave ? HANGS : (async () => ({ content: 'SAVED' }))) as never,
        );
    }
    return cfg;
}

/**
 * A handler that never finishes on its own but DOES honour its signal, which is
 * the documented contract. Neither loop races the handler — both just await it —
 * so a handler that ignores its signal hangs both identically, and a test built on
 * one can only hang. This one lets the timeout be observed.
 */
const HANGS = (_call: unknown, signal: AbortSignal) => new Promise<never>((_, reject) => {
    const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
});

const makeToolLookup = (o: ParityOpts) => (n: string) =>
    n === 'search' ? (async () => ({ content: 'RESULT' }))
    : n === 'save' ? (o.withoutSave ? undefined : (o.hangingSave ? HANGS : (async () => ({ content: 'SAVED' }))))
    : undefined;

const makeToolConfigLookup = (o: ParityOpts) => (n: string) =>
    n === 'search'
        ? { needsApproval: true, ...(o.searchMaxTurns !== undefined ? { maxTurns: o.searchMaxTurns } : {}) }
        : undefined;

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
    /** Global turn ceiling — passed to the client option AND the runner option. */
    maxTurns?: number;
    /** Per-tool ceiling for `search`, applied to both sides' tool config. */
    searchMaxTurns?: number;
    /** Per-call tool timeout; pair with a handler that never resolves. */
    toolTimeoutMs?: number;
    /** Make the `save` handler hang forever, to exercise the timeout. */
    hangingSave?: boolean;
    /** Drop `save` from the lookups, to exercise the missing-handler exit. */
    withoutSave?: boolean;
    /** Both loops are expected to reject; the recorded calls are still compared. */
    expectThrow?: boolean;
    /**
     * Stop BOTH loops after this many events of the first stream have been
     * delivered. The stream parks at that point, each loop is aborted through its
     * own mechanism (`client.abort()` / the runner's signal), and only then is the
     * stream released — so the abort lands while the loop is genuinely mid-stream,
     * which is the state all three abort defects lived in.
     */
    abortAfter?: number;
}

/** Run the same script through the real _streamLoop and through runStreamAgent+adapter. */
async function captureParity(opts: ParityOpts): Promise<{ old: string[]; knew: string[]; oldUsage: unknown; newUsage: unknown; oldError?: string; newError?: string }> {
    const { streams, approve = true, meta, toolChoice } = opts;
    const baseReqExtras: Record<string, unknown> = {};
    if (meta) baseReqExtras['_meta'] = meta;
    if (toolChoice !== undefined) baseReqExtras['toolChoice'] = toolChoice;
    const artifactHint = meta?.['artifactHint'] as { mimeType: string; kind: string } | undefined;

    // A scenario may legitimately reject on BOTH sides (a provider `error` event).
    // The calls recorded up to that point still have to match, so the rejection is
    // captured rather than allowed to fail the test.
    const settle = async <T>(run: () => Promise<T>): Promise<{ value?: T; error?: string }> => {
        try {
            return { value: await run() };
        } catch (err) {
            if (!opts.expectThrow) throw err;
            return { error: (err as Error)?.message ?? String(err) };
        }
    };

    // ── OLD: drive the real _streamLoop directly (bypass _handleSend) ──
    let oti = 0;
    const oldGate = newGate();
    const oldCfg = makeConfig((turn) => (
        opts.abortAfter !== undefined && turn === 0
            ? gatedReadable(streams[oti++] ?? [], opts.abortAfter, oldGate)
            : readableOf(streams[oti++] ?? [])
    ), opts);
    const oldRec = makeRecorder();
    const oldClient = new AparteClient({
        config: oldCfg, autoRegister: false, targetResolver: () => oldRec.el,
        approvalResolver: async () => ({ approved: approve }),
        ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
        ...(opts.toolTimeoutMs !== undefined ? { toolTimeoutMs: opts.toolTimeoutMs } : {}),
    });
    const oldRun = settle(() =>
        (oldClient as unknown as { _streamLoop: (t: unknown, id: string, p: unknown, r: unknown, a: unknown) => Promise<unknown> })
            ._streamLoop(oldRec.el, 'assistant-1', oldCfg.getAIProvider('mock'), { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true, ...baseReqExtras }, 'k'));
    if (opts.abortAfter !== undefined) {
        await oldGate.reached;
        oldClient.abort();
        oldGate.open();
    }
    const oldOut = await oldRun;

    // ── NEW: runStreamAgent + the real core adapter against the same script ──
    const newRec = makeRecorder();
    const newAbort = new AbortController();
    const newGateRef = newGate();
    const adapter = createStreamAdapter({ target: newRec.el, config: oldCfg, messageId: 'assistant-1', artifactHint });
    let nti = 0;
    const newOut = settle(() => runStreamAgent({
        messageId: 'assistant-1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], ...baseReqExtras } as StreamChatRequest,
        transportCall: async () => {
            const turn = nti++;
            const evts = (streams[turn] ?? []) as unknown as StreamChatEvent[];
            return opts.abortAfter !== undefined && turn === 0
                ? gatedIterable(evts, opts.abortAfter, newGateRef)
                : iterableOf(evts);
        },
        toolLookup: makeToolLookup(opts),
        toolConfigLookup: makeToolConfigLookup(opts),
        approvalResolver: async () => ({ approved: approve }),
        emitter: adapter,
        signal: newAbort.signal,
        idGen: parityIdGen,
        ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
        ...(opts.toolTimeoutMs !== undefined ? { toolTimeoutMs: opts.toolTimeoutMs } : {}),
    }));
    if (opts.abortAfter !== undefined) {
        await newGateRef.reached;
        newAbort.abort();
        newGateRef.open();
    }
    const newSettled = await newOut;

    return {
        old: normalize(oldRec.calls), knew: normalize(newRec.calls),
        oldUsage: oldOut.value, newUsage: newSettled.value,
        oldError: oldOut.error, newError: newSettled.error,
    };
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

// ─── the exits, not just the happy paths ─────────────────────────────────────
//
// Every scenario above completes normally. The audit's point was that the seam's
// only behavioural evidence covered success: a consumer who injected the runner got
// a DIFFERENT library on every path that stops early, with no signal. These are
// those paths.

describe('runStreamAgent — parity on the paths that STOP', () => {
    it('a provider error event: both reject, with the same calls and the same message', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Partial ' },
                { type: 'error', message: 'upstream exploded' },
            ]],
            expectThrow: true,
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newError).toBe(r.oldError);
        expect(r.oldError).toContain('upstream exploded');
    });

    it('a tool with no handler stops the turn the same way', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Saving.' },
                { type: 'tool_use', id: 'c1', name: 'save', input: {} },
                { type: 'done' },
            ]],
            withoutSave: true,
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('the global turn ceiling stops both loops at the same point', async () => {
        // Each turn asks for another tool call, so only maxTurns bounds it.
        const loop = [
            { type: 'text', delta: 'again' },
            { type: 'tool_use', id: 'c1', name: 'save', input: {} },
            { type: 'done' },
        ] as never[];
        const r = await captureParity({ streams: [loop, loop, loop, loop], maxTurns: 2 });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('a per-tool turn ceiling stops both loops at the same point', async () => {
        const loop = [
            { type: 'text', delta: 'searching' },
            { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
            { type: 'done' },
        ] as never[];
        const r = await captureParity({ streams: [loop, loop, loop], searchMaxTurns: 1, approve: true });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });

    it('a stop mid-stream unwinds identically on both sides', async () => {
        // The path all three abort defects lived in: the loop is parked on its read
        // when the user presses Stop. The gate makes sure both loops are genuinely
        // mid-stream, not between turns, before each is aborted its own way.
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Partial ' },
                { type: 'text', delta: 'answer so far' },
                { type: 'text', delta: 'NEVER RENDERED' },
                { type: 'done' },
            ]],
            abortAfter: 2,
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);

        // And what the user is left with: the text that had arrived, no error.
        const rendered = r.old.join(String.fromCharCode(10));
        expect(rendered).toContain('answer so far');
        expect(rendered).not.toContain('"type":"error"');
        expect(rendered).not.toContain('aparte-message-error');
    });

    it('a tool that never resolves times out identically on both sides', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Saving.' },
                { type: 'tool_use', id: 'c1', name: 'save', input: {} },
                { type: 'done' },
            ]],
            hangingSave: true,
            toolTimeoutMs: 30,
        });
        expect(r.knew).toEqual(r.old);
        expect(r.newUsage).toEqual(r.oldUsage);
    });
});

describe('runStreamAgent — parity on WALKING AWAY from a live stream', () => {
    // The fix for the leaking vendor stream (`await reader.cancel()` before
    // releasing the lock) landed on ONE loop first. That is the forgotten-sibling
    // pattern the audit was about, so it gets a parity test rather than a unit
    // test on whichever loop happens to be in front of us.
    const harness = (cancel: () => void) => {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock',
            getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }],
            chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({
            chat: () =>
                new ReadableStream({
                    start(c) {
                        c.enqueue({ type: 'text', delta: 'hi' });
                        // A tool nothing handles → the loop stops and walks away
                        // WITHOUT having read to the end of the stream.
                        c.enqueue({ type: 'tool_use', id: 'c1', name: 'nope', input: {} });
                        c.enqueue({ type: 'done' });
                    },
                    cancel,
                }),
        } as never);
        const el = document.createElement('div');
        for (const m of [
            'updateMessage',
            'addSegment',
            'updateSegment',
            'typeName',
            'setUsage',
            'updateLastMessage',
        ]) {
            (el as unknown as Record<string, unknown>)[m] = () => {};
        }
        return { cfg, el };
    };

    const drive = async (opts: Record<string, unknown>): Promise<ReturnType<typeof vi.fn>> => {
        const cancel = vi.fn();
        const { cfg, el } = harness(cancel);
        const client = new AparteClient({ config: cfg, autoRegister: false, ...opts });
        await (
            client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> }
        )._streamTurn(el, 'a1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');
        return cancel;
    };

    it("core's inline loop cancels the vendor stream", async () => {
        expect(await drive({})).toHaveBeenCalled();
    });

    it('the injected runner cancels it too', async () => {
        expect(await drive({ streamRunner: runStreamAgent })).toHaveBeenCalled();
    });
});

describe('a streamed turn never writes a withheld prefix into `content`', () => {
    /**
     * The other half of the same bug, at its source. The loops had a branch that
     * wrote the raw delta whenever the parser reported no segments — which only
     * happens when it is holding an ambiguous prefix, because a real text delta
     * always leaves an active segment. So those characters were duplicated into
     * `content`, and history preferred that field.
     *
     * Asserted on BOTH loops: core's inline one and the injected runner.
     */
    const driveFenceOpening = async (streamRunner?: unknown): Promise<string[]> => {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({
            chat: () => new ReadableStream({
                start(c) {
                    c.enqueue({ type: 'text', delta: '```' });
                    c.enqueue({ type: 'text', delta: 'py\nprint(1)\n```' });
                    c.enqueue({ type: 'done' });
                    c.close();
                },
            }),
        } as never);

        const rawWrites: string[] = [];
        const el = document.createElement('div');
        for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'setUsage', 'appendMessage']) {
            (el as unknown as Record<string, unknown>)[m] = () => {};
        }
        (el as unknown as Record<string, unknown>).updateLastMessage = (text: string) => { rawWrites.push(text); };
        (el as unknown as Record<string, unknown>).getMessages = () => [];

        const client = new AparteClient({
            config: cfg, autoRegister: false, targetResolver: () => el as never,
            ...(streamRunner ? { streamRunner } : {}),
        } as never);
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'show me a snippet' } }),
        );
        return rawWrites;
    };

    it("core's inline loop never emits the bare fence as content", async () => {
        expect(await driveFenceOpening()).not.toContain('```');
    });

    it('the injected runner does not either', async () => {
        expect(await driveFenceOpening(runStreamAgent)).not.toContain('```');
    });
});

describe('parity on events and tags neither loop used to handle', () => {
    /**
     * An unrecognised event type used to break BOTH loops, differently: core threw
     * (`assertNever`), which replaced the reply the user was reading with an error
     * bubble; the engine's final branch had no discriminant, so it treated the event
     * as a tool call — a phantom `tool-start`/`tool-aborted` with an undefined name —
     * AND stopped processing the rest of the stream.
     *
     * Reachable on any provider/SDK skew: the ai-sdk mapper already drops
     * `source`/`file`/`abort` parts by design, so a new member is a normal event.
     */
    it('an unrecognised event is ignored by both, and the reply survives', async () => {
        const r = await captureParity({
            streams: [[
                { type: 'text', delta: 'Hi ' },
                { type: 'citation', url: 'x' },
                { type: 'text', delta: 'there' },
                { type: 'done' },
            ] as never[]],
        });
        expect(r.knew).toEqual(r.old);
        const rendered = r.old.join(String.fromCharCode(10));
        expect(rendered, 'the text after the unknown event must still arrive').toContain('there');
        expect(rendered, 'no error bubble').not.toContain('"status":"error"');
        expect(rendered, 'and no phantom tool call').not.toContain('tool-undefined');
    });

    /**
     * `aparte-message-aborted` and `aparte-tool-approval-request` used to leave the
     * engine path with no `targetId`. `aparte-composer._isForThisComposer` treats an
     * absent one as "for me" — on purpose, so a single-chat page needs no wiring — so
     * on a two-chat page stopping one chat reset the other's composer.
     *
     * The recorder element gets an `id` here on purpose: without one both paths emit
     * `undefined` and agree, which is exactly why the suite was blind to it.
     */
    it('an aborted turn carries targetId on both paths', async () => {
        const seen: Record<string, unknown[]> = { old: [], knew: [] };
        for (const which of ['old', 'knew'] as const) {
            const cfg = new AparteConfig();
            cfg.registerAIProvider({
                id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
                getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
            } as never);
            cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
            cfg.setKeyProvider(() => 'k');
            // A stream that parks after one delta, so the abort lands mid-flight.
            let release: null | (() => void) = null;
            const setRelease = (fn: () => void): void => { release = fn; };
            cfg.setTransport({
                chat: () => new ReadableStream({
                    async start(c) {
                        c.enqueue({ type: 'text', delta: 'hi' });
                        await new Promise<void>((r) => { setRelease(r); });
                        c.enqueue({ type: 'done' });
                        c.close();
                    },
                }),
            } as never);

            const el = document.createElement('div');
            el.id = 'chat-left';
            for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'setUsage', 'updateLastMessage', 'appendMessage']) {
                (el as unknown as Record<string, unknown>)[m] = () => {};
            }
            document.body.appendChild(el);
            // `aparte-message-aborted` specifically: `aparte-message-done` is
            // dispatched by the CLIENT on both paths, so it agreed either way and a
            // first version of this test passed with the bug still in place. The
            // adapter is what emits the aborted/approval events on the engine path.
            el.addEventListener('aparte-message-aborted', (e) => {
                seen[which]!.push((e as CustomEvent).detail);
            });

            const client = new AparteClient({
                config: cfg, autoRegister: false, targetResolver: () => el as never,
                ...(which === 'knew' ? { streamRunner: runStreamAgent } : {}),
            } as never);
            const turn = (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
                new CustomEvent('aparte-send', { detail: { content: 'go' } }),
            );
            // Let the first delta land, then stop the turn.
            await new Promise((r) => setTimeout(r, 0));
            (client as unknown as { abort: () => void }).abort();
            (release as null | (() => void))?.();
            await turn;
            el.remove();
        }
        for (const which of ['old', 'knew'] as const) {
            const first = seen[which]![0] as { targetId?: string } | undefined;
            expect(first?.targetId, `${which} path lost targetId`).toBe('chat-left');
        }
    });
});

describe('parity on a NON-STREAMING response', () => {
    /**
     * A transport may return a plain string — a buffering backend, a cached reply.
     * Core wrote it straight to `message.content` with no parsing, so the user saw
     * literal ``` fences and got no code, thinking or artifact segments; the engine
     * emitted it as a `text-delta` and the adapter parsed it properly. One response,
     * two different products depending on which loop was wired.
     *
     * The suite could not see it: its own "non-streaming" case still handed back a
     * ReadableStream.
     */
    it('both loops parse a string reply into segments', async () => {
        const reply = 'Sure, here:\n```js\nconsole.log(1)\n```\ndone';
        const rendered: Record<string, string[]> = { old: [], knew: [] };

        for (const which of ['old', 'knew'] as const) {
            const cfg = new AparteConfig();
            cfg.registerAIProvider({
                id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
                getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
            } as never);
            cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
            cfg.setKeyProvider(() => 'k');
            cfg.setTransport({ chat: async () => reply } as never);

            const el = document.createElement('div');
            for (const m of ['updateMessage', 'updateSegment', 'setUsage', 'updateLastMessage', 'appendMessage']) {
                (el as unknown as Record<string, unknown>)[m] = () => {};
            }
            (el as unknown as Record<string, unknown>).addSegment = (seg: { type: string; language?: string; content?: string }) => {
                rendered[which]!.push(`${seg.type}:${seg.language ?? ''}:${(seg.content ?? '').trim()}`);
            };
            (el as unknown as Record<string, unknown>).getMessages = () => [];

            const client = new AparteClient({
                config: cfg, autoRegister: false, targetResolver: () => el as never,
                ...(which === 'knew' ? { streamRunner: runStreamAgent } : {}),
            } as never);
            await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
                new CustomEvent('aparte-send', { detail: { content: 'go' } }),
            );
        }

        for (const which of ['old', 'knew'] as const) {
            const joined = rendered[which]!.join(' | ');
            expect(joined, `${which} produced no segments at all`).not.toBe('');
            expect(joined, `${which} did not parse the code fence`).toContain('code:js:console.log(1)');
        }
    });
});

describe('parity on a whole <artifact> in ONE delta', () => {
    /**
     * Both loops parked the tail in `scanBuf` and cleared `remaining`, which ended
     * their loop before the buffered tag could be read. The outcomes differed, and
     * both were wrong: core dropped the artifact AND the prose after the closing tag
     * entirely; the engine's `finalize()` handed the buffer back as raw chat text, so
     * the artifact rendered as a literal `<artifact …>` tag.
     *
     * Reachable from a non-SSE backend transport, a buffering provider, or
     * `injectTokenStream`. The suite's own artifactXml scenario splits the tag across
     * two deltas, so it stepped past this by exactly one delta boundary.
     */
    it('both loops build the artifact and keep the trailing text', async () => {
        const whole = 'Here you go: <artifact mimeType="text/html" title="Page"><h1>Hi</h1></artifact> Enjoy!';
        const r = await captureParity({
            streams: [[{ type: 'text', delta: whole }, { type: 'done' }] as never[]],
            // Same switch the existing artifactXml scenario uses: the mode is a
            // request `_meta` hint, not a client option.
            meta: { artifactXml: { mimeType: 'text/html', kind: 'html' } },
        });
        expect(r.knew).toEqual(r.old);
        const rendered = r.old.join(String.fromCharCode(10));
        expect(rendered, 'the artifact segment must exist').toContain('"type":"artifact"');
        expect(rendered, 'with the declared mimeType, not a guessed one').toContain('text/html');
        expect(rendered, 'and the prose after the closing tag must survive').toContain('Enjoy!');
        expect(rendered, 'the tag must not render as literal text').not.toContain('&lt;artifact');
    });
});
