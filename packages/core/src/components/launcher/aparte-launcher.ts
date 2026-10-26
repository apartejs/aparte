import { resolveConfig, APARTE_HOST_ATTR, type AparteConfig } from '../../config/index.js';
import { presenceOn } from '../../utils/presence.js';
import { activeElementIn, eventOrigin } from '../../utils/event-target.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';

/** Detail of `aparte-launcher-toggle`: the state just entered. */
export interface AparteLauncherToggleDetail {
    open: boolean;
    /** True while the window is under the breakpoint and the open chat fills it. Kept current: the event fires again when the window crosses the breakpoint while the chat is open. */
    sheet: boolean;
}

/** The window width under which the open chat becomes a full-window sheet. Mirrored in `launcher.css`. */
const SHEET_QUERY = '(max-width: 30rem)';

/** What can hold the focus inside the chat, when it opens and while the sheet keeps Tab in. */
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A chat that floats in a corner of the page — the support widget every product site has,
 * as an element. A round button sits at the bottom of the window, on the inline-end side;
 * a click opens the chat above it as a card, and a second click, Escape or any control
 * marked `data-aparte-launcher-close` inside closes it again.
 *
 * Children are yours: put the chat in it — an `<aparte-chat>`, or your own card with a
 * header above one. The element adds its button after them and shows them only while it is
 * open, so a closed launcher keeps the chat mounted (the conversation and the client stay)
 * but out of the tab order and the accessibility tree. Nothing is stored: listen to
 * `aparte-launcher-toggle` to remember the state.
 *
 * **On a phone.** Under `breakpoint` (30rem of window unless you set it) the open chat
 * fills the window as a sheet, Tab stays inside it, and the button moves to the top corner
 * to close it — or hides, when your card holds its own `data-aparte-launcher-close`
 * control. The element reflects `data-sheet` while the window is that narrow.
 *
 * **The button** shows a speech bubble, or the bubble and your `label` (`label="Help"`)
 * as a pill; it is named by the locale's `launcherOpen`/`launcherClose` when it shows no
 * text. Opening with the button hands the focus to the composer, or to the first control of
 * your card; `show()` and `open` set from a script move no focus, so a page that restores the
 * state on load does not steal it. Closing gives the focus back to the button when it was
 * inside.
 *
 * **Server rendering.** The button is drawn when the element connects, which on a
 * server-rendered page is before the framework hydrates, and hydration removes what it did
 * not render. Put `defer-hydration` on the launcher in the server's HTML and call
 * `releaseDeferredHydration` once your framework has hydrated, so the element draws itself
 * then; if something takes the button out anyway, the element puts it back.
 *
 * @element aparte-launcher
 *
 * @attr {boolean} open - The chat is open. Reflected; set it to start open.
 * @attr {string} label - Text shown beside the bubble on the closed button, which then reads as a pill. Without it the button is round and named by the locale.
 * @attr {string} breakpoint - The window width under which the open chat fills the window: a length (default `30rem`), or `none` for a card at any width.
 * @attr {boolean} data-sheet - Reflected BY the element while the window is narrower than `breakpoint` (30rem unless you set it). Read-only.
 *
 * @fires {CustomEvent<AparteLauncherToggleDetail>} aparte-launcher-toggle - The chat opened or closed, by the button, by Escape, by a close control or by `open` being set — or, while it is open, turned into a sheet or back as the window crossed the breakpoint. Bubbles.
 *
 * @cssprop [--aparte-launcher-width=23.75rem] - Width of the open card.
 * @cssprop [--aparte-launcher-height=37.5rem] - Height of the open card, shortened to fit a short window.
 * @cssprop [--aparte-launcher-offset=1.25rem] - Distance from the window's edges to the button and the card.
 * @cssprop [--aparte-launcher-gap=var(--aparte-space-5)] - Space between the open card and the button.
 * @cssprop [--aparte-launcher-radius=var(--aparte-radius-xl)] - Corner radius of the open card.
 *
 * @example
 * <!-- In a page it floats over the window; here, over a 30rem frame. -->
 * <div style="height: 30rem"></div>
 * <aparte-launcher label="Help" open breakpoint="none" style="--aparte-launcher-height: 24rem">
 *   <aparte-chat></aparte-chat>
 * </aparte-launcher>
 */
