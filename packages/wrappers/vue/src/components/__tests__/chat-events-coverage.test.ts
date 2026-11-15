import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { registerAllComponents } from '@aparte/core';
import AparteChat from '../AparteChat.vue';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageEvents, emittersOf, detailFor, fire, COVERAGE_MESSAGES, COVERAGE_ACTION_ID } from '../../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every event `<aparte-chat>` declares reaches `<AparteChat>` as an emit — `@link-click`,
 * `@retry`… — once, with the detail and then the event.
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

/** `linkClick` → `onLinkClick`: the listener prop `@link-click` compiles to. */
const listenerOf = (binding: string): string => `on${binding.charAt(0).toUpperCase()}${binding.slice(1)}`;

const mounted: VueWrapper[] = [];
afterEach(() => { for (const w of mounted.splice(0)) w.unmount(); });

/** The chat with every sender rendered, and a listener on every event — the exempt ones included. */
async function renderChat(): Promise<{ root: HTMLElement; handlers: Map<string, Mock> }> {
    const handlers = new Map<string, Mock>();
    for (const ev of [...events, ...exempt]) handlers.set(ev.binding, vi.fn());
    const wrapper = mount(AparteChat, {
        props: {
            ...Object.fromEntries([...handlers].map(([binding, fn]) => [listenerOf(binding), fn])),
            messages: COVERAGE_MESSAGES,
            attachments: true,
        },
        slots: { toolbar: () => h('aparte-composer-action', { 'action-id': COVERAGE_ACTION_ID }) },
        attachTo: document.body,
    });
    mounted.push(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { root: wrapper.element as HTMLElement, handlers };
}

describe('<AparteChat> emits every event of the chat', () => {
    it('tests the events the manifest declares, at least twenty of them, each a declared emit', () => {
        expect(events.length).toBeGreaterThanOrEqual(20);
        // A declared emit, or Vue hands the listener to the root as a DOM listener on `linkClick`.
        const declared = (AparteChat as unknown as { emits: string[] }).emits;
        expect(declared).toEqual(expect.arrayContaining(events.map((ev) => ev.binding)));
    });

    for (const ev of events) {
        it(`${ev.name} → @${ev.binding}(detail, event), once, sent by ${ev.from.join(' and ')}`, async () => {
            const { root, handlers } = await renderChat();
            const handler = handlers.get(ev.binding)!;
            for (const { from, element } of emittersOf(root, ev) as Array<{ from: string; element: HTMLElement }>) {
                handler.mockClear();
                const detail = detailFor(ev);
                const sent = fire(element, ev, detail) as Sent;
                expect(handler, `${ev.name} sent by <${from}>`).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith(detail, sent.event);
            }
            for (const [binding, other] of handlers) {
                if (other !== handler) expect(other, `${binding} heard ${ev.name}`).not.toHaveBeenCalled();
            }
        });
    }

    const cancelable = events.filter((ev) => ev.cancelable);
    it('has a cancelable event to cancel', () => {
        expect(cancelable.length).toBeGreaterThan(0);
    });
    for (const ev of cancelable) {
        it(`${ev.name}: event.preventDefault() in @${ev.binding} reaches the sender`, async () => {
            const { root, handlers } = await renderChat();
            handlers.get(ev.binding)!.mockImplementation((_detail: unknown, event: Event) => event.preventDefault());
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                expect((fire(element, ev, detailFor(ev)) as Sent).result).toBe(false);
            }
        });
    }

    it('emits none of the events the chat keeps to itself', async () => {
        const { root, handlers } = await renderChat();
        expect(exempt.length).toBeGreaterThan(0);
        for (const ex of exempt) root.dispatchEvent(new CustomEvent(ex.name, { detail: { coverage: ex.name }, bubbles: true }));
        for (const [binding, handler] of handlers) expect(handler, `@${binding} was called`).not.toHaveBeenCalled();
    });

    it('emits the send once per message the composer sends', async () => {
        const sendEvent = events.find((ev) => ev.name === 'aparte-send')!;
        const { root, handlers } = await renderChat();
        const composer = root.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; submit(): void };
        const sent: Event[] = [];
        root.addEventListener('aparte-send', (e) => sent.push(e));
        composer.setValue('Once');
        composer.submit();
        expect(sent).toHaveLength(1);
        const handler = handlers.get(sendEvent.binding)!;
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ content: 'Once' }), sent[0]);
    });
});
