import { placeFloating, type AparteFloatingOptions } from './place-floating.js';
import { activeElementIn, eventOrigin } from './event-target.js';

/** What `enhanceMenu` takes besides its two elements: where the menu goes, and two hooks. */
export interface AparteMenuOptions extends AparteFloatingOptions {
    /**
     * Called as the menu is about to open, before it shows: fill it here when its items
     * depend on the moment. Return `false` to keep it closed.
     */
    onOpen?: () => boolean | void;
    /** Called once the menu has closed, whatever closed it. */
    onClose?: () => void;
}

/** What `enhanceContextMenu` takes besides its two elements. */
export interface AparteContextMenuOptions {
    /** Distance from the focused element when a key opens it, in px. At the pointer it opens on the spot. */
    gap?: number;
    /** Room kept free at the edges of the window, in px. Default 8. */
    margin?: number;
    /** The writing direction is right to left. Read from the region when left out. */
    rtl?: boolean;
    /**
     * Called as the menu is about to open, with the element it was asked about: the one
     * under the pointer, or the focused one for a key. Fill the menu for it here. Return
     * `false` to keep it closed and leave the browser its own menu.
     */
    onOpen?: (target: Element) => boolean | void;
    /** Called once the menu has closed, whatever closed it. */
    onClose?: () => void;
}

/**
 * The item chosen in a menu that `enhanceMenu` or `enhanceContextMenu` drives. Dispatched
 * on the menu before it closes; `preventDefault()` keeps it open. A checkbox or radio item
 * is not ticked for you: set its `aria-checked` here.
 *
 * @event aparte-menu-select
 */
export interface AparteMenuSelectDetail {
    /** The item, or the other button inside the menu, that was pressed. */
    item: HTMLElement;
}

type Anchor = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;

const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
/** How long a pause ends a word typed to reach an item. */
const TYPE_AHEAD_MS = 500;

/** The menu open on the page, if any: one at a time, like the browser's own. */
let openMenu: Session | null = null;

interface Session {
    readonly isOpen: () => boolean;
    open(anchor: Anchor, place: AparteFloatingOptions, focus: 'first' | 'last', returnTo: HTMLElement | null): void;
    close(returnFocus: boolean): void;
    release(): void;
    /** Where the focus goes back to when it closes. */
    returnTarget(): HTMLElement | null;
}

/** Inside `root`, and not under anything `hidden` on the way up to it. */
function shownWithin(el: HTMLElement, root: HTMLElement): boolean {
    for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
        if (node.hidden) return false;
    }
    return true;
}

/** An item a reader can reach: not `disabled`, not `aria-disabled`, not hidden. */
export function usableIn(el: HTMLElement, root: HTMLElement): boolean {
    return !(el as HTMLButtonElement).disabled
        && el.getAttribute('aria-disabled') !== 'true'
        && shownWithin(el, root);
}

/** Enter and Space already click it: a button, or Enter on a link. */
function clicksItself(el: HTMLElement, key: string): boolean {
    return el.tagName === 'BUTTON' || (el.tagName === 'A' && key === 'Enter');
}

function isRtl(el: Element): boolean {
    return getComputedStyle(el).direction === 'rtl';
}

