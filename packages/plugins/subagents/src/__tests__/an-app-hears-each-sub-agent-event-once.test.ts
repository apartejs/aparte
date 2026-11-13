/**
 * An app hears each sub-agent event once.
 *
 * The plugin draws a sub-agent through an adapter of core's own, writing a segment list. That
 * adapter called the observers too, so an app observing the run beside the plugin heard every
 * sub-agent event twice — first without its `agentId`, as the reply's own. It hears each once
 * now, attributed, whether it observes the global config or the chat's.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig, type AparteStreamRunEvent } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const childEvents: AparteStreamRunEvent[] = as('a1',
    { type: 'turn-start' },
    { type: 'text-delta', delta: 'From the child.' },
    { type: 'text-flush' },
    { type: 'tool-start', toolCallId: 'x1', name: 'fetch', input: {} },
    { type: 'tool-resolved', toolCallId: 'x1', result: 'ok' },
);

describe('an app beside the plugin', () => {
    it.each([['the global config', false], ["the chat's config", true]] as const)('observing %s hears each sub-agent event once, attributed', (_label, ownConfig) => {
        const config = ownConfig ? new AparteConfig() : aparteGlobalConfig;
        stop = setupSubagents({}, config);
        const heard: AparteStreamRunEvent[] = [];
        config.observeRunEvents((e) => { heard.push(e); });
        const c = chat(ownConfig ? { config } : {});
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
            ...childEvents,
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'run-done' },
        );

        const own = (e: AparteStreamRunEvent): boolean => e.type !== 'agent-start' && e.type !== 'agent-end';
        expect(heard.filter((e) => own(e) && (e as { agentId?: string }).agentId === 'a1')).toEqual(childEvents);
        expect(heard.filter((e) => !own(e)).map((e) => e.type)).toEqual(['agent-start', 'agent-end']);
        // Nothing of the sub-agent reached the app as the reply's own.
        const unattributed = heard.filter((e) => own(e) && (e as { agentId?: string }).agentId === undefined).map((e) => e.type);
        expect(unattributed).toEqual(['run-start', 'tool-start', 'tool-resolved', 'run-done']);
        // And the plugin drew it all the same.
        expect(textOfAll(subagentOf(callIn(c.segments(), 'c1')!)!.segments)).toBe('From the child.');
    });
});
