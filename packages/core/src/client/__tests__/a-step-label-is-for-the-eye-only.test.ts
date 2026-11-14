// @vitest-environment jsdom
/**
 * A step's label is for the eye: the run, its observers and the saved reply keep the key.
 *
 * `registerStepLabel` changes what the waiting indicator SAYS and nothing it carries. The adapter
 * hands the target the key the run announced, the observers hear the event untouched, and the
 * reply an app saves holds neither the key nor the label — a step is live only. So the same step
 * reads as words to a person on the page and stays a key to the code that listens for it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import { createStreamAdapter, type AparteStreamRunEvent, type StreamAdapterTarget } from '../stream-adapter.js';
import { AparteConfig, attachConfig } from '../../config/index.js';
import type { AparteMessage } from '../../types/index.js';

type Viewport = HTMLElement & StreamAdapterTarget & {
    appendMessage(message: AparteMessage): void;
    getMessage(id: string): AparteMessage | undefined;
};

/** A chat on the page with a config of its own, its reply `a1` open, and the adapter that writes it. */
async function chat(config: AparteConfig) {
    const host = document.createElement('div');
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    host.append(viewport);
    document.body.append(host);
    attachConfig(host, config);
    await vi.waitFor(() => expect(typeof viewport.appendMessage).toBe('function'));
    viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'pending' });
    const emit = createStreamAdapter({ target: viewport, config, messageId: 'a1' });
    return { host, viewport, emit };
}

/** The step's words as the page shows them: '' when none shows. */
const words = (host: HTMLElement): string => {
    const waiting = host.querySelector<HTMLElement>('aparte-chat-bubble .aparte-waiting');
    const step = waiting?.querySelector<HTMLElement>('.aparte-waiting-step');
    return waiting && !waiting.hidden && step && !step.hidden ? step.textContent ?? '' : '';
};
const spoken = (host: HTMLElement): string => host.querySelector('aparte-chat-bubble .aparte-sr-only')?.textContent ?? '';

afterEach(() => { document.body.innerHTML = ''; });

describe('a step the run announces, with a label registered for it', () => {
    it('is handed to the target as the key and shown as the label', async () => {
        const config = new AparteConfig();
        config.registerStepLabel('reread', 'Re-reading the conversation');
        const { host, viewport, emit } = await chat(config);
        const setStep = vi.spyOn(viewport, 'setStep');

        emit({ type: 'run-start' });
        emit({ type: 'step-start', name: 'reread' });
        expect(setStep).toHaveBeenLastCalledWith('a1', 'reread');
        expect(words(host)).toBe('Re-reading the conversation');
        expect(spoken(host)).toBe('Re-reading the conversation');

        emit({ type: 'step-end', name: 'reread' });
        expect(setStep).toHaveBeenLastCalledWith('a1', null);
        expect(words(host)).toBe('');
    });

    it('is heard by the observers as the key, the event untouched', async () => {
        const config = new AparteConfig();
        config.registerStepLabel('reread', 'Re-reading the conversation');
        const heard: AparteStreamRunEvent[] = [];
        config.observeRunEvents((event) => { heard.push(event); });
        const { emit } = await chat(config);

        emit({ type: 'run-start' });
        emit({ type: 'step-start', name: 'reread' });
        emit({ type: 'step-end', name: 'reread' });
        expect(heard.filter((event) => event.type.startsWith('step-'))).toEqual([
            { type: 'step-start', name: 'reread' },
            { type: 'step-end', name: 'reread' },
        ]);
    });

    it('leaves the reply an app saves with neither the key nor the label', async () => {
        const config = new AparteConfig();
        config.registerStepLabel('reread', 'Re-reading the conversation');
        const { viewport, emit } = await chat(config);

        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit({ type: 'step-start', name: 'reread' });
        emit({ type: 'text-delta', delta: 'Here is the answer.' });
        emit({ type: 'text-flush' });
        emit({ type: 'step-end', name: 'reread' });
        emit({ type: 'run-done' });

        const saved = JSON.stringify(viewport.getMessage('a1'));
        expect(saved).toContain('Here is the answer.');
        expect(saved).not.toContain('reread');
        expect(saved).not.toContain('Re-reading the conversation');
    });
});
