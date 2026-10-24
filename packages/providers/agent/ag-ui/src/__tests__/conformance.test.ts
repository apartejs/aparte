/**
 * The AG-UI conformance corpus, replayed through `createAgUiRunner`.
 *
 * `conformance/streams` is the protocol's own fixture set (see `conformance/README.md`):
 * one event stream each, and what the specification requires of a client consuming it.
 * They were written for clients that hold the run's messages and state; a runner hands
 * aparté run events to `AparteClient` instead. So this file translates, and says so:
 *
 *   - `outcome` — `completed` when the runner did not reject the stream; a producer's
 *     own `RUN_ERROR` is not a rejection (`runError` pins it).
 *   - `errorContains` — the reference client's wording; ours is `REJECTIONS` below.
 *   - `messages` / `messageCount` — rebuilt from the run events the runner emitted.
 *   - `state` — read from the next request the runner sends on the same thread.
 *   - `request` / `requestAbsentPaths` — the RunAgentInput it sent.
 *   - `warnings` / `noWarnings` — what reached `onWarning`.
 *
 * What a runner cannot observe is listed with its reason in `UNOBSERVABLE_KEYS` and
 * `UNOBSERVABLE_MESSAGE_KEYS`, never skipped silently, and every fixture must keep at
 * least one assertion beyond `outcome` on this lane.
 */
import { describe, it, expect } from 'vitest';
import { AparteError } from '@aparte/core';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

interface Fixture {
    name: string;
    area: string;
    description: string;
    client?: { maxProtocolVersion?: string };
    input?: { messages?: Record<string, unknown>[]; tools?: { name: string; description?: string; parameters?: unknown }[] };
    stream: Record<string, unknown>[];
    expect: Record<string, unknown>;
}

const files = import.meta.glob<Fixture>('./conformance/streams/*.json', { eager: true, import: 'default' });
const manifest = import.meta.glob<string>('./conformance/streams/MANIFEST.txt', { eager: true, query: '?raw', import: 'default' });
const fixtures = Object.values(files).sort((a, b) => a.name.localeCompare(b.name));

/** Keys a runner has no way to observe, and why. */
const UNOBSERVABLE_KEYS: Record<string, string> = {
    eventTypes: 'a runner hands aparté run events to the client, not AG-UI events: there is no AG-UI event list delivered to application code',
    eventTypesAbsent: 'same: no AG-UI event list is delivered to application code',
    eventPaths: 'same: the values inside delivered AG-UI events are not exposed',
    eventAbsentPaths: 'same: the values inside delivered AG-UI events are not exposed',
};

/** Message fields a runner does not carry: core keys messages and attributes them its own way. */
const UNOBSERVABLE_MESSAGE_KEYS: Record<string, string> = {
    id: 'core mints its own message ids; the AG-UI messageId does not reach a run event, and aparté history carries none to send',
    subagentRunId: 'subagent attribution is not drawn yet (rendering subagents is a MAY, and comes with the agentic lot)',
    metadata: 'run events carry no message or tool-call metadata: nothing in aparté reads it',
};

/**
 * Fixtures whose observable is something aparté does not draw yet. The keys named are
 * not asserted; what is left — at least that the stream is accepted — still is.
 */
const NOT_DRAWN: Record<string, { keys: string[]; reason: string }> = {
    'activity-snapshot-then-delta': { keys: ['messages', 'messageCount'], reason: 'ACTIVITY_* messages are drawn with the agentic lot (steps, subagents, activity)' },
    'activity-replace-false-preserves': { keys: ['messages', 'messageCount'], reason: 'ACTIVITY_* messages are drawn with the agentic lot' },
    'messages-snapshot-reconciles-by-id': { keys: ['messages', 'messageCount'], reason: 'MESSAGES_SNAPSHOT would rewrite messages already drawn, which needs a core seam a runner does not have' },
    'unknown-part-in-message-list': { keys: ['messages', 'messageCount'], reason: 'the message arrives in a MESSAGES_SNAPSHOT, which is not applied (see messages-snapshot-reconciles-by-id)' },
};

/** Fixtures left with nothing but `outcome` on this lane, and why that is still worth running. */
const OUTCOME_ONLY: Record<string, string> = {
    'activity-replace-false-preserves': 'the runner must still accept a stream carrying activities',
    'messages-snapshot-reconciles-by-id': 'the runner must still accept a stream carrying a messages snapshot',
};

/**
 * Where the reference client's expectation contradicts the specification, and we follow
 * the specification. The corpus README asks a third-party lane to relax exactly this.
 */
