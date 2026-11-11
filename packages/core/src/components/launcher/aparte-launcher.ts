import { resolveConfig, APARTE_HOST_ATTR, type AparteConfig } from '../../config/index.js';
import type { AparteAvatarProvider } from '../../config/avatar-provider.js';
import { presenceOn } from '../../utils/presence.js';
import { activeElementIn, eventOrigin } from '../../utils/event-target.js';
import { inRenderedContent } from '../../utils/rendered-content.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';

/** Detail of `aparte-launcher-toggle`: the state just entered. */
export interface AparteLauncherToggleDetail {
    open: boolean;
    /** True while the window is under the breakpoint and the open chat fills it. Kept current: the event fires again when the window crosses the breakpoint while the chat is open. */
    sheet: boolean;
    /** True while the chat is maximized (`maximized`). It is kept while the chat is closed, so a page that saves the state gets both back. */
    maximized: boolean;
    /** True while the open chat covers the whole window — a sheet, or maximized without `maximizable="panel"`. Take your page out of reach meanwhile (`inert`): the launcher does not own it. */
    covers: boolean;
}

/**
 * The window under which the open chat becomes a full-window sheet, unless `breakpoint`
 * says another width: narrow, or short — a phone held sideways, a laptop zoomed to 200 %,
 * where a card leaves the transcript a sliver between its header and its composer. Only
 * here: `launcher.css` has no media query and keys on the `data-sheet` this element
 * reflects, so there is one copy of the numbers and nothing to keep in step.
 */
