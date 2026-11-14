import React, { useRef } from 'react';
import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest';
import { render, renderHook, cleanup, act } from '@testing-library/react';
import { registerAllComponents, type AparteChatImperativeApi } from '@aparte/core';
import { AparteChat } from '../components/AparteChat';
import { useAparteChat, type UseAparteChat } from '../hooks/useAparteChat';
import { useAparteEvent } from '../hooks/useAparteEvent';

/*
 * The generic path: an event core has no prop for — a plugin's, or the app's own — is heard
 * on the chat's root element, `getElement()`, which `useAparteEvent` subscribes on. The
 * event here is plugin-shaped: it bubbles from inside the chat and augments
 * `HTMLElementEventMap`, as every `aparte-*` event of a plugin package does.
 */

declare global {
    interface HTMLElementEventMap {
        'aparte-test-plugin-event': CustomEvent<{ x: number }>;
    }
}

registerAllComponents();
afterEach(() => cleanup());

const MESSAGES = [{ id: 'm1', role: 'assistant' as const, content: 'hi', timestamp: 1 }];

/** The event a plugin's element would send: bubbling, with a detail. */
function sendPluginEvent(from: Element, x = 1): void {
    act(() => { from.dispatchEvent(new CustomEvent('aparte-test-plugin-event', { bubbles: true, detail: { x } })); });
}

describe('getElement() and getComposer()', () => {
    it('return the root and the composer', () => {
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} />);
        const root = container.querySelector<HTMLElement>('[data-aparte-chat]');
        expect(root).not.toBeNull();
        expect(ref.current!.getElement()).toBe(root);
        expect(ref.current!.getComposer()).toBe(root!.querySelector('aparte-composer'));
    });
});

describe('useAparteEvent', () => {
    function Probe({ handler, ref: chatRef }: { handler: (e: CustomEvent<{ x: number }>) => void; ref?: React.RefObject<AparteChatImperativeApi> }) {
        const own = useRef<AparteChatImperativeApi>(null);
        const ref = chatRef ?? own;
        useAparteEvent(ref, 'aparte-test-plugin-event', handler);
        return <AparteChat ref={ref} messages={MESSAGES} />;
    }

    it('hears a plugin-shaped event from inside the chat, once, with its detail', () => {
        const handler = vi.fn();
        const { container } = render(<Probe handler={handler} />);
        sendPluginEvent(container.querySelector('aparte-chat-bubble')!, 7);
        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ x: 7 });
    });

    it('calls the latest handler without subscribing again', () => {
        const first = vi.fn();
        const second = vi.fn();
        const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
        const { container, rerender } = render(<Probe handler={first} />);
        const subscribed = () => add.mock.calls.filter(([type]) => type === 'aparte-test-plugin-event').length;
        expect(subscribed()).toBe(1);
        rerender(<Probe handler={second} />);
        expect(subscribed()).toBe(1);
        sendPluginEvent(container.querySelector('aparte-chat-bubble')!);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        add.mockRestore();
    });

    it('removes its listener on unmount', () => {
        const handler = vi.fn();
        const { container, unmount } = render(<Probe handler={handler} />);
        const root = container.querySelector<HTMLElement>('[data-aparte-chat]')!;
        const remove = vi.spyOn(root, 'removeEventListener');
        unmount();
        expect(remove.mock.calls.some(([type]) => type === 'aparte-test-plugin-event')).toBe(true);
        sendPluginEvent(root);
        expect(handler).not.toHaveBeenCalled();
    });

    it('takes an element as the target too', () => {
        const handler = vi.fn();
        const el = document.createElement('div');
        const ref = { current: el };
        renderHook(() => useAparteEvent(ref, 'aparte-test-plugin-event', handler));
        el.dispatchEvent(new CustomEvent('aparte-test-plugin-event', { detail: { x: 3 } }));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('types the event by HTMLElementEventMap', () => {
        expectTypeOf(useAparteEvent<'aparte-test-plugin-event'>).parameter(2)
            .toEqualTypeOf<(event: CustomEvent<{ x: number }>) => void>();
    });
});

describe('useAparteChat', () => {
    it('is the imperative API, and more', () => {
        expectTypeOf<UseAparteChat>().toMatchTypeOf<AparteChatImperativeApi>();
        const { result } = renderHook(() => useAparteChat());
        expect(result.current.getElement()).toBeNull();
        expect(result.current.getComposer()).toBeNull();
    });
});
