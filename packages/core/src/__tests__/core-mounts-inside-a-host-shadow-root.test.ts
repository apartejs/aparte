// @vitest-environment jsdom
/**
 * A chat mounted inside a shadow root of the consumer's own — their web component,
 * their micro-frontend — is a documented arrangement: the stylesheet declares its
 * tokens on `:host` for exactly that case. Four of core's handlers listen on
 * `document`, and an event that crosses a shadow boundary is RETARGETED there:
 * `event.target` reads as the shadow host, not the node that was hit. Each of the
 * four asked "is this inside me?" of the host, got no, and did the wrong thing —
 * a row menu that closed on the press, a sidebar toggle and a pane switch that did
 * nothing, a select that shut itself the instant it opened.
 *
 * Two lookups read the wrong tree the same way: a control that names no element
 * resolves the one beside it, which `document.querySelector` cannot see inside a
 * shadow root, and `document.activeElement` retargets to the host exactly as
 * `event.target` does — which the drawer's Tab trap and the select's filter field
 * both ask.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../components/conversation-list/aparte-conversation-list.js';
import '../components/sidebar/aparte-sidebar.js';
import '../components/split/aparte-split.js';
import '../primitives/select/aparte-select.js';
import '../primitives/select/aparte-option.js';
import type { AparteConversationListItem } from '../components/conversation-list/aparte-conversation-list.js';

/** A host element with an open shadow root, connected to the document. */
function shadowHost(): ShadowRoot {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
}

/** What a real click is: composed, so it crosses the boundary and reaches `document`. */
const clickIt = (el: Element): void => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
};

afterEach(() => { document.body.innerHTML = ''; });

/** The drawer's media query, driven by hand: jsdom's own never matches. */
type MediaListener = (e: { matches: boolean }) => void;
let mediaMatches = false;
let mediaListeners: MediaListener[] = [];
beforeEach(() => {
    mediaMatches = false;
    mediaListeners = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        get matches() { return mediaMatches; },
        addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
        removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
    });
});
const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of mediaListeners) cb({ matches });
};

/** A composed keydown, the way a real key press crosses the boundary. */
const press = (target: Element, key: string, shiftKey = false): boolean =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true, cancelable: true }));


describe('core inside a host shadow root', () => {
    it('keeps a conversation row menu open while it is being used', () => {
        const root = shadowHost();
        const list = document.createElement('aparte-conversation-list') as HTMLElement & {
            conversations: AparteConversationListItem[];
        };
        root.appendChild(list);
        list.conversations = [{ id: 'c1', title: 'One' }];

        list.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        const menu = list.querySelector<HTMLElement>('[role="menu"]')!;
        menu.querySelector<HTMLElement>('[data-menu-action="rename"]')!
            .dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

        expect(list.querySelector('[role="menu"]')).not.toBeNull();
    });

    it('honours a sidebar toggle button', () => {
        const root = shadowHost();
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        sidebar.id = 'shadow-sidebar';
        root.appendChild(sidebar);
        const toggle = document.createElement('button');
        toggle.setAttribute('data-aparte-sidebar-toggle', 'shadow-sidebar');
        root.appendChild(toggle);
        const before = sidebar.collapsed;

        clickIt(toggle);

        expect(sidebar.collapsed).toBe(!before);
    });

    it('honours a split pane button', () => {
        const root = shadowHost();
        const split = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        split.id = 'shadow-split';
        root.appendChild(split);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-split-pane', 'shadow-split');
        root.appendChild(button);

        clickIt(button);

        expect(split.pane).toBe('end');
    });

    it('lets a select open on its own trigger', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        const option = document.createElement('aparte-option');
        option.setAttribute('value', 'a');
        option.textContent = 'a';
        select.appendChild(option);
        root.appendChild(select);

        clickIt(select.querySelector('.aparte-select-trigger')!);

        expect(select.hasAttribute('open')).toBe(true);
    });

    it('still closes that select on a click elsewhere in the shadow tree', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        root.appendChild(select);
        const elsewhere = document.createElement('button');
        root.appendChild(elsewhere);
        clickIt(select.querySelector('.aparte-select-trigger')!);

        clickIt(elsewhere);

        expect(select.hasAttribute('open')).toBe(false);
    });
});

describe('a control that names no element finds the one in its own tree', () => {
    it('toggles the sidebar beside it, not the one in the document', () => {
        const light = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        document.body.appendChild(light);
        const root = shadowHost();
        const toggle = document.createElement('button');
        toggle.setAttribute('data-aparte-sidebar-toggle', '');
        root.appendChild(toggle);
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        root.appendChild(sidebar);

        expect(toggle.getAttribute('aria-controls'), 'the toggle announces the sidebar in its own tree').toBe(sidebar.id);

        clickIt(toggle);

        expect(sidebar.collapsed).toBe(true);
        expect(light.collapsed, 'a sidebar in the document must not answer a control from another tree').toBe(false);
    });

    it('switches the split beside it, not the one in the document', () => {
        const light = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        document.body.appendChild(light);
        const root = shadowHost();
        const split = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        root.appendChild(split);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-split-pane', 'end');
        root.appendChild(button);

        clickIt(button);

        expect(split.pane).toBe('end');
        expect(light.pane, 'a split in the document must not answer a button from another tree').toBe('start');
    });
});

describe('the focus reads from the tree it is in', () => {
    it('keeps Shift+Tab inside a drawer', () => {
        const root = shadowHost();
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean; open(): void };
        sidebar.innerHTML = '<button type="button" id="first">New chat</button>'
            + '<button type="button" id="last">Settings</button>';
        root.appendChild(sidebar);
        narrow(true);
        sidebar.open();
        expect(sidebar.collapsed).toBe(false);
        const first = sidebar.querySelector<HTMLElement>('#first')!;
        const last = sidebar.querySelector<HTMLElement>('#last')!;

        first.focus();
        const notPrevented = press(first, 'Tab', true);

        expect(notPrevented, 'Shift+Tab at the first control must be handled').toBe(false);
        expect(root.activeElement, 'Shift+Tab wraps to the last control, not back to the first').toBe(last);
    });

    it('leaves Home to the caret in a searchable select', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        select.setAttribute('searchable', '');
        for (const value of ['a', 'b']) {
            const option = document.createElement('aparte-option');
            option.setAttribute('value', value);
            option.textContent = value;
            select.appendChild(option);
        }
        root.appendChild(select);
        clickIt(select.querySelector('.aparte-select-trigger')!);
        const search = select.querySelector<HTMLInputElement>('.aparte-select-search')!;
        search.focus();

        const notPrevented = press(search, 'Home');

        expect(notPrevented, 'Home in the filter field moves the caret; it does not jump the list').toBe(true);
    });
});
