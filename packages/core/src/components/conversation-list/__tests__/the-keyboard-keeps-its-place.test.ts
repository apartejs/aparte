// @vitest-environment jsdom
/**
 * Two ways this list dropped the focus on the floor, both invisible to jsdom until the
 * browser's own focus rules are put back in front of it.
 *
 * (a) **Delete was unreachable.** `⋯ → Delete` replaces the menu's contents with the
 * confirmation, and the item the reader had just activated held the focus. A browser
 * blurs an element it is about to remove — `focusout`, `relatedTarget: null`, dispatched
 * while the node is still in the tree — and the list reads that as "focus left the menu"
 * and closes it. The question never appeared; the ⋯ menu simply vanished, and there was
 * no way to delete a conversation with the mouse OR the keyboard. jsdom runs no focus
 * fixup on removal, which is exactly why the unit tests were green.
 *
 * (b) **Enter on a row left the focus on `<body>`.** Selecting re-renders the list (the
 * host re-assigns `conversations` to mark the active row), `innerHTML` replaces every
 * row, and the button the reader was on is gone. The next Tab restarts at the top of the
 * page. The rename exit already restores the row for exactly this reason.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

function mount(items: AparteConversationListItem[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

const rowOf = (el: ListEl, id: string): HTMLElement => el.querySelector<HTMLElement>(`[data-conv-id="${id}"]`)!;
const moreOf = (el: ListEl, id: string): HTMLElement => rowOf(el, id).querySelector<HTMLElement>('.aparte-conv-item__more')!;
const selectOf = (el: ListEl, id: string): HTMLElement => el.querySelector<HTMLElement>(`[data-select-id="${id}"]`)!;
const choose = (el: ListEl, action: string): void => {
    el.querySelector<HTMLElement>(`[data-menu-action="${action}"]`)!.click();
};

/**
 * What Blink does and jsdom does not: a node about to be removed while it holds the
 * focus is blurred first — `focusout`, no `relatedTarget`, dispatched from the node
 * itself while it is still in the tree (`Document::NodeChildrenWillBeRemoved`, before
 * the children go). Removal is intercepted rather than observed because the moment is
 * the whole point: a `MutationObserver` runs a microtask later, by which time whatever
 * replaced the content has already taken the focus, and the question "did the focus die
 * with that node?" can no longer be asked.
 *
 * Three removal paths, so the assertion does not depend on which one the component
 * happens to use.
 */
function withBrowserFocusFixup(): () => void {
    const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
    const remove = Element.prototype.remove;
    const replaceChildren = Element.prototype.replaceChildren;
    const blurIfDoomed = (doomed: Node[]): void => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !doomed.some((n) => n === active || n.contains(active))) return;
        active.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    };
    Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        get(this: Element) { return html.get!.call(this); },
        set(this: Element, value: string) { blurIfDoomed([...this.childNodes]); html.set!.call(this, value); },
    });
    Element.prototype.remove = function remover(this: Element): void { blurIfDoomed([this]); remove.call(this); };
    Element.prototype.replaceChildren = function replacer(this: Element, ...nodes: Array<Node | string>): void {
        blurIfDoomed([...this.childNodes]);
        replaceChildren.call(this, ...nodes);
    };
    return () => {
        Object.defineProperty(Element.prototype, 'innerHTML', html);
        Element.prototype.remove = remove;
        Element.prototype.replaceChildren = replaceChildren;
    };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the delete confirmation', () => {
    it('never lets the focus leave the menu', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        moreOf(el, 'c1').click();
        const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
        expect(menu.contains(document.activeElement), 'the menu opens focused').toBe(true);

        choose(el, 'delete');

        expect(menu.contains(document.activeElement), 'and the question keeps it').toBe(true);
        expect((document.activeElement as HTMLElement).dataset['menuAction']).toBe('cancel');
    });

    it('survives the browser blurring the item it replaced, and deletes on confirm', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const stop = withBrowserFocusFixup();
        try {
            const deleted: unknown[] = [];
            el.addEventListener('aparte-conversation-delete', (e) => deleted.push((e as CustomEvent).detail));

            moreOf(el, 'c1').click();
            choose(el, 'delete');

            expect(el.querySelector('[role="dialog"]'), 'the popover is still open, asking').not.toBeNull();
            expect(el.querySelector('[data-menu-action="confirm-delete"]'), 'and the question is on screen').not.toBeNull();

            choose(el, 'confirm-delete');
            expect(deleted).toEqual([{ id: 'c1' }]);
        } finally {
            stop();
        }
    });

    it('stays open when a mouse press blurs the item the browser never focuses', () => {
        // WebKit does not move the focus to a button on mousedown: the element that held
        // it is blurred instead — `focusout`, `relatedTarget: null` — before the click
        // reaches the item. Read as "the focus left the menu", that closed the menu on
        // the press itself, so with a mouse no item could be chosen at all.
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        moreOf(el, 'c1').click();
        const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
        const item = menu.querySelector<HTMLElement>('[data-menu-action="delete"]')!;
        const held = document.activeElement as HTMLElement;
        expect(menu.contains(held), 'the menu opens focused').toBe(true);

        item.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        held.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        expect(el.querySelector('[role="menu"]'), 'the press leaves the menu open').not.toBeNull();

        item.click();
        expect(el.querySelector('[data-menu-action="confirm-delete"]'), 'and the click reaches the item').not.toBeNull();
    });
});