/** What a reader types to reach an item: its name, folded. */
function labelOf(item: HTMLElement): string {
    return (item.getAttribute('aria-label') ?? item.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** A text field inside the menu keeps its own keys: the caret, the letters. */
function isField(el: Element | null): boolean {
    return !!el?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

/**
 * Everything the two kinds of menu share, from the moment it shows to the moment it closes:
 * the keys inside it, the choice, and the four ways it closes on its own (a press outside,
 * the focus leaving, a scroll, a resize).
 */
function menuSession(
    menu: HTMLElement,
    hooks: { owns?: (node: Node) => boolean; onToggle?: (open: boolean) => void; onClose?: () => void },
): Session {
    let open = false;
    let returnTo: HTMLElement | null = null;
    // A press inside the menu, held from `pointerdown` to its release. WebKit does not move
    // the focus to a button on mousedown: the element that held it is blurred instead —
    // `focusout` with no `relatedTarget` — before the click reaches the item. Read as the
    // focus leaving, that closed the menu on the press, and no item could be chosen with a mouse.
    let pressInside = false;
    let typed = '';
    let typedAt = 0;

    const items = (): HTMLElement[] =>
        [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((item) => {
            // An item of a submenu nested in this one is that submenu's.
            const owner = item.parentElement?.closest('[role="menu"]');
            return (!owner || owner === menu || !menu.contains(owner)) && usableIn(item, menu);
        });

    const focusItem = (item: HTMLElement | undefined): void => item?.focus({ preventScroll: true });

    const onPress = (e: Event): void => {
        // `eventOrigin`, not `e.target`: this listens on `document`, and a menu inside a
        // shadow root is seen from there as its host.
        const target = eventOrigin(e) as Node | null;
        pressInside = !!target && menu.contains(target);
        // A press on the trigger is left to its own click, which toggles.
        if (pressInside || (target && hooks.owns?.(target))) return;
        session.close(false);
    };
    const onRelease = (): void => { pressInside = false; };
    const onScroll = (e: Event): void => {
        // Its own list scrolling is not the page moving under it.
        const target = eventOrigin(e);
        if (target instanceof Node && menu.contains(target)) return;
        session.close(false);
    };
    const onResize = (): void => session.close(false);

    const onFocusOut = (e: FocusEvent): void => {
        if (!open) return;
        const next = e.relatedTarget as Node | null;
        if (!next && pressInside) return;
        if (next && (menu.contains(next) || hooks.owns?.(next))) return;
        // Somewhere else took it: close, and do not pull it back.
        session.close(false);
    };

    const onKeydown = (e: KeyboardEvent): void => {
        if (!open || e.isComposing) return;
        const target = e.target as HTMLElement;
        if (e.key === 'Escape') {
            // Spent here: a dialog or a drawer around the menu reads `defaultPrevented` and stays.
            e.preventDefault();
            session.close(true);
            return;
        }
        if (e.key === 'Tab') {
            // The menu goes, the focus goes back to where it came from, and the browser's own
            // Tab moves on from there — to what follows the button, not what followed the menu.
            session.close(true);
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey || isField(target)) return;
        const list = items();
        if (!list.length) return;
        const at = list.indexOf(activeElementIn(menu) as HTMLElement);
        const step = (to: number): void => {
            e.preventDefault();
            focusItem(list[(to + list.length) % list.length]);
        };
        switch (e.key) {
            case 'ArrowDown': step(at + 1); return;
            case 'ArrowUp': step(at < 0 ? list.length - 1 : at - 1); return;
            case 'Home': step(0); return;
            case 'End': step(list.length - 1); return;
            case 'Enter': case ' ': {
                const item = target.closest<HTMLElement>(ITEM);
                if (item && menu.contains(item) && !clicksItself(item, e.key)) {
                    e.preventDefault();
                    item.click();
                }
                return;
            }
        }
        if ([...e.key].length !== 1) return;
        // Type-ahead: the next item whose name starts with what was typed. Letters typed
        // quickly are one word; the same letter again moves on to the next item that has it.
        e.preventDefault();
        const now = Date.now();
        typed = now - typedAt > TYPE_AHEAD_MS ? e.key : typed + e.key;
        typedAt = now;
        const chars = [...typed.toLocaleLowerCase()];
        const word = chars.every((c) => c === chars[0]) ? chars[0]! : chars.join('');
        const from = [...word].length === 1 ? at + 1 : Math.max(at, 0);
        for (let n = 0; n < list.length; n++) {
            const item = list[(from + n) % list.length]!;
            if (labelOf(item).startsWith(word)) { focusItem(item); return; }
        }
    };

    const onClick = (e: MouseEvent): void => {
        if (!open) return;
        // An item, or another button the menu holds — the answer to a question it now asks.
        const item = (e.target as Element).closest?.<HTMLElement>(`${ITEM}, button`);
        if (!item || item === menu || !menu.contains(item)) return;
        if (!usableIn(item, menu)) return;
        const go = menu.dispatchEvent(new CustomEvent<AparteMenuSelectDetail>('aparte-menu-select', {
            detail: { item },
            bubbles: true,
            composed: true,
            cancelable: true,
        }));
        if (go) session.close(true);
    };

    // No browser menu on top of this one.
    const onContextMenu = (e: Event): void => { if (open) e.preventDefault(); };

    menu.addEventListener('keydown', onKeydown);
    menu.addEventListener('click', onClick);
    menu.addEventListener('focusout', onFocusOut);
    menu.addEventListener('contextmenu', onContextMenu);

    const placed = { position: menu.style.position, top: menu.style.top, left: menu.style.left };
    menu.hidden = true;
    const addedRole = !menu.hasAttribute('role');
    if (addedRole) menu.setAttribute('role', 'menu');

    const session: Session = {
        isOpen: () => open,
        open(anchor, place, focus, back) {
            if (openMenu && openMenu !== session) openMenu.close(false);
            open = true;
            openMenu = session;
            returnTo = back;
            typed = '';
            menu.hidden = false;
            // Fixed to the window: a menu inside a scrolling list is not clipped by it. It is
            // measured once, which is why a scroll or a resize closes it.
            menu.style.position = 'fixed';
            placeFloating(anchor, menu, place);
            document.addEventListener('pointerdown', onPress, true);
            document.addEventListener('pointerup', onRelease, true);
            document.addEventListener('pointercancel', onRelease, true);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onResize);
            hooks.onToggle?.(true);
            const list = items();
            // A choice among radio items opens on the one in force.
            const checked = list.find((i) => i.getAttribute('role') === 'menuitemradio' && i.getAttribute('aria-checked') === 'true');
            focusItem(focus === 'last' ? list[list.length - 1] : checked ?? list[0]);
        },
        close(returnFocus) {
            if (!open) return;
            open = false;
            if (openMenu === session) openMenu = null;
            pressInside = false;
            document.removeEventListener('pointerdown', onPress, true);
            document.removeEventListener('pointerup', onRelease, true);
            document.removeEventListener('pointercancel', onRelease, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            // Before it hides: a hidden element that holds the focus drops it on `<body>`.
            if (returnFocus && returnTo?.isConnected) returnTo.focus();
            returnTo = null;
            menu.hidden = true;
            hooks.onToggle?.(false);
            hooks.onClose?.();
        },
        release() {
            session.close(false);
            menu.removeEventListener('keydown', onKeydown);
            menu.removeEventListener('click', onClick);
            menu.removeEventListener('focusout', onFocusOut);
            menu.removeEventListener('contextmenu', onContextMenu);
            menu.style.position = placed.position;
            menu.style.top = placed.top;
            menu.style.left = placed.left;
            if (!menu.getAttribute('style')) menu.removeAttribute('style');
            if (addedRole) menu.removeAttribute('role');
            // `hidden` stays: it is the menu's state, closed, not wiring to take back.
        },
        returnTarget: () => returnTo,
    };
    return session;
}

/** An attribute the helper sets while it runs, and puts back as it was on release. */
function borrowAttribute(el: Element, name: string, value: string, keepExisting = false): () => void {
    const before = el.getAttribute(name);
    if (before === null || !keepExisting) el.setAttribute(name, value);
    return () => {
        if (before === null) el.removeAttribute(name);
        else el.setAttribute(name, before);
    };
}

/**
 * Drives a menu drawn with the kit (`.aparte-menu`, `role="menuitem"` items) from the button
 * that opens it, the way the WAI-ARIA menu button pattern asks, and returns the function that
 * stops it.
 *
 * The button opens it on a click (so Enter and Space, which click a button), ArrowDown (on the
 * first item) and ArrowUp (on the last). Inside, the arrows move and wrap round, Home and End
 * jump to the ends, and a letter moves to the next item that starts with it; an item that is
 * `disabled`, `aria-disabled="true"` or hidden is passed over. Escape closes it and puts the
 * focus back on the button; Tab closes it and moves on from the button. A press outside, the
 * focus leaving, a scroll or a resize close it. One menu is open at a time.
 *
 * Choosing an item fires `aparte-menu-select` on the menu with `{ item }`, then closes it and
 * puts the focus back. A `menuitemcheckbox` or `menuitemradio` is not ticked for you: set its
 * `aria-checked` in that listener. `preventDefault()` on the event keeps the menu open.
 *
 * The menu is shown and hidden with `hidden`, and placed with `placeFloating` against the
 * button, fixed to the window. To open or close it from code, call `trigger.click()`.
 *
 * Touches no DOM until it is called, so it can be imported on a server.
 *
 * @example
 * const release = enhanceMenu(button, menu, { align: 'end' });
 * menu.addEventListener('aparte-menu-select', (e) => run(e.detail.item.dataset.action));
 * // later, when the menu goes away:
 * release();
 */
export function enhanceMenu(trigger: HTMLElement, menu: HTMLElement, options: AparteMenuOptions = {}): () => void {
    const { onOpen, onClose, ...place } = options;
    const giveBack = [
        borrowAttribute(trigger, 'aria-haspopup', 'menu', true),
        borrowAttribute(trigger, 'aria-expanded', 'false'),
    ];
    const session = menuSession(menu, {
        owns: (node) => trigger.contains(node),
        onToggle: (open) => trigger.setAttribute('aria-expanded', String(open)),
        onClose,
    });

    const show = (focus: 'first' | 'last'): void => {
        if (session.isOpen()) {
            // Already open (a mouse opened it and the focus stayed on the button): go in.
            const items = [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((i) => usableIn(i, menu));
            (focus === 'last' ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
            return;
        }
        if (onOpen?.() === false) return;
        session.open(trigger.getBoundingClientRect(), { ...place, rtl: place.rtl ?? isRtl(trigger) }, focus, trigger);
    };
    const toggle = (): void => {
        if (session.isOpen()) session.close(true);
        else show('first');
    };

    const onClick = (): void => toggle();
    const onKeydown = (e: KeyboardEvent): void => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show(e.key === 'ArrowUp' ? 'last' : 'first');
        } else if ((e.key === 'Enter' || e.key === ' ') && !clicksItself(trigger, e.key)) {
            e.preventDefault();
            toggle();
        }
    };
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKeydown);

    return () => {
        session.release();
        trigger.removeEventListener('click', onClick);
        trigger.removeEventListener('keydown', onKeydown);
        for (const back of giveBack) back();
    };
}

/**
 * The same menu as `enhanceMenu`, opened by a right click, Shift+F10 or the Menu key inside
 * `region` — at the pointer for a click, under the focused element for a key — and returns
 * the function that stops it. One menu serves the whole region: `onOpen(target)` says which
 * element it was asked about, so the menu can be filled for that row.
 *
 * Inside, it behaves as `enhanceMenu`'s does: the same keys, the same `aparte-menu-select`,
 * the same ways to close. Escape puts the focus back on the element that had it.
 *
 * @example
 * const release = enhanceContextMenu(list, menu, {
 *     onOpen: (target) => {
 *         const row = target.closest('[data-id]');
 *         if (!row) return false; // not a row: the browser keeps its own menu
 *         menu.dataset.for = row.dataset.id;
 *     },
 * });
 */
export function enhanceContextMenu(region: HTMLElement, menu: HTMLElement, options: AparteContextMenuOptions = {}): () => void {
    const { onOpen, onClose, gap, margin, rtl } = options;
    const session = menuSession(menu, { onClose });

    /** Opens it about `target`; false when `onOpen` said no and the browser keeps its menu. */
    const openAt = (target: Element, anchor: Anchor, pointer: boolean): boolean => {
        // Where the focus was, to give it back: a key opens on the focused element, and a
        // right click has focused what it pressed by now. Inside the open menu it is the
        // menu's, and the place to go back to is the one it already had.
        const active = activeElementIn(region) as HTMLElement | null;
        const back = active && active !== document.body && !menu.contains(active) ? active : session.returnTarget();
        // Already open about another row: closed first, so `onOpen` fills a closed menu.
        session.close(false);
        if (onOpen?.(target) === false) return false;
        session.open(anchor, {
            // At the pointer it opens on the spot, the way the browser's own does.
            gap: pointer ? 0 : gap,
            margin,
            side: 'below',
            align: 'start',
            rtl: rtl ?? isRtl(region),
        }, 'first', back);
        return true;
    };

    const onContextMenu = (e: MouseEvent): void => {
        const target = eventOrigin(e) as Element | null;
        if (!target) return;
        // On the open menu itself: nothing to open, and no browser menu over it either.
        if (target instanceof Node && menu.contains(target)) {
            e.preventDefault();
            return;
        }
        const point = { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX };
        if (openAt(target, point, true)) e.preventDefault();
    };
    const onKeydown = (e: KeyboardEvent): void => {
        if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) return;
        const target = eventOrigin(e) as Element | null;
        if (!target || menu.contains(target)) return;
        if (openAt(target, target.getBoundingClientRect(), false)) e.preventDefault();
    };
    region.addEventListener('contextmenu', onContextMenu);
    region.addEventListener('keydown', onKeydown);

    return () => {
        session.release();
        region.removeEventListener('contextmenu', onContextMenu);
        region.removeEventListener('keydown', onKeydown);
    };
}
