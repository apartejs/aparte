import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, registerSegmentRenderer } from '@aparte/core';
import { defineCard } from './define.js';
import { el } from './dom.js';

interface Note { text: string }

const card = (name: string, styles: string) => defineCard<Note, 'a' | 'b'>({
    name,
    variants: ['a', 'b'],
    styles,
    icon: '<svg></svg>',
    normalize: (raw: any) => (raw && typeof raw.text === 'string' ? { text: raw.text } : null),
    render: (note, ctx) => [el('span', { class: 'text', text: `${note.text}:${ctx.variant}` })],
    skeleton: () => [],
    label: (note) => note?.text ?? 'Note',
    fallback: (note) => note.text,
});

const first = card('test-first', '.aparte-test-first { color: red }');

const stops: Array<() => void> = [];
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const segment = (which: ReturnType<typeof card>, text: string) => getSegmentRenderer('card')!.render(which.segment({ text }, { id: 's1' }) as never) as HTMLElement;

describe('setting a card up', () => {
    it('stacks: the newer setup draws, and taking the older off leaves it in place', () => {
        const older = first.setup({ tool: 'get_note', variant: 'a' });
        const newer = first.setup({ tool: 'get_note', variant: 'b' });
        stops.push(newer);
        expect(segment(first, 'x').querySelector('.text')!.textContent).toBe('x:b');
        older();
        expect(aparteGlobalConfig.getToolRenderer('get_note')).toBeTruthy();
        expect(getSegmentRenderer('card')).toBeTruthy();
        expect(segment(first, 'x').querySelector('.text')!.textContent).toBe('x:b');
        newer();
        expect(aparteGlobalConfig.getToolRenderer('get_note')).toBeFalsy();
    });

    it('gives back a card segment renderer the app had before the first setup', () => {
        const own = { type: 'card', render: () => el('p', { class: 'aparte-own', text: 'own' }) };
        registerSegmentRenderer(own as never);
        const stop = first.setup();
        expect(segment(first, 'x').classList.contains('aparte-own')).toBe(false);
        stop();
        expect(getSegmentRenderer('card')).toBe(own);
    });

    it("puts a card's sheet on the page when its setup comes after another card's", () => {
        stops.push(first.setup());
        const later = card('test-later', '.aparte-test-later { color: blue }');
        stops.push(later.setup());
        document.body.append(segment(later, 'y'));
        const sheets = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
        expect(sheets).toContain('.aparte-test-later');
    });

    it('turns a segment drawn as its fallback sentence into the card once the card is set up', () => {
        stops.push(first.setup());
        const pending = card('test-pending', '');
        const renderer = getSegmentRenderer('card')!;
        const shown = renderer.render(pending.segment({ text: 'z' }, { id: 's2' }) as never) as HTMLElement;
        document.body.append(shown);
        expect(shown.tagName).toBe('P');
        stops.push(pending.setup());
        getSegmentRenderer('card')!.update!(shown, pending.segment({ text: 'z' }, { id: 's2' }) as never);
        expect(document.body.querySelector('[data-card="test-pending"] .text')!.textContent).toBe('z:a');
    });
});