describe('a re-render of the rows', () => {
    it('puts the keyboard back on the row it was on', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        selectOf(el, 'c2').focus();
        selectOf(el, 'c2').click();

        // What a host does on `aparte-conversation-select`: mark the active row and
        // re-assign the list, which replaces every row element.
        el.setAttribute('active-id', 'c2');
        el.conversations = [{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }];

        expect(document.activeElement).toBe(selectOf(el, 'c2'));
    });

    it('leaves the focus alone when it was not in the list', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();

        el.conversations = [{ id: 'c1', title: 'One' }];

        expect(document.activeElement).toBe(outside);
    });
});

/**
 * (c) **A confirmed delete left the focus on `<body>`.** The row the keyboard was on is
 * the row that just left, so putting it back is not an option — but neither is dropping
 * it: the reader's next Tab restarts at the top of the page, right after the one action
 * of this list that cannot be undone.
 */
describe('a confirmed delete', () => {
    /** What a host does on `aparte-conversation-delete`: drop the row and re-assign. */
    function hostDeletes(el: ListEl): void {
        el.addEventListener('aparte-conversation-delete', (e) => {
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            el.conversations = el.conversations.filter((c) => c.id !== id);
        });
    }
    const remove = (el: ListEl, id: string): void => {
        moreOf(el, id).focus();
        moreOf(el, id).click();
        choose(el, 'delete');
        choose(el, 'confirm-delete');
    };

    it('hands the keyboard to the row that took the deleted one’s place', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }, { id: 'c3', title: 'Three' }]);
        hostDeletes(el);

        remove(el, 'c2');

        expect(el.querySelector('[data-conv-id="c2"]'), 'the row is gone').toBeNull();
        expect(document.activeElement).toBe(selectOf(el, 'c3'));
    });

    it('falls back to the row above when the deleted one was the last', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        hostDeletes(el);

        remove(el, 'c2');

        expect(document.activeElement).toBe(selectOf(el, 'c1'));
    });

    it('takes the keyboard itself when the last conversation goes', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        hostDeletes(el);

        remove(el, 'c1');

        expect(document.activeElement).toBe(el);
        expect(el.getAttribute('tabindex')).toBe('-1');
    });

    it('keeps the tab stop the host gave the list', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        el.setAttribute('tabindex', '0');
        hostDeletes(el);

        remove(el, 'c1');

        expect(document.activeElement).toBe(el);
        expect(el.getAttribute('tabindex')).toBe('0');
    });

    it('gives back the tab order it borrowed once the focus leaves', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        hostDeletes(el);
        remove(el, 'c1');

        const elsewhere = document.body.appendChild(document.createElement('button'));
        elsewhere.focus();

        expect(el.hasAttribute('tabindex')).toBe(false);
    });
});
