// @vitest-environment jsdom
/**
 * The waiting indicator says the step the agent is on.
 *
 * While the reply waits — nothing written yet, or a call done and the next one not begun —
 * a step the run announced ("Reading the parser") shows as words beside the dots, and is
 * what a screen reader is given in place of "Typing". It is live only: it goes as soon as
 * the reply has something to show, when the step ends, and with the reply's end, and it is
 * never one of the message's segments.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & {
    addSegment(segment: AparteSegment): void;
    updateSegment(id: string, updates: Partial<AparteSegment>): void;
    updateMessage(updates: Partial<AparteMessage>): void;
    getSegments(): AparteSegment[];
    setStep(name: string | null): void;
};

function streamingBubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const waiting = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-waiting')!;
/** The step's words as the reader sees them: '' when none shows. */
const shown = (el: HTMLElement): string => {
    const step = waiting(el).querySelector<HTMLElement>('.aparte-waiting-step');
    return !waiting(el).hidden && step && !step.hidden ? step.textContent ?? '' : '';
};
const spoken = (el: HTMLElement) => waiting(el).querySelector('.aparte-sr-only')!.textContent;

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the waiting indicator', () => {
    it('shows only the dots, and says "Typing", when no step is open', () => {
        const el = streamingBubble();
        expect(waiting(el).hidden).toBe(false);
        expect(shown(el)).toBe('');
        expect(spoken(el)).toBe(aparteGlobalConfig.getLocale().typing);
    });

    it('says the step beside the dots, to the eye and to a screen reader', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        expect(shown(el)).toBe('Reading the parser');
        expect(spoken(el)).toBe('Reading the parser');
        expect(waiting(el).querySelector('.aparte-dots')).not.toBeNull();
    });

    it('follows the step, and goes back to the dots alone when none is left', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        el.setStep('Checking tokens');
        expect(shown(el)).toBe('Checking tokens');
        el.setStep(null);
        expect(shown(el)).toBe('');
        expect(spoken(el)).toBe(aparteGlobalConfig.getLocale().typing);
    });

    it('is gone as soon as the reply has text', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        el.addSegment({ id: 't1', type: 'text', content: 'The parser reads tokens.' } as AparteSegment);
        expect(waiting(el).hidden).toBe(true);
        expect(shown(el)).toBe('');
    });

    it('comes back between two calls while the step is still open', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        el.addSegment({ id: 'tool-c1', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'read_file', input: {} } } as AparteToolCallSegment);
        expect(shown(el), 'a running call has its own row').toBe('');
        el.updateSegment('tool-c1', { status: 'resolved', result: 'ok' } as Partial<AparteSegment>);
        expect(shown(el)).toBe('Reading the parser');
    });

    it('leaves nothing once the reply ends, even a step nobody closed', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        el.updateMessage({ status: 'completed' });
        expect(shown(el)).toBe('');
        // A later turn into the same bubble (a resumed run) starts without it.
        el.updateMessage({ status: 'streaming' });
        expect(shown(el)).toBe('');
        expect(spoken(el)).toBe(aparteGlobalConfig.getLocale().typing);
    });

    it('is never one of the message\'s segments', () => {
        const el = streamingBubble();
        el.setStep('Reading the parser');
        expect(el.getSegments()).toEqual([]);
        expect(el.querySelector('.aparte-segments')!.textContent).toBe('');
    });

    it('says it in a shell of the app\'s own too, right after its dots', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => '<div class="aparte-message"><div class="aparte-message-content">'
            + '<div class="aparte-segments"></div><div class="aparte-content"></div>'
            + '<div class="aparte-waiting" hidden><span class="aparte-dots"></span><span class="aparte-sr-only"></span></div>'
            + '</div></div>');
        const el = streamingBubble();
        el.setStep('Reading the parser');
        expect(shown(el)).toBe('Reading the parser');
        expect(waiting(el).querySelector('.aparte-dots')!.nextElementSibling!.classList.contains('aparte-waiting-step')).toBe(true);
        expect(spoken(el)).toBe('Reading the parser');
    });

    it('a user bubble shows no step', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'user');
        el.setAttribute('message-id', 'u1');
        document.body.appendChild(el);
        el.setStep('Reading');
        expect(shown(el)).toBe('');
    });
});
