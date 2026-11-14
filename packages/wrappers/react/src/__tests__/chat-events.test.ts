import { describe, it, expect, expectTypeOf } from 'vitest';
import type { AparteLinkClickEventDetail, AparteSendEventDetail } from '@aparte/core';
import { APARTE_CHAT_EVENT_BINDINGS, type AparteChatEventProps } from '../generated/chat-events';

/*
 * The file `scripts/gen-element-bindings.mjs` writes for this wrapper from `<aparte-chat>`'s
 * `@fires`, as this package compiles and loads it. The generator's own suite proves what it
 * writes; this proves the file is one the React wrapper can import: a prop per event, called
 * with the detail and the event.
 */
describe('the generated chat event bindings', () => {
    it('name one prop per event: `on` and the binding name', () => {
        expect(APARTE_CHAT_EVENT_BINDINGS.length).toBeGreaterThanOrEqual(20);
        for (const b of APARTE_CHAT_EVENT_BINDINGS) {
            expect(b.type).toMatch(/^aparte-[a-z-]+$/);
            expect(b.prop).toBe(`on${b.name.charAt(0).toUpperCase()}${b.name.slice(1)}`);
        }
        expect(new Set(APARTE_CHAT_EVENT_BINDINGS.map((b) => b.prop)).size).toBe(APARTE_CHAT_EVENT_BINDINGS.length);
    });

    it('keep the two names the chat already published, and call its Stop `onStop`', () => {
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-send', name: 'messageSent', prop: 'onMessageSent', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-action', name: 'action', prop: 'onAction', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-cancel', name: 'stop', prop: 'onStop', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-link-click', name: 'linkClick', prop: 'onLinkClick', cancelable: true });
    });

    it('hand a callback the detail first and the event second', () => {
        expectTypeOf<NonNullable<AparteChatEventProps['onLinkClick']>>()
            .parameters.toEqualTypeOf<[AparteLinkClickEventDetail, CustomEvent<AparteLinkClickEventDetail>]>();
        expectTypeOf<NonNullable<AparteChatEventProps['onStop']>>()
            .parameters.toEqualTypeOf<[null, CustomEvent<null>]>();
        // A callback written for the detail alone, as `onMessageSent` was, still fits.
        const props: AparteChatEventProps = { onMessageSent: (detail: AparteSendEventDetail) => void detail };
        expect(props.onMessageSent).toBeTypeOf('function');
    });
});