const SHEET_QUERY = '(max-width: 30rem), (max-height: 30rem)';

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
 * **The header.** Over a card that has none, the element draws one: the assistant's avatar,
 * as the config's avatar provider draws it in the messages (`setAvatarProvider`) and none
 * without one, a title (`heading`, else the button's `label`, else the locale's
 * `launcherHeading`), a line under it (`subheading`), and a ✕ that
 * closes the chat. A card that brings its own keeps it, and the element draws none: a
 * `<header>` at the card's top level. `header="false"` takes it away in any case. It is a `div` wearing the
 * `aparte-app-header` recipe rather than a `<header>`, which outside a section is the
 * page's banner landmark.
 *
 * **Maximize.** `maximizable` adds a button to that header which makes the open chat fill
 * the window — the sheet a phone gets, on any window — and brings the card back; so does
 * Escape, before a second Escape closes the chat.
 * `maximizable="panel"` keeps the page in view instead: maximized, the chat is a panel the
 * window's height along its inline-end edge, `--aparte-launcher-panel-width` wide. The
 * button's name changes with the state, the way a window's Maximize turns into Restore: the
 * locale's `launcherMaximize`, then `launcherRestore`. In a header of your own, mark any
 * control `data-aparte-launcher-maximize`: it toggles the same state, and the element keeps
 * its `aria-pressed`. The state is `maximized`, reflected and settable; `covers` says whether
 * the open chat covers the whole window, and `aparte-launcher-toggle` reports both. A sheet
 * under the breakpoint already fills the window, so it hides every maximize control.
 *
 * **On a phone.** Under `breakpoint` (30rem of window, wide or high, unless you set a width) the open chat
 * fills the window as a sheet, under its header, and Tab stays inside it. The header's ✕
 * closes it; without a close control in the card (`header="false"`), the button moves to
 * the top corner to close it. The element reflects `data-sheet` while the window is that
 * narrow.
 *
 * **The button** shows a speech bubble, or the bubble and your `label` (`label="Help"`)
 * as a pill; it is named by the locale's `launcherOpen`/`launcherClose` when it shows no
 * text. Its two icons are the `launcherOpen` and `launcherClose` icons when the config holds
 * them (`registerIcons`), else `messageSquare` and `close` — so a theme redraws this button
 * without redrawing every close button in the chat. Opening with the button hands the focus to the composer, or to the first control of
 * your card; `show()` and `open` set from a script move no focus, so a page that restores the
 * state on load does not steal it. Closing gives the focus back to the button when it was
 * inside.
 *
 * **Server rendering.** The button and the header are drawn when the element connects,
 * which on a server-rendered page is before the framework hydrates, and hydration removes
 * what it did not render. Put `defer-hydration` on the launcher in the server's HTML and call
 * `releaseDeferredHydration` once your framework has hydrated, so the element draws itself
 * then; if something takes the button or the header out anyway, the element puts it back.
 *
 * @element aparte-launcher
 *
 * @attr {boolean} open - The chat is open. Reflected; set it to start open.
 * @attr {string} label - Text shown beside the bubble on the closed button, which then reads as a pill. Without it the button is round and named by the locale.
 * @attr {string} breakpoint - The window width under which the open chat fills the window: a length, or `none` for a card at any size. Unset, a window under 30rem wide or 30rem high.
 * @attr {boolean} header - The header the element draws over a card that has none. On unless set to the string `"false"`; a card with a header of its own keeps it, whatever this says.
 * @attr {string} heading - The header's title. Unset, the button's `label`, else the locale's `launcherHeading` ("Chat"); set but empty, no title.
 * @attr {string} subheading - A line under the title, smaller and quieter: who answers, how fast.
 * @attr {boolean | '' | 'panel'} maximizable - Adds the maximize button to the element's header, beside its ✕. Maximized, the chat fills the window; with `"panel"`, it is a panel the window's height along its inline-end edge, and the page stays in view.
 * @attr {boolean} maximized - The open chat is maximized: it fills the window, as the sheet does on a phone, or with `maximizable="panel"` runs the window's height along its edge. Reflected; set it to start maximized.
 * @attr {boolean} data-sheet - Reflected BY the element while the window is narrower than `breakpoint` (30rem unless you set it). Read-only.
 *
 * @fires {CustomEvent<AparteLauncherToggleDetail>} aparte-launcher-toggle - The chat opened or closed, by the button, by Escape, by a close control or by `open` being set — or, while it is open, turned into a sheet or back as the window crossed the breakpoint — or it was maximized or brought back, by a control or by `maximized` being set. Bubbles.
 *
 * @cssprop [--aparte-launcher-width=23.75rem] - Width of the open card.
 * @cssprop [--aparte-launcher-height=37.5rem] - Height of the open card, the element's header included, shortened to fit a short window.
 * @cssprop [--aparte-launcher-panel-width=36rem] - Width of the maximized chat with `maximizable="panel"`, never wider than the window.
 * @cssprop [--aparte-launcher-header-height=3.5rem] - Least height of the element's header, which grows with what a theme puts in it (a larger title, more padding); the card's height includes it.
 * @cssprop [--aparte-launcher-offset=1.25rem] - Distance from the window's edges to the button and the card.
 * @cssprop [--aparte-launcher-gap=var(--aparte-space-5)] - Space between the open card and the button.
 * @cssprop [--aparte-launcher-radius=var(--aparte-radius-xl)] - Corner radius of the open card.
 *
 * @example
 * <!-- In a page it floats over the window; here, over a 30rem frame. -->
 * <div style="height: 30rem"></div>
 * <aparte-launcher label="Help" heading="Kilnhouse support" subheading="Usually answers in a minute"
 *   maximizable open breakpoint="none" style="--aparte-launcher-height: 24rem">
 *   <aparte-chat></aparte-chat>
 * </aparte-launcher>
 */
