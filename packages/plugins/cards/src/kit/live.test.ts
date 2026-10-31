import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer } from '@aparte/core';
import { defineCard } from './define.js';
import { el } from './dom.js';
import { segmented, toggle, slider } from './controls.js';

interface Light { name: string; on: boolean; level: number; range: string }

const lightCard = defineCard<Light, 'card'>({
    name: 'test-light',
    variants: ['card'],
    styles: '',
    icon: '<svg></svg>',
    normalize: (raw: any) => (raw && typeof raw.name === 'string' ? { name: raw.name, on: !!raw.on, level: Number(raw.level ?? 0), range: raw.range ?? '1D' } : null),
    render: (light, ctx) => [
        el('span', { class: 'name', text: `${light.name} ${light.on ? 'on' : 'off'} ${light.level}` }),
        segmented(ctx, { name: 'range', value: light.range, options: [{ value: '1D', label: '1D' }, { value: '1M', label: () => '1M' }] }),
        toggle(ctx, { name: 'on', checked: light.on, label: () => 'Power' }),
        slider(ctx, { name: 'level', value: light.level, label: () => 'Level', format: (v) => `${v} %` }),
    ].filter((n): n is HTMLElement => n !== null),
    skeleton: () => [],
    label: (light) => light?.name ?? 'Light',
    fallback: (light) => light.name,
});

