/**
 * The tokens of a sent message, as the pills they were in the composer. A user message goes
 * through the Markdown provider like any other, so a token is found again by its TEXT in the
 * rendered DOM, at the same occurrence as in the source. One that cannot be found stays as the
 * text it is: nothing is guessed.
 */
import type { AparteMessageToken } from '../../types/index.js';

const count = (haystack: string, needle: string): number => (needle ? haystack.split(needle).length - 1 : 0);

function pill(doc: Document, token: AparteMessageToken): HTMLElement {
    const el = doc.createElement('span');
    el.className = 'aparte-tag aparte-inline-token';
    if (token.kind) el.dataset['kind'] = token.kind;
    const label = doc.createElement('span');
    label.className = 'aparte-tag__label';
    label.textContent = token.label;
    el.appendChild(label);
    return el;
}

function draw(root: Element, content: string, token: AparteMessageToken): void {
    let skip = count(content.slice(0, token.start), token.text);
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        for (let at = node.data.indexOf(token.text); at >= 0; at = node.data.indexOf(token.text, at + token.text.length)) {
            if (skip-- > 0) continue;
            const range = doc.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + token.text.length);
            range.deleteContents();
            range.insertNode(pill(doc, token));
            return;
        }
    }
}

/** Last first, so that the earlier occurrences are still text when their turn comes. */
export function drawMessageTokens(root: Element, content: string, tokens: readonly AparteMessageToken[]): void {
    if (root.querySelector('.aparte-inline-token')) return;
    for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
        if (token.text) draw(root, content, token);
    }
}
