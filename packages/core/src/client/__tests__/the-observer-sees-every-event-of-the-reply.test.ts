// @vitest-environment jsdom
/**
 * An observer sees every event of the reply — the run's own and its sub-agents' — before
 * the reply handles it.
 *
 * It is how a plugin draws what the reply does not: a sub-agent's conversation. It is found
 * the way a segment renderer is: on the chat's own config, then on the global one, so a
 * plugin set up once on the page reaches a chat that carries a config of its own.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStreamAdapter, type AparteStreamRunEvent } from '../stream-adapter.js';
import { aparteGlobalConfig, AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import type { AparteRunEventContext } from '../../config/aparte-config.js';
import type { AparteSegment } from '../../types/index.js';

const undo: (() => void)[] = [];
afterEach(() => {
    while (undo.length) undo.pop()!();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function hostWith(config: AparteConfig, log: string[]) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    attachConfig(el, config);
    Object.assign(el, {
        addSegment: (s: AparteSegment) => { log.push(`add ${s.type}`); },
        updateSegment: () => {},
        updateMessage: () => {},
    });
    return el;
}

const run: AparteStreamRunEvent[] = [
    { type: 'run-start' },
    { type: 'turn-start' },
    { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a1', toolCallId: 'c1' },
    { type: 'text-delta', delta: 'child', agentId: 'a1' },
    { type: 'agent-end', agentId: 'a1', status: 'done' },
    { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
    { type: 'text-delta', delta: 'Done.' },
    { type: 'run-done' },
];

describe('an observer of the run\'s events', () => {
    it('on the global config, is reached from a chat with its own config, before the reply', () => {
        const own = new AparteConfig();
        const log: string[] = [];
        const contexts: AparteRunEventContext[] = [];
        undo.push(own.observeRunEvents((e) => { log.push(`own ${e.type}`); }));
        undo.push(aparteGlobalConfig.observeRunEvents((e, ctx) => { log.push(`global ${e.type}`); contexts.push(ctx); }));
        const el = hostWith(own, log);
        const emit = createStreamAdapter({ target: el as never, config: aparteGlobalConfig, messageId: 'm1', targetId: 'chat-1' });
        for (const e of run) emit(e);

        // Every event, the sub-agent's included, in order; the chat's config first.
        expect(log.filter((l) => l.startsWith('global')).map((l) => l.slice(7))).toEqual(run.map((e) => e.type));
        expect(log.filter((l) => l.startsWith('own'))).toHaveLength(run.length);
        expect(log.slice(0, 2)).toEqual(['own run-start', 'global run-start']);
        // Before the reply draws it.
        const i = log.indexOf('add tool_call');
        expect(log.slice(i - 2, i)).toEqual(['own tool-start', 'global tool-start']);
        // The context names the reply, the chat, and the chat's config.
        expect(contexts[0]).toEqual({ messageId: 'm1', target: el, targetId: 'chat-1', config: own });
    });

    it('stops hearing the run once unsubscribed', () => {
        const config = new AparteConfig();
        const seen: string[] = [];
        const off = config.observeRunEvents((e) => { seen.push(e.type); });
        const emit = createStreamAdapter({ target: { dispatchEvent: () => true }, config, messageId: 'm1' });
        emit({ type: 'run-start' });
        off();
        emit({ type: 'turn-start' });
        expect(seen).toEqual(['run-start']);
    });

    it('on the adapter\'s config, is reached for a target that is not an element', () => {
        const config = new AparteConfig();
        const contexts: AparteRunEventContext[] = [];
        undo.push(config.observeRunEvents((_e, ctx) => { contexts.push(ctx); }));
        const target = { dispatchEvent: () => true };
        createStreamAdapter({ target, config, messageId: 'm1' })({ type: 'run-start' });
        expect(contexts).toEqual([{ messageId: 'm1', target, config }]);
    });

    it('that throws does not stop the reply, nor the observers after it', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const config = new AparteConfig();
        const seen: string[] = [];
        undo.push(config.observeRunEvents(() => { throw new Error('observer bug'); }));
        undo.push(config.observeRunEvents((e) => { seen.push(e.type); }));
        const added: AparteSegment[] = [];
        const emit = createStreamAdapter({
            target: { addSegment: (s: AparteSegment) => { added.push(s); }, dispatchEvent: () => true },
            config, messageId: 'm1',
        });
        for (const e of run) emit(e);
        expect(seen).toEqual(run.map((e) => e.type));
        expect(added.map((s) => s.type)).toEqual(['tool_call', 'text']);
        // Said once, not once per token.
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('silences the warning about undrawn sub-agents', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = new AparteConfig();
        undo.push(config.observeRunEvents(() => {}));
        const emit = createStreamAdapter({ target: { dispatchEvent: () => true }, config, messageId: 'm1' });
        for (const e of run) emit(e);
        expect(warn).not.toHaveBeenCalled();
    });

    it('is cleared by reset()', () => {
        const config = new AparteConfig();
        const seen: string[] = [];
        config.observeRunEvents((e) => { seen.push(e.type); });
        config.reset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        createStreamAdapter({ target: { dispatchEvent: () => true }, config, messageId: 'm1' })({ type: 'run-start' });
        expect(seen).toEqual([]);
    });
});
