import React, { StrictMode, createRef, type ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
    registerAllComponents,
    type AparteConversationList as AparteConversationListElement,
    type AparteConversationListItem,
    type AparteConversationSelectDetail,
} from '@aparte/core';
import {
    AparteChatViewport,
    AparteComposer,
    AparteConversationList,
    AparteProgressSpinner,
    AparteSelect,
} from '../index';

/*
 * `<aparte-conversation-list>` from React — the issue's case, and what every other generated
 * component shares with it.
 *
 * The list takes its rows as a PROPERTY and answers with EVENTS. React 18 has neither (it
 * stringifies a property into an attribute and listens to nothing); React 19 has both, and
 * decides per prop which one it uses. So a component does not hand its props to React for the
 * element: it applies them itself, after render, the same way under both — attributes through
 * core's `applyElementProps`, properties by assignment, events with `addEventListener`.
 *
 * Every test here drives the REAL element, registered from core's source: a stub would pass
 * with any binding.
 */

registerAllComponents();
afterEach(() => cleanup());

const ITEMS: AparteConversationListItem[] = [
    { id: 'c1', title: 'First chat' },
    { id: 'c2', title: 'Second chat' },
];

type ListElement = AparteConversationListElement;
const listOf = (container: HTMLElement): ListElement => container.querySelector('aparte-conversation-list') as ListElement;
const rowTitle = (container: HTMLElement, id: string): HTMLElement => container.querySelector<HTMLElement>(`[data-select-id="${id}"]`)!;

/** A cancelable event the way core sends the list's: bubbling, composed. */
const cancelable = (type: string, detail: unknown): CustomEvent => new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true });

describe('<AparteConversationList> — the rows', () => {
    it('renders the element, and the ref is the element', () => {
        const ref = createRef<ListElement>();
        const { container } = render(<AparteConversationList ref={ref} />);
        const el = listOf(container);
        expect(el).not.toBeNull();
        expect(el.localName).toBe('aparte-conversation-list');
        expect(ref.current).toBe(el);
    });

    it('hands a callback ref the element, and null when it goes away', () => {
        const ref = vi.fn();
        const { container, unmount } = render(<AparteConversationList ref={ref} />);
        expect(ref).toHaveBeenLastCalledWith(listOf(container));
        unmount();
        expect(ref).toHaveBeenLastCalledWith(null);
    });

    it('sets `conversations` as a PROPERTY: the rows are drawn, and no attribute carries them', () => {
        const { container } = render(<AparteConversationList conversations={ITEMS} />);
        const el = listOf(container);
        expect(el.conversations).toBe(ITEMS);
        expect(container.querySelectorAll('[data-select-id]')).toHaveLength(2);
        expect(rowTitle(container, 'c2').textContent).toContain('Second chat');
        expect(el.hasAttribute('conversations')).toBe(false);
    });

    it('assigns it again only when the array is a new one', () => {
        const proto = Object.getPrototypeOf(document.createElement('aparte-conversation-list'));
        const assign = vi.spyOn(proto, 'conversations', 'set');
        const { rerender, container } = render(<AparteConversationList conversations={ITEMS} />);
        expect(assign).toHaveBeenCalledTimes(1);
        // The same array, a new render: nothing to tell the list, which would draw every row again.
        rerender(<AparteConversationList conversations={ITEMS} active-id="c1" />);
        expect(assign).toHaveBeenCalledTimes(1);
        const next = [...ITEMS, { id: 'c3', title: 'Third chat' }];
        rerender(<AparteConversationList conversations={next} active-id="c1" />);
        expect(assign).toHaveBeenCalledTimes(2);
        expect(listOf(container).conversations).toBe(next);
        expect(container.querySelectorAll('[data-select-id]')).toHaveLength(3);
        assign.mockRestore();
    });

    it('clears the rows when the prop goes away after being set: the list reads a non-array as none', () => {
        const { rerender, container } = render(<AparteConversationList conversations={ITEMS} />);
        rerender(<AparteConversationList />);
        expect(listOf(container).conversations).toEqual([]);
        expect(container.querySelectorAll('[data-select-id]')).toHaveLength(0);
    });

    it('leaves an unset `conversations` alone: it never writes the property for a prop nobody passed', () => {
        const proto = Object.getPrototypeOf(document.createElement('aparte-conversation-list'));
        const assign = vi.spyOn(proto, 'conversations', 'set');
        render(<AparteConversationList active-id="c1" />);
        expect(assign).not.toHaveBeenCalled();
        assign.mockRestore();
    });
});

