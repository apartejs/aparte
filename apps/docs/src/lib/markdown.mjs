/**
 * The docs' Markdown, drawn with the library's own recipes.
 *
 * Two things in a page's prose are not prose: a callout (`:::note`) and a code block. Starlight
 * and Expressive Code draw both with their own markup and colours; here they come out as the
 * same markup aparté's kit and its code segment use, so the site shows the library rather
 * than a theme that resembles it:
 *
 *   - `rehypeAparteAsides` turns Starlight's `<aside class="starlight-aside …">` into an
 *     `.aparte-alert` (the kit's callout);
 *   - `aparteCodeBlock` is a Shiki transformer that wraps each highlighted block in the code
 *     segment's own markup (`.aparte-segment-code` → header with the language and a copy
 *     button → `.aparte-code-content-wrapper`).
 *
 * Both run at build time in Node, so the icons come from `@aparte/core/icons`, the DOM-free
 * entry, as SVG strings converted to HAST here.
 */
import { alertTriangleIcon, copyIcon, errorIcon, infoIcon } from '@aparte/core/icons';

/** A glyph is a handful of simple tags; this turns one into HAST without a parser dependency. */
function svgToHast(svg) {
    const root = { type: 'root', children: [] };
    const stack = [root];
    for (const [, closing, tag, attrs, selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
        if (closing) {
            stack.pop();
            continue;
        }
        const properties = {};
        for (const [, name, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) properties[name] = value;
        const node = { type: 'element', tagName: tag, properties, children: [] };
        stack.at(-1).children.push(node);
        if (!selfClosing) stack.push(node);
    }
    const svgNode = root.children[0];
    svgNode.properties['aria-hidden'] = 'true';
    return svgNode;
}

const el = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });
const classes = (node) => {
    const c = node.properties?.className ?? node.properties?.class ?? [];
    return Array.isArray(c) ? c.map(String) : String(c).split(/\s+/);
};
const textOf = (node) =>
    node.type === 'text' ? node.value : (node.children ?? []).filter((c) => c.tagName !== 'svg').map(textOf).join('');

/** Starlight's four aside variants, as the kit's intents and the glyph each wears. */
const ASIDE = {
    note: { intent: 'info', icon: infoIcon },
    tip: { intent: 'primary', icon: infoIcon },
    caution: { intent: 'warning', icon: alertTriangleIcon },
    danger: { intent: 'danger', icon: errorIcon },
};

export function rehypeAparteAsides() {
    return (tree) => {
        const walk = (node) => {
            for (const child of node.children ?? []) {
                if (child.type === 'element' && child.tagName === 'aside' && classes(child).includes('starlight-aside')) {
                    const variant = classes(child).find((c) => c.startsWith('starlight-aside--'))?.slice('starlight-aside--'.length) ?? 'note';
                    const { intent, icon } = ASIDE[variant] ?? ASIDE.note;
                    const title = child.children.find((c) => c.type === 'element' && classes(c).includes('starlight-aside__title'));
                    const content = child.children.find((c) => c.type === 'element' && classes(c).includes('starlight-aside__content'));
                    const label = title ? textOf(title).trim() : '';
                    child.properties = {
                        className: ['aparte-alert', `aparte-alert--${intent}`, 'aparte-doc-callout'],
                        'aria-label': child.properties?.['aria-label'] ?? label,
                    };
                    child.children = [
                        el('span', { className: ['aparte-alert__icon'] }, [svgToHast(icon)]),
                        el('div', { className: ['aparte-alert__body'] }, [
                            ...(label ? [el('p', { className: ['aparte-alert__title'] }, [text(label)])] : []),
                            el('div', { className: ['aparte-alert__message'] }, content?.children ?? []),
                        ]),
                    ];
                }
                walk(child);
            }
        };
        walk(tree);
    };
}

/** A Shiki transformer: each block becomes the code segment's markup, header and all. */
export function aparteCodeBlock() {
    return {
        name: 'aparte-code-block',
        // `language-*` on the <code> is what Markdown converters read for a fence's language
        // (llms.txt is one); it stays unprefixed, as it is the name highlighters look for.
        code(node) {
            const lang = this.options.lang;
            if (lang && lang !== 'plaintext') node.properties.className = [`language-${lang}`];
        },
        root(root) {
            const pre = root.children.find((n) => n.type === 'element' && n.tagName === 'pre');
            if (!pre) return;
            const lang = this.options.lang && this.options.lang !== 'plaintext' ? this.options.lang : '';
            // Astro swaps the code node for `children[0]` of this root, so the wrapper must be it.
            root.children = [
                el('div', { className: ['aparte-segment-code', 'aparte-doc-code', 'not-content'], 'data-language': lang || undefined }, [
                    el('div', { className: ['aparte-code-header'] }, [
                        el('span', { className: ['aparte-code-header-filler'] }),
                        el('span', { className: ['aparte-code-language'] }, lang ? [text(lang)] : []),
                        el('button', {
                            type: 'button',
                            className: ['aparte-btn', 'aparte-btn--icon', 'aparte-btn--sm', 'aparte-code-copy'],
                            'data-copy-code': '',
                            'aria-label': 'Copy',
                            title: 'Copy',
                            'data-pagefind-ignore': '',
                        }, [svgToHast(copyIcon)]),
                    ]),
                    el('div', { className: ['aparte-code-content-wrapper'] }, [pre]),
                ]),
            ];
        },
    };
}
