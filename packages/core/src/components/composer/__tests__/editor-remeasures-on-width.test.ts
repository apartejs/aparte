// @vitest-environment jsdom
/**
 * #55 — the composer's editor sometimes came up ~200 px tall while empty.
 *
 * The auto-grow reads `scrollHeight` at three fixed instants (connect, next frame,
 * fonts.ready) and then only on input. If any of those instants falls while the
 * editor has a near-zero inline size — its container not laid out yet — the
 * PLACEHOLDER (a `::before` that counts in scrollHeight) wraps over many lines, the
 * inflated number becomes the inline height, and nothing re-measures until the first
 * keystroke. jsdom has no layout, so the measurement is scripted: `scrollHeight` is
 * what the box would report narrow, then what it reports at its real width.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import type { AparteComposerInput } from '../aparte-composer-input.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

const observed: Element[] = [];
let resizeCallback: ((entries: unknown[]) => void) | null = null;
class CapturingResizeObserver {
    constructor(cb: (entries: unknown[]) => void) { resizeCallback = cb; }
    observe(el: Element): void { observed.push(el); }
    unobserve(): void {}
    disconnect(): void { observed.length = 0; }
}

function mount(scrollHeights: number[]) {
    const composer = document.createElement('aparte-composer');
    document.body.appendChild(composer);
    const input = document.createElement('aparte-composer-input') as AparteComposerInput;
    // Each measurement reads the next scripted value; the last one sticks.
    const queue = [...scrollHeights];
    composer.appendChild(input);
    const editor = (input as unknown as { _editor: HTMLElement })._editor;
    Object.defineProperty(editor, 'scrollHeight', {
        configurable: true,
        get: () => (queue.length > 1 ? queue.shift()! : queue[0]!),
    });
    return { input, editor };
}

beforeEach(() => {
    observed.length = 0;
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('#55 — the editor re-measures when its width changes', () => {
    it('observes the editor (or its box) for size changes', () => {
        const { editor } = mount([24]);
        expect(observed.length).toBeGreaterThan(0);
        expect(observed.some((el) => el === editor || el.contains(editor))).toBe(true);
    });

    it('an inflated first measurement is corrected by the resize — without any input', () => {
        // Scripted: the connect-time read happens with the scripted 320 (a placeholder
        // wrapped in a 0 px box); once the box has its width the editor reports 24.
        const { input, editor } = mount([320, 24]);
        // The inflated read: what the connect-time / next-frame measurement did in a box
        // with no width. Capped at max-height (200) — the ~200 px box of the screenshot.
        (input as unknown as { _adjustHeight(): void })._adjustHeight();
        expect(editor.style.height).toBe('200px');
        // The box gets its width; the observer fires; the editor reads its true height.
        expect(resizeCallback).not.toBeNull();
        resizeCallback!([{ target: editor }]);
        expect(editor.style.height).toBe('24px');
    });

    it('the placeholder never wraps — a wrapped placeholder is what inflated the measurement', () => {
        const css = readAparteStylesheet();
        const rule = css.match(/aparte-composer-input \.aparte-ci-editor:empty::before \{[^}]*\}/)?.[0] ?? '';
        expect(rule).toMatch(/white-space:\s*nowrap/);
        expect(rule).toMatch(/overflow:\s*hidden/);
    });

    it('stops observing when disconnected', () => {
        const { input } = mount([24]);
        const disconnect = vi.spyOn(CapturingResizeObserver.prototype, 'disconnect');
        input.remove();
        expect(disconnect).toHaveBeenCalled();
    });
});
