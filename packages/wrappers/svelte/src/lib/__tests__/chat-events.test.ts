import { describe, it, expect, expectTypeOf } from 'vitest';
import type { AparteLinkClickEventDetail } from '@aparte/core';
import {
    APARTE_CHAT_EVENT_BINDINGS,
    type AparteChatEventCallbacks,
    type AparteChatEventDetails,
} from '../generated/chat-events';

/*
 * The file `scripts/gen-element-bindings.mjs` writes for this wrapper from `<aparte-chat>`'s
 * `@fires`, as this package compiles and loads it: the details the Svelte 4 component's
 * dispatcher carries, the callback props of the runes component, and the table both walk.
 */
describe('the generated chat event bindings', () => {
    it('name one callback per event: `on` and the binding name, Svelte\'s own spelling', () => {
        expect(APARTE_CHAT_EVENT_BINDINGS.length).toBeGreaterThanOrEqual(20);
        for (const b of APARTE_CHAT_EVENT_BINDINGS) {
            expect(b.type).toMatch(/^aparte-[a-z-]+$/);
            expect(b.callback).toBe(`on${b.name}`);
        }
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-send', name: 'messageSent', callback: 'onmessageSent', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-cancel', name: 'stop', callback: 'onstop', cancelable: false });
        expect(APARTE_CHAT_EVENT_BINDINGS).toContainEqual({ type: 'aparte-link-click', name: 'linkClick', callback: 'onlinkClick', cancelable: true });
    });

    it('type the dispatcher\'s details and the runes callbacks', () => {
        expectTypeOf<AparteChatEventDetails['linkClick']>().toEqualTypeOf<AparteLinkClickEventDetail>();
        expectTypeOf<AparteChatEventDetails['stop']>().toEqualTypeOf<null>();
        expectTypeOf<NonNullable<AparteChatEventCallbacks['onlinkClick']>>()
            .parameters.toEqualTypeOf<[AparteLinkClickEventDetail, CustomEvent<AparteLinkClickEventDetail>]>();
        // `createEventDispatcher<T extends Record<string, any>>` takes the interface as it is:
        // an index signature of type `any` accepts an interface, which `unknown` would not.
        expectTypeOf<AparteChatEventDetails>().toMatchTypeOf<Record<string, any>>();
    });
});
