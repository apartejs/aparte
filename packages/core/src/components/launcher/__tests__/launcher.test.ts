// @vitest-environment jsdom
/**
 * `<aparte-launcher>` — the chat that floats in a corner of the page.
 *
 * The element owns one thing, its button, and the state: open or closed, card or sheet.
 * The children are the host's, so every test checks they are left where they were.
 * jsdom applies no stylesheet, so what the sheet draws is pinned by reading it at the end.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-launcher.js';
import type { AparteLauncher, AparteLauncherToggleDetail } from '../aparte-launcher.js';
import { aparteGlobalConfig, APARTE_DEFAULT_LOCALE } from '../../../config/index.js';
import { releaseDeferredHydration } from '../../../interop/defer-hydration.js';
import { messageSquareIcon, closeIcon } from '../../../icons/glyphs.js';
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
    it('adds its class, an id, and one button after the children it leaves in place', () => {
        const el = mount();
        expect(el.classList.contains('aparte-launcher')).toBe(true);
        expect(el.id).toMatch(/^aparte-launcher-\d+$/);
        expect(Array.from(el.children).map((c) => c.id || c.className)).toEqual(['chat', expect.stringContaining('aparte-launcher__button')]);
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

    it('names what the button controls', () => {
        const el = mount();
        expect(buttonOf(el).getAttribute('aria-controls')).toBe(el.id);
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
        expect(Array.from(el.children).map((c) => c.id || 'button')).toEqual(['chat', 'button']);
        expect(el.querySelector('#chat')).toBe(chat);
    });

    it('leaves a button that is where it should be, whatever else is added around it', async () => {
        const el = mount();
        const button = buttonOf(el);
        el.insertBefore(document.createElement('section'), button);
        el.append(document.createElement('aside'));
        await settle();
        expect(Array.from(el.children).map((c) => c.tagName)).toEqual(['DIV', 'SECTION', 'BUTTON', 'ASIDE']);
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
        expect(seen).toEqual([{ open: true, sheet: true }, { open: false, sheet: true }]);
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
            { open: true, sheet: false },
            { open: true, sheet: true },
            { open: true, sheet: false },
            { open: false, sheet: false },
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
        el.show();
        expect(document.activeElement?.id).toBe('faq');
        const empty = mount('', '<div>nothing to focus</div>');
        (document.getElementById('page') as HTMLButtonElement).focus();
        empty.show();
        expect(document.activeElement?.id).toBe('page');
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
        const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        composer.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
        composer.dispatchEvent(handled);
        expect(el.open).toBe(true);
        const escape = key(composer, 'Escape');
        expect(escape.defaultPrevented).toBe(true);
        expect(el.open).toBe(false);
        expect(document.activeElement).toBe(buttonOf(el));
    });

    it('ignores Escape while closed, and Escape outside', () => {
        const el = mount();
        expect(key(buttonOf(el), 'Escape').defaultPrevented).toBe(false);
        el.show();
        key(document.getElementById('page') as HTMLElement, 'Escape');
        expect(el.open).toBe(true);
    });

    it('keeps Tab inside the sheet, and leaves it free on a card', () => {
        const el = mount();
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

    it('lets Tab go in a sheet with nothing to focus', () => {
        const el = mount('open', '<div>text only</div>');
        narrow(true);
        el.querySelector<HTMLElement>('.aparte-launcher__button')!.remove();
        expect(key(el, 'Tab').defaultPrevented).toBe(false);
    });
});

describe('<aparte-launcher>: the sheet', () => {
    it('becomes a sheet under 30rem of window, and says so', () => {
        const el = mount();
        expect(queries).toEqual(['(max-width: 30rem)']);
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

    it('fills the window with the open sheet, and hides its button when the card closes itself', () => {
        expect(css).toMatch(/aparte-launcher\[data-sheet\]\[open\] \{[^}]*inset: 0;/);
        expect(css).toMatch(/aparte-launcher\[data-sheet\]\[open\]:has\(\[data-aparte-launcher-close\]\) > \.aparte-launcher__button \{\s*display: none;/);
    });

    it('animates the card only for a reader who did not ask for less motion', () => {
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*aparte-launcher\[open\] > :not\(\.aparte-launcher__button\) \{\s*animation: aparte-launcher-in/);
    });
});
