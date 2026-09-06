/**
 * Where an event really started, read from a listener on `document`.
 *
 * An event that crosses a shadow boundary is RETARGETED on its way out: seen from
 * outside, `event.target` is the shadow HOST, not the node that was hit. Core is light
 * DOM, so this never bites inside core — but a consumer mounting a chat inside a shadow
 * root of their own (their web component, a micro-frontend) is a documented
 * arrangement, and every handler core puts on `document` then asks "was this inside
 * me?" of the wrong element and answers no.
 *
 * `composedPath()[0]` is the node that was actually hit, whichever tree it lives in.
 * The fallbacks are for the two events that have no path: one dispatched by hand with
 * no `composed`, and one read after its dispatch has finished (the path is empty by
 * then). Internal — not exported from the package barrel; the four callers are core's
 * own document-level handlers.
 */
export function eventOrigin(e: Event): EventTarget | null {
    return e.composedPath?.()[0] ?? e.target;
}

/**
 * The tree a node lives in: the consumer's shadow root when a chat is mounted inside
 * one, the document otherwise. `document.querySelector` cannot see into a shadow tree —
 * so a sibling looked up through it is missed, and on a page that also holds one in the
 * light DOM it is the WRONG element that answers. Internal, like `eventOrigin`.
 */
export function rootOf(node: Node): ParentNode {
    return node.getRootNode() as ParentNode;
}

/**
 * The focused element as the node's own tree sees it. `document.activeElement` is
 * retargeted to the shadow HOST exactly as `event.target` is, so "is the focus inside
 * me?" answers no for every node sharing the node's shadow root.
 */
export function activeElementIn(node: Node): Element | null {
    return (node.getRootNode() as Partial<DocumentOrShadowRoot>).activeElement ?? document.activeElement;
}
