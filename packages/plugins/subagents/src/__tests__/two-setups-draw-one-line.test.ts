/**
 * Two setups draw one line.
 *
 * A chat that carries a config of its own hears the observers of its config AND of the
 * global one. With `setupSubagents` on both, two observers hear the same run: only one of
 * them draws it — the chat's own, the nearer one, which is the first to hear a sub-agent's
 * event — so there is one line, one lane and one event per sub-agent.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf, type AparteSubagentStartEventDetail } from '../index.js';
import { as, callIn, chat, shown, textOfAll } from './harness.js';

const stops: Array<() => void> = [];
afterEach(() => {
    document.body.innerHTML = '';
    for (const stop of stops.splice(0)) stop();
    aparteGlobalConfig.reset();
});

describe('two setups', () => {
    it('on the chat and on the page draw one line, with the chat\'s options', () => {
        const config = new AparteConfig();
        stops.push(setupSubagents({ counts: true }));
        stops.push(setupSubagents({ counts: false }, config));
        const c = chat({ config });
        const started: AparteSubagentStartEventDetail[] = [];
        c.host.addEventListener('aparte-subagent-start', (e) => started.push(e.detail));
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
            { type: 'agent-start', agentId: 'a2', name: 'Planner' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Once.' }, { type: 'tool-start', toolCallId: 'r1', name: 'read', input: {} }),
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Also once.' }, { type: 'text-flush' }),
        );
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1', 'subagent-a2']);
        const lane = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(textOfAll(lane.segments)).toBe('Once.');
        expect(lane.segments.filter((s) => s.type === 'tool_call')).toHaveLength(1);
        expect(textOfAll(subagentOf(c.segment('subagent-a2')!)!.segments)).toBe('Also once.');
        expect(started.map((s) => s.agentId)).toEqual(['a1', 'a2']);
        // The chat's own provider names its rows: no counts.
        expect(shown(c.row('tool-c1'), 'name')).toBe('Researcher');
        expect(shown(c.row('tool-c1'), 'note')).toBeNull();
    });

    it('a chat with no setup of its own is drawn by the page\'s', () => {
        const config = new AparteConfig();
        stops.push(setupSubagents());
        const c = chat({ config });
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'a1', name: 'Planner' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Drawn.' }, { type: 'text-flush' }),
        );
        expect(textOfAll(subagentOf(c.segment('subagent-a1')!)!.segments)).toBe('Drawn.');
        expect(shown(c.row('subagent-a1'), 'name')).toBe('Planner');
    });
});
