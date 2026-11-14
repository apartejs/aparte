import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { AparteLinkClickEventDetail } from '@aparte/core';
import { APARTE_CHAT_EVENT_BINDINGS } from '../../generated/chat-events';
import ChatEventsProbe from './ChatEventsProbe.vue';

/*
 * The file `scripts/gen-element-bindings.mjs` writes for this wrapper from `<aparte-chat>`'s
 * `@fires`. The generator's suite proves what it writes; this proves Vue reads it: the SFC
 * compiler resolves the imported `AparteChatEventEmits` in `defineEmits`, so a listener
 * passed as `onLinkClick` is an emit, called with the detail and the event.
 */
describe('the generated chat event bindings', () => {
    it('name one emit per event, the binding name itself', () => {
        expect(APARTE_CHAT_EVENT_BINDINGS.length).toBeGreaterThanOrEqual(20);
        for (const b of APARTE_CHAT_EVENT_BINDINGS) {
            expect(b.type).toMatch(/^aparte-[a-z-]+$/);
            expect(b.emit).toBe(b.name);
        }
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-send', name: 'messageSent', emit: 'messageSent', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-cancel', name: 'stop', emit: 'stop', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-link-click', name: 'linkClick', emit: 'linkClick', cancelable: true });
    });

    it('are read by the SFC compiler: `defineEmits<AparteChatEventEmits>()` declares every one', () => {
        // The compiler turns the type into the component's runtime `emits`. Unresolved, it would
        // fail the compile, or declare nothing and leave every listener a fallthrough attribute.
        const declared = (ChatEventsProbe as unknown as { emits: string[] }).emits;
        expect([...declared].sort()).toEqual(APARTE_CHAT_EVENT_BINDINGS.map((b) => b.emit).sort());
    });

    it('type `defineEmits`, which hands a listener the detail and the event', () => {
        const links: unknown[][] = [];
        const stops: unknown[][] = [];
        const wrapper = mount(ChatEventsProbe, {
            props: {
                onLinkClick: (...args: unknown[]) => links.push(args),
                onStop: (...args: unknown[]) => stops.push(args),
            },
        });
        const detail = { href: 'https://example.com' } as unknown as AparteLinkClickEventDetail;
        const event = new CustomEvent('aparte-link-click', { detail, cancelable: true });
        const stop = new CustomEvent<null>('aparte-cancel');
        (wrapper.vm as unknown as { fireLink: (d: typeof detail, e: typeof event) => void }).fireLink(detail, event);
        (wrapper.vm as unknown as { fireStop: (e: typeof stop) => void }).fireStop(stop);
        expect(links).toEqual([[detail, event]]);
        expect(stops).toEqual([[null, stop]]);
        wrapper.unmount();
    });
});