describe('<AparteConversationList> — the attributes', () => {
    it('writes `active-id`, and the list marks that row the current one', () => {
        const { container, rerender } = render(<AparteConversationList conversations={ITEMS} active-id="c2" />);
        expect(listOf(container).getAttribute('active-id')).toBe('c2');
        expect(rowTitle(container, 'c2').getAttribute('aria-current')).toBe('page');
        rerender(<AparteConversationList conversations={ITEMS} active-id="c1" />);
        expect(rowTitle(container, 'c1').getAttribute('aria-current')).toBe('page');
        expect(rowTitle(container, 'c2').getAttribute('aria-current')).toBe('false');
    });

    it('removes an attribute when its prop goes away or is null', () => {
        const { container, rerender } = render(<AparteConversationList active-id="c2" target="support" />);
        const el = listOf(container);
        expect(el.getAttribute('target')).toBe('support');
        rerender(<AparteConversationList target={null} />);
        expect(el.hasAttribute('active-id')).toBe(false);
        expect(el.hasAttribute('target')).toBe(false);
    });

    it('takes a presence attribute as a boolean or as `\'\'`: true is on, false and undefined are off', () => {
        const { container, rerender } = render(<AparteConversationList flat />);
        const el = listOf(container);
        expect(el.getAttribute('flat')).toBe('');
        rerender(<AparteConversationList flat={false} />);
        expect(el.hasAttribute('flat')).toBe(false);
        rerender(<AparteConversationList flat="" loading={true} />);
        expect(el.getAttribute('flat')).toBe('');
        expect(el.getAttribute('loading')).toBe('');
        rerender(<AparteConversationList flat={undefined} loading={null} />);
        expect(el.hasAttribute('flat')).toBe(false);
        expect(el.hasAttribute('loading')).toBe(false);
    });

    it('writes an attribute only when its value changed: a rewrite would wake the element for nothing', () => {
        const set = vi.spyOn(HTMLElement.prototype, 'setAttribute');
        const writes = () => set.mock.calls.filter(([name]) => name === 'active-id').length;
        const { rerender } = render(<AparteConversationList active-id="c1" />);
        expect(writes()).toBe(1);
        rerender(<AparteConversationList active-id="c1" className="again" />);
        expect(writes()).toBe(1);
        rerender(<AparteConversationList active-id="c2" className="again" />);
        expect(writes()).toBe(2);
        set.mockRestore();
    });
});

