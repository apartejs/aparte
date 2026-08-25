/**
 * Which chat an element belongs to.
 *
 * The predicate is three-legged and every leg is load-bearing: `<aparte-chat>` is the
 * vanilla shell, `<aparte-chat-component>` is Angular's, and the other three wrappers
 * render a plain `<div data-aparte-chat id="…">` — so matching only the tag finds the
 * boundary in one framework out of four.
 *
 * Extracted because it was written out four times (the bubble's target-id walk, the
 * composer's, the elicitation presenter's composer walk, and the presenter routing in
 * `AparteConfig`), which is the duplication threshold CLAUDE.md sets for a new layer.
 * A fifth copy is how the three-legged predicate loses a leg.
 */

/**
 * True when `el` is the host element of a chat, in any of the four framework shapes.
 *
 * Not exported: `chatBoundaryOf` is the only caller, and an export nothing uses is a
 * contract maintained for nobody.
 */
function isChatBoundary(el: Element | null | undefined): boolean {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'aparte-chat'
        || tag === 'aparte-chat-component'
        || el.hasAttribute?.('data-aparte-chat') === true;
}

/**
 * The nearest chat host at or above `el`, or `null`.
 *
 * Identity is the point: two elements are in the same chat when this returns the same
 * node for both. That is what makes it usable for routing a request to the presenter
 * that lives beside the transcript rather than above it, where `contains` would fail.
 */
export function chatBoundaryOf(el: Element | null | undefined): HTMLElement | null {
    let node: Element | null = el ?? null;
    while (node) {
        if (isChatBoundary(node)) return node as HTMLElement;
        node = node.parentElement;
    }
    return null;
}

/*
 * NOT extracted here, deliberately: the bubble's and the composer's target-id walks
 * (`aparte-chat-bubble.ts`, `aparte-composer.ts`) look like this one but are not. They
 * test `isHost && el.id` and keep CLIMBING past an id-less host to find an enclosing one
 * that has an id, where `chatBoundaryOf` stops at the first boundary. Folding them in
 * would change which chat an element is attributed to — a behaviour change wearing a
 * refactor's clothes. They can be unified once someone decides which rule is right; that
 * is a separate change with its own reasoning.
 */