let stop: () => void = () => {};
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function draw(data: unknown): HTMLElement {
    const out = getSegmentRenderer('card')!.render(lightCard.segment(data, { id: 's1' }) as never) as HTMLElement;
    document.body.append(out);
    return out;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('a live card', () => {
    it('draws no control when nothing answers a change', () => {
        stop = lightCard.setup();
        const card = draw({ name: 'Lamp', on: true, level: 40 });
        expect(card.querySelector('button, input')).toBeNull();
    });

    it('fires the change, runs onChange and draws its answer in the same element, the focus kept', async () => {
        const onChange = vi.fn(async ({ name, value }: { name: string; value: unknown }, data: Light) => ({ ...data, [name]: value }));
        stop = lightCard.setup({ onChange });
        const card = draw({ name: 'Lamp', on: false, level: 40 });
        const seen: unknown[] = [];
        card.addEventListener('aparte-card-change', (e) => seen.push((e as CustomEvent).detail.name));
        const power = card.querySelector<HTMLButtonElement>('[role="switch"]')!;
        power.focus();
        power.click();
        expect(card.hasAttribute('data-busy')).toBe(true);
        await flush();
        expect(seen).toEqual(['on']);
        expect(onChange).toHaveBeenCalledWith({ name: 'on', value: true }, expect.objectContaining({ name: 'Lamp' }));
        expect(document.body.firstElementChild).toBe(card);
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 40');
        expect(card.hasAttribute('data-busy')).toBe(false);
        expect(document.activeElement).toBe(card.querySelector('[role="switch"]'));
        expect(card.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
    });

    it('keeps what onChange gave when core draws the same segment again, and drops it for a new result', async () => {
        stop = lightCard.setup({ onChange: async ({ name, value }, data) => ({ ...data, [name]: value }) });
        const card = draw({ name: 'Lamp', on: false, level: 40 });
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 40');

        // The message saved, a turn ending: core draws the segment again from what it holds.
        const again = draw({ name: 'Lamp', on: false, level: 40 });
        expect(again.querySelector('.name')!.textContent).toBe('Lamp on 40');
        expect(again.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');

        // The segment sent again with a new result is a new card.
        const fresh = draw({ name: 'Lamp', on: false, level: 70 });
        expect(fresh.querySelector('.name')!.textContent).toBe('Lamp off 70');
        expect(draw({ name: 'Lamp', on: false, level: 40 }).querySelector('.name')!.textContent).toBe('Lamp off 40');
    });

    it('keeps a tool card\'s onChange data through a redraw of the same call', async () => {
        stop = lightCard.setup({ tool: 'get_light', onChange: async ({ name, value }, data) => ({ ...data, [name]: value }) });
        const renderer = aparteGlobalConfig.getToolRenderer('get_light')!;
        const call = { id: 't1', type: 'tool_call', status: 'resolved', toolCall: { id: 'c1', name: 'get_light', input: {} }, structuredResult: { name: 'Lamp', on: false, level: 40 } } as never;
        const card = renderer.render(call) as HTMLElement;
        document.body.append(card);
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        const again = renderer.render(call) as HTMLElement;
        expect(again.querySelector('.name')!.textContent).toBe('Lamp on 40');
    });

    it('runs overlapping changes in order, each from the data the one before left', async () => {
        // The app answers with what it was asked: the change applied to the data it was handed.
        const answers: Array<() => void> = [];
        const seen: Light[] = [];
        stop = lightCard.setup({
            onChange: ({ name, value }, data) => new Promise((resolve) => {
                seen.push(data);
                answers.push(() => resolve({ ...data, [name]: value }));
            }),
        });
        const card = draw({ name: 'Lamp', on: false, level: 0 });
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        const input = card.querySelector<HTMLInputElement>('input[type="range"]')!;
        input.value = '70';
        input.dispatchEvent(new Event('change'));
        // One request at a time: the slider waits for the switch's answer.
        expect(answers).toHaveLength(1);
        answers[0]!();
        await flush();
        expect(answers).toHaveLength(2);
        expect(seen[1]!.on).toBe(true);
        answers[1]!();
        await flush();
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 70');
        expect(card.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
        expect(card.hasAttribute('data-busy')).toBe(false);
    });

    it('asks once for a control moved several times while it waits, with its latest value', async () => {
        const asked: unknown[] = [];
        const answers: Array<() => void> = [];
        stop = lightCard.setup({
            onChange: ({ name, value }, data) => new Promise((resolve) => {
                asked.push(value);
                answers.push(() => resolve({ ...data, [name]: value }));
            }),
        });
        const card = draw({ name: 'Lamp', on: true, level: 0 });
        const move = (v: number) => {
            const input = card.querySelector<HTMLInputElement>('input[type="range"]')!;
            input.value = String(v);
            input.dispatchEvent(new Event('change'));
        };
        move(10);
        move(30);
        move(60);
        answers[0]!();
        await flush();
        answers[1]!();
        await flush();
        expect(asked).toEqual([10, 60]);
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 60');
    });

    it('drops a change still waiting when core draws the card from a new result', async () => {
        let answer: () => void = () => {};
        stop = lightCard.setup({ tool: 'get_light', onChange: ({ name, value }, data) => new Promise((resolve) => { answer = () => resolve({ ...data, [name]: value }); }) });
        const renderer = aparteGlobalConfig.getToolRenderer('get_light')!;
        const call = (level: number) => ({ id: 't9', type: 'tool_call', status: 'resolved', toolCall: { id: 'c9', name: 'get_light', input: {} }, structuredResult: { name: 'Lamp', on: false, level } }) as never;
        const card = renderer.render(call(10)) as HTMLElement;
        document.body.append(card);
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        renderer.update!(card, call(99));
        answer();
        await flush();
        expect(card.querySelector('.name')!.textContent).toBe('Lamp off 99');
        expect(card.hasAttribute('data-busy')).toBe(false);
    });

    it('lets the app cancel the change, and leaves the card as it is when onChange returns nothing or throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let answer: unknown = undefined;
        const onChange = vi.fn(async () => {
            if (answer === 'throw') throw new Error('offline');
            return answer;
        });
        stop = lightCard.setup({ onChange });
        const card = draw({ name: 'Lamp', on: true, level: 0 });
        card.addEventListener('aparte-card-change', (e) => e.preventDefault(), { once: true });
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        expect(onChange).not.toHaveBeenCalled();
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 0');
        answer = 'throw';
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        answer = { nope: true };
        card.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
        await flush();
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 0');
        expect(card.hasAttribute('data-busy')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('does not report a choice that is already pressed, and shows the slider value while it moves', () => {
        const onChange = vi.fn();
        stop = lightCard.setup({ onChange });
        const card = draw({ name: 'Lamp', on: true, level: 40, range: '1D' });
        card.querySelector<HTMLButtonElement>('[data-card-key="range:1D"]')!.click();
        expect(onChange).not.toHaveBeenCalled();
        const input = card.querySelector<HTMLInputElement>('input[type="range"]')!;
        input.value = '75';
        input.dispatchEvent(new Event('input'));
        expect(card.querySelector('output')!.textContent).toBe('75 %');
        expect(input.getAttribute('aria-valuetext')).toBe('75 %');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('draws a card segment sent again with new data in place', () => {
        stop = lightCard.setup();
        const renderer = getSegmentRenderer('card')!;
        const card = draw({ name: 'Lamp', on: false, level: 0 });
        renderer.update!(card, lightCard.segment({ name: 'Lamp', on: true, level: 80 }, { id: 's1' }) as never);
        expect(document.body.firstElementChild).toBe(card);
        expect(card.querySelector('.name')!.textContent).toBe('Lamp on 80');
    });
});
