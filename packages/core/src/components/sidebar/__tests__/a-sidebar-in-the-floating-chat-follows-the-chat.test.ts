// @vitest-environment jsdom
/**
 * A sidebar in the floating chat follows the chat, not the window.
 *
 * The sidebar turns drawer under a WINDOW width. Inside `<aparte-launcher>` the chat is a
 * card a few hundred pixels wide in the widest window, so the sidebar stayed a column and
 * took most of the card; and once it was a drawer, the drawer and its scrim, fixed to the
 * window, opened over the page the chat floats on. In a launcher the sidebar is a drawer
 * until the chat fills the window, and its scrim covers the chat's card.
 *
 * jsdom has no layout: the window's width is a `matchMedia` stub, and what is asserted is
 * the state the stylesheet reads (`data-drawer`, `collapsed`) and where the scrim is put.
 * That the drawer sits inside the card on screen is the browser test's to say.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-sidebar.js';
import { AparteSidebar } from '../aparte-sidebar.js';

type MediaListener = (e: { matches: boolean }) => void;
let narrowWindow = false;
let mediaListeners: MediaListener[] = [];

beforeEach(() => {
    narrowWindow = false;
    mediaListeners = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        get matches() { return narrowWindow; },
        addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
        removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
    });
});

afterEach(() => { document.body.innerHTML = ''; });

/** A change of the launcher's attributes reaches the sidebar through an observer: one tick. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

interface Floating { launcher: HTMLElement; shell: HTMLElement; sidebar: AparteSidebar }

/** The floating chat with a shell in its card: a sidebar and the place of the chat. */
function floating(launcherAttrs: Record<string, string> = {}, sidebarAttrs: Record<string, string> = {}): Floating {
    const launcher = document.createElement('aparte-launcher');
    for (const [name, value] of Object.entries(launcherAttrs)) launcher.setAttribute(name, value);
    const shell = document.createElement('div');
    shell.className = 'aparte-app-shell';
    const sidebar = document.createElement('aparte-sidebar') as AparteSidebar;
    for (const [name, value] of Object.entries(sidebarAttrs)) sidebar.setAttribute(name, value);
    const main = document.createElement('div');
    main.className = 'aparte-app-shell__main';
    shell.append(sidebar, main);
    launcher.appendChild(shell);
    document.body.appendChild(launcher);
    return { launcher, shell, sidebar };
}

