import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { registerAllComponents } from '@aparte/core';
import ChatCoverageHost from './ChatCoverageHost.svelte';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageEvents, emittersOf, detailFor, fire, COVERAGE_MESSAGES, COVERAGE_ACTION_ID } from '../../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every event `<aparte-chat>` declares reaches the Svelte-4-syntax `<AparteChat>` as a
 * component event — `on:linkClick`, `on:retry`… — once, carrying the detail; and a listener's
 * `preventDefault()` on a cancelable one reaches the element that sent it.
 *
 * The list is core's MANIFEST (`scripts/chat-event-coverage.mjs`), never the table the
 * component forwards from: an event a generator dropped from that table is one this test
 * still sends. Each is sent from the element that really sends it — a bubble, the composer,
 * the attachment strip, a composer action placed in the toolbar, or the host for the turn's
 * lifecycle — in a chat rendered with every one of them (`ChatCoverageHost.svelte`).
 */

registerAllComponents();

interface ChatEvent { name: string; binding: string; detail: string | null; cancelable: boolean; from: string[] }
interface Sent { event: CustomEvent; result: boolean }
interface LegacyChat { $on(type: string, handler: (event: CustomEvent) => void): () => void }
const { events, exempt } = readCoverageEvents() as { events: ChatEvent[]; exempt: Array<{ name: string; binding: string }> };

afterEach(() => cleanup());

/** The chat with every sender rendered, and `$on` on every event — the exempt ones included. */
async function renderChat(props: Record<string, unknown> = {}): Promise<{ root: HTMLElement; handlers: Map<string, Mock> }> {
    const { container, component } = render(ChatCoverageHost, { messages: COVERAGE_MESSAGES, actionId: COVERAGE_ACTION_ID, ...props });
    await tick();
    const chat = (component as unknown as { instance(): LegacyChat }).instance();
    const handlers = new Map<string, Mock>();
    for (const ev of [...events, ...exempt]) {
        const handler = vi.fn();
        chat.$on(ev.binding, handler);
        handlers.set(ev.binding, handler);
    }
    return { root: container.querySelector<HTMLElement>('[data-aparte-chat]')!, handlers };
}

describe('<AparteChat> (Svelte 4 syntax) dispatches every event of the chat', () => {
    it('tests the events the manifest declares, at least twenty of them', () => {
        expect(events.length).toBeGreaterThanOrEqual(20);
    });

    for (const ev of events) {
        it(`${ev.name} → on:${ev.binding}, once, with the detail, sent by ${ev.from.join(' and ')}`, async () => {
            const { root, handlers } = await renderChat();
            const handler = handlers.get(ev.binding)!;
            for (const { from, element } of emittersOf(root, ev) as Array<{ from: string; element: HTMLElement }>) {
                handler.mockClear();
                const detail = detailFor(ev);
                fire(element, ev, detail);
                expect(handler, `${ev.name} sent by <${from}>`).toHaveBeenCalledTimes(1);
                expect((handler.mock.calls[0]![0] as CustomEvent).detail).toBe(detail);
            }
            for (const [binding, other] of handlers) {
                if (other !== handler) expect(other, `on:${binding} heard ${ev.name}`).not.toHaveBeenCalled();
            }
        });
    }

    const cancelable = events.filter((ev) => ev.cancelable);
    it('has a cancelable event to cancel', () => {
        expect(cancelable.length).toBeGreaterThan(0);
    });
    for (const ev of cancelable) {
        it(`${ev.name}: preventDefault() on on:${ev.binding} reaches the sender, through the dispatcher's answer`, async () => {
            const { root, handlers } = await renderChat();
            handlers.get(ev.binding)!.mockImplementation((event: CustomEvent) => event.preventDefault());
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                expect((fire(element, ev, detailFor(ev)) as Sent).result).toBe(false);
            }
        });
        it(`${ev.name}: left alone, the sender goes on`, async () => {
            const { root } = await renderChat();
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                expect((fire(element, ev, detailFor(ev)) as Sent).result).toBe(true);
            }
        });
    }

    it('dispatches none of the events the chat keeps to itself', async () => {
        const { root, handlers } = await renderChat();
        expect(exempt.length).toBeGreaterThan(0);
        for (const ex of exempt) root.dispatchEvent(new CustomEvent(ex.name, { detail: { coverage: ex.name }, bubbles: true }));
        for (const [binding, handler] of handlers) expect(handler, `on:${binding} was called`).not.toHaveBeenCalled();
    });

    it('sends messageSent once per message, to the event and to the onmessageSent callback, with the detail and the event', async () => {
        const sendEvent = events.find((ev) => ev.name === 'aparte-send')!;
        const onmessageSent = vi.fn();
        const { root, handlers } = await renderChat({ onmessageSent });
        const composer = root.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; submit(): void };
        const sent: Event[] = [];
        root.addEventListener('aparte-send', (e) => sent.push(e));
        composer.setValue('Once');
        composer.submit();
        expect(sent).toHaveLength(1);
        const viaEvent = handlers.get(sendEvent.binding)!;
        expect(viaEvent).toHaveBeenCalledTimes(1);
        expect((viaEvent.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({ content: 'Once' });
        expect(onmessageSent).toHaveBeenCalledTimes(1);
        expect(onmessageSent).toHaveBeenCalledWith(expect.objectContaining({ content: 'Once' }), sent[0]);
    });

    it('calls the onaction callback once, with the detail and the event, before the event', async () => {
        const actionEvent = events.find((ev) => ev.name === 'aparte-action')!;
        const order: string[] = [];
        const onaction = vi.fn(() => order.push('callback'));
        const { root, handlers } = await renderChat({ onaction });
        handlers.get(actionEvent.binding)!.mockImplementation(() => order.push('event'));
        const detail = detailFor(actionEvent);
        const { event } = fire(root.querySelector('aparte-chat-bubble')!, actionEvent, detail) as Sent;
        expect(onaction).toHaveBeenCalledTimes(1);
        expect(onaction).toHaveBeenCalledWith(detail, event);
        expect(order).toEqual(['callback', 'event']);
    });
});
