/**
 * A step the run announces is handed to the target as it changes, and nowhere else.
 *
 * The adapter keeps the steps open for the reply — the latest one wins, and when it ends the
 * one opened before it shows again — and tells the target through `setStep(messageId, name)`,
 * only when what should show changes. The run's end, however it ends, takes it off. A step is
 * never a segment and never touches the message: it is live only. A sub-agent's step is the
 * sub-agent's, not the reply's.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStreamAdapter, type AparteStreamRunEvent } from '../stream-adapter.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

function target() {
    const steps: [string, string | null][] = [];
    const added: AparteSegment[] = [];
    const messages: [string, Partial<AparteMessage>][] = [];
    return {
        steps, added, messages,
        setStep: (id: string, name: string | null) => { steps.push([id, name]); },
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: () => {},
        updateMessage: (id: string, u: Partial<AparteMessage>) => { messages.push([id, u]); },
        dispatchEvent: () => true,
    };
}

const start = (name: string, agentId?: string): AparteStreamRunEvent => ({ type: 'step-start', name, ...(agentId ? { agentId } : {}) });
const end = (name: string, agentId?: string): AparteStreamRunEvent => ({ type: 'step-end', name, ...(agentId ? { agentId } : {}) });

afterEach(() => vi.restoreAllMocks());

describe('the reply\'s step', () => {
    it('is handed to the target, the latest open one, and the previous one comes back when it ends', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'run-start' });
        emit(start('Reading the parser'));
        emit(start('Checking tokens'));
        emit(end('Checking tokens'));
        emit(end('Reading the parser'));
        expect(t.steps).toEqual([
            ['m1', 'Reading the parser'],
            ['m1', 'Checking tokens'],
            ['m1', 'Reading the parser'],
            ['m1', null],
        ]);
    });

    it('is told only when what shows changes', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit(start('Searching'));
        emit(start('Planning'));
        // Ends a step that is not the one showing: the latest one still shows.
        emit(end('Searching'));
        // Ends a step that was never opened: nothing to say.
        emit(end('Elsewhere'));
        expect(t.steps).toEqual([['m1', 'Searching'], ['m1', 'Planning']]);
    });

    it('two open steps of one name end one at a time', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit(start('Searching'));
        emit(start('Searching'));
        emit(end('Searching'));
        expect(t.steps.at(-1)).toEqual(['m1', 'Searching']);
        emit(end('Searching'));
        expect(t.steps.at(-1)).toEqual(['m1', null]);
    });

    it.each([
        ['done', { type: 'run-done' }],
        ['stopped', { type: 'run-aborted' }],
        ['paused', { type: 'run-suspended', pending: [] }],
    ] as [string, AparteStreamRunEvent][])('is taken off when the run ends %s, with a step still open', (_how, last) => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit(start('Searching'));
        emit(last);
        expect(t.steps.at(-1)).toEqual(['m1', null]);
    });

    it('is never a segment, and never written on the message', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit(start('Searching'));
        emit(end('Searching'));
        emit({ type: 'text-flush' });
        emit({ type: 'run-done' });
        expect(t.added).toEqual([]);
        for (const [, update] of t.messages) expect(JSON.stringify(update)).not.toContain('Searching');
    });

    it('a sub-agent\'s step is not the reply\'s', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'agent-start', agentId: 'a1', name: 'researcher' });
        emit(start('Searching', 'a1'));
        emit(end('Searching', 'a1'));
        expect(t.steps).toEqual([]);
    });

    it('reaches the observers, the reply\'s and a sub-agent\'s', () => {
        const config = new AparteConfig();
        const heard: AparteStreamRunEvent[] = [];
        config.observeRunEvents((e) => { heard.push(e); });
        const emit = createStreamAdapter({ target: target(), config, messageId: 'm1' });
        emit(start('Searching'));
        emit(start('Reading', 'a1'));
        expect(heard).toEqual([start('Searching'), start('Reading', 'a1')]);
    });
});
