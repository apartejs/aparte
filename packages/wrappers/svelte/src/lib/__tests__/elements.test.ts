import { describe, it, expect, afterEach, expectTypeOf } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { SvelteHTMLElements } from 'svelte/elements';
import { registerAllComponents, type AparteConversationListItem, type AparteConversationSelectDetail } from '@aparte/core';
import ElementsHost from './ElementsHost.svelte';

/*
 * The raw `<aparte-conversation-list>` in a Svelte template, mounted: the rows are bound as a
 * PROPERTY, the active conversation as an attribute, the events as `on:` handlers — what the
 * issue asks of React, and what Svelte already does, because it sets a property the element has.
 * The same template is checked by `typecheck:tests` (`ElementsHost.svelte`), and the tag's types are
 * asserted at the bottom of this file: a template has no `@ts-expect-error`, a `.ts` file does.
 */

registerAllComponents();
afterEach(() => cleanup());

const mount = () => {
    const { container, component } = render(ElementsHost);
    const list = container.querySelector('aparte-conversation-list') as HTMLElement & { conversations: Array<{ id: string }> };
    const host = component as unknown as { events(): { picked: unknown[]; deleted: string[] }; setActive(id: string | null): void };
    return { container, list, events: () => host.events(), setActive: (id: string | null) => host.setActive(id) };
};

describe('the raw tag in a Svelte template', () => {
    it('sets `conversations` as the element\'s property: the rows are drawn, and no attribute carries them', async () => {
        const { list } = mount();
        await tick();
        expect(list.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
        expect(list.querySelectorAll('[data-select-id]')).toHaveLength(2);
        expect(list.hasAttribute('conversations')).toBe(false);
    });

    it('writes `active-id` as an attribute, and removes it for `null`', async () => {
        const { list, setActive } = mount();
        await tick();
        expect(list.hasAttribute('active-id')).toBe(false);
        setActive('c2');
        await tick();
        expect(list.getAttribute('active-id')).toBe('c2');
        setActive(null);
        await tick();
        expect(list.hasAttribute('active-id')).toBe(false);
    });

    it('calls `on:aparte-conversation-select` once with the event, whose detail is the row', async () => {
        const { list, events } = mount();
        await tick();
        list.querySelector<HTMLElement>('[data-select-id="c2"]')!.click();
        await tick();
        expect(events().picked).toEqual([{ id: 'c2' }]);
    });

    it('calls `on:aparte-conversation-delete` with an inline handler', async () => {
        const { list, events } = mount();
        list.dispatchEvent(new CustomEvent('aparte-conversation-delete', { detail: { id: 'c1' }, bubbles: true, composed: true, cancelable: true }));
        await tick();
        expect(events().deleted).toEqual(['c1']);
    });
});

/*
 * What the tag's types say, asserted on `SvelteHTMLElements` — the surface svelte-check reads a
 * tag through. Before the element members were generated, `active-id` took a `string` where
 * `useConversationManager().activeId` is a `string | null`, and `conversations` (a property, not
 * an attribute) was not on the tag at all: `ElementsHost.svelte` did not compile.
 */
describe('the types of the raw tag', () => {
    type List = SvelteHTMLElements['aparte-conversation-list'];

    it('takes the rows as a property, and the active conversation as a string or null', () => {
        expectTypeOf<List['conversations']>().toEqualTypeOf<AparteConversationListItem[] | undefined>();
        expectTypeOf<List['active-id']>().toEqualTypeOf<string | null | undefined>();
    });

    it('types the handler of an event by its detail, in both spellings', () => {
        type Handler = NonNullable<List['on:aparte-conversation-select']>;
        expectTypeOf<Parameters<Handler>[0]>().toEqualTypeOf<CustomEvent<AparteConversationSelectDetail>>();
        type Attribute = NonNullable<List['onaparte-conversation-select']>;
        expectTypeOf<Parameters<Attribute>[0]>().toEqualTypeOf<CustomEvent<AparteConversationSelectDetail>>();
    });

    it('refuses what the element does not take', () => {
        // @ts-expect-error -- `active-id` is a string, not a number
        const id: List = { 'active-id': 5 };
        // @ts-expect-error -- `conversations` is a list of conversations
        const rows: List = { conversations: 'nope' };
        // @ts-expect-error -- a handler for another detail
        const handler: List = { 'on:aparte-conversation-select': (e: CustomEvent<{ nope: number }>) => e.detail.nope };
        void [id, rows, handler];
    });
});
