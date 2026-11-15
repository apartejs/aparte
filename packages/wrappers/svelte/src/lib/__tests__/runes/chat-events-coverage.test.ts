import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { registerAllComponents } from '@aparte/core';
import CoverageHost from './CoverageHost.svelte';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageEvents, emittersOf, detailFor, fire, COVERAGE_MESSAGES, COVERAGE_ACTION_ID } from '../../../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every event `<aparte-chat>` declares reaches the runes `<AparteChat>` as its callback prop —
 * `onlinkClick`, `onretry`… — once, with the detail and then the event.
 *
 * The list is core's MANIFEST (`scripts/chat-event-coverage.mjs`), never the table the
 * component forwards from: an event a generator dropped from that table is one this test
 * still sends. Each is sent from the element that really sends it — a bubble, the composer,
 * the attachment strip, a composer action placed in the toolbar, or the host for the turn's
 * lifecycle — in a chat rendered with every one of them (`CoverageHost.svelte`).
 */

registerAllComponents();

interface ChatEvent { name: string; binding: string; detail: string | null; cancelable: boolean; from: string[] }
interface Sent { event: CustomEvent; result: boolean }
const { events, exempt } = readCoverageEvents() as { events: ChatEvent[]; exempt: Array<{ name: string; binding: string }> };

/** `linkClick` → `onlinkClick`: Svelte's own spelling of a callback prop. */
const callbackOf = (binding: string): string => `on${binding}`;

afterEach(() => cleanup());

/** The chat with every sender rendered, and a callback on every event — the exempt ones included. */
async function renderChat(): Promise<{ root: HTMLElement; handlers: Map<string, Mock> }> {
    const handlers = new Map<string, Mock>();
    for (const ev of [...events, ...exempt]) handlers.set(callbackOf(ev.binding), vi.fn());
    const { container } = render(CoverageHost, {
        messages: COVERAGE_MESSAGES,
        actionId: COVERAGE_ACTION_ID,
        callbacks: Object.fromEntries(handlers),
    });
    await tick();
    return { root: container.querySelector<HTMLElement>('[data-aparte-chat]')!, handlers };
}

describe('<AparteChat> (runes) calls a callback for every event of the chat', () => {
    it('tests the events the manifest declares, at least twenty of them', () => {
        expect(events.length).toBeGreaterThanOrEqual(20);
    });

    for (const ev of events) {
        it(`${ev.name} → ${callbackOf(ev.binding)}(detail, event), once, sent by ${ev.from.join(' and ')}`, async () => {
            const { root, handlers } = await renderChat();
            const handler = handlers.get(callbackOf(ev.binding))!;
            for (const { from, element } of emittersOf(root, ev) as Array<{ from: string; element: HTMLElement }>) {
                handler.mockClear();
                const detail = detailFor(ev);
                const sent = fire(element, ev, detail) as Sent;
                expect(handler, `${ev.name} sent by <${from}>`).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith(detail, sent.event);
            }
            for (const [callback, other] of handlers) {
                if (other !== handler) expect(other, `${callback} heard ${ev.name}`).not.toHaveBeenCalled();
            }
        });
    }

    const cancelable = events.filter((ev) => ev.cancelable);
    it('has a cancelable event to cancel', () => {
        expect(cancelable.length).toBeGreaterThan(0);
    });
    for (const ev of cancelable) {
        it(`${ev.name}: event.preventDefault() in ${callbackOf(ev.binding)} reaches the sender`, async () => {
            const { root, handlers } = await renderChat();
            handlers.get(callbackOf(ev.binding))!.mockImplementation((_detail: unknown, event: Event) => event.preventDefault());
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                expect((fire(element, ev, detailFor(ev)) as Sent).result).toBe(false);
            }
        });
    }

    it('calls none of the callbacks for the events the chat keeps to itself', async () => {
        const { root, handlers } = await renderChat();
        expect(exempt.length).toBeGreaterThan(0);
        for (const ex of exempt) root.dispatchEvent(new CustomEvent(ex.name, { detail: { coverage: ex.name }, bubbles: true }));
        for (const [callback, handler] of handlers) expect(handler, `${callback} was called`).not.toHaveBeenCalled();
    });

    it('calls the send callback once per message the composer sends', async () => {
        const sendEvent = events.find((ev) => ev.name === 'aparte-send')!;
        const { root, handlers } = await renderChat();
        const composer = root.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; submit(): void };
        const sent: Event[] = [];
        root.addEventListener('aparte-send', (e) => sent.push(e));
        composer.setValue('Once');
        composer.submit();
        expect(sent).toHaveLength(1);
        const handler = handlers.get(callbackOf(sendEvent.binding))!;
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ content: 'Once' }), sent[0]);
    });
});