export class AparteLauncher extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['open', 'label', 'breakpoint', 'header', 'heading', 'subheading', 'maximizable', 'maximized'];
    }

    private _button: HTMLButtonElement | null = null;
    /**
     * The element's header and the parts of it a render updates. Built once and updated in
     * place, never redrawn: the maximize button is what the person just pressed, and a new
     * node would take the focus out from under them.
     */
    private _header: HTMLElement | null = null;
    private _avatar: HTMLElement | null = null;
    /** The provider that drew the header's avatar, and what it returned to undo it. */
    private _avatarDrawnBy: AparteAvatarProvider | null = null;
    private _avatarCleanup: (() => void) | null = null;
    private _title: HTMLElement | null = null;
    private _subtitle: HTMLElement | null = null;
    private _maximize: HTMLButtonElement | null = null;
    private _closeControl: HTMLButtonElement | null = null;
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

    /** The open chat is maximized: the whole window, or a panel along its edge with `maximizable="panel"`. */
    get maximized(): boolean {
        return this.hasAttribute('maximized');
    }

    set maximized(value: boolean) {
        this.toggleAttribute('maximized', presenceOn(value));
    }

    /**
     * The open chat covers the whole window: a sheet under the breakpoint, or maximized
     * without `maximizable="panel"`. What a page reads to take itself out of reach — the
     * launcher keeps Tab inside it meanwhile, and does not own the page.
     */
    get covers(): boolean {
        if (!this.open) return false;
        if (this.sheet) return true;
        if (!this.maximized) return false;
        if (!this._panel) return true;
        // A panel on a window narrower than the panel's width is the whole window too.
        const width = this.getBoundingClientRect().width;
        return width > 0 && width >= document.documentElement.clientWidth - 1;
    }

    /** Maximized, the chat is a panel along the window's edge rather than the whole window. */
    private get _panel(): boolean {
        return this.getAttribute('maximizable') === 'panel';
    }

    /**
     * The element draws its header over a card that has none. A property as well as the
     * attribute because the attribute's OFF is a value, `"false"`, and a framework handed
     * `header={false}` removes a boolean attribute instead — which here means ON.
     */
    get header(): boolean {
        return this.getAttribute('header') !== 'false';
    }

    set header(value: boolean | 'false') {
        if (value === false || value === 'false') this.setAttribute('header', 'false');
        else this.removeAttribute('header');
    }

    connectedCallback(): void {
        if (!this.classList.contains('aparte-launcher')) this.classList.add('aparte-launcher');
        // Re-used on a re-parent: a second button would be the element's own doing twice.
        if (!this._button) {
            // A page brought back from its HTML (Livewire's Back button, a page cache) makes a new
            // element whose markup already holds the button the old one drew: take that one up.
            const drawn = this.querySelector(':scope > button.aparte-launcher__button');
            this._button = drawn instanceof HTMLButtonElement ? drawn : document.createElement('button');
            this._button.type = 'button';
            this._button.addEventListener('click', this._onButtonClick);
        }
        // Any other one in the markup is a dead copy: nothing listens to it. A header brought
        // back with the page is one too, and the render draws the element's own.
        for (const stale of this.querySelectorAll(':scope > .aparte-launcher__button, :scope > .aparte-launcher__header')) {
            if (stale !== this._button && stale !== this._header) stale.remove();
        }
        if (this._button.parentNode !== this) this.appendChild(this._button);
        if (typeof MutationObserver === 'function') {
            this._childWatch ??= new MutationObserver((records) => {
                if (records.some((r) => r.target === this || AparteLauncher._touchesParts(r))) this._onChildren();
            });
            // The whole subtree, so a header a framework renders inside the card after the card
            // is seen; the filter keeps a streaming reply from calling a render per frame.
            this._childWatch.observe(this, { childList: true, subtree: true });
            this._hostWatch ??= new MutationObserver(() => this._render());
            this._hostWatch.observe(this, { attributes: true, attributeFilter: [APARTE_HOST_ATTR], subtree: true });
        }
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._watchBreakpoint();
        this._lastOpen = this.open;
        this._render();
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
        // A component the provider mounted in the header goes with the element; the next
        // connect draws it again.
        this._clearAvatar();
        this._ready = false;
    }

    attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
        if (!this._ready) return;
        if (name === 'breakpoint') {
            this._watchBreakpoint();
            return;
        }
        this._render();
        // `maximized="true"` after `maximized` is the same state: only a presence change is one.
        if (name === 'maximized') {
            if ((previous === null) !== (value === null)) this._announce();
            return;
        }
        // A maximized chat that turns into a panel, or back, no longer covers the page, or now does.
        if (name === 'maximizable') {
            if (this.open && this.maximized && (previous === 'panel') !== (value === 'panel')) this._announce();
            return;
        }
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
            detail: { open: this.open, sheet: this.sheet, maximized: this.maximized, covers: this.covers },
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

    /**
     * Maximize the chat: the whole window, or a panel along its edge with
     * `maximizable="panel"`. Kept while the chat is closed, so it opens maximized.
     */
    maximize(): void {
        this.maximized = true;
    }

    /** Bring the chat back to its card. */
    restore(): void {
        this.maximized = false;
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

    private _onConfigChange = (): void => this._render();

    /** Everything the element draws, for the state it is in and the config it answers to. */
    private _render(): void {
        const config = this._config();
        this._renderButton(config);
        this._renderHeader(config);
        this._syncMaximizeControls();
    }

    /**
     * The children changed: a framework reconciled them, hydration took out what it did not
     * render, a card arrived late. The button and the header go back if they were taken out,
     * and a card that now brings a header of its own is no longer given a second one.
     */
    private _onChildren(): void {
        this._keepButton();
        this._renderHeader(this._config());
        this._syncMaximizeControls();
    }

    /**
     * The config the button answers to: the chat's own when the chat inside carries an
     * instance config (a wrapper's `config` prop, `attachConfig(chat, config)`), else the
     * one at the launcher's own place — an ancestor's boundary, or the page's. The button
     * labels and draws a control of THAT chat, and the chat's boundary is below the launcher,
     * so resolving from the launcher alone read the page's locale and icons next to a chat
     * in another language. Resolved live, never kept: the boundary may arrive after connect.
     */
    private _config(): AparteConfig {
        const boundary = Array.from(this.querySelectorAll(`[${APARTE_HOST_ATTR}]`)).find((el) => !inRenderedContent(el));
        return resolveConfig(boundary ?? this);
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
     * is what speech users cannot say to press it. `aria-expanded` is the disclosure's whole
     * contract: there is no `aria-controls`, since the one element it could name without
     * writing an id on the host's card is the launcher itself, the button's own ancestor.
     */
    private _renderButton(config: AparteConfig): void {
        const button = this._button;
        if (!button) return;
        this._keepButton();
        const locale = config.getLocale();
        const open = this.open;
        const label = open ? '' : (this.getAttribute('label') ?? '').trim();
        const shape = label ? 'aparte-btn--pill' : 'aparte-btn--circle';
        button.className = ['aparte-btn', 'aparte-btn--primary', 'aparte-btn--solid', 'aparte-btn--lg', shape, 'aparte-launcher__button'].join(' ');
        button.setAttribute('aria-expanded', String(open));
        if (label) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', open ? (locale.launcherClose ?? 'Close the chat') : (locale.launcherOpen ?? 'Open the chat'));
        // The launcher's own names first, so a theme can redraw this button alone: `close` and
        // `messageSquare` are every other close button's and the chat's too.
        const parts: Node[] = [AparteLauncher._glyph(open
            ? config.getIcon('launcherClose') ?? config.getIcon('close')
            : config.getIcon('launcherOpen') ?? config.getIcon('messageSquare'))];
        if (label) {
            const text = document.createElement('span');
            text.className = 'aparte-launcher__label';
            text.textContent = label;
            parts.push(text);
        }
        button.replaceChildren(...parts);
    }

    /** A glyph, out of the accessibility tree: what holds it is named by its label. */
    private static _glyph(svg: string): HTMLElement {
        const icon = document.createElement('span');
        icon.className = 'aparte-launcher__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = svg;
        return icon;
    }

    // ─── Header ───────────────────────────────────────────────────────────

    /**
     * A card that brings its own header: a `<header>` at its top level — how every card in
     * this repository with a header of its own is written, so they keep theirs and are not
     * given a second. A close control alone is not one: an "End chat" in a card's footer is a
     * close control too, and took the header away when it counted.
     */
    private _cardHasHeader(): boolean {
        return Array.from(this.children).some((child) =>
            child !== this._button && child !== this._header && child.querySelector(':scope > header') !== null);
    }

    /**
     * A change deeper in the card that the element answers: a header, or a maximize
     * control, arriving or leaving — a framework rendering a card's header after the card,
     * a conditional control. A streamed reply adds text and spans, so it calls for nothing.
     */
    private static _touchesParts(record: MutationRecord): boolean {
        const parts = 'header, [data-aparte-launcher-maximize]';
        return [...record.addedNodes, ...record.removedNodes].some((node) =>
            node instanceof Element && (node.matches(parts) || node.querySelector(parts) !== null));
    }

    /** An icon-only control of the header: the recipe's ghost icon button. */
    private static _headerButton(part: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `aparte-btn aparte-btn--icon aparte-btn--ghost aparte-launcher__${part}`;
        return button;
    }

    /** A control's name, spoken and shown on hover: an icon alone says nothing to a pointer. */
    private static _name(button: HTMLElement, name: string, svg: string): void {
        button.setAttribute('aria-label', name);
        button.setAttribute('title', name);
        button.replaceChildren(AparteLauncher._glyph(svg));
    }

    private _buildHeader(): HTMLElement {
        const header = document.createElement('div');
        header.className = 'aparte-app-header aparte-launcher__header';
        // The slot a message's avatar is, filled by the same provider; out of the accessibility
        // tree, since the title beside it names the chat.
        this._avatar = document.createElement('span');
        this._avatar.className = 'aparte-avatar aparte-launcher__avatar';
        // The assistant's role, so the slot wears the colours and the picture the stylesheet
        // gives the assistant's avatar in the messages.
        this._avatar.setAttribute('data-role', 'assistant');
        this._avatar.setAttribute('aria-hidden', 'true');
        const heading = document.createElement('div');
        heading.className = 'aparte-launcher__heading';
        this._title = document.createElement('span');
        this._title.className = 'aparte-app-header__title aparte-launcher__title';
        // A heading, so a screen reader reaches the chat by its name, the way a page's sections
        // are reached; level 2, under the page's own title.
        this._title.setAttribute('role', 'heading');
        this._title.setAttribute('aria-level', '2');
        this._subtitle = document.createElement('span');
        this._subtitle.className = 'aparte-launcher__subheading';
        heading.append(this._title, this._subtitle);
        const actions = document.createElement('div');
        actions.className = 'aparte-app-header__actions';
        this._maximize = AparteLauncher._headerButton('maximize');
        this._maximize.setAttribute('data-aparte-launcher-maximize', '');
        this._closeControl = AparteLauncher._headerButton('close');
        this._closeControl.setAttribute('data-aparte-launcher-close', '');
        actions.append(this._maximize, this._closeControl);
        header.append(this._avatar, heading, actions);
        return header;
    }

    /**
     * The header, when the element draws one: the title, the line under it, the maximize
     * button for its state, the ✕. It goes first among the children, and the stylesheet
     * joins it to the card under it.
     */
    private _renderHeader(config: AparteConfig): void {
        if (!this.header || this._cardHasHeader()) {
            const hadFocus = !!this._header?.contains(activeElementIn(this));
            this._clearAvatar();
            this._header?.remove();
            // The ✕ or the maximize button held the focus and went with the header.
            if (hadFocus) (this._focusTarget() ?? this._button)?.focus();
            return;
        }
        const header = (this._header ??= this._buildHeader());
        const locale = config.getLocale();
        // Unset, the name the page already gave the chat on its button, before a generic word.
        const label = (this.getAttribute('label') ?? '').trim();
        const title = (this.getAttribute('heading') ?? (label || (locale.launcherHeading ?? 'Chat'))).trim();
        this._title!.textContent = title;
        this._title!.hidden = !title;
        this._drawAvatar(config);
        const subtitle = (this.getAttribute('subheading') ?? '').trim();
        this._subtitle!.textContent = subtitle;
        this._subtitle!.hidden = !subtitle;
        const maximize = this._maximize!;
        maximize.hidden = !this.hasAttribute('maximizable');
        AparteLauncher._name(
            maximize,
            this.maximized ? (locale.launcherRestore ?? 'Shrink the chat') : (locale.launcherMaximize ?? 'Expand the chat'),
            config.getIcon(this.maximized ? 'minimize' : 'maximize'),
        );
        AparteLauncher._name(this._closeControl!, locale.launcherClose ?? 'Close the chat', config.getIcon('close'));
        // First in the DOM, not only on screen (`order` draws it first wherever it is): Tab and a
        // screen reader follow the DOM, and a card prepended after connect would put the whole
        // conversation before the title. Moving the element's own node touches none of the host's.
        if (this.firstElementChild !== header) this.prepend(header);
        this._markAvatarImage();
    }

    /**
     * The assistant's avatar, by the provider that draws it in the messages — the one place an
     * app says what its assistant looks like, a framework component included. Drawn again only
     * when the provider changes, since a render runs on every attribute and a provider may
     * mount a component. Empty without one, and the stylesheet folds an empty slot away.
     */
    private _drawAvatar(config: AparteConfig): void {
        const provider = config.getAvatarProvider();
        if (provider === this._avatarDrawnBy) return;
        this._clearAvatar();
        if (!provider || !this._avatar) return;
        // Marked drawn before the call, so a provider that throws is not called again on every
        // render: it was written for messages, and may look for a bubble around its host.
        this._avatarDrawnBy = provider;
        try {
            const cleanup = provider.render('assistant', this._avatar);
            if (typeof cleanup === 'function') this._avatarCleanup = cleanup;
        } catch (error) {
            this._avatar.replaceChildren();
            console.error("[aparte] The avatar provider failed for the launcher's header, which shows no avatar. It is called with a host outside any message there.", error);
        }
    }

    /**
     * A picture from the stylesheet alone (`--aparte-avatar-image-assistant`), as a message's
     * slot shows it: an empty slot that has one is marked, which lifts the rule folding an empty
     * slot away. Read after the header is in the document, where its style resolves.
     */
    private _markAvatarImage(): void {
        const slot = this._avatar;
        if (!slot) return;
        const image = typeof getComputedStyle === 'function' ? getComputedStyle(slot).backgroundImage : '';
        slot.toggleAttribute('data-image', !slot.firstChild && !!image && image !== 'none');
    }

    private _clearAvatar(): void {
        try {
            this._avatarCleanup?.();
        } catch {
            // A provider's own teardown failing leaves nothing of ours to undo.
        }
        this._avatarCleanup = null;
        this._avatarDrawnBy = null;
        this._avatar?.replaceChildren();
    }

    /**
     * A maximize control of the host's says what it does: `aria-pressed` follows the state.
     * The element's own button is the exception, because it changes its NAME with the state
     * instead, and a toggle whose name changes must not also say it is pressed.
     */
    private _syncMaximizeControls(): void {
        const pressed = String(this.maximized);
        for (const control of this.querySelectorAll('[data-aparte-launcher-maximize]')) {
            if (control === this._maximize || inRenderedContent(control)) continue;
            control.setAttribute('aria-pressed', pressed);
        }
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
        // A sheet hides every maximize control: one that held the focus hands it to the ✕.
        const active = activeElementIn(this);
        if (sheet && active?.matches('[data-aparte-launcher-maximize]') && this.contains(active)) {
            (this._closeControl?.isConnected ? this._closeControl : this._focusTarget())?.focus();
        }
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
     * person just pressed. Nor the element's header, which comes first in the DOM: its ✕
     * is not what anyone opened the chat for, and focus landing there would read the way
     * out before the way in.
     */
    private _focusChat(): void {
        // A composer the card hides (a welcome screen in front of the chat) takes no focus:
        // the first visible control does.
        // Not one inside a reply: `role` is the model's to write too, and the transcript
        // comes before the composer in the card.
        this._focusTarget()?.focus();
    }

    /**
     * Where the focus goes in the chat: the composer, else the card's first control, else —
     * when the chat covers the window and its button is hidden — the header's ✕, the one way
     * out left on screen.
     */
    private _focusTarget(): HTMLElement | undefined {
        const composer = Array.from(this.querySelectorAll<HTMLElement>('[role="textbox"]:not([aria-disabled="true"])'))
            .find((el) => !inRenderedContent(el) && !el.closest('[hidden]') && el.checkVisibility?.() !== false);
        return composer
            ?? this._focusables().find((el) => el !== this._button && !this._header?.contains(el))
            ?? (this.covers && this._closeControl?.isConnected ? this._closeControl : undefined);
    }

    /**
     * A `[data-aparte-launcher-close]` inside closes the chat, and a
     * `[data-aparte-launcher-maximize]` enlarges it or brings it back — no script in your card.
     */
    private _onClick = (e: Event): void => {
        // `eventOrigin`, not `e.target`: a click from inside a consumer's shadow root is
        // retargeted to its host by the time it bubbles here.
        const origin = eventOrigin(e) as HTMLElement | null;
        // A control the card placed, not a phrase in a reply.
        const placed = (selector: string): boolean => {
            const control = origin?.closest?.(selector);
            return !!control && this.contains(control) && !inRenderedContent(control);
        };
        if (placed('[data-aparte-launcher-close]')) this.close();
        else if (placed('[data-aparte-launcher-maximize]')) this.maximized = !this.maximized;
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
            // Maximized, Escape brings the card back first, the way it leaves a full screen: a
            // way out that needs no control on the page — a restore button may be gone with the
            // header, or never drawn. Under the breakpoint there is nothing to bring back.
            if (this.maximized && !this.sheet) this.maximized = false;
            else this.close();
            return;
        }
        // A chat that covers the page keeps Tab inside it: from the last control back to the
        // first, and Shift+Tab the other way — a sheet, or maximized to the whole window. A
        // card, and a panel beside the page, leave the page reachable.
        if (e.key !== 'Tab' || !this.covers) return;
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

deferHydrationOf(AparteLauncher);
if (!customElements.get('aparte-launcher')) {
    customElements.define('aparte-launcher', AparteLauncher);
}
