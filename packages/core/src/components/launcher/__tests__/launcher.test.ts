// @vitest-environment jsdom
/**
 * `<aparte-launcher>` — the chat that floats in a corner of the page.
 *
 * The element owns its button, its header, and the state: open or closed, card or sheet,
 * maximized or not.
 * The children are the host's, so every test checks they are left where they were.
 * jsdom applies no stylesheet, so what the sheet draws is pinned by reading it at the end.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-launcher.js';
import '../../context/aparte-context.js';
import type { AparteLauncher, AparteLauncherToggleDetail } from '../aparte-launcher.js';
import { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_LOCALE, attachConfig, detachConfig } from '../../../config/index.js';
import { releaseDeferredHydration } from '../../../interop/defer-hydration.js';
import { messageSquareIcon, closeIcon, maximizeIcon, minimizeIcon } from '../../../icons/glyphs.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

type MediaListener = (e: { matches: boolean }) => void;
let mediaMatches = false;
let mediaListeners: MediaListener[] = [];
let queries: string[] = [];

beforeEach(() => {
    mediaMatches = false;
    mediaListeners = [];
    queries = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => {
        queries.push(query);
        return {
            get matches() { return mediaMatches; },
            addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
            removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
        };
    };
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of [...mediaListeners]) cb({ matches });
};

function mount(attrs = '', inner = '<div id="chat"><div id="composer" role="textbox" tabindex="0"></div><button type="button" id="send">Send</button></div>'): AparteLauncher {
    document.body.innerHTML = `<button type="button" id="page">Page</button><aparte-launcher ${attrs}>${inner}</aparte-launcher>`;
    return document.querySelector('aparte-launcher') as AparteLauncher;
}

const buttonOf = (el: AparteLauncher) => el.querySelector('.aparte-launcher__button') as HTMLButtonElement;

/** The element's children as names: its header and its button by their part, the host's by id or tag. */
const partsOf = (el: AparteLauncher): string[] => Array.from(el.children).map((c) =>
    c.classList.contains('aparte-launcher__header') ? 'header'
        : c.classList.contains('aparte-launcher__button') ? 'button'
            : c.id || c.tagName);

/** A glyph as the DOM serialises it, which closes `<path/>` its own way. */
function asParsed(svg: string): string {
    const span = document.createElement('span');
    span.innerHTML = svg;
    return span.innerHTML;
}

function record(el: AparteLauncher): AparteLauncherToggleDetail[] {
    const seen: AparteLauncherToggleDetail[] = [];
    document.addEventListener('aparte-launcher-toggle', (e) => seen.push((e as CustomEvent<AparteLauncherToggleDetail>).detail));
    void el;
    return seen;
}

const key = (target: Element, k: string, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
};