describe('<AparteConversationList> — the events', () => {
    it('calls onConversationSelect once with the detail, then the event, when a row is clicked', () => {
        const onSelect = vi.fn();
        const { container } = render(<AparteConversationList conversations={ITEMS} onConversationSelect={onSelect} />);
        act(() => rowTitle(container, 'c2').click());
        expect(onSelect).toHaveBeenCalledTimes(1);
        const [detail, event] = onSelect.mock.calls[0] as [AparteConversationSelectDetail, CustomEvent<AparteConversationSelectDetail>];
        expect(detail).toEqual({ id: 'c2' });
        expect(event).toBeInstanceOf(CustomEvent);
        expect(event.type).toBe('aparte-conversation-select');
        expect(event.detail).toBe(detail);
    });

    it('calls the callback of the event that was sent, and no other', () => {
        const onSelect = vi.fn();
        const onDelete = vi.fn();
        const { container } = render(<AparteConversationList onConversationSelect={onSelect} onConversationDelete={onDelete} />);
        act(() => { listOf(container).dispatchEvent(cancelable('aparte-conversation-delete', { id: 'c1' })); });
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(onDelete.mock.calls[0]![0]).toEqual({ id: 'c1' });
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('lets event.preventDefault() cancel a cancelable event: the sender sees it, as `manage` does', () => {
        const prevent = vi.fn((_detail: unknown, event: Event) => event.preventDefault());
        const { container } = render(<AparteConversationList onConversationDelete={prevent} onConversationRename={vi.fn()} />);
        const el = listOf(container);
        let delivered = true;
        act(() => { delivered = el.dispatchEvent(cancelable('aparte-conversation-delete', { id: 'c1' })); });
        expect(delivered).toBe(false);
        // A callback that does not cancel leaves the event as it was.
        act(() => { delivered = el.dispatchEvent(cancelable('aparte-conversation-rename', { id: 'c1', title: 'New' })); });
        expect(delivered).toBe(true);
    });

    it('is called without a detail as `null`: an event core sends bare', () => {
        const onOpen = vi.fn();
        const { container } = render(<AparteSelect onSelectOpen={onOpen} />);
        act(() => { container.querySelector('aparte-select')!.dispatchEvent(new CustomEvent('aparte-select-open', { bubbles: true })); });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen.mock.calls[0]![0]).toBeNull();
    });

    it('subscribes once: a new callback on a later render takes no new listener, and is the one called', () => {
        const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
        const subscribed = () => add.mock.calls.filter(([type]) => type === 'aparte-conversation-select').length;
        const first = vi.fn();
        const second = vi.fn();
        const { container, rerender } = render(<AparteConversationList conversations={ITEMS} onConversationSelect={first} />);
        expect(subscribed()).toBe(1);
        rerender(<AparteConversationList conversations={ITEMS} onConversationSelect={second} />);
        expect(subscribed()).toBe(1);
        act(() => rowTitle(container, 'c1').click());
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        add.mockRestore();
    });

    it('stops calling a callback that is taken away, and calls one that is added', () => {
        const handler = vi.fn();
        const { container, rerender } = render(<AparteConversationList conversations={ITEMS} />);
        act(() => rowTitle(container, 'c1').click());
        rerender(<AparteConversationList conversations={ITEMS} onConversationSelect={handler} />);
        act(() => rowTitle(container, 'c1').click());
        expect(handler).toHaveBeenCalledTimes(1);
        rerender(<AparteConversationList conversations={ITEMS} onConversationSelect={undefined} />);
        act(() => rowTitle(container, 'c1').click());
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('lets go of its listeners when it unmounts', () => {
        const handler = vi.fn();
        const { container, unmount } = render(<AparteConversationList onConversationSelect={handler} />);
        const el = listOf(container);
        const remove = vi.spyOn(el, 'removeEventListener');
        unmount();
        expect(remove.mock.calls.map(([type]) => type)).toContain('aparte-conversation-select');
        el.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: 'c1' } }));
        expect(handler).not.toHaveBeenCalled();
    });

    it('hears an event again after it was unmounted and mounted anew', () => {
        const handler = vi.fn();
        const View = ({ show }: { show: boolean }) => (show ? <AparteConversationList conversations={ITEMS} onConversationSelect={handler} /> : null);
        const { container, rerender } = render(<View show />);
        rerender(<View show={false} />);
        rerender(<View show />);
        act(() => rowTitle(container, 'c1').click());
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls each callback once under <StrictMode>, which runs every effect twice in development', () => {
        const handler = vi.fn();
        const assign = vi.spyOn(Object.getPrototypeOf(document.createElement('aparte-conversation-list')), 'conversations', 'set');
        const { container } = render(
            <StrictMode>
                <AparteConversationList conversations={ITEMS} active-id="c1" onConversationSelect={handler} />
            </StrictMode>,
        );
        act(() => rowTitle(container, 'c2').click());
        expect(handler).toHaveBeenCalledTimes(1);
        expect(assign).toHaveBeenCalledTimes(1);
        expect(listOf(container).getAttribute('active-id')).toBe('c1');
        assign.mockRestore();
    });
});

