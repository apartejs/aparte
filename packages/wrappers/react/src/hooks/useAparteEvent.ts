import { useEffect, useRef } from 'react';

/** What `useAparteEvent` listens on: an element, or a handle that has one (`<AparteChat>`'s ref). */
type AparteEventTarget ={ getElement(): HTMLElement | null } | HTMLElement | null;

/**
 * Listen to an event `<AparteChat>` has no prop for — one a plugin sends
 * (`aparte-subagent-open`, `aparte-artifact-open`, `aparte-diff-comment`…) or your own. The
 * chat's parts send their events up to its root, so one listener there hears them all.
 *
 * Pass the chat's ref (or an element) and the event's name. The handler is typed by
 * `HTMLElementEventMap`, which every plugin package augments, so `event.detail` is typed
 * with no cast. The latest handler is always the one called: it can close over state and
 * take no new subscription. Call it in the component that renders the chat: after each of
 * its renders the hook looks at the element the ref points to, so a chat shown later, or
 * mounted again, is heard, and one that went away is let go.
 *
 * @example
 * const chat = useAparteChat();
 * useAparteEvent(chat.ref, 'aparte-subagent-open', (e) => openPanel(e.detail.runId));
 * return <AparteChat ref={chat.ref} messages={chat.messages} onMessagesChange={chat.setMessages} />;
 */
export function useAparteEvent<K extends keyof HTMLElementEventMap>(
    target: React.RefObject<AparteEventTarget>,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
): void {
    const latest = useRef(handler);
    latest.current = handler;
    const heard = useRef<{ element: HTMLElement; type: string; stop: () => void } | null>(null);

    // After every render, not once: a ref changing does not render, so the element is read
    // again each time the calling component renders — which it does to show or remove the
    // chat. A dependency list would keep the first answer, and a chat shown on the second
    // render was never heard. The check is an identity test; the listener moves only when
    // the element or the type changed.
    useEffect(() => {
        const current = target.current;
        const element = current == null ? null : 'getElement' in current ? current.getElement() : current;
        const was = heard.current;
        if (was && was.element === element && was.type === type) return;
        was?.stop();
        heard.current = null;
        if (!element) return;
        const listener = (event: Event): void => latest.current(event as HTMLElementEventMap[K]);
        element.addEventListener(type, listener);
        heard.current = { element, type, stop: () => element.removeEventListener(type, listener) };
    });

    useEffect(() => () => {
        heard.current?.stop();
        heard.current = null;
    }, []);
}