const OVERRIDES: Record<string, { intentional: string } & Record<string, unknown>> = {
    'unknown-enum-value-role-fatal': {
        intentional: 'the fixture pins an ADMITTED GAP of the reference client (it rejects an unknown role); the specification says an unrecognised member of a closed set is stripped, and this runner follows the specification',
        outcome: 'completed',
        warnings: ['/role'],
        messageCount: 1,
        messages: [{ role: 'assistant', content: 'the role above is the only defect in this stream' }],
    },
};

/**
 * Our reason for each stream the specification requires a client to reject. The
 * fixture's `errorContains` is the reference client's wording; this is ours, so the
 * lane still says WHICH rejection happened rather than accepting any.
 */
const REJECTIONS: Record<string, string> = {
    'first-event-not-run-started-fatal': 'the first event must be RUN_STARTED',
    'nested-run-started-fatal': 'RUN_STARTED while a run is still active',
    'event-after-run-finished-fatal': 'after the run finished',
    'open-message-at-run-finished-fatal': 'still running at RUN_FINISHED',
    'run-finished-with-active-subagent-fatal': 'subagent "s-run-finished-active-subagent-1" still running at RUN_FINISHED',
    'content-without-start-fatal': 'no open text message has that id',
    'reasoning-discipline-verified': 'no open reasoning message has that id',
    'reasoning-message-wrong-role-fatal': 'only role "reasoning" is allowed',
    'first-chunk-missing-id-fatal': 'the first TEXT_MESSAGE_CHUNK of a stream needs a messageId',
    'custom-closes-chunk-stream-fatal': 'the first TEXT_MESSAGE_CHUNK of a stream needs a messageId',
    'first-tool-chunk-missing-name-fatal': 'the first TOOL_CALL_CHUNK of a call needs a toolCallId and a toolCallName',
    'chunk-conflicting-role-fatal': 'changes its role',
    'chunk-conflicting-tool-name-fatal': 'changes its toolCallName',
    'malformed-known-field-fatal': '"delta" must be a string',
    'step-finished-without-start-fatal': 'which was not started',
    'subagent-finished-unstarted-fatal': 'subagent "s-subagent-finished-unstarted-1", which was not started',
    'subagent-started-missing-name-fatal': 'needs a name',
    'subagent-attribution-mismatch-fatal': 'started attributed to',
    'unknown-outcome-array-fatal': 'RUN_FINISHED.outcome must be an object',
};

/**
 * The ratchet: fixtures this runner does not pass YET, by the family of the change that
 * will make them pass. Each runs as `it.fails`, so a fix that makes one pass turns it red
 * until it leaves this list — the list can only shrink, and never silently.
 */
const KNOWN_GAPS: Record<string, string> = {
};

/**
 * aparté's history for a fixture's `input.messages`, which are AG-UI messages. Text and
 * images carry over; a legacy `binary` part becomes the image it is, since aparté's
 * history has no binary part — so the upgrade the reference client performs on the way
 * out has already happened on the way in, and what this lane checks is that the runner
 * sends aparté's images as AG-UI 1.0 image parts. Message ids and attribution have no
 * place in aparté's history (see UNOBSERVABLE_MESSAGE_KEYS).
 */
function historyOf(fixture: Fixture): { role: string; content: unknown }[] {
    return (fixture.input?.messages ?? []).map((m) => {
        const content = m['content'];
        if (!Array.isArray(content)) return { role: String(m['role']), content: typeof content === 'string' ? content : '' };
        const parts = content.flatMap((part: Record<string, unknown>) => {
            if (part['type'] === 'text') return [{ type: 'text', text: part['text'] }];
            const source = part['source'] as { type?: string; value?: string; mimeType?: string } | undefined;
            if (part['type'] === 'image' && source?.type === 'url') return [{ type: 'image', image: source.value, mimeType: source.mimeType }];
            if (part['type'] === 'image' && source?.type === 'data') return [{ type: 'image', image: `data:${source.mimeType};base64,${source.value}`, mimeType: source.mimeType }];
            if (part['type'] === 'binary' && typeof part['url'] === 'string') return [{ type: 'image', image: part['url'], mimeType: part['mimeType'] }];
            return [];
        });
        return { role: String(m['role']), content: parts };
    });
}

