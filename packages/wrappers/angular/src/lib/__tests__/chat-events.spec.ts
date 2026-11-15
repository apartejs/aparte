import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@angular/compiler';
import { Component, ElementRef, EventEmitter, NgZone, inject, type AfterViewInit, type OnDestroy } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AparteLinkClickEventDetail } from '@aparte/core';
import { AparteChatEvents } from '../../generated/chat-events';

/*
 * The generated base of the chat component: one `@Output()` per event `<aparte-chat>`
 * declares, and `forwardChatEvents`, which listens on the host for each.
 *
 * Two things a test can see and a reading of the file cannot:
 *
 *   • Angular takes the outputs from the ABSTRACT base — a template binds `(linkClick)` on a
 *     component that only extends it. That is the inheritance the chat component relies on.
 *   • `segment-update` fires per streamed token. The listeners sit OUTSIDE the zone and enter
 *     it only for an output somebody binds, so an event nobody listens to schedules no change
 *     detection at all.
 */

@Component({ selector: 'probe-chat', standalone: true, template: '' })
class ProbeChat extends AparteChatEvents implements AfterViewInit, OnDestroy {
    readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    readonly zone = inject(NgZone);
    private _off?: () => void;

    ngAfterViewInit(): void {
        this._off = this.forwardChatEvents(this.element, this.zone);
    }

    ngOnDestroy(): void {
        this._off?.();
    }

    /** The protected forwarder, on an element of the test's choosing. */
    forwardTo(element: HTMLElement): () => void {
        return this.forwardChatEvents(element, this.zone);
    }
}

@Component({
    standalone: true,
    imports: [ProbeChat],
    template: `<probe-chat (linkClick)="onLink($event)" (stop)="stops.push($event)"></probe-chat>`,
})
class Host {
    links: AparteLinkClickEventDetail[] = [];
    stops: null[] = [];
    inZone: boolean[] = [];

    onLink(detail: AparteLinkClickEventDetail): void {
        this.links.push(detail);
        this.inZone.push(NgZone.isInAngularZone());
    }
}

describe('the generated chat base (AparteChatEvents)', () => {
    let fixture: ComponentFixture<Host>;
    let probe: ProbeChat;
    let added: Array<{ type: string; inZone: boolean }>;

    beforeEach(() => {
        added = [];
        const real = HTMLElement.prototype.addEventListener;
        vi.spyOn(HTMLElement.prototype, 'addEventListener').mockImplementation(function (
            this: HTMLElement,
            type: string,
            ...rest: [EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]
        ) {
            if (this.tagName === 'PROBE-CHAT') added.push({ type, inZone: NgZone.isInAngularZone() });
            return real.call(this, type, ...rest);
        });
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [Host] });
        fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        probe = fixture.debugElement.children[0]!.componentInstance as ProbeChat;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fixture.destroy();
    });

    const outputs = () => Object.entries(probe).filter(([, v]) => v instanceof EventEmitter).map(([k]) => k);
    /** The forwarder's listeners: Angular adds its own, below, for the template's `(x)`. */
    const forwarded = () => added.filter((a) => a.type.startsWith('aparte-'));

    it('declares one output per chat event, and listens for each one on the host', () => {
        expect(outputs().length).toBeGreaterThanOrEqual(20);
        expect(outputs()).toEqual(expect.arrayContaining(['messageSent', 'stop', 'action', 'linkClick', 'segmentUpdate']));
        expect(forwarded()).toHaveLength(outputs().length);
        expect(new Set(forwarded().map((a) => a.type)).size).toBe(forwarded().length);
    });

    it('adds every listener outside the Angular zone', () => {
        expect(forwarded().length).toBeGreaterThan(0);
        expect(forwarded().filter((a) => a.inZone)).toEqual([]);
    });

    it('shows why a binding is never named like a DOM event: `(x)` also listens to the DOM event `x`', () => {
        // Angular's renderer put a DOM listener for each output the template binds. Named
        // `cancel`, the composer's Stop would have heard every native `cancel` that bubbled.
        expect(added.filter((a) => !a.type.startsWith('aparte-')).map((a) => a.type).sort()).toEqual(['linkClick', 'stop']);
    });

    it('emits the detail, inside the zone, to an output a template binds', () => {
        const detail = { href: 'https://example.com', messageId: 'm1' } as unknown as AparteLinkClickEventDetail;
        probe.element.dispatchEvent(new CustomEvent('aparte-link-click', { detail, bubbles: true, cancelable: true }));
        expect(fixture.componentInstance.links).toEqual([detail]);
        expect(fixture.componentInstance.inZone).toEqual([true]);
    });

    it('emits null for an event that carries no detail', () => {
        probe.element.dispatchEvent(new CustomEvent('aparte-cancel', { bubbles: true }));
        expect(fixture.componentInstance.stops).toEqual([null]);
    });

    it('does not enter the zone for an output nobody binds', () => {
        const run = vi.spyOn(probe.zone, 'run');
        // `segmentUpdate` is bound by no one here: the token stream costs no change detection.
        probe.element.dispatchEvent(new CustomEvent('aparte-segment-update', { detail: {}, bubbles: true }));
        probe.element.dispatchEvent(new CustomEvent('aparte-retry', { detail: {}, bubbles: true }));
        expect(run).not.toHaveBeenCalled();
        // A bound one enters it (and Angular's tick, once the zone is left, enters it again).
        probe.element.dispatchEvent(new CustomEvent('aparte-link-click', { detail: {}, bubbles: true }));
        expect(run).toHaveBeenCalled();
    });

    it('stops listening once the returned cleanup runs', () => {
        // Its own element and its own subscription: a destroyed fixture would also unsubscribe
        // the template, which would pass this test with every listener still attached.
        const element = document.createElement('div');
        const seen: unknown[] = [];
        const subscription = probe.linkClick.subscribe((detail) => seen.push(detail));
        const off = probe.forwardTo(element);
        element.dispatchEvent(new CustomEvent('aparte-link-click', { detail: 1 }));
        off();
        element.dispatchEvent(new CustomEvent('aparte-link-click', { detail: 2 }));
        subscription.unsubscribe();
        expect(seen).toEqual([1]);
    });
});
