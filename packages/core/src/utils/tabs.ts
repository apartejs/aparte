import { cssEscape } from './css-escape.js';
import { usableIn } from './menu.js';

/** What `enhanceTabs` takes besides the tablist. */
export interface AparteTabsOptions {
    /**
     * `automatic` (the default): an arrow key selects the tab it moves to. `manual`: the
     * arrows only move the focus, and Enter or Space selects — for a panel that is slow to show.
     */
    activation?: 'automatic' | 'manual';
}

/**
 * A tab about to be selected in a tablist that `enhanceTabs` drives. Dispatched on the
 * tablist before the panels change, so a listener can fill or measure them;
 * `preventDefault()` keeps the current tab.
 *
 * @event aparte-tab-change
 */
export interface AparteTabChangeDetail {
    /** The tab being selected. */
    tab: HTMLElement;
    /** The panel it controls (`aria-controls`), still hidden; `null` when it names none. */
    panel: HTMLElement | null;
    /** The tab that was selected until now. */
    previous: HTMLElement | null;
}

/**
 * Drives a row of tabs drawn with the kit (`role="tablist"`, `role="tab"` buttons with
 * `aria-controls`), the way the WAI-ARIA tabs pattern asks, and returns the function that
 * stops it.
 *
 * The row is one tab stop: the selected tab has `tabindex="0"`, the others `-1`. ArrowRight
 * and ArrowLeft move to the next and the previous tab and wrap round — the other way round in
 * a right-to-left row — or ArrowDown and ArrowUp when the list says
 * `aria-orientation="vertical"`. Home and End go to the ends. A tab that is `disabled`,
 * `aria-disabled="true"` or hidden is passed over. A click selects too.
 *
 * Selecting sets `aria-selected`, moves the tab stop, shows the panel the tab's
 * `aria-controls` names and puts `hidden` on the others. `aparte-tab-change` fires on the
 * tablist just before, with `{ tab, panel, previous }`; `preventDefault()` keeps the current
 * tab. To select a tab from code, call its `click()`.
 *
 * With nothing marked `aria-selected="true"`, the first tab that can be used is selected.
 * Touches no DOM until it is called, so it can be imported on a server.
 *
 * @example
 * const release = enhanceTabs(document.querySelector('[role="tablist"]'));
 * // later, when the tabs go away:
 * release();
 */
export function enhanceTabs(tablist: HTMLElement, options: AparteTabsOptions = {}): () => void {
    const manual = options.activation === 'manual';

    // A tablist nested inside this one keeps its own tabs.
    const tabs = (): HTMLElement[] =>
        [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')].filter((tab) => tab.closest('[role="tablist"]') === tablist);
    const usable = (tab: HTMLElement): boolean => usableIn(tab, tablist);
    const selected = (): HTMLElement | null => tabs().find((tab) => tab.getAttribute('aria-selected') === 'true') ?? null;

    /** The panel a tab names, looked up in the tablist's own tree — which may not be in the document yet. */
    const panelOf = (tab: HTMLElement): HTMLElement | null => {
        const id = tab.getAttribute('aria-controls');
        if (!id) return null;
        const root = tablist.getRootNode() as ParentNode;
        return root.querySelector<HTMLElement>(`[id="${cssEscape(id)}"]`);  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
    };

    const show = (chosen: HTMLElement): void => {
        for (const tab of tabs()) {
            const on = tab === chosen;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            const panel = panelOf(tab);
            if (panel) panel.hidden = !on;
        }
    };

    /** Selects `tab`, asking first; false when a listener kept the current one. */
    const select = (tab: HTMLElement): boolean => {
        const previous = selected();
        if (tab === previous) return true;
        const go = tablist.dispatchEvent(new CustomEvent<AparteTabChangeDetail>('aparte-tab-change', {
            detail: { tab, panel: panelOf(tab), previous },
            bubbles: true,
            composed: true,
            cancelable: true,
        }));
        if (go) show(tab);
        return go;
    };

    const onClick = (e: MouseEvent): void => {
        const tab = (e.target as Element).closest?.<HTMLElement>('[role="tab"]');
        if (!tab || !tabs().includes(tab) || !usable(tab)) return;
        select(tab);
    };

    const onKeydown = (e: KeyboardEvent): void => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
        const tab = (e.target as Element).closest?.<HTMLElement>('[role="tab"]');
        const list = tabs();
        const at = tab ? list.indexOf(tab) : -1;
        if (!tab || at < 0) return;
        if (e.key === 'Enter' || e.key === ' ') {
            // A real button turns them into its click, which selects.
            if (manual && tab.tagName !== 'BUTTON' && usable(tab)) {
                e.preventDefault();
                select(tab);
            }
            return;
        }
        const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
        const rtl = !vertical && getComputedStyle(tablist).direction === 'rtl';
        const forward = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
        const back = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
        let from: number;
        let step: number;
        if (e.key === forward) { from = at + 1; step = 1; }
        else if (e.key === back) { from = at - 1; step = -1; }
        else if (e.key === 'Home') { from = 0; step = 1; }
        else if (e.key === 'End') { from = list.length - 1; step = -1; }
        else return;
        e.preventDefault();
        for (let n = 0; n < list.length; n++) {
            const next = list[(((from + n * step) % list.length) + list.length) % list.length]!;
            if (!usable(next)) continue;
            if (manual || select(next)) next.focus();
            return;
        }
    };

    tablist.addEventListener('click', onClick);
    tablist.addEventListener('keydown', onKeydown);

    // The markup's choice when it made one, else the first tab that can be used.
    const initial = selected() ?? tabs().find(usable);
    if (initial) show(initial);

    return () => {
        tablist.removeEventListener('click', onClick);
        tablist.removeEventListener('keydown', onKeydown);
    };
}