export class AparteLauncher extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['open', 'label', 'breakpoint'];
    }

    private _button: HTMLButtonElement | null = null;
    /**
     * Watches the element's own children. The button is the one child that is not the host's,
     * so it is the one a framework reconciling the others knows nothing about: Vue's
     * hydration removes "more child nodes than client vdom", Svelte 4's removes what its
     * claim did not take. Without this it stays removed — a closed launcher then shows
     * nothing, and nothing can open the chat.
     */
    private _childWatch: MutationObserver | null = null;
    /**
     * Watches for a config boundary appearing, changing or leaving inside the element. A
     * framework wrapper attaches its chat's `config` from a post-mount hook, after the
     * launcher has connected and drawn its button, and `attachConfig` tells the elements
     * INSIDE the boundary, never the launcher around it.
     */
    private _hostWatch: MutationObserver | null = null;
    private _media: MediaQueryList | null = null;
    private _lastOpen: boolean | null = null;

    /**
     * `connectedCallback` has run. During an UPGRADE `attributeChangedCallback` fires for
     * every authored attribute before it — `<aparte-launcher open>` server-rendered and
     * upgraded when the module loads — and announcing a toggle there tells the host its
     * chat just opened when all that happened is that the markup was read.
     */
    private _ready = false;

    /** The chat is open. */
    get open(): boolean {
        return this.hasAttribute('open');
    }

    set open(value: boolean) {
        this.toggleAttribute('open', presenceOn(value));
    }

    /** True while the window is under the breakpoint, where the open chat fills it. */
    get sheet(): boolean {
        return this.hasAttribute('data-sheet');
    }

    connectedCallback(): void {
        if (!this.classList.contains('aparte-launcher')) this.classList.add('aparte-launcher');
        if (!this.id) this.id = `aparte-launcher-${++launcherIdSeq}`;
        // Re-used on a re-parent: a second button would be the element's own doing twice.
        if (!this._button) {
            this._button = document.createElement('button');
            this._button.type = 'button';
            this._button.addEventListener('click', this._onButtonClick);
        }
        this.appendChild(this._button);
        if (typeof MutationObserver === 'function') {
            this._childWatch ??= new MutationObserver(() => this._keepButton());
            this._childWatch.observe(this, { childList: true });
            this._hostWatch ??= new MutationObserver(() => this._renderButton());
            this._hostWatch.observe(this, { attributes: true, attributeFilter: [APARTE_HOST_ATTR], subtree: true });
        }
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._watchBreakpoint();
        this._lastOpen = this.open;
        this._renderButton();
        this._ready = true;
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKeydown);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
        this._childWatch?.disconnect();
        this._hostWatch?.disconnect();
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        this._ready = false;
    }

    attributeChangedCallback(name: string): void {
        if (!this._ready) return;
        if (name === 'breakpoint') {
            this._watchBreakpoint();
            return;
        }
        this._renderButton();
        if (name !== 'open') return;
        const open = this.open;
        if (open === this._lastOpen) return;
        this._lastOpen = open;
        // Closed with the focus inside: the button takes it back, or it would fall to <body>
        // with the chat that held it. Opening moves no focus here — whoever opened it did, or
        // did not, mean the composer to have it (see `_onButtonClick`).
        if (!open && this._button && this.contains(activeElementIn(this))) this._button.focus();
        this._announce();
    }

    private _announce(): void {
        this.dispatchEvent(new CustomEvent<AparteLauncherToggleDetail>('aparte-launcher-toggle', {
            detail: { open: this.open, sheet: this.sheet },
            bubbles: true,
            composed: true,
        }));
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** Open the chat. */
    show(): void {
        this.open = true;
    }

    /** Close the chat. */
    close(): void {
        this.open = false;
    }

    /** Open the chat when it is closed, close it when it is open. */
    toggle(): void {
        this.open = !this.open;
    }

    // ─── Button ───────────────────────────────────────────────────────────

    /**
     * The one opening that is a person's: the composer takes the focus, since they opened the
     * chat to write. `show()` and `open` are a script's — a page restoring the state it saved,
     * a host driving `open` from its own state — and a focus that jumps on page load is
     * unasked for, and on a phone raises the keyboard over a sheet nobody pressed. An authored
     * `open` never took the focus either, so the three ways of starting open now agree.
     */
    private _onButtonClick = (): void => {
        const opening = !this.open;
        this.toggle();
        if (opening) this._focusChat();
    };

    private _onConfigChange = (): void => this._renderButton();

    /**
     * The config the button answers to: the chat's own when the chat inside carries an
     * instance config (a wrapper's `config` prop, `attachConfig(chat, config)`), else the
     * one at the launcher's own place — an ancestor's boundary, or the page's. The button
     * labels and draws a control of THAT chat, and the chat's boundary is below the launcher,
     * so resolving from the launcher alone read the page's locale and icons next to a chat
     * in another language. Resolved live, never kept: the boundary may arrive after connect.
     */
    private _config(): AparteConfig {
        return resolveConfig(this.querySelector(`[${APARTE_HOST_ATTR}]`) ?? this);
    }

    /**
     * The button is a child of the element, whatever was done to the children since: put
     * back at the end when something took it out. A button that is still a child stays
     * where it is, since the host may have placed it. Called on every render, and from the
     * observer for the removal that comes with no render at all.
     */
    private _keepButton(): void {
        if (this._button && this._button.parentNode !== this) this.appendChild(this._button);
    }

    /**
     * The button, for the state it is in: the bubble (and the label, as a pill) while
     * closed, a close glyph while open. Its name comes from the locale when it shows no
     * text, and from that text when it does — a visible label the name did not contain
     * is what speech users cannot say to press it.
     */
    private _renderButton(): void {
        const button = this._button;
        if (!button) return;
        this._keepButton();
        const config = this._config();
        const locale = config.getLocale();
        const open = this.open;
        const label = open ? '' : (this.getAttribute('label') ?? '').trim();
        const shape = label ? 'aparte-btn--pill' : 'aparte-btn--circle';
        button.className = ['aparte-btn', 'aparte-btn--primary', 'aparte-btn--solid', 'aparte-btn--lg', shape, 'aparte-launcher__button'].join(' ');
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-controls', this.id);
        if (label) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', open ? (locale.launcherClose ?? 'Close the chat') : (locale.launcherOpen ?? 'Open the chat'));
        const icon = document.createElement('span');
        icon.className = 'aparte-launcher__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = config.getIcon(open ? 'close' : 'messageSquare');
        const parts: Node[] = [icon];
        if (label) {
            const text = document.createElement('span');
            text.className = 'aparte-launcher__label';
            text.textContent = label;
            parts.push(text);
        }
        button.replaceChildren(...parts);
    }

    // ─── Sheet ────────────────────────────────────────────────────────────

    private _onMediaChange = (e: MediaQueryListEvent): void => this._applySheet(e.matches);

    /** The sheet's media query, from `breakpoint`: a length, or `none` for a card at any width. */
    private _watchBreakpoint(): void {
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        const attr = (this.getAttribute('breakpoint') ?? '').trim();
        if (attr === 'none' || typeof matchMedia !== 'function') {
            this._applySheet(false);
            return;
        }
        this._media = matchMedia(attr ? `(max-width: ${attr})` : SHEET_QUERY);
        this._media.addEventListener('change', this._onMediaChange);
        this._applySheet(this._media.matches);
    }

    /**
     * An open chat that turns into a sheet now covers the page, and one that turns back no
     * longer does: announced, so a host that takes its page out of reach under the sheet
     * follows the window without a media query of its own, which would be a second copy
     * of `breakpoint` to keep in step.
     */
    private _applySheet(sheet: boolean): void {
        if (sheet === this.sheet) return;
        this.toggleAttribute('data-sheet', sheet);
        if (this._ready && this.open) this._announce();
    }

    // ─── Focus and keys ───────────────────────────────────────────────────

    /** What the chat lets the focus land on: yours to decide, so only what is visible. */
    private _focusables(): HTMLElement[] {
        return Array.from(this.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter((el) => !el.closest('[hidden]') && el.checkVisibility?.() !== false);
    }

    /**
     * The composer when there is one — the person opened the chat to write — else the
     * first thing in the card that holds focus. The button itself never: it is what the
     * person just pressed.
     */
    private _focusChat(): void {
        const composer = this.querySelector<HTMLElement>('[role="textbox"]:not([aria-disabled="true"])');
        const target = composer ?? this._focusables().find((el) => el !== this._button);
        target?.focus();
    }

    /** A `[data-aparte-launcher-close]` inside closes the chat — no script in your card. */
    private _onClick = (e: Event): void => {
        // `eventOrigin`, not `e.target`: a click from inside a consumer's shadow root is
        // retargeted to its host by the time it bubbles here.
        const control = (eventOrigin(e) as HTMLElement | null)?.closest?.('[data-aparte-launcher-close]');
        if (control && this.contains(control)) this.close();
    };

    /**
     * A modal dialog open inside the card, with the key pressed inside it. The browser
     * closes it on Escape — unless the keydown was cancelled, which is what closing the
     * launcher would do: the dialog refused its close request and the card hidden under it.
     * An engine that cannot tell a modal dialog from one opened with `show()` (no `:modal`)
     * leaves the key to the dialog, which is the answer that loses nothing.
     */
    private _inModalDialog(e: Event): boolean {
        const dialog = (eventOrigin(e) as Element | null)?.closest?.('dialog[open]');
        if (!dialog || !this.contains(dialog)) return false;
        try {
            return dialog.matches(':modal');
        } catch {
            return true;
        }
    }

    private _onKeydown = (e: KeyboardEvent): void => {
        if (!this.open) return;
        if (e.key === 'Escape') {
            // On the element, not the document: Escape elsewhere on the page is not ours. Nor
            // is it when something inside answered it first — a menu closing, the context
            // gauge's panel, anything that took it has set `defaultPrevented` — or is about
            // to: an IME cancelling its composition (`keyCode` 229 for the engines that do not
            // say `isComposing`, the composer's own test), a modal dialog closing itself.
            if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || this._inModalDialog(e)) return;
            e.preventDefault();
            this.close();
            return;
        }
        // The sheet covers the page, so Tab stays inside it: from the last control back to
        // the first, and Shift+Tab the other way. A card leaves the page reachable.
        if (e.key !== 'Tab' || !this.sheet) return;
        const focusable = this._focusables();
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = activeElementIn(this);
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };
}

/** For the id a launcher gives itself when the host wrote none, so its button can name it. */
let launcherIdSeq = 0;

deferHydrationOf(AparteLauncher);
if (!customElements.get('aparte-launcher')) {
    customElements.define('aparte-launcher', AparteLauncher);
}
