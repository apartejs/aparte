/**
 * TanStack AI 1.0's router as it really streams. `fixtures/tanstack-router-handoff.json` is the
 * AG-UI event list `apps/examples/agents-sdk` serves at `/tanstack` (`server/tanstack.ts`),
 * recorded as sent: `chat()` with a `subagents` router of two steps, the order tracker then the
 * returns desk, each a `chat()` of its own that calls one real tool and answers, then
 * (`strategy: 'handoff'`) the main model's reply. Every sub-agent event carries its
 * `subagentRunId`, the plan rides on each `SUBAGENT_STARTED`, the router opens the run and the
 * main model opens it AGAIN (a second `RUN_STARTED`, same id) before its reply.
 *
 * Its one `RUN_FINISHED` reports usage as TanStack's `withChildUsage` builds it: one entry per
 * model call, the run's OWN first, then every sub-agent's. The run's usage is the size of the
 * conversation the run's model last saw (`readUsage`), so it is the first entry — read as the
 * last, the reply reported the returns desk's last call instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { agUi, scripted, sse, turn } from './replay.js';
import type { Event } from './replay.js';

type Wire = { type: string; [key: string]: unknown };
const wire = JSON.parse(readFileSync(new URL('./fixtures/tanstack-router-handoff.json', import.meta.url), 'utf8')) as Wire[];

async function read(): Promise<{ events: Event[]; warnings: string[]; error: unknown }> {
    const warnings: string[] = [];
    const f = scripted(sse(...wire));
    const { events, error } = await turn(agUi(f.fetch, { relaxedRunFraming: true, onWarning: (w) => warnings.push(w) }));
    return { events, warnings, error };
}

describe('TanStack AI’s router stream, as captured', () => {
    it('draws a line per sub-agent, their calls under them, and the main model’s words alone in the reply', async () => {
        const { events, warnings, error } = await read();
        expect(error).toBeUndefined();
        expect(warnings).toEqual([]);
        const starts = events.filter((e) => e.type === 'agent-start');
        expect(starts.map((e) => e['name'])).toEqual(['Order tracker', 'Returns desk']);
        // A router starts its agents itself: no call opens them.
        for (const s of starts) expect(s).not.toHaveProperty('toolCallId');
        const [tracker, desk] = starts.map((e) => e['agentId']);
        expect(events.filter((e) => e.type === 'tool-start').map((e) => [e['name'], e['agentId']]))
            .toEqual([['get_order_status', tracker], ['get_return_policy', desk]]);
        expect(events.filter((e) => e.type === 'agent-end').map((e) => [e['agentId'], e['status']]))
            .toEqual([[tracker, 'done'], [desk, 'done']]);
        const reply = events.filter((e) => e.type === 'text-delta' && !('agentId' in e)).map((e) => e['delta']).join('');
        expect(reply).toBe('Order 1042 is on its way with La Poste and arrives in 2 days. Once it has, you have 30 days to send it back.');
        const plans = events.filter((e) => e.type === 'activity');
        expect(new Set(plans.map((e) => e['id'])).size).toBe(1);
        expect((plans.at(-1)!['content'] as { steps: Array<{ status: string }> }).steps.map((s) => s.status)).toEqual(['done', 'done']);
        expect(events.at(-1)!.type).toBe('run-done');
    });

    it('reports the run’s own usage, the first entry, not its last sub-agent’s', async () => {
        const reported = wire.at(-1)!['usage'] as Array<Record<string, number>>;
        expect(reported.length).toBeGreaterThan(1);
        const { events } = await read();
        expect(events.at(-1)!['usage']).toEqual({
            inputTokens: reported[0]!['inputTokens'],
            outputTokens: reported[0]!['outputTokens'],
            totalTokens: reported[0]!['totalTokens'],
        });
    });
});