describe('<aparte-launcher>: what it adds', () => {
    it('adds its class, its header before the children it leaves in place, and one button after them', () => {
        const el = mount();
        expect(el.classList.contains('aparte-launcher')).toBe(true);
        expect(partsOf(el)).toEqual(['header', 'chat', 'button']);
        expect(buttonOf(el).type).toBe('button');
    });

    it('keeps its id, and keeps one button when it is moved', () => {
        const el = mount('id="help"');
        const button = buttonOf(el);
        document.body.prepend(el);
        expect(el.id).toBe('help');
        expect(el.querySelectorAll('.aparte-launcher__button')).toHaveLength(1);
        expect(buttonOf(el)).toBe(button);
    });

    it('draws a round bubble named by the locale while closed', () => {
        const button = buttonOf(mount());
        expect(button.className).toContain('aparte-btn--circle');
        expect(button.className).not.toContain('aparte-btn--pill');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-label')).toBe('Open the chat');
        expect(button.querySelector('.aparte-launcher__icon')?.innerHTML).toBe(asParsed(messageSquareIcon));
        expect(button.querySelector('.aparte-launcher__icon')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('draws a pill with the label, which names it, when given one', () => {
        const button = buttonOf(mount('label="  Help  "'));
        expect(button.className).toContain('aparte-btn--pill');
        expect(button.querySelector('.aparte-launcher__label')?.textContent).toBe('Help');
        expect(button.hasAttribute('aria-label')).toBe(false);
    });

    it('says whether it is expanded, and writes no id and no aria-controls', () => {
        // `aria-controls` named the launcher, the button's own ancestor, which is not what it
        // opens, and the element wrote an id on the host's element only to make that possible.
        // `aria-expanded` is the disclosure's contract; the id is the host's to give or not.
        const el = mount();
        expect(buttonOf(el).getAttribute('aria-expanded')).toBe('false');
        expect(buttonOf(el).hasAttribute('aria-controls')).toBe(false);
        expect(el.hasAttribute('id')).toBe(false);
        el.show();
        expect(buttonOf(el).hasAttribute('aria-controls')).toBe(false);
    });
});

describe('<aparte-launcher>: a framework that takes its button out', () => {
    /** MutationObserver callbacks are microtasks; a macrotask is after all of them. */
    const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

    it('puts its button back when the children are reconciled without it, and the button still opens', async () => {
        // Hydration compares the DOM to what it rendered and removes the trailing nodes it
        // did not (Vue's "more child nodes than client vdom", Svelte 4's detach of the rest).
        // The button is the element's own, not the framework's, so that is what goes.
        const el = mount();
        const button = buttonOf(el);
        button.remove();
        await settle();
        expect(buttonOf(el)).toBe(button);
        expect(el.lastElementChild).toBe(button);
        button.click();
        expect(el.open).toBe(true);
    });

    it('puts it back at once on a render, and keeps the children where they are', () => {
        const el = mount();
        const button = buttonOf(el);
        button.remove();
        const chat = el.querySelector('#chat');
        el.setAttribute('label', 'Help');
        expect(buttonOf(el)).toBe(button);
        expect(button.querySelector('.aparte-launcher__label')?.textContent).toBe('Help');
        expect(partsOf(el)).toEqual(['header', 'chat', 'button']);
        expect(el.querySelector('#chat')).toBe(chat);
    });

    it('leaves a button that is where it should be, whatever else is added around it', async () => {
        const el = mount();
        const button = buttonOf(el);
        el.insertBefore(document.createElement('section'), button);
        el.append(document.createElement('aside'));
        await settle();
        expect(partsOf(el)).toEqual(['header', 'chat', 'SECTION', 'button', 'ASIDE']);
        expect(buttonOf(el)).toBe(button);
    });

    it('stops watching while it is off the page, and puts the button back when it returns', async () => {
        const el = mount();
        const button = buttonOf(el);
        el.remove();
        button.remove();
        await settle();
        expect(el.contains(button)).toBe(false);
        document.body.append(el);
        expect(buttonOf(el)).toBe(button);
    });

    it('draws nothing under defer-hydration, and its button once the framework has released it', () => {
        // The documented server-rendering pattern: the attribute on the launcher, released after
        // hydration. Until then the element is the markup the server sent, so the framework
        // finds the DOM it rendered.
        document.body.innerHTML = '<div id="root" defer-hydration><aparte-launcher label="Help"><div id="chat"></div></aparte-launcher></div>';
        const el = document.querySelector('aparte-launcher') as AparteLauncher;
        expect(buttonOf(el)).toBeNull();
        expect(el.classList.contains('aparte-launcher')).toBe(false);
        releaseDeferredHydration(document.getElementById('root'));
        expect(buttonOf(el)).not.toBeNull();
        expect(buttonOf(el).querySelector('.aparte-launcher__label')?.textContent).toBe('Help');
    });
});

describe('<aparte-launcher>: a page brought back from its own HTML', () => {
    // Livewire's wire:navigate keeps the page's HTML for the Back button and parses it back in;
    // so does any page cache that restores markup. The launcher it brings back is a NEW element
    // whose markup already holds the button the old one drew.
    const restore = (): AparteLauncher => {
        const html = document.body.innerHTML;
        document.body.innerHTML = html;
        return document.querySelector('aparte-launcher') as AparteLauncher;
    };

    it('takes up the button in its markup instead of drawing a second one, and that button opens', () => {
        mount('label="Help"');
        const el = restore();
        const buttons = el.querySelectorAll('.aparte-launcher__button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]?.querySelector('.aparte-launcher__label')?.textContent).toBe('Help');
        (buttons[0] as HTMLButtonElement).click();
        expect(el.open).toBe(true);
        expect(buttons[0]?.getAttribute('aria-expanded')).toBe('true');
    });

    it('draws the button for the state it comes back in, open or closed', () => {
        mount('open');
        const el = restore();
        expect(el.querySelectorAll('.aparte-launcher__button')).toHaveLength(1);
        expect(buttonOf(el).getAttribute('aria-expanded')).toBe('true');
        buttonOf(el).click();
        expect(el.open).toBe(false);
    });

    it('keeps one button when the markup it comes back with already held two', () => {
        mount();
        const el = document.querySelector('aparte-launcher') as AparteLauncher;
        el.append(buttonOf(el).cloneNode(true));
        expect(restore().querySelectorAll('.aparte-launcher__button')).toHaveLength(1);
    });
});

describe('<aparte-launcher>: opening and closing', () => {
    it('opens and closes on its button, and the button says which', () => {
        const el = mount('label="Help"');
        buttonOf(el).click();
        expect(el.open).toBe(true);
        expect(el.hasAttribute('open')).toBe(true);
        const button = buttonOf(el);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(button.getAttribute('aria-label')).toBe('Close the chat');
        expect(button.className).toContain('aparte-btn--circle');
        expect(button.querySelector('.aparte-launcher__label')).toBeNull();
        // A close control while open, as a launcher is everywhere, header or not.
        expect(button.querySelector('.aparte-launcher__icon')?.innerHTML).toBe(asParsed(closeIcon));
        button.click();
        expect(el.open).toBe(false);
        expect(buttonOf(el).querySelector('.aparte-launcher__label')?.textContent).toBe('Help');
    });

    it('answers show, close, toggle and the open property', () => {
        const el = mount();
        el.show();
        expect(el.open).toBe(true);
        el.close();
        expect(el.open).toBe(false);
        el.toggle();
        expect(el.open).toBe(true);
        el.open = false;
        expect(el.hasAttribute('open')).toBe(false);
    });

    it('announces each change once, with the state entered', () => {
        const el = mount();
        const seen = record(el);
        narrow(true);
        el.show();
        el.show();
        el.close();
        expect(seen).toEqual([{ open: true, sheet: true, maximized: false, covers: true }, { open: false, sheet: true, maximized: false, covers: false }]);
    });

    it('announces the sheet again when the window crosses the breakpoint while it is open', () => {
        const el = mount();
        const seen = record(el);
        el.show();
        narrow(true);
        narrow(true);
        narrow(false);
        el.close();
        narrow(true);
        expect(seen).toEqual([
            { open: true, sheet: false, maximized: false, covers: false },
            { open: true, sheet: true, maximized: false, covers: true },
            { open: true, sheet: false, maximized: false, covers: false },
            { open: false, sheet: false, maximized: false, covers: false },
        ]);
    });

    it('does not announce the state its markup asked for when it upgrades', () => {
        const seen: AparteLauncherToggleDetail[] = [];
        document.addEventListener('aparte-launcher-toggle', (e) => seen.push((e as CustomEvent<AparteLauncherToggleDetail>).detail));
        const el = mount('open');
        expect(el.open).toBe(true);
        expect(buttonOf(el).getAttribute('aria-expanded')).toBe('true');
        expect(seen).toEqual([]);
    });

    it('closes from any control marked data-aparte-launcher-close inside, and not from one outside', () => {
        const el = mount('open', '<section><header><button type="button" id="x" data-aparte-launcher-close><span id="glyph">✕</span></button></header></section>');
        document.body.insertAdjacentHTML('beforeend', '<button type="button" id="far" data-aparte-launcher-close>far</button>');
        (document.getElementById('far') as HTMLButtonElement).click();
        expect(el.open).toBe(true);
        (document.getElementById('glyph') as HTMLElement).click();
        expect(el.open).toBe(false);
    });

    it('relabels its button when the locale changes', () => {
        const el = mount();
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, launcherOpen: 'Ouvrir la discussion', launcherClose: 'Fermer la discussion' });
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Ouvrir la discussion');
        el.show();
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Fermer la discussion');
    });
});

describe('<aparte-launcher>: the config of the chat inside', () => {
    const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    const ownBubble = '<svg class="aparte-icon" id="own-bubble"></svg>';

    /** A French chat with a glyph of its own, the way a wrapper's `config` prop gives one: `attachConfig` on the chat's element. */
    function frenchConfig(): AparteConfig {
        const config = new AparteConfig();
        config.setLocale({ ...APARTE_DEFAULT_LOCALE, launcherOpen: 'Ouvrir la discussion', launcherClose: 'Fermer la discussion' });
        config.registerIcons({ messageSquare: () => ownBubble });
        return config;
    }

    it('names its button, and draws its bubble, from the config the chat inside carries', () => {
        const el = mount();
        attachConfig(el.querySelector('#chat') as HTMLElement, frenchConfig());
        return settle().then(() => {
            expect(buttonOf(el).getAttribute('aria-label')).toBe('Ouvrir la discussion');
            expect(buttonOf(el).querySelector('#own-bubble')).not.toBeNull();
            el.show();
            expect(buttonOf(el).getAttribute('aria-label')).toBe('Fermer la discussion');
            // The global config is the page's, and stays as it was.
            expect(aparteGlobalConfig.getLocale().launcherOpen).toBe('Open the chat');
        });
    });

    it('hands the focus past a composer the card hides, to the first control it shows', () => {
        const el = mount('', '<div id="card"><button type="button" id="start">New conversation</button><div id="chat" hidden><div id="composer" role="textbox" tabindex="0"></div></div></div>');
        buttonOf(el).click();
        expect(document.activeElement?.id).toBe('start');
    });

    it("draws the launcher's own icons when the config holds them, and leaves the chat's close icon alone", () => {
        const el = mount();
        const config = new AparteConfig();
        config.registerIcons({
            launcherOpen: () => '<svg class="aparte-icon" id="own-open"></svg>',
            launcherClose: () => '<svg class="aparte-icon" id="own-close"></svg>',
        });
        attachConfig(el.querySelector('#chat') as HTMLElement, config);
        return settle().then(() => {
            expect(buttonOf(el).querySelector('#own-open')).not.toBeNull();
            el.show();
            expect(buttonOf(el).querySelector('#own-close')).not.toBeNull();
            // Every other close button keeps core's drawing.
            expect(config.getIcon('close')).toBe(closeIcon);
        });
    });

    it('reads it when the chat carries it already at connect, and follows a live change of it', () => {
        const el = document.createElement('aparte-launcher') as AparteLauncher;
        el.innerHTML = '<div id="chat"></div>';
        const config = frenchConfig();
        attachConfig(el.firstElementChild as HTMLElement, config);
        document.body.append(el);
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Ouvrir la discussion');
        config.setLocale({ ...APARTE_DEFAULT_LOCALE, launcherOpen: 'Abrir el chat' });
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Abrir el chat');
    });

    it('falls back to the config at its own place when the chat has none, and when it loses it', async () => {
        const el = mount();
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Open the chat');
        const chat = el.querySelector('#chat') as HTMLElement;
        attachConfig(chat, frenchConfig());
        await settle();
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Ouvrir la discussion');
        detachConfig(chat);
        await settle();
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Open the chat');
        // An ancestor's boundary governs a chat that has none of its own.
        const ancestor = new AparteConfig();
        ancestor.setLocale({ ...APARTE_DEFAULT_LOCALE, launcherOpen: 'Chat öffnen' });
        const shell = document.createElement('div');
        document.body.append(shell);
        attachConfig(shell, ancestor);
        shell.append(el);
        expect(buttonOf(el).getAttribute('aria-label')).toBe('Chat öffnen');
    });
});

describe('<aparte-launcher>: the focus and the keys', () => {
    it('hands the focus to the composer on open, and back to the button on close', () => {
        const el = mount();
        buttonOf(el).focus();
        buttonOf(el).click();
        expect(document.activeElement?.id).toBe('composer');
        buttonOf(el).click();
        expect(document.activeElement).toBe(buttonOf(el));
    });

    it('focuses the first control of a card that has no composer, never its own button', () => {
        const el = mount('', '<div><a href="#faq" id="faq">FAQ</a></div>');
        buttonOf(el).click();
        expect(document.activeElement?.id).toBe('faq');
        const empty = mount('', '<div>nothing to focus</div>');
        (document.getElementById('page') as HTMLButtonElement).focus();
        buttonOf(empty).click();
        expect(document.activeElement?.id).toBe('page');
    });

    it('moves no focus when a script opens it: show(), the property, the attribute', () => {
        // A page that restores the state on load, or a host that drives `open` from its own
        // state, is not a person opening the chat — and a sheet on a phone would raise the
        // keyboard. Only the button, which a person pressed, hands the focus to the composer.
        const el = mount();
        const page = document.getElementById('page') as HTMLButtonElement;
        page.focus();
        const seen = record(el);
        el.show();
        expect(document.activeElement).toBe(page);
        el.close();
        el.open = true;
        expect(document.activeElement).toBe(page);
        el.close();
        el.setAttribute('open', '');
        expect(document.activeElement).toBe(page);
        expect(seen).toHaveLength(5);
        // The button is still the person's way in.
        el.close();
        buttonOf(el).click();
        expect(document.activeElement?.id).toBe('composer');
    });

    it('leaves the focus alone when it closes while the focus is elsewhere', () => {
        const el = mount('open');
        const page = document.getElementById('page') as HTMLButtonElement;
        page.focus();
        el.close();
        expect(document.activeElement).toBe(page);
    });

    it('closes on Escape inside, unless something inside answered it first', () => {
        const el = mount();
        el.show();
        const composer = document.getElementById('composer') as HTMLElement;
        composer.focus();
        const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        composer.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
        composer.dispatchEvent(handled);
        expect(el.open).toBe(true);
        const escape = key(composer, 'Escape');
        expect(escape.defaultPrevented).toBe(true);
        expect(el.open).toBe(false);
        expect(document.activeElement).toBe(buttonOf(el));
    });

    it('leaves Escape to an IME that is composing: it cancels the composition, not the chat', () => {
        const el = mount();
        el.show();
        const composer = document.getElementById('composer') as HTMLElement;
        const composing = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true });
        composer.dispatchEvent(composing);
        expect(composing.defaultPrevented).toBe(false);
        expect(el.open).toBe(true);
        // The engines that do not set `isComposing` say 229, the way the composer reads them.
        const legacy = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true, cancelable: true });
        composer.dispatchEvent(legacy);
        expect(legacy.defaultPrevented).toBe(false);
        expect(el.open).toBe(true);
        key(composer, 'Escape');
        expect(el.open).toBe(false);
    });

    it('leaves Escape to the context gauge\'s panel open inside the card, and closes on the next', () => {
        const el = mount('', '<div id="chat"><div id="composer" role="textbox" tabindex="0"></div><aparte-context window="1000" used="300"></aparte-context></div>');
        el.show();
        const toggle = el.querySelector<HTMLButtonElement>('.aparte-context__toggle')!;
        const panel = el.querySelector<HTMLElement>('.aparte-context__panel')!;
        toggle.click();
        toggle.focus();
        expect(panel.hidden).toBe(false);
        key(toggle, 'Escape');
        expect(panel.hidden).toBe(true);
        expect(el.open).toBe(true);
        key(toggle, 'Escape');
        expect(el.open).toBe(false);
    });

    it('leaves Escape to a dialog open inside the card, which closes itself on it', () => {
        // A modal dialog closes on Escape unless the keydown was cancelled: the launcher
        // cancelling it would refuse the dialog its close request and hide the card under it.
        // jsdom has no `:modal`, so every open dialog counts here; the browser spec tells a
        // modal one from one opened with `show()`.
        const el = mount('', '<div id="chat"><div id="composer" role="textbox" tabindex="0"></div><dialog id="dlg" open><button type="button" id="in-dialog">OK</button></dialog></div>');
        el.show();
        const inDialog = document.getElementById('in-dialog') as HTMLElement;
        const pressed = key(inDialog, 'Escape');
        expect(pressed.defaultPrevented).toBe(false);
        expect(el.open).toBe(true);
        (document.getElementById('dlg') as HTMLDialogElement).removeAttribute('open');
        key(inDialog, 'Escape');
        expect(el.open).toBe(false);
    });

    it('ignores Escape while closed, and Escape outside', () => {
        const el = mount();
        expect(key(buttonOf(el), 'Escape').defaultPrevented).toBe(false);
        el.show();
        key(document.getElementById('page') as HTMLElement, 'Escape');
        expect(el.open).toBe(true);
    });

    it('keeps Tab inside the sheet, and leaves it free on a card', () => {
        // Without the header, whose ✕ would be the ring's first stop (the next test).
        const el = mount('header="false"');
        el.show();
        const composer = document.getElementById('composer') as HTMLElement;
        const button = buttonOf(el);
        // A card: the page stays reachable.
        button.focus();
        expect(key(button, 'Tab').defaultPrevented).toBe(false);
        narrow(true);
        button.focus();
        expect(key(button, 'Tab').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(composer);
        expect(key(composer, 'Tab', true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(button);
        // In the middle, Tab is the browser's.
        const send = document.getElementById('send') as HTMLElement;
        send.focus();
        expect(key(send, 'Tab').defaultPrevented).toBe(false);
        expect(key(el, 'Enter').defaultPrevented).toBe(false);
    });

    it("starts the sheet's ring at its header's ✕, the first control on screen", () => {
        const el = mount('open');
        narrow(true);
        const send = document.getElementById('send') as HTMLElement;
        const close = el.querySelector<HTMLElement>('.aparte-launcher__close')!;
        // The ring's last stop wraps to the first, the header's ✕. jsdom draws nothing, so the
        // round button still counts as the last stop here; a browser hides it while the
        // header holds a ✕ (proved in e2e/tests/launcher.spec.ts, the phone's Tab ring).
        void send;
        buttonOf(el).focus();
        expect(key(buttonOf(el), 'Tab').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(close);
    });

    it('keeps Tab inside while maximized, on a window wide enough for a card', () => {
        const el = mount('open maximized header="false"');
        const composer = document.getElementById('composer') as HTMLElement;
        const button = buttonOf(el);
        button.focus();
        expect(key(button, 'Tab').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(composer);
        el.maximized = false;
        button.focus();
        expect(key(button, 'Tab').defaultPrevented).toBe(false);
    });

    it('lets Tab go in a sheet with nothing to focus', () => {
        const el = mount('open', '<div>text only</div>');
        narrow(true);
        el.querySelector<HTMLElement>('.aparte-launcher__button')!.remove();
        expect(key(el, 'Tab').defaultPrevented).toBe(false);
    });
});

describe('<aparte-launcher>: its header', () => {
    const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    const headerOf = (el: AparteLauncher) => el.querySelector<HTMLElement>(':scope > .aparte-launcher__header');
    const part = (el: AparteLauncher, name: string) => el.querySelector<HTMLElement>(`.aparte-launcher__${name}`)!;

    it('draws one over a card that has none, titled by the locale, with a ✕ that closes the chat', () => {
        const el = mount('open');
        const header = headerOf(el)!;
        // A div wearing the recipe: a <header> outside a section is the page's banner landmark.
        expect(header.tagName).toBe('DIV');
        expect(header.className).toContain('aparte-app-header');
        expect(part(el, 'title').textContent).toBe('Chat');
        expect(part(el, 'subheading').hidden).toBe(true);
        const close = part(el, 'close') as HTMLButtonElement;
        expect(close.getAttribute('aria-label')).toBe('Close the chat');
        expect(close.getAttribute('title')).toBe('Close the chat');
        expect(close.querySelector('.aparte-launcher__icon')?.innerHTML).toBe(asParsed(closeIcon));
        close.focus();
        close.click();
        expect(el.open).toBe(false);
        expect(document.activeElement).toBe(buttonOf(el));
    });

    it('takes its title and the line under it from heading and subheading, and follows them', () => {
        const el = mount('heading="  Kilnhouse support " subheading="Usually answers in a minute"');
        const header = headerOf(el);
        expect(part(el, 'title').textContent).toBe('Kilnhouse support');
        expect(part(el, 'subheading').textContent).toBe('Usually answers in a minute');
        expect(part(el, 'subheading').hidden).toBe(false);
        el.setAttribute('heading', 'Help');
        el.removeAttribute('subheading');
        expect(part(el, 'title').textContent).toBe('Help');
        expect(part(el, 'subheading').hidden).toBe(true);
        // Set but empty: no title, and the ✕ stays.
        el.setAttribute('heading', '');
        expect(part(el, 'title').hidden).toBe(true);
        expect(headerOf(el)).toBe(header);
    });

    it('names its title and its controls from the config of the chat inside', async () => {
        const el = mount('maximizable');
        const config = new AparteConfig();
        config.setLocale({ ...APARTE_DEFAULT_LOCALE, launcherHeading: 'Discussion', launcherClose: 'Fermer la discussion', launcherMaximize: 'Agrandir la discussion' });
        attachConfig(el.querySelector('#chat') as HTMLElement, config);
        await settle();
        expect(part(el, 'title').textContent).toBe('Discussion');
        expect(part(el, 'close').getAttribute('aria-label')).toBe('Fermer la discussion');
        expect(part(el, 'maximize').getAttribute('aria-label')).toBe('Agrandir la discussion');
    });

    it('draws none over a card that brings its own header at its top level, and only then', () => {
        expect(headerOf(mount('heading="Help"', '<section><header>Kilnhouse</header><div id="chat"></div></section>'))).toBeNull();
        // A close control alone is not a header: an "End chat" in the card's footer is one too.
        expect(headerOf(mount('', '<div id="chat"><footer><button type="button" data-aparte-launcher-close>End chat</button></footer></div>'))).not.toBeNull();
        // A header deeper in the card is its content — a reply, a form — not the card's own.
        expect(headerOf(mount('', '<div id="chat"><article><header>A reply</header></article></div>'))).not.toBeNull();
    });

    it('steps aside when the card renders its own header after it connected, and comes back when it goes', async () => {
        const el = mount('', '<section id="chat"><div>conversation</div></section>');
        expect(headerOf(el)).not.toBeNull();
        const own = document.createElement('header');
        own.textContent = 'Kilnhouse';
        el.querySelector('#chat')!.prepend(own);
        await settle();
        expect(headerOf(el)).toBeNull();
        own.remove();
        await settle();
        expect(headerOf(el)).not.toBeNull();
    });

    it("titles itself with the button's label when it has no heading, before the locale's word", () => {
        expect(part(mount('label="Help"'), 'title').textContent).toBe('Help');
        expect(part(mount('label="Help" heading="Kilnhouse support"'), 'title').textContent).toBe('Kilnhouse support');
    });

    it("survives a provider that throws in the header, written for a message's host", () => {
        const errors: unknown[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => { errors.push(args); };
        try {
            aparteGlobalConfig.setAvatarProvider({
                render(_role, host) {
                    // The lookup a provider written for messages makes, unguarded.
                    host.closest('aparte-chat-bubble')!.getAttribute('message-id');
                },
            });
            const el = mount();
            const seen = record(el);
            el.show();
            expect(el.open).toBe(true);
            expect(seen).toHaveLength(1);
            expect(part(el, 'avatar').childElementCount).toBe(0);
            expect(errors).toHaveLength(1);
            // Not called again on every render.
            el.setAttribute('heading', 'Help');
            expect(errors).toHaveLength(1);
        } finally {
            console.error = original;
        }
    });

    it("wears the assistant's role, so the stylesheet's assistant colours and picture reach it", () => {
        expect(part(mount(), 'avatar').getAttribute('data-role')).toBe('assistant');
    });

    it("draws the assistant's avatar by the config's avatar provider, the messages' own, and none without one", () => {
        const el = mount();
        const avatar = part(el, 'avatar');
        expect(avatar.childElementCount).toBe(0);
        let undone = 0;
        aparteGlobalConfig.setAvatarProvider({
            render(role, host) {
                const face = document.createElement('b');
                face.textContent = role === 'assistant' ? 'W' : '?';
                host.append(face);
                return () => { undone++; };
            },
        });
        expect(avatar.textContent).toBe('W');
        expect(avatar.getAttribute('aria-hidden')).toBe('true');
        expect(avatar.nextElementSibling?.className).toBe('aparte-launcher__heading');
        // Not drawn again on a render that changes nothing about the provider.
        el.setAttribute('heading', 'Help');
        expect(avatar.querySelectorAll('b')).toHaveLength(1);
        expect(undone).toBe(0);
        aparteGlobalConfig.setAvatarProvider(null);
        expect(avatar.childElementCount).toBe(0);
        expect(undone).toBe(1);
    });

    it('steps aside when a card with its own header arrives later, and comes back when it goes', async () => {
        const el = mount();
        const card = document.createElement('section');
        card.innerHTML = '<header>Kilnhouse</header>';
        el.querySelector('#chat')!.replaceWith(card);
        await settle();
        expect(headerOf(el)).toBeNull();
        card.remove();
        await settle();
        expect(partsOf(el)).toEqual(['header', 'button']);
    });

    it('draws none with header="false", and its property says and sets the same', () => {
        const el = mount('header="false"');
        expect(headerOf(el)).toBeNull();
        expect(el.header).toBe(false);
        el.header = true;
        expect(el.hasAttribute('header')).toBe(false);
        expect(headerOf(el)).not.toBeNull();
        // `header={false}` from a framework sets the property, which writes the attribute's
        // OFF — where removing a boolean attribute would have meant ON.
        el.header = false;
        expect(el.getAttribute('header')).toBe('false');
        expect(headerOf(el)).toBeNull();
    });

    it('stays first in the DOM when the host prepends its card after connect, so Tab reads the title first', async () => {
        const el = mount('', '');
        const card = document.createElement('div');
        card.id = 'chat';
        el.prepend(card);
        await settle();
        expect(partsOf(el)).toEqual(['header', 'chat', 'button']);
    });

    it('names its title as a heading, for a screen reader to reach the chat by', () => {
        const title = part(mount('heading="Help"'), 'title');
        expect(title.getAttribute('role')).toBe('heading');
        expect(title.getAttribute('aria-level')).toBe('2');
    });

    it('puts its header back first when a framework takes it out', async () => {
        const el = mount();
        const header = headerOf(el)!;
        header.remove();
        await settle();
        expect(el.firstElementChild).toBe(header);
    });

    it('keeps one header when the page is brought back from its own HTML, and its ✕ closes', () => {
        mount('heading="Help" open');
        const html = document.body.innerHTML;
        document.body.innerHTML = html;
        const el = document.querySelector('aparte-launcher') as AparteLauncher;
        expect(el.querySelectorAll(':scope > .aparte-launcher__header')).toHaveLength(1);
        part(el, 'close').click();
        expect(el.open).toBe(false);
    });

    it('hands the focus on open to the card, never to its own ✕', () => {
        const el = mount('', '<div><a href="#faq" id="faq">FAQ</a></div>');
        buttonOf(el).click();
        expect(document.activeElement?.id).toBe('faq');
    });
});

describe('<aparte-launcher>: maximize', () => {
    const maximizeOf = (el: AparteLauncher) => el.querySelector<HTMLButtonElement>('.aparte-launcher__maximize')!;

    it('shows its maximize button only when maximizable', () => {
        const el = mount();
        expect(maximizeOf(el).hidden).toBe(true);
        el.setAttribute('maximizable', '');
        expect(maximizeOf(el).hidden).toBe(false);
    });

    it('enlarges the card and brings it back, the button named for what it will do, and still the one focused', () => {
        const el = mount('maximizable open');
        const button = maximizeOf(el);
        expect(button.getAttribute('aria-label')).toBe('Expand the chat');
        expect(button.querySelector('.aparte-launcher__icon')?.innerHTML).toBe(asParsed(maximizeIcon));
        button.focus();
        button.click();
        expect(el.maximized).toBe(true);
        expect(el.hasAttribute('maximized')).toBe(true);
        // The same node: a new one would have taken the focus out from under the click.
        expect(maximizeOf(el)).toBe(button);
        expect(document.activeElement).toBe(button);
        expect(button.getAttribute('aria-label')).toBe('Shrink the chat');
        expect(button.getAttribute('title')).toBe('Shrink the chat');
        expect(button.querySelector('.aparte-launcher__icon')?.innerHTML).toBe(asParsed(minimizeIcon));
        // Its name says the state; a toggle whose name changes does not also say it is pressed.
        expect(button.hasAttribute('aria-pressed')).toBe(false);
        button.click();
        expect(el.maximized).toBe(false);
        expect(button.getAttribute('aria-label')).toBe('Expand the chat');
        expect(el.open).toBe(true);
    });

    it('answers maximize() and restore() from a script, as show() and close() answer for open', () => {
        const el = mount('maximizable');
        el.maximize();
        expect(el.maximized).toBe(true);
        expect(el.hasAttribute('maximized')).toBe(true);
        el.restore();
        expect(el.maximized).toBe(false);
        // Kept while closed: the chat opens maximized.
        el.maximize();
        el.show();
        expect(el.covers).toBe(true);
    });

    it('announces each change of it once with the rest of the state, and not the one its markup asked for', () => {
        const seen: AparteLauncherToggleDetail[] = [];
        document.addEventListener('aparte-launcher-toggle', (e) => seen.push((e as CustomEvent<AparteLauncherToggleDetail>).detail));
        const el = mount('open maximized');
        expect(el.maximized).toBe(true);
        expect(seen).toEqual([]);
        // The same state, spelled differently: no change to announce.
        el.setAttribute('maximized', 'true');
        el.maximized = false;
        el.maximized = true;
        el.close();
        expect(seen).toEqual([
            { open: true, sheet: false, maximized: false, covers: false },
            { open: true, sheet: false, maximized: true, covers: true },
            { open: false, sheet: false, maximized: true, covers: false },
        ]);
    });

    it('toggles from a control of the card marked data-aparte-launcher-maximize, and keeps it pressed or not', () => {
        const el = mount('open', '<section><header><button type="button" id="grow" data-aparte-launcher-maximize><span id="glyph">⤢</span></button></header><div id="chat"></div></section>');
        const grow = document.getElementById('grow') as HTMLButtonElement;
        expect(grow.getAttribute('aria-pressed')).toBe('false');
        (document.getElementById('glyph') as HTMLElement).click();
        expect(el.maximized).toBe(true);
        expect(grow.getAttribute('aria-pressed')).toBe('true');
        el.maximized = false;
        expect(grow.getAttribute('aria-pressed')).toBe('false');
        // Not from a control outside the launcher.
        document.body.insertAdjacentHTML('beforeend', '<button type="button" id="far" data-aparte-launcher-maximize>far</button>');
        (document.getElementById('far') as HTMLButtonElement).click();
        expect(el.maximized).toBe(false);
        expect(document.getElementById('far')?.hasAttribute('aria-pressed')).toBe(false);
    });

    it('covers the window maximized, and not as a panel, which leaves Tab free and says so when it changes', () => {
        const seen: AparteLauncherToggleDetail[] = [];
        document.addEventListener('aparte-launcher-toggle', (e) => seen.push((e as CustomEvent<AparteLauncherToggleDetail>).detail));
        const el = mount('open maximized maximizable header="false"');
        expect(el.covers).toBe(true);
        el.setAttribute('maximizable', 'panel');
        expect(el.covers).toBe(false);
        const button = buttonOf(el);
        button.focus();
        expect(key(button, 'Tab').defaultPrevented).toBe(false);
        // Same mode, another spelling of it: nothing to announce.
        el.setAttribute('maximizable', 'panel');
        el.setAttribute('maximizable', '');
        expect(el.covers).toBe(true);
        expect(seen).toEqual([
            { open: true, sheet: false, maximized: true, covers: false },
            { open: true, sheet: false, maximized: true, covers: true },
        ]);
        el.close();
        expect(el.covers).toBe(false);
    });

    it('brings a maximized chat back on Escape first, then closes on the next', () => {
        const el = mount('open maximizable maximized');
        const composer = document.getElementById('composer') as HTMLElement;
        composer.focus();
        expect(key(composer, 'Escape').defaultPrevented).toBe(true);
        expect(el.maximized).toBe(false);
        expect(el.open).toBe(true);
        key(composer, 'Escape');
        expect(el.open).toBe(false);
        // Under the breakpoint there is nothing to bring back: Escape closes at once.
        el.maximize();
        el.show();
        narrow(true);
        composer.focus();
        key(composer, 'Escape');
        expect(el.open).toBe(false);
    });

    it('hands the focus to the ✕ when the window turns into a sheet under the focused maximize button', () => {
        const el = mount('open maximizable');
        const maximize = el.querySelector<HTMLButtonElement>('.aparte-launcher__maximize')!;
        maximize.focus();
        narrow(true);
        expect(document.activeElement).toBe(el.querySelector('.aparte-launcher__close'));
    });

    it('hands the focus on when the header it was in goes away', () => {
        const el = mount('open');
        el.querySelector<HTMLButtonElement>('.aparte-launcher__close')!.focus();
        el.header = false;
        expect(document.activeElement?.id).toBe('composer');
    });

    it('ignores a maximize control inside a reply', () => {
        const el = mount('open', '<div id="chat"><div class="aparte-message-content"><button type="button" id="forged" data-aparte-launcher-maximize>⤢</button></div></div>');
        (document.getElementById('forged') as HTMLButtonElement).click();
        expect(el.maximized).toBe(false);
        expect(document.getElementById('forged')?.hasAttribute('aria-pressed')).toBe(false);
    });
});

describe('<aparte-launcher>: the sheet', () => {
    it('becomes a sheet under 30rem of window, wide or high, and says so', () => {
        const el = mount();
        expect(queries).toEqual(['(max-width: 30rem), (max-height: 30rem)']);
        expect(el.sheet).toBe(false);
        narrow(true);
        expect(el.sheet).toBe(true);
        expect(el.hasAttribute('data-sheet')).toBe(true);
        narrow(false);
        expect(el.sheet).toBe(false);
    });

    it('reads its breakpoint from the attribute, and follows it when it changes', () => {
        const el = mount('breakpoint="40rem"');
        expect(queries.at(-1)).toBe('(max-width: 40rem)');
        el.setAttribute('breakpoint', '600px');
        expect(queries.at(-1)).toBe('(max-width: 600px)');
        expect(mediaListeners).toHaveLength(1);
    });

    it('stays a card at any width with breakpoint="none", or where there is no matchMedia', () => {
        mediaMatches = true;
        const el = mount('breakpoint="none"');
        expect(el.sheet).toBe(false);
        expect(queries).toEqual([]);
        el.setAttribute('breakpoint', '');
        expect(el.sheet).toBe(true);
        delete (globalThis as { matchMedia?: unknown }).matchMedia;
        const bare = mount();
        expect(bare.sheet).toBe(false);
    });

    it('stops listening to the window when it leaves the page', () => {
        const el = mount();
        el.remove();
        expect(mediaListeners).toHaveLength(0);
        narrow(true);
        expect(el.sheet).toBe(false);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        el.open = true;
        expect(el.open).toBe(true);
    });
});

describe('launcher.css', () => {
    const css = readAparteStylesheet();

    it('hides the closed chat by the attribute, important so a card\'s own display cannot show it, and floats the launcher at the inline end', () => {
        // jsdom applies no stylesheet and does not weigh `!important` against an inline style,
        // so the cascade itself is proved in a browser (e2e/tests/launcher.spec.ts: a card with
        // an inline and an `#id` display stays closed); what this pins is that the rule is
        // still the important one.
        expect(css).toMatch(/aparte-launcher:not\(\[open\]\) > :not\(\.aparte-launcher__button\) \{\s*display: none !important;/);
        expect(css).toMatch(/aparte-launcher \{[^}]*position: fixed;[^}]*inset-inline-end: var\(--aparte-launcher-offset\);/);
    });

    it('fills the window with the open sheet, under the breakpoint or maximized, and hides its button when the card closes itself', () => {
        expect(css).toMatch(/aparte-launcher\[open\]:is\(\[data-sheet\], \[maximized\]\) \{[^}]*inset: 0;/);
        expect(css).toMatch(/aparte-launcher\[open\]:is\(\[data-sheet\], \[maximized\]\):has\(\[data-aparte-launcher-close\]\) > \.aparte-launcher__button \{\s*display: none;/);
    });

    it('animates the card only for a reader who did not ask for less motion', () => {
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*aparte-launcher\[open\] > :not\(\.aparte-launcher__button\),[^{]*\{\s*animation: aparte-launcher-in/);
    });

    it('joins its header to the card: first, over it, the gap taken back, and one shadow for both', () => {
        expect(css).toMatch(/\.aparte-launcher__header \{[^}]*order: -1;[^}]*margin-block-end: calc\(-1 \* var\(--aparte-launcher-gap\)\);/);
        expect(css).toMatch(/aparte-launcher\[open\]:not\(\[data-sheet\], \[maximized\]\):has\(> \.aparte-launcher__header\)::before \{[^}]*z-index: -1;[^}]*box-shadow: var\(--aparte-popover-shadow\);/);
    });

    it("holds the window's height on the launcher under its header, so a taller header shortens the card", () => {
        expect(css).toMatch(/aparte-launcher\[open\]:not\(\[data-sheet\], \[maximized\]\):has\(> \.aparte-launcher__header\) \{\s*block-size: min\(\s*calc\(var\(--aparte-launcher-height\) \+ var\(--aparte-launcher-gap\) \+ var\(--aparte-btn-size-lg\)\)/);
        expect(css).toMatch(/aparte-launcher:where\(:has\(> \.aparte-launcher__header\)\) > :where\(:not\(\.aparte-launcher__button, \.aparte-launcher__header\)\) \{\s*flex: 1 1 0;\s*block-size: auto;/);
    });

    it("leaves the chat its own bottom padding in a sheet: the home bar's inset is the launcher's", () => {
        expect(css).toMatch(/aparte-launcher\[open\]:is\(\[data-sheet\], \[maximized\]\) \{[^}]*padding-block-end: env\(safe-area-inset-bottom, 0px\);/);
        expect(css).toMatch(/aparte-launcher\[open\]:is\(\[data-sheet\], \[maximized\]\) > :not\(\.aparte-launcher__button, \.aparte-launcher__header\) \{[^}]*padding-block-start: env\(safe-area-inset-top, 0px\);\s*\}/);
    });

    it("keeps a panel to the window's inline-end edge, its width a token", () => {
        expect(css).toMatch(/aparte-launcher\[open\]\[maximized\]\[maximizable='panel'\]:not\(\[data-sheet\]\) \{\s*inset-inline-start: auto;[^}]*inline-size: min\(var\(--aparte-launcher-panel-width\), 100%\);/);
    });

    it("brings the launcher's shadow in with the card, never before it", () => {
        expect(css).toMatch(/aparte-launcher\[open\] > :not\(\.aparte-launcher__button\),\s*aparte-launcher\[open\]:not\(\[data-sheet\], \[maximized\]\):has\(> \.aparte-launcher__header\)::before \{\s*animation: aparte-launcher-in/);
    });

    it('hides every maximize control in a sheet under the breakpoint, and only there', () => {
        expect(css).toMatch(/aparte-launcher\[data-sheet\] \[data-aparte-launcher-maximize\] \{\s*display: none;/);
    });

    it('fades the maximized chat in only for a reader who did not ask for less motion', () => {
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*aparte-launcher\[open\]\[maximized\] > :not\(\.aparte-launcher__button\) \{\s*animation: aparte-fade-in/);
    });

    it('takes the pointer over what it covers, the home bar\'s band included', () => {
        expect(css).toMatch(/aparte-launcher\[open\]:is\(\[data-sheet\], \[maximized\]\) \{[^}]*pointer-events: auto;/);
    });
});
