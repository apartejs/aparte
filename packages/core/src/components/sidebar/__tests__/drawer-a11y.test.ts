// @vitest-environment jsdom
/**
 * The sidebar's toggle says what it does, and the drawer keeps the keyboard (UI audit
 * LOT 7).
 *
 * A `[data-aparte-sidebar-toggle]` control opened and closed the sidebar without ever
 * announcing its state — no `aria-expanded`, no `aria-controls` — while the row's own
 * `⋯` button already did both. And the drawer, which draws a scrim over the page, moved
 * the focus in on open and closed on Escape, but Tab from its last control walked out
 * under the scrim, onto the transcript the drawer was covering. Tab is the one path
 * closed here; a `focusin` guard was considered and refused, because it would steal the
 * focus back from a dialog the drawer's own content opens onto `<body>`.
 *
 * The toggle state is synced wherever the state settles (connect, the collapsed
 * attribute, the breakpoint), never from `open()` alone — a close on Escape would
 * otherwise leave an "expanded" that lies.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-sidebar.js';
import '../../../primitives/select/aparte-select.js';
import type { AparteSidebar } from '../aparte-sidebar.js';

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

afterEach(() => { document.body.innerHTML = ''; });

const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of mediaListeners) cb({ matches });
};

function mountPage(): { toggle: HTMLButtonElement; sidebar: AparteSidebar; outside: HTMLButtonElement } {
    document.body.innerHTML = `
        <button type="button" data-aparte-sidebar-toggle>☰</button>
        <aparte-sidebar>
            <button type="button" id="first">New chat</button>
            <input id="search" data-aparte-sidebar-search />
            <button type="button" id="last">Settings</button>
        </aparte-sidebar>
        <button type="button" id="outside">Send</button>`;
    return {
        toggle: document.querySelector('[data-aparte-sidebar-toggle]') as HTMLButtonElement,
        sidebar: document.querySelector('aparte-sidebar') as AparteSidebar,
        outside: document.querySelector('#outside') as HTMLButtonElement,
    };
}

const key = (target: Element, k: string, shiftKey = false): boolean =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

describe('the toggle control', () => {
    it('is bound to the sidebar and announces its state at rest', () => {
        const { toggle, sidebar } = mountPage();
        expect(sidebar.id, 'the sidebar gives itself an id so a control can point at it').toBeTruthy();
        expect(toggle.getAttribute('aria-controls')).toBe(sidebar.id);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('follows a click, both ways', () => {
        const { toggle } = mountPage();
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('follows the breakpoint closing the drawer, and Escape closing it again', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        expect(sidebar.collapsed).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        key(document.body, 'Escape');
        expect(sidebar.collapsed).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps a host-authored id', () => {
        document.body.innerHTML = `<button type="button" data-aparte-sidebar-toggle="nav">☰</button><aparte-sidebar id="nav"></aparte-sidebar>`;
        const toggle = document.querySelector('[data-aparte-sidebar-toggle]')!;
        expect(document.querySelector('aparte-sidebar')!.id).toBe('nav');
        expect(toggle.getAttribute('aria-controls')).toBe('nav');
    });
});

describe('the open drawer keeps the keyboard', () => {
    it('Tab from the last control wraps to the first, Shift+Tab from the first to the last', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);
        const first = sidebar.querySelector<HTMLElement>('#first')!;
        const last = sidebar.querySelector<HTMLElement>('#last')!;

        last.focus();
        const notPrevented = key(last, 'Tab');
        expect(notPrevented, 'Tab at the end must be handled, or the focus leaves the drawer').toBe(false);
        expect(document.activeElement).toBe(first);

        key(first, 'Tab', true);
        expect(document.activeElement).toBe(last);
    });

    it('a script that focuses outside is left alone — a dialog opened from the drawer onto <body> must keep its focus', () => {
        const { toggle, sidebar, outside } = mountPage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);

        outside.focus();
        expect(document.activeElement).toBe(outside);
    });

    it('does nothing in the flow: Tab leaves the column as it always did', () => {
        const { sidebar } = mountPage();
        const last = sidebar.querySelector<HTMLElement>('#last')!;
        last.focus();
        expect(key(last, 'Tab')).toBe(true);
    });
});

/**
 * The drawer's own search filter hides rows (`hidden`), and a hidden row's buttons hold
 * no tab stop. A trap that compared DOM-last rather than REACHABLE-last therefore never
 * fired at the real end of the drawer, and Tab walked out under the scrim — the exact
 * failure the trap exists to prevent, reachable by typing in the field the drawer ships.
 */
function mountFilterablePage(): { toggle: HTMLButtonElement; sidebar: AparteSidebar } {
    document.body.innerHTML = `
        <button type="button" data-aparte-sidebar-toggle>☰</button>
        <aparte-sidebar>
            <button type="button" id="first">New chat</button>
            <input id="search" data-aparte-sidebar-search />
            <aparte-conversation-list>
                <div class="aparte-conv-group">
                    <div data-conv-id="a">
                        <span class="aparte-conv-item__title">alpha</span>
                        <button type="button" id="menu-a">⋯</button>
                    </div>
                    <div data-conv-id="b">
                        <span class="aparte-conv-item__title">beta</span>
                        <button type="button" id="menu-b">⋯</button>
                    </div>
                </div>
            </aparte-conversation-list>
        </aparte-sidebar>
        <button type="button" id="outside">Send</button>`;
    return {
        toggle: document.querySelector('[data-aparte-sidebar-toggle]') as HTMLButtonElement,
        sidebar: document.querySelector('aparte-sidebar') as AparteSidebar,
    };
}

