// @vitest-environment jsdom
/**
 * One measure of the context window, for the gauge and the compaction plugin.
 *
 * `estimateWireTokens` reads the SAME serialisation the client sends (`wireMessages`), so
 * what is counted is what goes out: thinking is not sent, text is, and a tool call is its
 * envelope plus the `tool` message that answers it. `measureContext` is the real usage while
 * nothing the model reads has changed, and a calibrated estimate of the request that would
 * be sent once something has.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '../../config/index.js';
import { estimateRequestTokens, estimateTokens, estimateWireTokens, measureContext } from '../measure.js';
import type { AparteMessage } from '../../types/index.js';

const text = (n: number): string => 'x'.repeat(n);
const user = (id: string, content: string, extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role: 'user', content, timestamp: 1, ...extra,
});
const reply = (id: string, content: string, extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role: 'assistant', content, timestamp: 2, ...extra,
});
const config = (): AparteConfig => new AparteConfig();

describe('estimateTokens', () => {
    it('is the character heuristic: ceil(length / 3.8), nothing for nothing', () => {
        expect(estimateTokens('')).toBe(0);
        expect(estimateTokens(null)).toBe(0);
        expect(estimateTokens(undefined)).toBe(0);
        expect(estimateTokens(text(38))).toBe(10);
        expect(estimateTokens(text(39))).toBe(11);
    });
});

describe('estimateWireTokens', () => {
    it('counts the text segments of a reply, not its empty `content`', () => {
        const streamed = reply('a1', '', { segments: [{ id: 's', type: 'text', content: text(380) }] });
        expect(estimateWireTokens([streamed])).toBe(100);
    });

    it('does not count thinking: it is not sent', () => {
        const withThinking = reply('a1', '', {
            segments: [
                { id: 't', type: 'thinking', content: text(3800) },
                { id: 's', type: 'text', content: text(380) },
            ],
        });
        expect(estimateWireTokens([withThinking])).toBe(100);
    });

    it('counts a tool call as the envelope and its result as the tool message', () => {
        const withCall = reply('a1', '', {
            segments: [{
                id: 'c', type: 'tool_call', status: 'resolved',
                toolCall: { id: 'call_1', name: 'search', input: { q: 'lisbon' } },
                result: text(380),
            } as never],
        });
        const counted = estimateWireTokens([withCall]);
        // The result is 100 tokens by itself; the declared call (id, name, input) is on top.
        expect(counted).toBeGreaterThan(100);
        expect(counted).toBeLessThan(140);
    });

    it('counts nothing for a failed turn or one still in flight, which the wire does not send', () => {
        expect(estimateWireTokens([
            user('u1', text(380), { status: 'error' }),
            reply('a1', text(380), { status: 'streaming' }),
            reply('a2', text(380), { status: 'pending' }),
        ])).toBe(0);
    });

    it('counts a legacy compaction message under the preamble it goes out with', () => {
        const legacy = user('c', text(380), { compaction: true });
        expect(estimateWireTokens([legacy])).toBeGreaterThan(100);
    });
});

describe('measureContext', () => {
    it('is the last reply\'s real usage while nothing the model reads has changed', () => {
        const messages = [
            user('u1', text(400)),
            reply('a1', text(400), { usage: { inputTokens: 900, outputTokens: 60 } }),
        ];
        const m = measureContext({ messages, config: config(), windowOverride: 8000 });
        expect(m).toMatchObject({ window: 8000, used: 960, estimated: false });
        expect(m.parts.messages).toBeGreaterThan(0);
        expect(m.other).toBe(Math.max(0, 960 - m.parts.system - m.parts.tools - m.parts.summary - m.parts.messages));
    });

    it('prefers the provider\'s total to input + output, like the gauge always did', () => {
        const messages = [reply('a1', 'hi', { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 150 } })];
        expect(measureContext({ messages, config: config() }).used).toBe(150);
    });

    it('is an estimate once a message came after the reply', () => {
        const messages = [
            user('u1', text(380)),
            reply('a1', text(380), { usage: { inputTokens: 900, outputTokens: 60 } }),
            user('u2', text(380)),
        ];
        const m = measureContext({ messages, config: config() });
        expect(m.estimated).toBe(true);
        // Three messages of 100 tokens, k = 1 (the reply recorded no estimate).
        expect(m.used).toBe(300);
        expect(m.parts.messages).toBe(300);
    });

    it('scales the estimate by how far the last reply showed the heuristic to be off', () => {
        const messages = [
            user('u1', text(380)),
            reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 10 }, contextEstimate: 100 }),
            user('u2', text(380)),
        ];
        const m = measureContext({ messages, config: config() });
        // k = 200 / 100 = 2 over an estimate of 300 tokens.
        expect(m.used).toBe(600);
        expect(m.estimated).toBe(true);
        // The parts are NOT calibrated: they stay the raw estimates.
        expect(m.parts.messages).toBe(300);
        expect(m.other).toBe(300);
    });

    it('clamps k to [0.5, 3]: one odd reply cannot throw the reading', () => {
        const high = [reply('a1', 'x', { usage: { inputTokens: 100000, outputTokens: 0 }, contextEstimate: 10 }), user('u2', text(380))];
        const low = [reply('a1', 'x', { usage: { inputTokens: 1, outputTokens: 0 }, contextEstimate: 1000 }), user('u2', text(380))];
        const rawHigh = estimateWireTokens(high);
        const rawLow = estimateWireTokens(low);
        expect(measureContext({ messages: high, config: config() }).used).toBe(rawHigh * 3);
        expect(measureContext({ messages: low, config: config() }).used).toBe(Math.round(rawLow * 0.5));
    });

    it('uses k = 1 when the reply carries no estimate or no input count', () => {
        const noEstimate = [reply('a1', text(380), { usage: { inputTokens: 500, outputTokens: 0 } }), user('u2', text(380))];
        const noInput = [reply('a1', text(380), { usage: { inputTokens: 0, outputTokens: 5 }, contextEstimate: 100 }), user('u2', text(380))];
        expect(measureContext({ messages: noEstimate, config: config() }).used).toBe(estimateWireTokens(noEstimate));
        expect(measureContext({ messages: noInput, config: config() }).used).toBe(estimateWireTokens(noInput));
    });

    it('does not calibrate against a reply that called tools: its last call read the results too', () => {
        // The estimate was written for the FIRST request; the usage is the LAST call's input,
        // which also holds the call and its result. A ratio of the two would count the result
        // twice, once in the view and once through k.
        const called = reply('a1', '', {
            usage: { inputTokens: 5000, outputTokens: 20 }, contextEstimate: 100,
            segments: [
                {
                    id: 'c', type: 'tool_call', status: 'resolved',
                    toolCall: { id: 'call_1', name: 'search', input: { q: 'lisbon' } },
                    result: text(3800),
                } as never,
                { id: 's', type: 'text', content: text(380) },
            ],
        });
        const messages = [user('u1', text(380)), called, user('u2', text(380))];
        const m = measureContext({ messages, config: config() });
        expect(m.estimated).toBe(true);
        expect(m.used, 'k = 1: the raw estimate of the view, not three times it').toBe(estimateWireTokens(messages));
    });

    it('still calibrates against a reply with no tool call', () => {
        const plain = reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 10 }, contextEstimate: 100 });
        const messages = [user('u1', text(380)), plain, user('u2', text(380))];
        expect(measureContext({ messages, config: config() }).used).toBe(estimateWireTokens(messages) * 2);
    });

    it('counts what the next request carries right after a turn: the input and the answer, not the reasoning', () => {
        // A local server counts every generated token in its total, the reasoning among them,
        // and the reasoning is not sent back. 900 in, 1100 out of which 1000 are reasoning.
        const thought = reply('a1', '', {
            usage: { inputTokens: 900, outputTokens: 1100, totalTokens: 2000 },
            segments: [
                { id: 't', type: 'thinking', content: text(3800) },
                { id: 's', type: 'text', content: text(380) },
            ],
        });
        const m = measureContext({ messages: [user('u1', text(380)), thought], config: config() });
        expect(m.estimated, 'nothing changed since the reply, so the input the provider reported is still real').toBe(false);
        expect(m.used).toBe(900 + 100);
    });

    it('never counts more of the reply than the provider says it generated', () => {
        const thought = reply('a1', '', {
            usage: { inputTokens: 900, outputTokens: 40 },
            segments: [
                { id: 't', type: 'thinking', content: text(380) },
                { id: 's', type: 'text', content: text(3800) },
            ],
        });
        expect(measureContext({ messages: [user('u1', 'q'), thought], config: config() }).used).toBe(940);
    });

    it('keeps the total for a reply that thought when the provider reports no input count', () => {
        // ai-sdk, openai-compat and AG-UI read a missing prompt count as 0: input + the visible
        // answer would then be the answer alone, and an after-turn trigger would miss a full window.
        const thought = reply('a1', '', {
            usage: { inputTokens: 0, outputTokens: 1100, totalTokens: 3000 },
            segments: [
                { id: 't', type: 'thinking', content: text(3800) },
                { id: 's', type: 'text', content: text(380) },
            ],
        });
        expect(measureContext({ messages: [user('u1', 'q'), thought], config: config() }).used).toBe(3000);
    });

    it('leaves the total the provider reported alone for a reply that did not think', () => {
        const plain = reply('a1', '', {
            usage: { inputTokens: 900, outputTokens: 100, totalTokens: 1010 },
            segments: [{ id: 's', type: 'text', content: text(380) }],
        });
        expect(measureContext({ messages: [user('u1', 'q'), plain], config: config() }).used).toBe(1010);
    });

    it('counts the system prompt and the tools, and reads the window from the override', () => {
        const c = config();
        c.setSystemPrompt('s'.repeat(380));
        c.registerTool(
            { name: 'search', description: 'd'.repeat(380), inputSchema: { type: 'object' } },
            async () => ({ toolCallId: 'search', content: 'ok' }),
        );
        const m = measureContext({ messages: [user('u1', text(380))], config: c, windowOverride: 4000 });
        expect(m.window).toBe(4000);
        expect(m.parts.system).toBe(100);
        expect(m.parts.tools).toBeGreaterThanOrEqual(100);
        expect(m.parts.messages).toBe(100);
        expect(m.estimated, 'no reply has reported yet').toBe(true);
        expect(m.used).toBe(m.parts.system + m.parts.tools + m.parts.messages);
        expect(m.other).toBe(0);
    });

    it('measures the view after a checkpoint: the summary and the messages from it, not the ones it replaces', () => {
        const messages = [
            user('u1', text(3800)),
            reply('a1', text(3800), { usage: { inputTokens: 2000, outputTokens: 100 } }),
            user('u2', text(380), { contextSummary: { summary: text(380), count: 2, createdAt: 10 } }),
            reply('a2', text(380)),
        ];
        const m = measureContext({ messages, config: config() });
        expect(m.parts.summary).toBeGreaterThan(100);
        expect(m.parts.messages).toBe(200);
        expect(m.used, 'far below the 2100 the old reply reported').toBeLessThan(500);
    });

    it('a checkpoint written after the last reply makes it an estimate, never the stale usage', () => {
        // The reply is the LAST message and still the compaction made the real number stale:
        // its checkpoint (written at 100) is newer than the reply (stamped 5).
        const messages = [
            user('u2', text(380), { contextSummary: { summary: 'short', count: 2, createdAt: 100 }, timestamp: 1 }),
            reply('a1', text(380), { usage: { inputTokens: 2000, outputTokens: 100 }, timestamp: 5 }),
        ];
        const m = measureContext({ messages, config: config() });
        expect(m.estimated).toBe(true);
        expect(m.used).toBeLessThan(2000);
    });

    it('a checkpoint that was already there when the reply came leaves the real usage alone', () => {
        const messages = [
            user('u2', text(380), { contextSummary: { summary: 'short', count: 2, createdAt: 1 }, timestamp: 1 }),
            reply('a2', text(380), { usage: { inputTokens: 300, outputTokens: 50 }, timestamp: 5 }),
        ];
        const m = measureContext({ messages, config: config() });
        expect(m).toMatchObject({ used: 350, estimated: false });
    });

    it('viewChanged forces an estimate even though no message can say so (a Restore)', () => {
        const messages = [user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 900, outputTokens: 0 } })];
        expect(measureContext({ messages, config: config() }).estimated).toBe(false);
        expect(measureContext({ messages, config: config(), viewChanged: true }).estimated).toBe(true);
    });

    it('other is never negative when the estimates add up to more than the reported usage', () => {
        const messages = [user('u1', text(3800)), reply('a1', text(3800), { usage: { inputTokens: 10, outputTokens: 0 } })];
        const m = measureContext({ messages, config: config() });
        expect(m.used).toBe(10);
        expect(m.other).toBe(0);
    });

    it('has no window when none is declared, and takes the override when one is given', () => {
        const m = measureContext({ messages: [user('u1', 'hi')], config: config() });
        expect('window' in m).toBe(false);
        expect(measureContext({ messages: [user('u1', 'hi')], config: config(), windowOverride: 123 }).window).toBe(123);
    });

    it('an empty path is an estimate of nothing, not a crash', () => {
        const m = measureContext({ messages: [], config: config() });
        expect(m).toMatchObject({ used: 0, estimated: true, other: 0 });
    });
});

describe('estimateRequestTokens', () => {
    const tool = { name: 'lookup', description: 'Find a thing', inputSchema: { type: 'object' } };

    it('adds the tool definitions to the messages, and counts none for an empty list', () => {
        const messages = [{ role: 'user' as const, content: text(38) }];
        expect(estimateRequestTokens({ messages })).toBe(10);
        expect(estimateRequestTokens({ messages, tools: [] })).toBe(10);
        expect(estimateRequestTokens({ messages, tools: [tool as never] })).toBeGreaterThan(10);
    });

    it('reads the same tool definitions the measure reads, so the two are one currency', () => {
        const cfg = config();
        cfg.registerTool(tool as never, (async () => ({ content: '' })) as never);
        const measured = measureContext({ messages: [], config: cfg });
        expect(estimateRequestTokens({ messages: [], tools: cfg.getTools() })).toBe(measured.parts.tools);
    });
});
