import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { applyElementProps, DEFAULT_UI_EVENTS } from '@aparte/core';

export interface AparteUiProps {
    /** The custom element tag name (e.g. 'aparte-chat-input'). */
    name: string;
    /** Props to apply. Keys starting with `--` become CSS variables. */
    props?: Record<string, unknown>;
    /** Emits a forwarded custom event from the underlying Web Component. */
    onElementEvent?: (event: CustomEvent) => void;
    /**
     * Which custom events to forward through `onElementEvent`. Defaults to the
     * interactive aparté surface ({@link DEFAULT_EVENTS}); pass your own list to
     * listen to other events (e.g. `['aparte-composer-change']` for attachments).
     */
    events?: string[];
}

export interface AparteUiHandle {
    getElement: <T extends HTMLElement = HTMLElement>() => T | null;
    callMethod: <T = unknown>(methodName: string, ...args: unknown[]) => T | undefined;
}

/**
 * Universal pass-through proxy: dynamically mounts any `aparte-*` Web Component so
 * you don't need a dedicated React wrapper per element. React equivalent of
 * Angular's `AparteUiComponent`.
 *
 * @example
 * <AparteUi name="aparte-chat-input" props={{ placeholder: 'Ask…', '--glow-speed': '4s' }} onElementEvent={onEvent} />
 */
export const AparteUi = forwardRef<AparteUiHandle, AparteUiProps>(function AparteUi(
    { name, props = {}, onElementEvent, events },
    ref,
) {
    const hostRef = useRef<HTMLSpanElement>(null);
    const elRef = useRef<HTMLElement | null>(null);
    const cbRef = useRef(onElementEvent);
    cbRef.current = onElementEvent;

    const evts = events ?? DEFAULT_UI_EVENTS;
    const evtsKey = evts.join('|');

    // (Re)create the element when `name` (or the forwarded event set) changes.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const el = document.createElement(name);
        elRef.current = el;
        const cleanups: Array<() => void> = [];
        for (const ev of evtsKey.split('|').filter(Boolean)) {
            const listener = (e: Event) => cbRef.current?.(e as CustomEvent);
            el.addEventListener(ev, listener);
            cleanups.push(() => el.removeEventListener(ev, listener));
        }
        host.appendChild(el);
        return () => {
            for (const c of cleanups) c();
            el.remove();
            elRef.current = null;
        };
    }, [name, evtsKey]);

    // Apply props whenever they change.
    useEffect(() => {
        if (elRef.current) applyElementProps(elRef.current, props);
    }, [props]);

    useImperativeHandle(ref, (): AparteUiHandle => ({
        getElement: () => elRef.current as never,
        callMethod: (methodName, ...args) => {
            const fn = (elRef.current as unknown as Record<string, unknown>)?.[methodName];
            return typeof fn === 'function'
                ? (fn as (...a: unknown[]) => unknown).apply(elRef.current, args) as never
                : undefined;
        },
    }), []);

    return <span ref={hostRef} style={{ display: 'contents' }} />;
});

AparteUi.displayName = 'AparteUi';