describe('a filtered-out row keeps no tab stop', () => {
    it('Tab wraps from the last VISIBLE control, not from a hidden row buried below it', () => {
        const { toggle, sidebar } = mountFilterablePage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);

        const search = sidebar.querySelector<HTMLInputElement>('#search')!;
        search.value = 'alpha';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(sidebar.querySelector<HTMLElement>('[data-conv-id="b"]')!.hidden).toBe(true);

        const first = sidebar.querySelector<HTMLElement>('#first')!;
        const lastVisible = sidebar.querySelector<HTMLElement>('#menu-a')!;
        lastVisible.focus();
        const notPrevented = key(lastVisible, 'Tab');
        expect(notPrevented, 'Tab at the last reachable control must be handled').toBe(false);
        expect(document.activeElement).toBe(first);
    });

    it('opening focuses the first control a reader can reach, not an invisible one', () => {
        const { toggle, sidebar } = mountFilterablePage();
        sidebar.querySelector<HTMLElement>('#first')!.hidden = true;
        narrow(true);
        toggle.click();

        expect(document.activeElement).toBe(sidebar.querySelector('#search'));
    });
});

describe('the open drawer leaves the keys of what is above it', () => {
    /** A modal dialog the drawer's own content opens, beside the shell (the kit's documented pattern). */
    function openDialog(): { dialog: HTMLDialogElement; inside: HTMLButtonElement } {
        const dialog = document.createElement('dialog');
        dialog.innerHTML = '<button type="button" id="in-dialog">OK</button>';
        document.body.appendChild(dialog);
        // jsdom has no showModal: what it does to the dialog is enough for the drawer to read.
        dialog.setAttribute('open', '');
        const inside = dialog.querySelector('button')!;
        inside.focus();
        return { dialog, inside };
    }

    it('Escape in a modal dialog opened from the drawer is the dialog\'s, and the drawer stays open', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        const { inside } = openDialog();
        const notPrevented = key(inside, 'Escape');
        expect(notPrevented, 'the dialog gets its own Escape').toBe(true);
        expect(sidebar.collapsed).toBe(false);
    });

    it('Tab in that dialog stays in the dialog, not pulled back into the drawer behind it', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        const { inside } = openDialog();
        const notPrevented = key(inside, 'Tab');
        expect(notPrevented).toBe(true);
        expect(document.activeElement).toBe(inside);
        expect(sidebar.contains(document.activeElement)).toBe(false);
    });

    // jsdom throws on `:modal`, so the tests above ran the fallback alone: every open dialog read as
    // modal. With `:modal` answered as a browser does, a modal dialog keeps its keys and a dialog
    // opened with `show()` (not modal: the drawer still covers the page) does not.
    describe('with :modal answered as a browser does', () => {
        const matches = Element.prototype.matches;
        afterEach(() => { Element.prototype.matches = matches; });
        const modalWhen = (isModal: (el: Element) => boolean) => {
            Element.prototype.matches = function (this: Element, selector: string) {
                return selector === ':modal' ? isModal(this) : matches.call(this, selector);
            };
        };

        it('a modal dialog keeps its Escape, and the drawer stays open', () => {
            modalWhen((el) => el instanceof HTMLDialogElement && el.hasAttribute('data-modal'));
            const { toggle, sidebar } = mountPage();
            narrow(true);
            toggle.click();
            const { dialog, inside } = openDialog();
            dialog.setAttribute('data-modal', '');
            expect(key(inside, 'Escape')).toBe(true);
            expect(sidebar.collapsed).toBe(false);
        });

        it('a dialog that is not modal leaves the Escape to the drawer', () => {
            modalWhen(() => false);
            const { toggle, sidebar } = mountPage();
            narrow(true);
            toggle.click();
            const { inside } = openDialog();
            key(inside, 'Escape');
            expect(sidebar.collapsed).toBe(true);
        });

        // A field inside a component's own shadow root, in the dialog: `closest()` from where the
        // key began stops at that root, found no dialog, and the drawer took Tab and Escape.
        it.each(['Escape', 'Tab'])('a modal dialog keeps the %s typed in a field of a component inside it', (name) => {
            modalWhen((el) => el instanceof HTMLDialogElement);
            const { toggle, sidebar } = mountPage();
            narrow(true);
            toggle.click();
            const { dialog } = openDialog();
            const host = document.createElement('div');
            dialog.append(host);
            const field = host.attachShadow({ mode: 'open' }).appendChild(document.createElement('input'));
            field.focus();
            const event = new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, cancelable: true });
            field.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
            expect(sidebar.collapsed).toBe(false);
        });
    });

    it('Escape that cancels a word being composed in its search field closes nothing', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        const search = sidebar.querySelector<HTMLInputElement>('#search')!;
        search.focus();
        const composing = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true });
        search.dispatchEvent(composing);
        expect(composing.defaultPrevented).toBe(false);
        expect(sidebar.collapsed).toBe(false);
    });
});

describe('a select open in the drawer', () => {
    // WebKit leaves the focus on the page after a click on a part of the list that takes none, and
    // the select hears the keys typed there. Its Escape ran after the drawer's, which had already
    // closed the drawer: the list and the drawer went with one key.
    it('takes an Escape typed on the page before the drawer does', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);
        const select = document.createElement('aparte-select');
        for (const value of ['one', 'two']) {
            const option = document.createElement('aparte-option');
            option.setAttribute('value', value);
            option.textContent = value;
            select.append(option);
        }
        sidebar.append(select);
        const trigger = select.querySelector<HTMLElement>('.aparte-select-trigger')!;
        trigger.click();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        (document.activeElement as HTMLElement | null)?.blur();
        key(document.body, 'Escape');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(sidebar.collapsed, 'the drawer stays: that Escape was the list\'s').toBe(false);
    });
});
