/**
 * The draft as a flat run of units, so a caret and a range are plain numbers: a character is
 * one, a `<br>` is one, and a token is one, whatever its label says. A plugin that looks for
 * `@` before the caret reads this, and can never read inside a token.
 */
import type { AparteComposerToken, AparteMessageToken } from '../../types/index.js';

const TOKEN_ATTR = 'data-aparte-token';
const TEXT_ATTR = 'data-aparte-text';
/** What a token counts as in the flat text. */
export const TOKEN_CHAR = '￼';

const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;
const isToken = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute(TOKEN_ATTR);
const indexIn = (node: Node): number => Array.prototype.indexOf.call(node.parentNode!.childNodes, node);

/** The editor's text nodes, `<br>`s and tokens in order. It is kept flat; a stray wrapper is walked through. */
function leaves(root: Node, out: Node[] = []): Node[] {
    root.childNodes.forEach((child) => {
        if (isText(child) || child.nodeName === 'BR' || isToken(child)) out.push(child);
        else leaves(child, out);
    });
    return out;
}

const sizeOf = (leaf: Node): number => (isText(leaf) ? leaf.data.length : 1);

export function flatText(editor: HTMLElement): string {
    return leaves(editor).map((leaf) => (isText(leaf) ? leaf.data : leaf.nodeName === 'BR' ? '\n' : TOKEN_CHAR)).join('');
}

/** The flat offset of a point in the DOM. */
export function flatOffset(editor: HTMLElement, container: Node, offset: number): number {
    const point = editor.ownerDocument.createRange();
    point.setStart(container, offset);
    point.collapse(true);
    let flat = 0;
    for (const leaf of leaves(editor)) {
        if (leaf === container) return flat + offset;
        if (point.comparePoint(leaf.parentNode!, indexIn(leaf)) >= 0) return flat;
        flat += sizeOf(leaf);
    }
    return flat;
}

function domPoint(editor: HTMLElement, flat: number): [Node, number] {
    let left = flat;
    for (const leaf of leaves(editor)) {
        if (isText(leaf) && left <= leaf.data.length) return [leaf, left];
        if (left === 0) return [leaf.parentNode!, indexIn(leaf)];
        left -= sizeOf(leaf);
    }
    return [editor, editor.childNodes.length];
}

/** A DOM range over two flat offsets. */
export function flatRange(editor: HTMLElement, from: number, to: number): Range {
    const range = editor.ownerDocument.createRange();
    range.setStart(...domPoint(editor, from));
    range.setEnd(...domPoint(editor, to));
    return range;
}

/** The pill itself: not editable, so a caret goes around it and Backspace takes it whole. */
export function tokenElement(doc: Document, id: string, token: AparteComposerToken): HTMLElement {
    const el = doc.createElement('span');
    el.className = 'aparte-tag aparte-inline-token';
    el.setAttribute('contenteditable', 'false');
    el.setAttribute(TOKEN_ATTR, id);
    el.setAttribute(TEXT_ATTR, token.text ?? token.label);
    if (token.kind) el.dataset['kind'] = token.kind;
    const label = doc.createElement('span');
    label.className = 'aparte-tag__label';
    label.textContent = token.label;
    el.appendChild(label);
    return el;
}

/** The message the draft will send, and where each token ended up in it. */
export function serializeDraft(editor: HTMLElement, known: ReadonlyMap<string, AparteComposerToken>): { value: string; tokens: AparteMessageToken[] } {
    let out = '';
    const tokens: AparteMessageToken[] = [];
    for (const leaf of leaves(editor)) {
        if (isText(leaf)) out += leaf.data;
        else if (leaf.nodeName === 'BR') out += '\n';
        else {
            const el = leaf as HTMLElement;
            const source = known.get(el.getAttribute(TOKEN_ATTR) ?? '');
            const text = el.getAttribute(TEXT_ATTR) ?? el.textContent ?? '';
            const start = out.length;
            out += text;
            tokens.push({
                label: el.textContent ?? '',
                text,
                start,
                end: out.length,
                ...(el.dataset['kind'] ? { kind: el.dataset['kind'] } : {}),
                ...(source?.data !== undefined ? { data: source.data } : {}),
            });
        }
    }
    const lead = out.length - out.trimStart().length;
    return { value: out.trim(), tokens: tokens.map((token) => ({ ...token, start: token.start - lead, end: token.end - lead })) };
}