/** The messages a client would hold after the run, rebuilt from the runner's events. */
function messagesOf(fixture: Fixture, events: { type: string; [key: string]: unknown }[]): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = (fixture.input?.messages ?? []).map((m) => ({ ...m }));
    let reasoning: Record<string, unknown> | undefined;
    let assistant: Record<string, unknown> | undefined;
    const assistantNow = (): Record<string, unknown> => {
        if (!assistant) { assistant = { role: 'assistant', content: '' }; out.push(assistant); }
        return assistant;
    };
    for (const e of events) {
        switch (e.type) {
            case 'run-start':
            case 'turn-start':
                reasoning = undefined;
                assistant = undefined;
                break;
            case 'thinking-delta':
                if (!reasoning) { reasoning = { role: 'reasoning', content: '' }; out.push(reasoning); }
                reasoning['content'] += String(e['delta']);
                break;
            case 'text-delta':
                assistantNow()['content'] += String(e['delta']);
                break;
            case 'tool-start': {
                const message = assistantNow();
                const calls = (message['toolCalls'] ??= []) as unknown[];
                calls.push({ id: e['toolCallId'], type: 'function', function: { name: e['name'], arguments: JSON.stringify(e['input']) } });
                break;
            }
            case 'tool-resolved':
            case 'tool-failed':
                // A result in parts keeps them as the structured result; its text is what the model reads.
                out.push({ role: 'tool', toolCallId: e['toolCallId'], content: e['structuredResult'] ?? e['result'] ?? e['error'] });
                assistant = undefined;
                break;
        }
    }
    return out;
}

/** Subset match, as the corpus defines it: arrays the same length, objects on the keys named. */
function subset(actual: unknown, expected: unknown, path: string, problems: string[], dropKeys: Record<string, string> = {}): void {
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || actual.length !== expected.length) {
            problems.push(`${path}: expected ${expected.length} item(s), got ${Array.isArray(actual) ? actual.length : JSON.stringify(actual)}`);
            return;
        }
        expected.forEach((item, i) => subset(actual[i], item, `${path}[${i}]`, problems, dropKeys));
        return;
    }
    if (expected && typeof expected === 'object') {
        if (!actual || typeof actual !== 'object') { problems.push(`${path}: expected an object, got ${JSON.stringify(actual)}`); return; }
        for (const [key, value] of Object.entries(expected)) {
            if (key in dropKeys) continue;
            subset((actual as Record<string, unknown>)[key], value, `${path}.${key}`, problems, dropKeys);
        }
        return;
    }
    if (actual !== expected) problems.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sse = (events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

/** Replay one fixture; return what the runner showed. */
async function replay(fixture: Fixture) {
    const bodies: Record<string, unknown>[] = [];
    const responses = [sse(fixture.stream), sse([
        { type: 'RUN_STARTED', threadId: 'conformance', runId: 'after', protocolVersion: '1.0' },
        { type: 'RUN_FINISHED', threadId: 'conformance', runId: 'after' },
    ])];
    const fetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return responses.shift()!;
    }) as unknown as typeof globalThis.fetch;
    const warnings: string[] = [];
    const runner = createAgUiRunner({
        endpoint: '/agui',
        fetch,
        threadId: 'conformance',
        onWarning: (message: string) => { warnings.push(message); },
        ...(fixture.client?.maxProtocolVersion ? { peerProtocolVersion: fixture.client.maxProtocolVersion } : {}),
    } as Parameters<typeof createAgUiRunner>[0]);
    const runOnce = async (history: { role: string; content: unknown }[]) => {
        const events: { type: string; [key: string]: unknown }[] = [];
        let error: unknown;
        try {
            await runner({
                messageId: 'm',
                providerId: 'agent',
                baseRequest: {
                    messages: history,
                    modelId: 'agent',
                    stream: true,
                    ...(fixture.input?.tools ? { tools: fixture.input.tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.parameters ?? { type: 'object' } })) } : {}),
                },
                transportCall: async () => { throw new Error('never called'); },
                toolLookup: () => undefined,
                emitter: (e: { type: string }) => { events.push(e as { type: string; [key: string]: unknown }); },
                signal: new AbortController().signal,
            } as unknown as AparteStreamRunOptions);
        } catch (e) {
            error = e;
        }
        return { events, error };
    };
    const first = await runOnce(historyOf(fixture));
    // The state the runner keeps for the thread is what it sends on the next run.
    await runOnce([{ role: 'user', content: 'next' }]);
    const rejected = first.error instanceof AparteError && (first.error.data as { agUi?: string } | undefined)?.agUi === 'malformed';
    const runError = first.error instanceof AparteError && (first.error.data as { agUi?: string } | undefined)?.agUi === 'run-error';
    if (first.error && !rejected && !runError) throw first.error;   // a bug, not a verdict
    return {
        rejected,
        error: first.error as AparteError | undefined,
        runError,
        messages: messagesOf(fixture, first.events),
        request: bodies[0],
        nextState: bodies[1]?.['state'],
        warnings,
    };
}

function getPath(value: unknown, dotted: string): unknown {
    return dotted.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), value);
}

