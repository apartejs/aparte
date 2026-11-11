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
