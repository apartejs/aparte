// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer } from '@aparte/core';
import { defineCard } from './define.js';
import { el } from './dom.js';

interface Note { text: string }

const noteCard = defineCard<Note, 'card'>({
    name: 'test-note',
    variants: ['card'],
    styles: '',
    icon: '<svg></svg>',
    normalize: (raw: any) => (raw && typeof raw.text === 'string' ? { text: raw.text } : null),
    render: (note) => [el('span', { class: 'text', text: note.text })],
    skeleton: () => [],
    label: (note) => note?.text ?? 'Note',
    fallback: (note) => note.text,
});

let stop: (() => void) | undefined;
afterEach(() => {
    stop?.();
    stop = undefined;
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function draw(data: unknown, id = 's1'): HTMLElement {
    const out = getSegmentRenderer('card')!.render(noteCard.segment(data, { id }) as never) as HTMLElement;
    document.body.append(out);
    return out;
}
const labels = (card: HTMLElement): string[] =>
    [...card.querySelectorAll('.aparte-rich-card__actions button')].map((b) => b.textContent ?? '');

describe('setup() returns a callable that can also refresh', () => {
    it('is still the stop function', () => {
        stop = noteCard.setup();
        expect(typeof stop).toBe('function');
        expect(typeof (stop as unknown as { refresh: unknown }).refresh).toBe('function');
    });

    it('re-runs `actions` on the cards on screen, with the data they were drawn from', () => {
        let signedIn = false;
        const seen: string[] = [];
        const handle = noteCard.setup({
            actions: (note) => {
                seen.push(note.text);
                return [{ label: signedIn ? 'Save' : 'Sign in', id: 'go' }];
            },
        });
        stop = handle;
        const card = draw({ text: 'hello' });
        expect(labels(card)).toEqual(['Sign in']);

        signedIn = true;
        handle.refresh();
        expect(labels(card)).toEqual(['Save']);
        expect(seen).toEqual(['hello', 'hello']);
        expect(card.querySelectorAll('.aparte-rich-card__actions').length).toBe(1);
        expect(card.querySelector('.text')!.textContent).toBe('hello');
    });

    it('draws actions that came to exist, and drops those that stopped', () => {
        let on = false;
        const handle = noteCard.setup({ actions: () => (on ? [{ label: 'Open', id: 'o' }] : []) });
        stop = handle;
        const card = draw({ text: 'x' });
        expect(labels(card)).toEqual([]);
        on = true;
        handle.refresh();
        expect(labels(card)).toEqual(['Open']);
        on = false;
        handle.refresh();
        expect(card.querySelector('.aparte-rich-card__actions')).toBeNull();
    });

    it('reaches every live card, leaves a card that left the page, and calls a card\'s own setup only', () => {
        let word = 'a';
        const handle = noteCard.setup({ actions: () => [{ label: word, id: 'w' }] });
        stop = handle;
        const one = draw({ text: '1' }, 's1');
        const two = draw({ text: '2' }, 's2');
        const gone = draw({ text: '3' }, 's3');
        gone.remove();
        word = 'b';
        handle.refresh();
        expect(labels(one)).toEqual(['b']);
        expect(labels(two)).toEqual(['b']);
        expect(labels(gone)).toEqual(['a']);
    });

    it('keeps the keyboard where it was when the button it was on is drawn again', () => {
        let word = 'a';
        const handle = noteCard.setup({ actions: () => [{ label: word, id: 'w' }] });
        stop = handle;
        const card = draw({ text: 'x' });
        card.querySelector<HTMLButtonElement>('.aparte-rich-card__actions button')!.focus();
        word = 'b';
        handle.refresh();
        expect(document.activeElement).toBe(card.querySelector('.aparte-rich-card__actions button'));
    });

    it('does nothing once stopped', () => {
        let word = 'a';
        const handle = noteCard.setup({ actions: () => [{ label: word, id: 'w' }] });
        const card = draw({ text: 'x' });
        handle();
        word = 'b';
        expect(() => handle.refresh()).not.toThrow();
        expect(labels(card)).toEqual(['a']);
    });

    it('uses the data a card was last drawn from, not the first', () => {
        const handle = noteCard.setup({ actions: (note) => [{ label: note.text, id: 'n' }] });
        stop = handle;
        const card = draw({ text: 'first' });
        // Core draws the same segment again with a new result, into the element on the page.
        const renderer = getSegmentRenderer('card')!;
        renderer.update!(card, noteCard.segment({ text: 'second' }, { id: 's1' }) as never);
        expect(labels(card)).toEqual(['second']);
        handle.refresh();
        expect(labels(card)).toEqual(['second']);
    });
});
