/**
 * The plugin's one stylesheet, put on the page once, by the first `<aparte-diff>` to connect.
 */
import styles from './diff.css?raw';

const STYLE_ID = 'aparte-diff-styles';

/** The sheet, as the element puts it on the page. */
export const DIFF_STYLES = styles;

/** Put the sheet on the page, unless it is there already. */
export function ensureStyles(doc: Document = document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styles;
    doc.head.appendChild(style);
}
