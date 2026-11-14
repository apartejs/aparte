import React from 'react';
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { registerAllComponents } from '@aparte/core';
import { AparteChat, type AparteChatProps } from '../components/AparteChat';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageEvents, emittersOf, detailFor, fire, COVERAGE_MESSAGES, COVERAGE_ACTION_ID } from '../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every event `<aparte-chat>` declares reaches `<AparteChat>` as its `on…` prop: once, with
 * the detail and then the event.
 *
 * The list is core's MANIFEST (`scripts/chat-event-coverage.mjs`), never the table the
 * component forwards from: an event a generator dropped from that table is one this test
 * still sends. Each is sent from the element that really sends it — a bubble, the composer,
 * the attachment strip, a composer action placed in the toolbar, or the host for the turn's
 * lifecycle — in a chat rendered with every one of them.
 */

registerAllComponents();

interface ChatEvent { name: string; binding: string; detail: string | null; cancelable: boolean; from: string[] }
interface Sent { event: CustomEvent; result: boolean }
const { events, exempt } = readCoverageEvents() as { events: ChatEvent[]; exempt: Array<{ name: string; binding: string }> };

/** `linkClick` → `onLinkClick`: React's spelling of a binding. */
const propOf = (binding: string): string => `on${binding.charAt(0).toUpperCase()}${binding.slice(1)}`;

afterEach(() => cleanup());

/** The chat with every sender rendered, and a mock on the prop of every event — the exempt ones included. */
function renderChat(): { root: HTMLElement; handlers: Map<string, Mock> } {
    const handlers = new Map<string, Mock>();
    for (const ev of [...events, ...exempt]) handlers.set(propOf(ev.binding), vi.fn());
    const { container } = render(
        <AparteChat
            {...(Object.fromEntries(handlers) as Partial<AparteChatProps>)}
            messages={COVERAGE_MESSAGES}
            attachments
            toolbar={<aparte-composer-action action-id={COVERAGE_ACTION_ID} />}
        />,
    );
    return { root: container.querySelector<HTMLElement>('[data-aparte-chat]')!, handlers };
}

function send(element: HTMLElement, ev: ChatEvent, detail: unknown): Sent {
    let sent: Sent | undefined;
    act(() => { sent = fire(element, ev, detail) as Sent; });
    return sent!;
}

describe('<AparteChat> forwards every event of the chat', () => {
    it('tests the events the manifest declares, at least twenty of them', () => {
        expect(events.length).toBeGreaterThanOrEqual(20);
    });

    for (const ev of events) {
        it(`${ev.name} → ${propOf(ev.binding)}(detail, event), once, sent by ${ev.from.join(' and ')}`, () => {
            const { root, handlers } = renderChat();
            const handler = handlers.get(propOf(ev.binding))!;
            for (const { from, element } of emittersOf(root, ev) as Array<{ from: string; element: HTMLElement }>) {
                handler.mockClear();
                const detail = detailFor(ev);
                const sent = send(element, ev, detail);
                expect(handler, `${ev.name} sent by <${from}>`).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith(detail, sent.event);
            }
            for (const [prop, other] of handlers) {
                if (other !== handler) expect(other, `${prop} heard ${ev.name}`).not.toHaveBeenCalled();
            }
        });
    }

    const cancelable = events.filter((ev) => ev.cancelable);
    it('has a cancelable event to cancel', () => {
        expect(cancelable.length).toBeGreaterThan(0);
    });
    for (const ev of cancelable) {
        it(`${ev.name}: event.preventDefault() in ${propOf(ev.binding)} reaches the sender`, () => {
            const { root, handlers } = renderChat();
            handlers.get(propOf(ev.binding))!.mockImplementation((_detail: unknown, event: Event) => event.preventDefault());
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                expect(send(element, ev, detailFor(ev)).result).toBe(false);
            }
        });
    }

    it('forwards none of the events the chat keeps to itself', () => {
        const { root, handlers } = renderChat();
        expect(exempt.length).toBeGreaterThan(0);
        for (const ex of exempt) {
            act(() => { root.dispatchEvent(new CustomEvent(ex.name, { detail: { coverage: ex.name }, bubbles: true })); });
        }
        for (const [prop, handler] of handlers) expect(handler, `${prop} was called`).not.toHaveBeenCalled();
    });

    it('calls the send callback once per message the composer sends', () => {
        const sendEvent = events.find((ev) => ev.name === 'aparte-send')!;
        const { root, handlers } = renderChat();
        const composer = root.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; submit(): void };
        const sent: Event[] = [];
        root.addEventListener('aparte-send', (e) => sent.push(e));
        act(() => { composer.setValue('Once'); composer.submit(); });
        expect(sent).toHaveLength(1);
        const handler = handlers.get(propOf(sendEvent.binding))!;
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ content: 'Once' }), sent[0]);
    });
});
