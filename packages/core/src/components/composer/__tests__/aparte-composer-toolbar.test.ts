// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import '../aparte-composer-toolbar.js';

/**
 * The composer's bottom row, as an element rather than a CSS class.
 *
 * Why an element at all: the row lived only in the four wrappers, each with its own
 * positional slot names, while core owned nothing but a class. The element is the one
 * name that works in vanilla and in every wrapper — and a mistyped ELEMENT breaks
 * visibly, where a mistyped CLASS renders an unstyled div in silence.
 *
 * Why it reflects `data-empty` instead of leaning on CSS `:empty`: `:empty` does not
 * match an element that holds a whitespace text node, so any template that indents its
 * content keeps the row — separator, padding and all — while it looks empty. Angular's
 * `<ng-content>` row did exactly that.
 */

const mount = (html = ''): HTMLElement => {
    const el = document.createElement('aparte-composer-toolbar');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-composer-toolbar', () => {
    it('is defined, and keeps its children in the light DOM', () => {
        expect(customElements.get('aparte-composer-toolbar')).toBeTruthy();

        const el = mount('<button id="a">A</button><span id="b">B</span>');

        expect(el.shadowRoot).toBeNull();
        expect([...el.children].map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('declares itself empty when it holds nothing', () => {
        expect(mount().hasAttribute('data-empty')).toBe(true);
    });

    it('declares itself empty when it holds only whitespace — the case `:empty` gets wrong', () => {
        const el = mount('\n    \n');

        // The premise, spelled out: this markup is NOT `:empty`, which is why the
        // attribute exists at all.
        expect(el.matches(':empty')).toBe(false);
        expect(el.hasAttribute('data-empty')).toBe(true);
    });

    it('declares itself empty when it holds only a comment — framework anchors', () => {
        const el = mount('<!-- ng-content -->');

        expect(el.hasAttribute('data-empty')).toBe(true);
    });

    it('stops declaring itself empty when a child arrives after mount', async () => {
        const el = mount();

        el.appendChild(document.createElement('button'));

        // Settled state only: the observer runs on a microtask, so asserting this
        // synchronously would pin a schedule rather than the behaviour.
        await vi.waitFor(() => expect(el.hasAttribute('data-empty')).toBe(false));
    });

    it('declares itself empty again when the last child leaves', async () => {
        const el = mount('<button>A</button>');
        expect(el.hasAttribute('data-empty')).toBe(false);

        el.firstElementChild!.remove();
        // Removal goes through the observer, so it settles on a microtask. Asserted only
        // once settled: pinning the intermediate state would be pinning a schedule.
        await vi.waitFor(() => expect(el.hasAttribute('data-empty')).toBe(true));
    });
});

describe('the stylesheet styles the element, not just the legacy class', () => {
    /**
     * Read as a contract, not as a snapshot: the element is worthless if the row it
     * names is unstyled, and nothing else in the suite would notice. Removing
     * `aparte-composer-toolbar` from either rule must fail here.
     */
    // Resolved by walking up from the cwd rather than from `import.meta.url`: under Vite
    // that is an http URL, not a file one, and the cwd differs between `pnpm test` at the
    // root and `nx test @aparte/core` in the package.
    const css = ((): string => {
        for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
            for (const rel of ['packages/core/src/styles/aparte.css', 'src/styles/aparte.css']) {
                const candidate = join(dir, rel);
                if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
            }
        }
        throw new Error(`aparte.css not found from ${process.cwd()}`);
    })();

    it('gives the element the row layout', () => {
        expect(css).toMatch(/aparte-composer-toolbar,\s*\n\s*\.aparte-composer-footer\s*\{/);
    });

    it('hides the element while it declares itself empty', () => {
        expect(css).toMatch(/aparte-composer-toolbar\[data-empty\]/);
    });

    it('keeps the legacy class working, so existing markup is not silently unstyled', () => {
        expect(css).toContain('.aparte-composer-footer');
        expect(css).toMatch(/\.aparte-composer-footer:empty/);
    });
});
