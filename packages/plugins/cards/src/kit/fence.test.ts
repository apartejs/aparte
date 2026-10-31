import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { defineCard } from './define.js';
import { el } from './dom.js';
import { setupCardFences } from './fence.js';

interface Note { text: string }

const note = defineCard<Note, 'a'>({
    name: 'note',
    variants: ['a'],
    styles: '',
    icon: '<svg></svg>',
    normalize: (raw: any) => (raw && typeof raw.text === 'string' ? { text: raw.text } : null),
    render: (n) => [el('span', { class: 'text', text: n.text })],
    skeleton: () => [],
    label: (n) => n?.text ?? 'Note',
    fallback: (n) => n.text,
});

const stops: Array<() => void> = [];
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const render = (language: string, source: string, open = false) =>
    aparteGlobalConfig.getCodeLanguageRenderer(language)!.render({ language, source, open } as never) as string;

/** The fence's markup put on the page, and the card it draws once it has. */
async function mount(markup: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return host;
}

describe('card fences', () => {
    it('knows every shipped card before any is set up', () => {
        stops.push(setupCardFences());
        for (const name of ['weather', 'stock', 'link']) expect(aparteGlobalConfig.hasCodeLanguageRenderer(`card-${name}`)).toBe(true);
    });

    it('shows a waiting box while the fence is open', () => {
        stops.push(setupCardFences());
        expect(render('card-weather', '{"loc', true)).toContain('aparte-skeleton');
    });

    it('draws a card that is set up, from the JSON in the fence', async () => {
        stops.push(note.setup());
        stops.push(setupCardFences());
        const host = await mount(render('card-note', '{"text":"hello"}'));
        expect(host.querySelector('.text')!.textContent).toBe('hello');
    });

    it('fetches a card that is not set up yet, through load, once', async () => {
        let loads = 0;
        stops.push(setupCardFences({ load: { note: async () => { loads++; return { setupNoteCard: note.setup }; } } }));
        const host = await mount(render('card-note', '{"text":"a"}') + render('card-note', '{"text":"b"}'));
        expect([...host.querySelectorAll('.text')].map((t) => t.textContent)).toEqual(['a', 'b']);
        expect(loads).toBe(1);
    });

    it('shows the source when the JSON is broken or the card unknown', async () => {
        stops.push(setupCardFences());
        const broken = await mount(render('card-weather', '{nope'));
        expect(broken.querySelector('.aparte-code-error')!.textContent).toBe('{nope');
        const unknown = await mount(render('card-weather', '{"location":"Lille"}'));
        expect(unknown.querySelector('.aparte-code-error')!.textContent).toBe('{"location":"Lille"}');
    });

    it('draws a card of the app own, set up after the fences', async () => {
        const late = defineCard<Note, 'a'>({
            name: 'late', variants: ['a'], styles: '', icon: '<svg></svg>',
            normalize: (raw: any) => (raw && typeof raw.text === 'string' ? { text: raw.text } : null),
            render: (n) => [el('span', { class: 'text', text: n.text })],
            skeleton: () => [], label: () => 'Late', fallback: (n) => n.text,
        });
        stops.push(setupCardFences());
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('card-late')).toBe(false);
        stops.push(late.setup());
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('card-late')).toBe(true);
        const host = await mount(render('card-late', '{"text":"late"}'));
        expect(host.querySelector('.text')!.textContent).toBe('late');
    });

    it('takes the layout from "variant" in the block, when it names one of the card', async () => {
        const two = defineCard<Note, 'a' | 'b'>({
            name: 'twin', variants: ['a', 'b'], styles: '', icon: '<svg></svg>',
            normalize: (raw: any) => (raw && typeof raw.text === 'string' ? { text: raw.text } : null),
            render: (n, ctx) => [el('span', { class: 'text', text: `${n.text}:${ctx.variant}` })],
            skeleton: () => [], label: () => 'Twin', fallback: (n) => n.text,
        });
        stops.push(two.setup(), setupCardFences());
        const host = await mount(render('card-twin', '{"text":"x","variant":"b"}') + render('card-twin', '{"text":"y","variant":"nope"}'));
        expect([...host.querySelectorAll('.text')].map((t) => t.textContent)).toEqual(['x:b', 'y:a']);
    });

    it('stops: the languages are no longer drawn', () => {
        setupCardFences()();
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('card-weather')).toBe(false);
    });
});
