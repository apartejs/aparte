// @vitest-environment jsdom
/**
 * Colour that survives the next token.
 *
 * Reported from the screen: the artifact's code pane flickered between plain white
 * and syntax colours on a dark theme. The debounce was innocent — every token did
 * `codeEl.textContent = content`, which destroys the highlighter's `<span>`s, so a
 * token erased whatever the last debounce had painted. Plain most of the time, one
 * coloured frame every 400ms.
 *
 * The `code` segment had the mirror-image bug: no colour at all until stream-end.
 * One helper now serves both, and these tests pin the two properties that make it
 * work — the coloured prefix is not rewritten by a token, and the line still being
 * written is never coloured (highlighting a half-open string re-tokenises the rest).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamHighlight } from '../highlight-stream.js';
import { aparteGlobalConfig } from '../../config/index.js';

/** Stand-in for Shiki: wraps the whole source in one identifiable span. */
function fakeHighlighter(calls: string[]) {
    return (code: string) => {
        calls.push(code);
        return `<pre class="shiki"><code><span class="tok">${code}</span></code></pre>`;
    };
}

let host: HTMLElement;
let calls: string[];

/** The pane the renderers hand the helper: a plain block, as first rendered. */
function mount(): void {
    host = document.createElement('div');
    host.innerHTML = '<div class="pane"><pre><code class="language-ts"></code></pre></div>';
    document.body.appendChild(host);
}

/** Two microtask turns: the provider resolves, then the `.then` writes the DOM. */
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
    calls = [];
    aparteGlobalConfig.setHighlightProvider(fakeHighlighter(calls));
    vi.useFakeTimers();
    mount();
});
afterEach(() => {
    vi.useRealTimers();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const tail = () => host.querySelector('[data-aparte-tail]');
const coloured = () => host.querySelectorAll('.tok').length;

describe('streamHighlight', () => {
    it('keeps the colours when the next token arrives — the flicker', async () => {
        // A complete line, so the prefix can advance.
        streamHighlight(host, '.pane', 'const a = 1;\n', 'ts', 'flicker');
        await settle();
        expect(coloured()).toBe(1);

        // The token that used to wipe it. This is the whole defect: one assignment
        // to `textContent` on the <code> element and every span was gone.
        vi.advanceTimersByTime(50);
        streamHighlight(host, '.pane', 'const a = 1;\nconst b', 'ts', 'flicker');

        expect(coloured()).toBe(1);
        expect(tail()!.textContent).toBe('const b');
    });

    it('never colours the line still being written', async () => {
        streamHighlight(host, '.pane', 'let x = "open\nlet y = 2\n', 'ts', 'partial');
        await settle();

        // Exactly the complete lines went to the provider — trailing newline included,
        // nothing after it.
        expect(calls).toEqual(['let x = "open\nlet y = 2\n']);

        vi.advanceTimersByTime(500);
        streamHighlight(host, '.pane', 'let x = "open\nlet y = 2\nlet z = "unter', 'ts', 'partial');
        await settle();

        // The half-written line is plain: colouring it would re-tokenise everything
        // after the unterminated quote, which is the second half of what looked like
        // flicker.
        expect(calls).toHaveLength(1);
        expect(tail()!.textContent).toBe('let z = "unter');
    });

    it('throttles: many tokens in one window, one highlight', async () => {
        for (let i = 1; i <= 8; i++) {
            vi.advanceTimersByTime(20);
            streamHighlight(host, '.pane', 'l1\n'.repeat(i), 'ts', 'throttle');
            await settle();
        }
        expect(calls).toHaveLength(1);

        vi.advanceTimersByTime(500);
        streamHighlight(host, '.pane', 'l1\n'.repeat(9), 'ts', 'throttle');
        await settle();
        expect(calls).toHaveLength(2);
    });

    it('will not let a slow earlier highlight rewind the pane', async () => {
        // Two in flight, resolving out of order: the FIRST carries the shorter prefix,
        // so landing it last would visibly delete text the reader already saw.
        const resolvers: Array<(html: string) => void> = [];
        aparteGlobalConfig.setHighlightProvider((code) => new Promise<string>(res => {
            resolvers.push((html) => res(html));
            calls.push(code);
        }));

        streamHighlight(host, '.pane', 'a\n', 'ts', 'ooo');
        vi.advanceTimersByTime(500);
        streamHighlight(host, '.pane', 'a\nb\nc\n', 'ts', 'ooo');
        expect(calls).toHaveLength(2);

        // Newer lands first.
        resolvers[1]!('<pre><code><span class="tok">a\nb\nc\n</span></code></pre>');
        await settle();
        expect(host.querySelector('.tok')!.textContent).toBe('a\nb\nc\n');

        // Older lands late and must be dropped.
        resolvers[0]!('<pre><code><span class="tok">a\n</span></code></pre>');
        await settle();
        expect(host.querySelector('.tok')!.textContent).toBe('a\nb\nc\n');
    });

    it('falls back to plain text before any colour exists', () => {
        // No complete line yet, so nothing is sent to the provider and the reader
        // still sees their code.
        streamHighlight(host, '.pane', 'const par', 'ts', 'plain');
        expect(calls).toHaveLength(0);
        expect(host.querySelector('code')!.textContent).toBe('const par');
    });
});
