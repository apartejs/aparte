import { describe, it, expect } from 'vitest';
import type { AparteChatRequest, AparteStreamEvent } from '@aparte/core';
import { createScenarioProvider, defaultMatch, playTurn, showcase } from '../index.js';

const request = (...messages: AparteChatRequest['messages']): AparteChatRequest => ({ modelId: 'scripted', messages });
const user = (content: string): AparteChatRequest['messages'][number] => ({ role: 'user', content });

async function drain(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const reader = stream.getReader();
    const out: AparteStreamEvent[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out.push(value);
    }
}

const text = (events: AparteStreamEvent[]): string => events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('');

async function reply(provider: ReturnType<typeof createScenarioProvider>, req: AparteChatRequest, signal?: AbortSignal): Promise<AparteStreamEvent[]> {
    const response = await provider.chat!(req, undefined, { providerId: provider.id, signal });
    return drain(response as ReadableStream<AparteStreamEvent>);
}

describe('turns mode', () => {
    it('answers calls in order and repeats the last one', async () => {
        const provider = createScenarioProvider({ turns: ['one', 'two'], pacing: 'instant' });
        expect(text(await reply(provider, request(user('a'))))).toBe('one');
        expect(text(await reply(provider, request(user('b'))))).toBe('two');
        expect(text(await reply(provider, request(user('c'))))).toBe('two');
    });

    it('ends every turn with done and an estimated usage', async () => {
        const provider = createScenarioProvider({ turns: ['twelve chars'], pacing: 'instant' });
        const events = await reply(provider, request(user('four')));
        const done = events[events.length - 1] as { type: 'done'; usage: { inputTokens: number; outputTokens: number; totalTokens: number } };
        expect(done.type).toBe('done');
        expect(done.usage.outputTokens).toBe(3);
        expect(done.usage.inputTokens).toBe(1);
        expect(done.usage.totalTokens).toBe(4);
    });
});

describe('pacing', () => {
    it('streams text in chunks of the configured size, in order', async () => {
        const events = await drain(playTurn('abcdefghijk', request(user('x')), { chunk: 5, delay: 0 }));
        const deltas = events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta);
        expect(deltas).toEqual(['abcde', 'fghij', 'k']);
    });

    it('stops streaming when the signal aborts, and reports no done', async () => {
        const controller = new AbortController();
        const stream = playTurn('a'.repeat(200), request(user('x')), { chunk: 10, delay: 5 }, controller.signal);
        const reader = stream.getReader();
        const first = await reader.read();
        expect(first.value).toEqual({ type: 'text', delta: 'a'.repeat(10) });
        controller.abort();
        const rest: AparteStreamEvent[] = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            rest.push(value);
        }
        expect(rest.some((e) => e.type === 'done')).toBe(false);
        expect(rest.length).toBeLessThan(19);
    });
});

describe('steps', () => {
    it('plays thinking, a tool call and a usage override', async () => {
        const events = await drain(playTurn([
            { thinking: 'hm' },
            { text: 'Checking.' },
            { tool: 'get_weather', input: { city: 'Lille' }, id: 'call_1' },
            { usage: { outputTokens: 99 } },
        ], request(user('weather?')), 'instant'));
        expect(events.map((e) => e.type)).toEqual(['thinking', 'text', 'tool_use', 'done']);
        expect(events[2]).toEqual({ type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'Lille' } });
        expect((events[3] as { usage: { outputTokens: number } }).usage.outputTokens).toBe(99);
    });

    it('an error step fails the turn: an error event, then the stream closes without done', async () => {
        const events = await drain(playTurn([{ text: 'so far so good' }, { error: 'boom' }, { text: 'never' }], request(user('x')), 'instant'));
        expect(events.map((e) => e.type)).toEqual(['text', 'error']);
        expect((events[1] as { message: string }).message).toBe('boom');
    });

    it('a bare string is one text step; a tool step without an id gets one', async () => {
        const events = await drain(playTurn([{ tool: 'noop' }], request(user('x')), 'instant'));
        expect((events[0] as { id: string }).id).toMatch(/^scenario_\d+$/);
    });
});

describe('scenarios mode', () => {
    const scenarios = {
        default: 'default reply',
        haiku: { when: /haiku/i, turn: 'a haiku' },
        weather: { when: 'weather', turn: [{ text: 'checking' }, { tool: 'get_weather', input: {}, id: 'w1' }] },
        forecast: { after: 'get_weather', turn: 'cloudy' },
    };

    it('matches the last user message by substring or RegExp, else default', () => {
        const normalized = { default: { turn: 'default reply' }, haiku: scenarios.haiku, weather: { turn: scenarios.weather.turn, when: 'weather' }, forecast: scenarios.forecast };
        expect(defaultMatch(request(user('Write me a HAIKU')), normalized)).toBe('haiku');
        expect(defaultMatch(request(user('What is the Weather like?')), normalized)).toBe('weather');
        expect(defaultMatch(request(user('hello')), normalized)).toBe('default');
    });

    it('routes a tool result to the scenario declared after that tool', async () => {
        const provider = createScenarioProvider({ scenarios, pacing: 'instant' });
        const first = await reply(provider, request(user('weather please')));
        expect(first.map((e) => e.type)).toEqual(['text', 'tool_use', 'done']);
        const second = await reply(provider, request(
            user('weather please'),
            { role: 'tool_call', content: '', toolCalls: [{ id: 'w1', name: 'get_weather', input: {} }] },
            { role: 'tool_result', content: '14 °C', toolCallId: 'w1' },
        ));
        expect(text(second)).toBe('cloudy');
    });

    it('lets a custom match override the rule, and falls back when it declines', async () => {
        const provider = createScenarioProvider({ scenarios, pacing: 'instant', match: (req) => (req.messages.length > 5 ? 'haiku' : undefined) });
        expect(text(await reply(provider, request(user('hello'))))).toBe('default reply');
    });

    it('the showcase preset covers the surface: every entry answers, and its tools have their after', () => {
        const names = Object.keys(showcase);
        expect(names).toContain('default');
        expect(showcase['forecast']!.after).toBe('get_weather');
        expect(showcase['answered']!.after).toBe('ask_user');
        expect(defaultMatch(request(user('Give me a markdown table')), showcase)).toBe('table');
    });
});

describe('the provider', () => {
    it('is local, keyless, and offers one scripted model to the picker', async () => {
        const provider = createScenarioProvider();
        const meta = provider.getMetadata();
        expect(meta.isLocal).toBe(true);
        expect(meta.configSchema?.fields).toEqual([]);
        expect(provider.getModels().map((m) => m.id)).toEqual(['scripted']);
        expect((await provider.fetchModels!()).map((m) => m.id)).toEqual(['scripted']);
        expect(provider.getModels()[0]!.capabilities).toContain('function_calling');
    });

    it('owns its I/O: chat() only, no format-adapter surface', () => {
        const provider = createScenarioProvider();
        expect(typeof provider.chat).toBe('function');
        expect(provider.buildRequest).toBeUndefined();
    });
});
