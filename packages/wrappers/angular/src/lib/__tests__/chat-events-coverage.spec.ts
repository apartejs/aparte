import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { registerAllComponents, type AparteMessage } from '@aparte/core';
import { AparteChatComponent } from '../aparte-chat.component';
// @ts-expect-error -- plain ESM tooling, untyped; the shapes it returns are declared below.
import { readCoverageEvents, emittersOf, detailFor, fire, COVERAGE_MESSAGES, COVERAGE_ACTION_ID } from '../../../../../../scripts/chat-event-coverage.mjs';

/*
 * Every event `<aparte-chat>` declares reaches `AparteChatComponent` as an output — `(linkClick)`,
 * `(retry)`… — which emits the detail, once. Cancelling stays the DOM event's: the component's
 * host IS `<aparte-chat>`, so `(aparte-link-click)` on it binds the event itself.
 *
 * The list is core's MANIFEST (`scripts/chat-event-coverage.mjs`), never the base the component
 * inherits its outputs from: an event a generator dropped from that base is one this test still
 * sends. Each is sent from the element that really sends it — a bubble, the composer, the
 * attachment strip, a composer action projected into the toolbar, or the host for the turn's
 * lifecycle — in a chat rendered with every one of them.
 */

registerAllComponents();

interface ChatEvent { name: string; binding: string; detail: string | null; cancelable: boolean; from: string[] }
interface Sent { event: CustomEvent; result: boolean }
interface Output { subscribe(next: (value: unknown) => void): { unsubscribe(): void } }
const { events, exempt } = readCoverageEvents() as { events: ChatEvent[]; exempt: Array<{ name: string; binding: string }> };

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
      <aparte-chat [messages]="messages" attachments
        (linkClick)="links.push($event)" (aparte-link-click)="onLinkEvent($event)">
        <aparte-composer-action slot="toolbar" [attr.action-id]="actionId"></aparte-composer-action>
      </aparte-chat>
    `,
})
class CoverageHost {
    messages: AparteMessage[] = COVERAGE_MESSAGES;
    actionId: string = COVERAGE_ACTION_ID;
    /** What `(linkClick)` emitted, and the events `(aparte-link-click)` received. */
    links: unknown[] = [];
    linkEvents: Event[] = [];
    cancelLinks = false;

    onLinkEvent(event: Event): void {
        this.linkEvents.push(event);
        if (this.cancelLinks) event.preventDefault();
    }
}

const fixtures: Array<ComponentFixture<CoverageHost>> = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.destroy(); });

/** The chat with every sender rendered, and a subscription on the output of every event. */
async function renderChat(): Promise<{ host: CoverageHost; chat: AparteChatComponent; root: HTMLElement; handlers: Map<string, Mock> }> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CoverageHost] });
    const fixture = TestBed.createComponent(CoverageHost);
    fixtures.push(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    const de = fixture.debugElement.query(By.directive(AparteChatComponent));
    const chat = de.componentInstance as AparteChatComponent;
    const handlers = new Map<string, Mock>();
    for (const ev of events) {
        const handler = vi.fn();
        const output = (chat as unknown as Record<string, Output | undefined>)[ev.binding];
        expect(typeof output?.subscribe, `(${ev.binding}) is an output of the chat`).toBe('function');
        output!.subscribe(handler);
        handlers.set(ev.binding, handler);
    }
    return { host: fixture.componentInstance, chat, root: de.nativeElement as HTMLElement, handlers };
}

describe('AparteChatComponent emits every event of the chat', () => {
    it('tests the events the manifest declares, at least twenty of them', () => {
        expect(events.length).toBeGreaterThanOrEqual(20);
    });

    for (const ev of events) {
        it(`${ev.name} → (${ev.binding}) emits the detail, once, sent by ${ev.from.join(' and ')}`, async () => {
            const { root, handlers } = await renderChat();
            const handler = handlers.get(ev.binding)!;
            for (const { from, element } of emittersOf(root, ev) as Array<{ from: string; element: HTMLElement }>) {
                handler.mockClear();
                const detail = detailFor(ev);
                fire(element, ev, detail);
                expect(handler, `${ev.name} sent by <${from}>`).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith(detail);
            }
            for (const [binding, other] of handlers) {
                if (other !== handler) expect(other, `(${binding}) heard ${ev.name}`).not.toHaveBeenCalled();
            }
        });
    }

    const cancelable = events.filter((ev) => ev.cancelable);
    it('has a cancelable event to cancel', () => {
        expect(cancelable.length).toBeGreaterThan(0);
    });
    for (const ev of cancelable) {
        it(`${ev.name}: a listener on the host cancels it, and (${ev.binding}) still emits once`, async () => {
            const { root, handlers } = await renderChat();
            root.addEventListener(ev.name, (event) => event.preventDefault());
            for (const { element } of emittersOf(root, ev) as Array<{ element: HTMLElement }>) {
                handlers.get(ev.binding)!.mockClear();
                expect((fire(element, ev, detailFor(ev)) as Sent).result).toBe(false);
                expect(handlers.get(ev.binding)).toHaveBeenCalledTimes(1);
            }
        });
    }

    it('(aparte-link-click) on the host cancels a link, and it and (linkClick) each run once', async () => {
        const link = events.find((ev) => ev.name === 'aparte-link-click')!;
        const { host, root } = await renderChat();
        host.cancelLinks = true;
        const detail = detailFor(link);
        const { event, result } = fire(root.querySelector('aparte-chat-bubble')!, link, detail) as Sent;
        expect(result).toBe(false);
        expect(host.linkEvents).toEqual([event]);
        expect(host.links).toEqual([detail]);
    });

    it('has no output for the events the chat keeps to itself, and emits nothing for them', async () => {
        const { chat, root, handlers } = await renderChat();
        expect(exempt.length).toBeGreaterThan(0);
        for (const ex of exempt) {
            expect((chat as unknown as Record<string, unknown>)[ex.binding], `(${ex.binding})`).toBeUndefined();
            root.dispatchEvent(new CustomEvent(ex.name, { detail: { coverage: ex.name }, bubbles: true }));
        }
        for (const [binding, handler] of handlers) expect(handler, `(${binding}) emitted`).not.toHaveBeenCalled();
    });

    it('emits (messageSent) once per message the composer sends', async () => {
        const sendEvent = events.find((ev) => ev.name === 'aparte-send')!;
        const { root, handlers } = await renderChat();
        const composer = root.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; submit(): void };
        const sent: CustomEvent[] = [];
        root.addEventListener('aparte-send', (e) => sent.push(e as CustomEvent));
        composer.setValue('Once');
        composer.submit();
        expect(sent).toHaveLength(1);
        const handler = handlers.get(sendEvent.binding)!;
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(sent[0]!.detail);
    });
});
