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

        launcher.setAttribute('maximized', '');
        launcher.removeAttribute('maximized');
        await settle();

        expect(sidebar.drawer).toBe(false);
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