describe('a sidebar in the floating chat', () => {
    it('is a drawer in the chat\'s card, however wide the window is', () => {
        const { sidebar } = floating();

        expect(sidebar.drawer).toBe(true);
        expect(sidebar.collapsed, 'and closed: the card opens on the chat').toBe(true);
    });

    it('is a column again once the chat fills the window', async () => {
        const { launcher, sidebar } = floating({ maximizable: '' });

        launcher.setAttribute('maximized', '');
        await settle();

        expect(sidebar.drawer).toBe(false);
        expect(sidebar.collapsed).toBe(false);
    });

    it('goes back to a drawer when the chat goes back to its card', async () => {
        const { launcher, sidebar } = floating({ maximizable: '', maximized: '' });
        expect(sidebar.drawer, 'precondition: a column in the maximized chat').toBe(false);

        launcher.removeAttribute('maximized');
        await settle();

        expect(sidebar.drawer).toBe(true);
        expect(sidebar.collapsed).toBe(true);
    });

    it('stays a drawer in a chat maximized as a panel, which is still narrow', async () => {
        const { launcher, sidebar } = floating({ maximizable: 'panel' });

        launcher.setAttribute('maximized', '');
        await settle();

        expect(sidebar.drawer).toBe(true);
    });

    it('is a drawer in the maximized chat too when the window itself is narrow', () => {
        narrowWindow = true;
        const { sidebar } = floating({ maximizable: '', maximized: '' });

        expect(sidebar.drawer).toBe(true);
    });

    it('keeps the word of a host that asked for a column at any width', async () => {
        const { launcher, sidebar } = floating({ maximizable: '' }, { breakpoint: 'none' });
        expect(sidebar.drawer).toBe(false);

        // One tick after each change: the two in one tick are a single reading of the launcher.
        launcher.setAttribute('maximized', '');
        await settle();
        expect(sidebar.drawer, 'in the maximized chat').toBe(false);

        launcher.removeAttribute('maximized');
        await settle();
        expect(sidebar.drawer, 'and back in the card').toBe(false);
    });

    it('keeps a column its host had collapsed closed when the chat is maximized again', async () => {
        const { launcher, sidebar } = floating({ maximizable: '', maximized: '' }, { collapsed: '' });
        expect(sidebar.drawer, 'precondition: a column').toBe(false);

        launcher.removeAttribute('maximized');
        await settle();
        launcher.setAttribute('maximized', '');
        await settle();

        expect(sidebar.drawer).toBe(false);
        expect(sidebar.collapsed, 'the host closed it, the card did not').toBe(true);
    });

    it('follows the window when it is not the shell\'s own child in the card', () => {
        // The drawer is held by the shell it is a child of. Anywhere else in a card nothing holds
        // it: it would open over the page, in a window wide enough for a column.
        const launcher = document.createElement('aparte-launcher');
        const card = document.createElement('div');
        const sidebar = document.createElement('aparte-sidebar') as AparteSidebar;
        card.appendChild(sidebar);
        launcher.appendChild(card);
        document.body.appendChild(launcher);

        expect(sidebar.drawer, 'a column in a wide window').toBe(false);

        narrowWindow = true;
        for (const cb of mediaListeners) cb({ matches: true });
        expect(sidebar.drawer, 'and a drawer under the breakpoint').toBe(true);
    });

    it('closes with the chat', async () => {
        const { launcher, shell, sidebar } = floating({ open: '' });
        sidebar.open();

        launcher.removeAttribute('open');
        await settle();

        expect(sidebar.collapsed).toBe(true);
        expect(shell.querySelector('.aparte-sidebar__scrim'), 'and its scrim with it').toBeNull();
    });

    it('leaves the focus where it is when the chat goes back to its card', async () => {
        // The toggle that opened the drawer before the chat was maximized is not where the focus
        // belongs once the chat is a card again: it is on the control that brought the card back.
        const { launcher, sidebar } = floating({ maximizable: '' });
        const toggle = document.createElement('button');
        const restore = document.createElement('button');
        document.body.append(toggle, restore);
        sidebar.open(toggle);
        launcher.setAttribute('maximized', '');
        await settle();

        restore.focus();
        launcher.removeAttribute('maximized');
        await settle();

        expect(sidebar.collapsed, 'precondition: a closed drawer again').toBe(true);
        expect(document.activeElement).toBe(restore);
    });

    it('puts its scrim over the chat\'s card, and takes it back when it closes', () => {
        const { shell, sidebar } = floating();

        sidebar.open();
        const scrim = shell.querySelector(':scope > .aparte-sidebar__scrim');
        expect(scrim, 'a child of the shell, beside the sidebar').not.toBeNull();
        expect(scrim!.classList.contains('aparte-sidebar__scrim--contained')).toBe(true);
        expect(sidebar.querySelector('.aparte-sidebar__scrim'), 'and not inside the sidebar, which clips').toBeNull();

        (scrim as HTMLElement).click();
        expect(sidebar.collapsed, 'a click on it closes the drawer').toBe(true);
        expect(shell.querySelector('.aparte-sidebar__scrim')).toBeNull();
    });

    it('leaves no scrim behind when it leaves the page while open', () => {
        const { shell, sidebar } = floating();
        sidebar.open();

        sidebar.remove();

        expect(shell.querySelector('.aparte-sidebar__scrim')).toBeNull();
    });
});

describe('an open drawer and the Escape key', () => {
    const escape = (from: Element): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        from.dispatchEvent(event);
        return event;
    };

    it('leaves Escape to whatever inside answered it first, and closes on the next', () => {
        const { sidebar } = floating();
        const more = document.createElement('button');
        sidebar.appendChild(more);
        sidebar.open();

        // A row's menu closing on Escape: it cancels the key it took.
        more.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
        escape(more);
        expect(sidebar.collapsed, 'the menu closed, not the drawer').toBe(false);

        expect(escape(more).defaultPrevented, 'the drawer takes the next one').toBe(true);
        expect(sidebar.collapsed).toBe(true);
    });
});

describe('a toggle in a shell', () => {
    it('drives the sidebar of its own shell, not the first one on the page', () => {
        const pages = document.createElement('aparte-sidebar') as AparteSidebar;
        document.body.appendChild(pages);
        const { shell, sidebar } = floating();
        const toggle = document.createElement('button');
        toggle.setAttribute('data-aparte-sidebar-toggle', '');
        const header = document.createElement('header');
        header.appendChild(toggle);
        shell.appendChild(header);

        toggle.click();

        expect(sidebar.collapsed, 'the card\'s drawer opened').toBe(false);
        expect(pages.collapsed, 'and the page\'s column did not move').toBe(false);
        expect(toggle.getAttribute('aria-controls')).toBe(sidebar.id);
    });
});

describe('a sidebar that is not in a floating chat', () => {
    it('follows the window, as it always did', () => {
        const sidebar = document.createElement('aparte-sidebar') as AparteSidebar;
        document.body.appendChild(sidebar);
        expect(sidebar.drawer).toBe(false);

        narrowWindow = true;
        for (const cb of mediaListeners) cb({ matches: true });
        expect(sidebar.drawer).toBe(true);

        sidebar.open();
        expect(sidebar.querySelector(':scope > .aparte-sidebar__scrim'), 'its scrim is its own child, over the page').not.toBeNull();
        expect(sidebar.querySelector('.aparte-sidebar__scrim--contained')).toBeNull();
    });
});
