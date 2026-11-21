/**
 * `<AparteUi>` forwards an element's events through `elementEvent` — as a component
 * event for Svelte 4, and as the `onelementEvent` callback prop for Svelte 5 (#47).
 * Same payload on both routes: the element's own CustomEvent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import AparteUi from '../AparteUi.svelte';
import { registerAllComponents, APARTE_DEFAULT_UI_EVENTS } from '@aparte/core';

registerAllComponents();
afterEach(cleanup);

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

// A prop bag handed again — Svelte 4's `items = items`, or a new object with the same values.
// The element hears an attribute only when its value changes, and gets the object again every
// time (it may have been mutated in place), so its setter can keep its state.
describe('<AparteUi> handed an equal prop bag', () => {
    it('writes no attribute again and hands the object again', async () => {
        const items = ['a'];
        const { container, component } = render(AparteUi, { props: { name: 'fx-probe', props: { mode: 'ask', items } } });
        await tick();
        const el = container.querySelector('fx-probe') as FxProbe;
        expect(el.heard).toEqual(['mode']);
        const sets = el.sets;
        (component as any).$set({ props: { mode: 'ask', items } });
        await tick();
        expect(el.heard).toEqual(['mode']);
        expect(el.sets).toBe(sets + 1);
        (component as any).$set({ props: { mode: 'auto', items } });
        await tick();
        expect(el.heard).toEqual(['mode', 'mode']);
    });
});

describe('<AparteUi> handed a bag a key left', () => {
    // A key that leaves the bag (`{ ...(busy && { disabled: true }) }` once busy ends) is cleared:
    // the wrapper hands the WHOLE bag (`replace`). Written key by key, the attribute stayed.
    it('clears that key', async () => {
        const { container, component } = render(AparteUi, { props: { name: 'fx-probe', props: { mode: 'ask' } } });
        await tick();
        const el = container.querySelector('fx-probe') as FxProbe;
        expect(el.hasAttribute('mode')).toBe(true);
        (component as any).$set({ props: {} });
        await tick();
        expect(el.hasAttribute('mode')).toBe(false);
    });
});

describe("<AparteUi> on <aparte-launcher>", () => {
    it('turns the header OFF with the string on false, and passes the rest of its props', async () => {
        // `header` is ON by default: removing it on `false` would have drawn the header.
        // `props` is also the testing library's own option, so the component's go under it.
        const { container } = render(AparteUi, {
            props: { name: 'aparte-launcher', props: { open: true, header: false, heading: 'Help', maximizable: 'panel', maximized: true } },
        });
        await tick();
        const el = container.querySelector('aparte-launcher') as HTMLElement & { covers: boolean };
        expect(el.getAttribute('header')).toBe('false');
        expect(el.querySelector('.aparte-launcher__header')).toBeNull();
        expect(el.getAttribute('heading')).toBe('Help');
        expect(el.getAttribute('maximizable')).toBe('panel');
        expect(el.covers).toBe(false);
    });
});

describe('<AparteUi> callback prop', () => {
    it('calls onelementEvent with the element’s event, alongside the elementEvent component event', async () => {
        const onelementEvent = vi.fn();
        // A tag aparté does not define, like the docs' own `<AparteUi name="my-token-counter">`:
        // the proxy's job is the forwarding, and a built-in's constructor has needs jsdom
        // does not meet (the select did not survive `createElement` here).
        const { container, component } = render(AparteUi, { name: 'my-token-counter', onelementEvent });
        const viaEvent = vi.fn();
        (component as any).$on('elementEvent', (e: any) => viaEvent(e.detail));
        await tick();

        const el = container.querySelector('my-token-counter');
        expect(el, 'the element is created on mount').not.toBeNull();
        const name = APARTE_DEFAULT_UI_EVENTS[0]!;
        const event = new CustomEvent(name, { detail: { value: 'gpt-4o-mini' }, bubbles: true });
        el!.dispatchEvent(event);

        expect(onelementEvent).toHaveBeenCalledTimes(1);
        expect(onelementEvent.mock.calls[0]![0]).toBe(event);
        expect(viaEvent, 'the component event still fires').toHaveBeenCalledTimes(1);
    });
});
