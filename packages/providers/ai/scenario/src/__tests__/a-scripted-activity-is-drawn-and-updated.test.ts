/**
 * A scripted activity: `{ activity: { type, content, id? } }` plays an `activity` event, the
 * structured progress an agent reports. The same `id` later updates it — the reply keeps one
 * segment for it, with the last content; without an `id` each step is an activity of its own.
 * In a scripted sub-agent it is the sub-agent's. The model reads nothing of it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentToText, type AparteChatRequest } from '@aparte/core';
import { createScenarioProvider, playTurn, scenarioSubagentTool } from '../index.js';
import { page, starts } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const request: AparteChatRequest = { modelId: 'scripted', messages: [{ role: 'user', content: 'go' }] };

async function eventsOf(stream: ReadableStream<{ type: string }>): Promise<{ type: string }[]> {
    const out: { type: string }[] = [];
    const reader = stream.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out.push(value);
    }
}

describe('a scripted activity', () => {
    it('is played as an activity event in its place, an id of its own when none is given', async () => {
        const events = await eventsOf(playTurn(
            [
                { activity: { type: 'search-progress', content: { read: 0, of: 5 }, id: 'p1' } },
                { text: 'Reading.' },
                { activity: { type: 'search-progress', content: { read: 5, of: 5 }, id: 'p1' } },
                { activity: { type: 'note', content: 'once' } },
            ],
            request, 'instant',
        ));
        expect(events.filter((e) => e.type !== 'done')).toEqual([
            { type: 'activity', id: 'p1', activityType: 'search-progress', content: { read: 0, of: 5 } },
            { type: 'text', delta: 'Reading.' },
            { type: 'activity', id: 'p1', activityType: 'search-progress', content: { read: 5, of: 5 } },
            { type: 'activity', id: expect.any(String), activityType: 'note', content: 'once' },
        ]);
    });

    it('reaches the reply as one segment, updated by the same id across a tool call, and the model reads none of it', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ activity: { type: 'search-progress', content: 'reading 1 of 2', id: 'p1' } }, { tool: 'read_file', input: {}, id: 'r1' }],
                [{ activity: { type: 'search-progress', content: 'reading 2 of 2', id: 'p1' } }, { text: 'Both read.' }],
                'Again.',
            ],
        });
        const readFile = {
            tool: { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object', properties: {} } },
            handler: async () => ({ toolCallId: 'r1', content: 'ok' }),
        };
        const p = page(provider, [readFile]);
        let sent: AparteChatRequest | undefined;
        const chat = provider.chat!.bind(provider);
        provider.chat = (...args: Parameters<typeof chat>) => { sent = args[0]; return chat(...args); };
        await p.send('Read them');
        const activities = (p.reply()?.segments ?? []).filter((s) => s.type === 'activity');
        expect(activities).toEqual([expect.objectContaining({ activityId: 'p1', activityType: 'search-progress', content: 'reading 2 of 2' })]);

        await p.send('Once more');
        expect(JSON.stringify(sent?.messages)).not.toContain('reading');
        expect(JSON.stringify(sent?.messages)).toContain('Both read.');
    });

    it('in a scripted sub-agent, is the sub-agent\'s', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{ name: 'Researcher', task: 'Read', turns: [[{ activity: { type: 'search-progress', content: 1, id: 'p1' } }, { text: 'Found it.' }]] }], id: 'd1' }],
                'Done.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        const [start] = starts(p.events);
        expect(p.events.filter((e) => e.type === 'activity')).toEqual([
            { type: 'activity', id: 'p1', activityType: 'search-progress', content: 1, agentId: start!.agentId },
        ]);
        expect(contentToText(p.reply()?.content ?? '')).not.toContain('search-progress');
        expect((p.reply()?.segments ?? []).some((s) => s.type === 'activity')).toBe(false);
    });
});
