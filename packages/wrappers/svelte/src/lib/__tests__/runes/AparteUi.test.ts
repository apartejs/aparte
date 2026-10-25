import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import AparteUi from '../../runes/AparteUi.svelte';

afterEach(() => cleanup());

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
