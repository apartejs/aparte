/**
 * The plugin's one stylesheet, put on the page once: by the `subagent` segment renderer's
 * `getStyles()` (core injects it with the other renderers' sheets) or by
 * `<aparte-subagent-view>` as it connects, whichever comes first.
 */
import styles from './subagents.css?raw';

const STYLE_ID = 'aparte-subagent-styles';
/** A selector only this sheet holds: how a copy already on the page is recognised. */
const MARK = '.aparte-subagent-transcript';

/** The `<style>` found holding the sheet, so a view connecting later does not search again. */
let holder: Element | null = null;

function onPage(): boolean {
    if (holder?.isConnected) return true;
    holder = document.getElementById(STYLE_ID)
        ?? [...document.querySelectorAll('style')].find((sheet) => sheet.textContent?.includes(MARK))
        ?? null;
    return holder !== null;
}

/** What the segment renderer hands core: the sheet, unless the element already put it on the page. */
export function rendererStyles(): string {
    return typeof document !== 'undefined' && document.getElementById(STYLE_ID) ? '' : styles;
}

/** Put the sheet on the page, unless it is there already. */
export function ensureStyles(): void {
    if (typeof document === 'undefined' || onPage()) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.appendChild(style);
    holder = style;
}