describe('what a component leaves to React: the props that are not the element\'s own', () => {
    it('takes className, style, id, aria-*, data-* and children onto the element', () => {
        const { container } = render(
            <AparteConversationList className="wide" style={{ minWidth: '12px' }} id="chats" aria-label="Your chats" data-testid="list" />,
        );
        const el = listOf(container);
        // The element may add classes of its own: ours is among them.
        expect(el.classList.contains('wide')).toBe(true);
        expect(el.style.minWidth).toBe('12px');
        expect(el.id).toBe('chats');
        expect(el.getAttribute('aria-label')).toBe('Your chats');
        expect(el.getAttribute('data-testid')).toBe('list');
    });

    it('keeps a class React 18 would have written as `classname`: the attribute is `class`', () => {
        const { container } = render(<AparteConversationList className="wide" />);
        expect(listOf(container).hasAttribute('class')).toBe(true);
        expect(listOf(container).hasAttribute('classname')).toBe(false);
    });

    it('renders children inside the element', () => {
        const { container } = render(
            <AparteSelect>
                <aparte-option value="a">A</aparte-option>
            </AparteSelect>,
        );
        expect(container.querySelector('aparte-select aparte-option')).not.toBeNull();
    });

    it('lets an `onClick` through to React, which owns the synthetic events of any element', () => {
        const onClick = vi.fn();
        const { container } = render(<AparteConversationList onClick={onClick} />);
        act(() => listOf(container).click());
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('renders no attribute for what it applies itself: not the rows, not a callback, not a declared prop', () => {
        const { container } = render(
            <AparteConversationList conversations={ITEMS} active-id="c1" onConversationSelect={() => undefined} />,
        );
        const names = listOf(container).getAttributeNames();
        expect(names).not.toContain('conversations');
        expect(names.filter((n) => n.startsWith('on'))).toEqual([]);
        expect(names).toContain('active-id');
    });
});

describe('the other elements follow the same rules', () => {
    it('writes a number as its string, and a zero as "0" rather than removing it', () => {
        const { container, rerender } = render(<AparteProgressSpinner value={0} />);
        const el = container.querySelector('aparte-progress-spinner')!;
        expect(el.getAttribute('value')).toBe('0');
        rerender(<AparteProgressSpinner value={42} />);
        expect(el.getAttribute('value')).toBe('42');
        rerender(<AparteProgressSpinner value={Number.NaN} />);
        expect(el.hasAttribute('value')).toBe(false);
    });

    it('turns a default-on attribute OFF with the string the element reads, not by removing it', () => {
        const { container, rerender } = render(<AparteComposer submit-on-enter={false} />);
        const el = container.querySelector('aparte-composer')!;
        expect(el.getAttribute('submit-on-enter')).toBe('false');
        rerender(<AparteComposer submit-on-enter />);
        expect(el.getAttribute('submit-on-enter')).toBe('');
        expect(el.getAttribute('placeholder')).toBeNull();
        rerender(<AparteComposer placeholder="Ask" disabled />);
        expect(el.getAttribute('placeholder')).toBe('Ask');
        expect(el.getAttribute('disabled')).toBe('');
    });

    it('puts an attribute the element reads once, at connect, in the markup it is connected with', () => {
        // `framework-managed` is read in `connectedCallback`: set after, the viewport has already moved
        // the children into its own wrapper, which breaks a framework that reconciles them.
        const { container } = render(
            <AparteChatViewport framework-managed>
                <div data-kid="" />
            </AparteChatViewport>,
        );
        const viewport = container.querySelector('aparte-chat-viewport')!;
        expect(viewport.getAttribute('framework-managed')).toBe('');
        expect(viewport.querySelector('.aparte-viewport-container')).toBeNull();
        expect(viewport.querySelector('[data-kid]')!.parentElement).toBe(viewport);
    });

    it('leaves an attribute out of the first markup when its prop is false', () => {
        const { container, rerender } = render(<AparteChatViewport framework-managed={false} />);
        const viewport = container.querySelector('aparte-chat-viewport')!;
        expect(viewport.hasAttribute('framework-managed')).toBe(false);
        rerender(<AparteChatViewport framework-managed={false} loading />);
        expect(viewport.hasAttribute('loading')).toBe(true);
    });
});

describe('the types', () => {
    type Props = ComponentProps<typeof AparteConversationList>;

    it('types the property, the attributes and each callback from the element', () => {
        expectTypeOf<Props['conversations']>().toEqualTypeOf<AparteConversationListItem[] | undefined>();
        expectTypeOf<Props['active-id']>().toEqualTypeOf<string | null | undefined>();
        expectTypeOf<NonNullable<Props['onConversationSelect']>>().parameters.toEqualTypeOf<
            [detail: AparteConversationSelectDetail, event: CustomEvent<AparteConversationSelectDetail>]
        >();
        expectTypeOf<NonNullable<Props['flat']>>().toEqualTypeOf<boolean | ''>();
        expectTypeOf<Props['className']>().toEqualTypeOf<string | undefined>();
    });

    it('types the ref as the element\'s own class', () => {
        expectTypeOf<Props['ref']>().toEqualTypeOf<React.Ref<ListElement> | undefined>();
        const ref = createRef<ListElement>();
        const ok = <AparteConversationList ref={ref} />;
        // @ts-expect-error -- the ref is a conversation list, not a select
        const wrong = <AparteConversationList ref={createRef<HTMLSelectElement>()} />;
        void [ok, wrong];
    });

    it('refuses what the element does not take', () => {
        // @ts-expect-error -- a presence attribute takes a boolean or '', not a word
        const word = <AparteConversationList flat="yes" />;
        // @ts-expect-error -- `active-id` is a string
        const num = <AparteConversationList active-id={5} />;
        // @ts-expect-error -- the callback receives the select detail
        const detail = <AparteConversationList onConversationSelect={(d: { nope: number }) => d.nope} />;
        // @ts-expect-error -- `conversations` is a list of conversations
        const rows = <AparteConversationList conversations={[{ nope: true }]} />;
        void [word, num, detail, rows];
    });
});

describe('hydrating server HTML', () => {
    let root: Root | null = null;
    afterEach(() => {
        act(() => root?.unmount());
        root = null;
        document.body.replaceChildren();
    });

    // The server's HTML is put in a page where core's elements are defined, so they upgrade on
    // insertion as in a browser — before React hydrates. Unless held, they draw themselves
    // first, and React finds a DOM it did not render (error 418, the server's HTML thrown away).
    it('holds the element while React hydrates it, then lets it draw itself with its props', async () => {
        const page = () => <AparteConversationList className="side" conversations={ITEMS} active-id="c2" />;
        const html = renderToString(page());
        expect(html).toContain('defer-hydration');
        expect(html).toContain('class="side"');
        // What the component applies itself is not markup: the client's first render has none either.
        expect(html).not.toContain('active-id');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.append(container);
        // Upgraded, and as the server sent it.
        expect(listOf(container).children).toHaveLength(0);

        // Core's rule for a wrapper is to release the element BEFORE anything talks to it: the
        // rows are assigned to an element that has already drawn itself, not to one still held.
        const proto = Object.getPrototypeOf(listOf(container));
        const assign = Object.getOwnPropertyDescriptor(proto, 'conversations')!.set!;
        const heldWhenAssigned: boolean[] = [];
        const spy = vi.spyOn(proto, 'conversations', 'set').mockImplementation(function (this: HTMLElement, rows: unknown) {
            heldWhenAssigned.push(this.hasAttribute('defer-hydration'));
            assign.call(this, rows);
        });

        const errors: unknown[] = [];
        await act(async () => {
            root = hydrateRoot(container, page(), { onRecoverableError: (e) => { errors.push(e); } });
        });
        spy.mockRestore();

        expect(errors).toEqual([]);
        expect(heldWhenAssigned).toEqual([false]);
        const el = listOf(container);
        expect(el.hasAttribute('defer-hydration')).toBe(false);
        expect(el.getAttribute('active-id')).toBe('c2');
        expect(container.querySelectorAll('[data-select-id]')).toHaveLength(2);
        expect(rowTitle(container, 'c2').getAttribute('aria-current')).toBe('page');
    });

    it('hears an event once hydrated', async () => {
        const onSelect = vi.fn();
        const page = () => <AparteConversationList conversations={ITEMS} onConversationSelect={onSelect} />;
        const container = document.createElement('div');
        container.innerHTML = renderToString(page());
        document.body.append(container);
        await act(async () => {
            root = hydrateRoot(container, page());
        });
        act(() => rowTitle(container, 'c1').click());
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('never holds the element in a client-only render: there is no server HTML to protect', () => {
        const container = document.createElement('div');
        document.body.append(container);
        act(() => {
            root = createRoot(container);
            root.render(<AparteConversationList conversations={ITEMS} />);
        });
        expect(container.querySelector('[defer-hydration]')).toBeNull();
        expect(container.querySelectorAll('[data-select-id]')).toHaveLength(2);
    });
});
