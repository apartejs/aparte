/*
 * What the five chat components' coverage tests share: one reading of the chat's events, and
 * one way to send each from the element that really sends it.
 *
 * Each wrapper's chat component forwards `<aparte-chat>`'s events from a table generated for
 * it. A test that took its list from that table would agree with any generator bug — an event
 * dropped from the table is an event nobody tests. So the list comes from the MANIFEST, through
 * `chat-surface.mjs`, and only once rule 5 of `check-event-map` holds on it: the events core
 * really sends to the chat's root, each with what sends it (`from`: a part's tag, or `'host'`).
 *
 * Beside the list:
 *   • the name each event binds under, from the generator's one naming function and the
 *     config's renames. The NAME is the generator's to decide and its own suite's to pin
 *     (`scripts/__tests__/gen-chat-bindings.test.ts`); whether the event ARRIVES under it is
 *     what the coverage tests check;
 *   • what a render needs for every sender to exist: `COVERAGE_MESSAGES` for the bubbles, the
 *     attachment strip (`attachments`), an `<aparte-composer-action>` placed in the toolbar;
 *   • the senders of an event in that render ({@link emittersOf}), a detail core's own
 *     listeners on the way can read ({@link detailFor}), and the dispatch ({@link fire}).
 *
 * The reading runs in Node (the manifest, core's sources); the rest is handed the rendered
 * root by a jsdom test. Missing manifest: `readChatTree` throws "build @aparte/core first",
 * and the test file fails on it rather than skipping.
 */
import { CHAT_EVENT_FLOOR, CHAT_EXEMPT, CHAT_TAG, checkChatSurface, readChatEvents, readChatTree } from './chat-surface.mjs';
import { bindingName } from './gen-element-bindings.mjs';
import bindings from '../packages/core/element-bindings.config.mjs';

/** A question and its reply, so every event a bubble sends has a bubble to come from. */
export const COVERAGE_MESSAGES = [
    { id: 'coverage-user', role: 'user', content: 'Where does the list of events come from?', timestamp: 1 },
    { id: 'coverage-reply', role: 'assistant', content: 'From the manifest of `@aparte/core`.', timestamp: 2 },
];

/** The `action-id` of the `<aparte-composer-action>` a test places in the composer's toolbar. */
export const COVERAGE_ACTION_ID = 'coverage-action';

/**
 * The chat's events as the manifest declares them, each with `binding`, the name it is
 * published under; and the exempt events, each with the name a forwarder would have given it,
 * so a test can listen there too and see nothing arrive.
 *
 * Throws rather than returning less: no manifest, a surface rule 5 refuses, or a list under
 * {@link CHAT_EVENT_FLOOR} — a collapsed reading would make every assertion vacuous.
 */
export function readCoverageEvents() {
    const tree = readChatTree();
    const { problems } = checkChatSurface(tree);
    if (problems.length) {
        throw new Error(`the chat's surface does not hold (check-event-map, rule 5):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    }
    const events = readChatEvents(tree).map((ev) => ({ ...ev, binding: bindingName(CHAT_TAG, ev.name, bindings) }));
    if (events.length < CHAT_EVENT_FLOOR) {
        throw new Error(`only ${events.length} chat event(s) read from the manifest, floor is ${CHAT_EVENT_FLOOR}.`);
    }
    const exempt = [...CHAT_EXEMPT.keys()].map((name) => ({ name, binding: bindingName(CHAT_TAG, name, bindings) }));
    return { events, exempt };
}

/**
 * Every element that sends `event` in a rendered chat whose host is `root`: the root itself
 * for what the host sends, else the first instance of each part under it. A sender the
 * render does not contain is an error, not a pass: the render lacks what makes it exist.
 */
export function emittersOf(root, event) {
    return event.from.map((from) => {
        const element = from === 'host' ? root : root.querySelector(from);
        if (!element) {
            throw new Error(`"${event.name}" is sent by <${from}>, and the chat rendered none: render what makes it exist.`);
        }
        return { from, element };
    });
}

/**
 * The detail to send `event` with: `null` for an event that carries none, as core sends it.
 * Otherwise an object no other event shares, carrying what core's own listeners on the way
 * read, so the chat stays as the test rendered it: `messages` and `siblings` (the host takes
 * them off an `aparte-path-changed` and puts that list back), and a `targetId` no chat has (the
 * conversation controller then leaves an `aparte-send` alone instead of appending a message).
 */
export function detailFor(event, messages = COVERAGE_MESSAGES) {
    if (event.detail === null) return null;
    return { coverage: event.name, targetId: 'coverage-no-chat', messages, siblings: [] };
}

/**
 * `event` sent from `element` the way core sends it: bubbling, composed, and cancelable when
 * the manifest's sender makes it so. Returns the event and what `dispatchEvent` returned —
 * `false` once a listener called `preventDefault()` on a cancelable one.
 */
export function fire(element, event, detail) {
    // The element's own window's constructor: this module is Node's, the element the test DOM's.
    const { CustomEvent } = element.ownerDocument.defaultView;
    const dispatched = new CustomEvent(event.name, { detail, bubbles: true, composed: true, cancelable: event.cancelable });
    const result = element.dispatchEvent(dispatched);
    return { event: dispatched, result };
}
