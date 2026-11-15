/**
 * Which chat an element belongs to, and an event that says so.
 *
 * A page with several chats listens to what bubbles out of them — a card's action, the approval
 * mode switched, a line commented — and must know which chat it came from. The turn's lifecycle
 * events have said it from the start (`dispatchLifecycleEvent` stamps `targetId`); an event a
 * chat's content or its composer's toolbar sent did not, and an app climbed the DOM itself.
 *
 * The climb was already written several times inside core, privately — the composer, the client,
 * the bubble, the context gauge, the suggestions — each its own copy of one rule. It is written
 * once here, and exported, because a plugin's element (ours or a third party's) needs the same
 * answer to stamp its own events: it cannot reach into core's private copies.
 */

/** The chat hosts the climb stops at: the element, and the root each React, Vue or Svelte wrapper renders. */
const isChatHost = (node: Element): boolean =>
    node.localName === 'aparte-chat' || node.hasAttribute('data-aparte-chat');

/** One step up, across a shadow root: an element mounted inside a host's own root still belongs to the chat around that host. */
function parentOf(node: Element): Element | null {
    if (node.parentElement) return node.parentElement;
    const root = node.getRootNode?.();
    return root && 'host' in root ? (root as ShadowRoot).host : null;
}

/**
 * The id of the chat `el` belongs to, or `undefined` when it belongs to none with an id.
 *
 * Climbing from `el` itself: the first aparté element with a `target` attribute names its chat
 * (a composer, a suggestions row or a gauge placed outside the chat it serves says so there);
 * otherwise the nearest `<aparte-chat>` or `[data-aparte-chat]` root that has an id. An id-less
 * host is passed over rather than answered with "no id", so a chat nested in another names the
 * one that has a name.
 *
 * `undefined` is an answer, not an error: a page with one chat needs no id, and an event that
 * names no chat is, by the rule every receiver in core follows, for every chat.
 *
 * @example
 * ```ts
 * import { chatIdOf } from '@aparte/core';
 *
 * document.addEventListener('aparte-card-action', (event) => {
 *     const chat = event.detail.targetId ?? chatIdOf(event.target as Element);
 * });
 * ```
 */
export function chatIdOf(el: Element | null | undefined): string | undefined {
    for (let node: Element | null = el ?? null; node; node = parentOf(node)) {
        if (node.localName.startsWith('aparte-')) {
            const target = node.getAttribute('target');
            if (target) return target;
        }
        if (isChatHost(node) && node.id) return node.id;
    }
    return undefined;
}

/** What {@link dispatchChatEvent} adds to a detail: the chat it came from, when there is one to name. */
export interface AparteChatScoped {
    /** The id of the chat the event came from ({@link chatIdOf} its sender); absent on a page whose chat has no id. */
    targetId?: string;
}

/**
 * Dispatch `type` on `el`, bubbling and composed, its detail stamped with the chat `el` belongs to
 * (`targetId`, from {@link chatIdOf}) — the stamp `dispatchLifecycleEvent` puts on the turn's own
 * events, for everything else a chat's content or its composer sends.
 *
 * A `targetId` the detail already carries is kept: the sender knew better. Without a chat to name,
 * the detail goes as it is, with no `targetId` key. Returns what `dispatchEvent` returns, so a
 * cancelable event (`{ cancelable: true }`) tells the sender whether a listener cancelled it.
 *
 * @example
 * ```ts
 * import { dispatchChatEvent } from '@aparte/core';
 *
 * class MyWidget extends HTMLElement {
 *     pick(value: string): void {
 *         dispatchChatEvent(this, 'my-widget-pick', { value });
 *     }
 * }
 * ```
 */
export function dispatchChatEvent<T extends object>(
    el: Element,
    type: string,
    detail: T,
    init: { cancelable?: boolean } = {},
): boolean {
    const targetId = (detail as AparteChatScoped).targetId ?? chatIdOf(el);
    const stamped = targetId === undefined ? detail : { ...detail, targetId };
    return el.dispatchEvent(new CustomEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: init.cancelable === true,
        detail: stamped,
    }));
}
