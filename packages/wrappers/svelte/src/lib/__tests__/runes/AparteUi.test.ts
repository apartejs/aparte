import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import AparteUi from '../../runes/AparteUi.svelte';
import PropsBagHost from './PropsBagHost.svelte';

afterEach(() => cleanup());

/** Records what it is told: each attribute change it hears, and each assignment of `items`. */
class FxProbe extends HTMLElement {
    static get observedAttributes(): string[] { return ['mode']; }
    heard: string[] = [];
    sets = 0;
    private _items: unknown = null;
    get items(): unknown { return this._items; }
    set items(value: unknown) { this._items = value; this.sets++; }
    attributeChangedCallback(name: string): void { this.heard.push(name); }
}
if (!customElements.get('fx-probe')) customElements.define('fx-probe', FxProbe);

// A prop bag handed again — a new object with the same values, as a `$state` proxy re-read gives.
// The element hears an attribute only when its value changes, and gets the object again every
// time (it may have been mutated in place), so its setter can keep its state.
describe('<AparteUi> for Svelte 5, handed an equal prop bag', () => {
    it('writes no attribute again and hands the object again', () => {
        const items = ['a'];
        const { container, component } = render(PropsBagHost, { props: { initial: { mode: 'ask', items } } });
        flushSync();
        const host = component as unknown as { hand(next: Record<string, unknown>): void };
        const el = container.querySelector('fx-probe') as FxProbe;
        expect(el.heard).toEqual(['mode']);
        const sets = el.sets;
        host.hand({ mode: 'ask', items });
        flushSync();
        expect(container.querySelector('fx-probe')).toBe(el);
        expect(el.heard).toEqual(['mode']);
        expect(el.sets).toBe(sets + 1);
        host.hand({ mode: 'auto', items });
        flushSync();
        expect(el.heard).toEqual(['mode', 'mode']);
    });
});

describe('<AparteUi> for Svelte 5', () => {
    it('mounts the tag, sets its props and forwards its events through the callback prop', () => {
        const onelementEvent = vi.fn();
        const { container, component } = render(AparteUi, {
            props: { name: 'my-probe', props: { 'data-budget': '8000' }, events: ['probe-ping'], onelementEvent },
        });
        flushSync();
        const el = container.querySelector('my-probe') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.getAttribute('data-budget')).toBe('8000');
        el.dispatchEvent(new CustomEvent('probe-ping', { detail: 1 }));
        expect(onelementEvent).toHaveBeenCalledTimes(1);
        expect((onelementEvent.mock.calls[0]![0] as CustomEvent).detail).toBe(1);
        const api = component as unknown as { getElement(): HTMLElement | null };
        expect(api.getElement()).toBe(el);
    });
});