describe('AG-UI conformance corpus', () => {
    it('holds every fixture its manifest lists, and nothing else', () => {
        const listed = Object.values(manifest)[0]!.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        const present = Object.keys(files).map((f) => f.split('/').pop()!).sort();
        expect(present).toEqual([...listed].sort());
        expect(present.length).toBeGreaterThanOrEqual(68);
    });

    it('lists only fixtures that exist, and a reason wherever it relaxes one', () => {
        const names = new Set(fixtures.map((f) => f.name));
        for (const list of [NOT_DRAWN, OUTCOME_ONLY, OVERRIDES, REJECTIONS, KNOWN_GAPS]) {
            for (const name of Object.keys(list)) expect(names.has(name), `${name} is not a fixture`).toBe(true);
        }
        for (const [name, o] of Object.entries(OVERRIDES)) expect(o.intentional, name).toBeTruthy();
    });

    for (const fixture of fixtures) {
        const gap = KNOWN_GAPS[fixture.name];
        (gap ? it.fails : it)(`${fixture.area} · ${fixture.name}${gap ? ` (known gap: ${gap})` : ''}`, async () => {
            const { intentional: _intentional, ...override } = OVERRIDES[fixture.name] ?? { intentional: '' };
            const notDrawn = new Set(NOT_DRAWN[fixture.name]?.keys ?? []);
            const e = Object.fromEntries(Object.entries({ ...fixture.expect, ...override }).filter(([key]) => !notDrawn.has(key)));
            const r = await replay(fixture);
            const problems: string[] = [];
            let observed = 0;

            if (e['outcome'] === 'failed' && !r.rejected) problems.push(`expected the runner to reject the stream (${String(e['errorContains'])})`);
            if (e['outcome'] === 'completed' && r.rejected) problems.push(`the runner rejected a stream it must accept: ${r.error?.message}`);
            if (e['outcome'] === 'failed') {
                observed++;
                const ours = REJECTIONS[fixture.name];
                if (!ours) problems.push(`no rejection reason recorded for this fixture in REJECTIONS (the reference client says "${String(e['errorContains'])}")`);
                else if (r.rejected && !r.error?.message.includes(ours)) problems.push(`rejected for another reason: ${r.error?.message}`);
            }
            if ('runError' in e) {
                observed++;
                const want = e['runError'];
                if (!r.runError) problems.push('expected the run to report its own failure');
                else if (typeof want === 'string' && !r.error?.message.includes(want)) problems.push(`run error "${r.error?.message}" lacks "${want}"`);
            }
            if ('messages' in e) {
                observed++;
                subset(r.messages, e['messages'], 'messages', problems, UNOBSERVABLE_MESSAGE_KEYS);
            }
            if ('messageCount' in e) {
                observed++;
                if (r.messages.length !== e['messageCount']) problems.push(`messageCount: expected ${String(e['messageCount'])}, got ${r.messages.length} ${JSON.stringify(r.messages)}`);
            }
            if ('state' in e) {
                observed++;
                subset(r.nextState, e['state'], 'state', problems);
            }
            if ('request' in e) {
                observed++;
                subset(r.request, e['request'], 'request', problems, UNOBSERVABLE_MESSAGE_KEYS);
            }
            if ('requestAbsentPaths' in e) {
                observed++;
                for (const p of e['requestAbsentPaths'] as string[]) if (getPath(r.request, p) !== undefined) problems.push(`request.${p} must be absent`);
            }
            if ('warnings' in e) {
                observed++;
                for (const w of e['warnings'] as string[]) if (!r.warnings.some((x) => x.includes(w))) problems.push(`no warning mentions "${w}" (warnings: ${JSON.stringify(r.warnings)})`);
            }
            if (e['noWarnings'] === true) {
                observed++;
                if (r.warnings.length) problems.push(`expected no warning, got ${JSON.stringify(r.warnings)}`);
            }
            for (const key of Object.keys(e)) {
                if (key === 'outcome' || key === 'errorContains') continue;
                if (key in UNOBSERVABLE_KEYS) continue;
                if (!['runError', 'messages', 'messageCount', 'state', 'request', 'requestAbsentPaths', 'warnings', 'noWarnings'].includes(key)) {
                    problems.push(`expectation key "${key}" is read by nobody here`);
                }
            }
            if (observed === 0 && !OUTCOME_ONLY[fixture.name]) problems.push('nothing beyond the outcome is observable for this fixture on this lane');
            if (observed > 0 && OUTCOME_ONLY[fixture.name]) problems.push('listed in OUTCOME_ONLY but asserts more: take it off the list');

            expect(problems, fixture.description).toEqual([]);
        });
    }
});
