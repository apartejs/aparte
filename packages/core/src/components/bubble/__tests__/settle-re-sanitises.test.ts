// @vitest-environment jsdom
/**
 * The settle pass on the simple-content path — the safety net that never ran.
 *
 * `writeStreamedMarkdown` documents two states: while streaming it feeds an
 * incremental provider that writes DOM DIRECTLY (bypassing `sanitizeHtml`), and on
 * the settling update it flushes that provider and re-renders once through the
 * one-shot provider, whose output IS sanitised. The second half is the whole
 * reason the first is acceptable.
 *
 * It never happened here. `_updateStreaming(false)` toggled `data-streaming`,
 * `aria-busy` and a class and re-highlighted — it never called `_updateContent()`,
 * and the live end-of-turn call is `updateMessage({ status: 'completed' })` with no
 * `content` key at all (`aparte-chat-viewport.completeMessage`, and every terminal
 * call in `AparteClient`). So whatever the streaming provider wrote stayed on the
 * page for good.
 *
 * The provider here is a stand-in for `@aparte/plugin-streaming-markdown` — core
 * cannot import a plugin — but it writes what that plugin wrote before its own fix:
 * a fence's info string, verbatim, as the `<code>` element's class. Everything else
 * is the real bubble, the real `writeStreamedMarkdown` and the real sanitizer.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';

interface BubbleEl extends HTMLElement {
    setContent(content: string): void;
    updateMessage(updates: Record<string, unknown>): void;
}

function mount(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    return el;
}

/** A fence, as a streaming renderer that trusts the info string writes it. */
function installUnfilteredStreamingProvider(): void {
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const flush = (): void => {
            const info = /^```([^\n]*)\n?([\s\S]*)$/.exec(buffer);
            if (!info) return;
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.setAttribute('class', info[1]!);        // the raw info string — the hole
            code.textContent = (info[2] ?? '').replace(/```\s*$/, '');
            pre.appendChild(code);
            target.replaceChildren(pre);
        };
        return {
            write: (chunk: string): void => { buffer += chunk; flush(); },
            end: (): void => { flush(); },
        };
    });
}

/** A `marked`-shaped one-shot provider: a fence becomes `language-<info>`. */
function installOneShotMarkdownProvider(): void {
    aparteGlobalConfig.setMarkdownProvider((raw: string) => {
        const m = /^```([^\n]*)\n?([\s\S]*?)```?\s*$/.exec(raw);
        if (!m) return raw;
        return `<pre><code class="language-${m[1]}">${m[2]}</code></pre>`;
    });
}

const codeClasses = (el: HTMLElement): string[] =>
    Array.from(el.querySelector('code')?.classList ?? []);

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('a settled message is what the sanitizer produced', () => {
    it('re-renders the simple content when the status turns completed', () => {
        installUnfilteredStreamingProvider();
        installOneShotMarkdownProvider();
        const el = mount();

        // The turn, exactly as the viewport drives it: content while streaming…
        el.updateMessage({ status: 'streaming' });
        el.updateMessage({ content: '```aparte-sidebar__scrim aparte-btn\nApprove\n```' });
        expect(codeClasses(el)).toContain('aparte-sidebar__scrim');   // the streamed DOM, unfiltered

        // …then the terminal call, which carries no content of its own.
        el.updateMessage({ status: 'completed' });

        expect(codeClasses(el).some((c) => /^aparte-/i.test(c))).toBe(false);
        expect(codeClasses(el)).toEqual(['language-aparte-sidebar__scrim']);
    });

    it('re-renders even when content and status arrive in one call, content first', () => {
        // `updateMessage` applies `content` before `status`, so the render that
        // matters still happens while `_streaming` is true. The settle has to redo it.
        installUnfilteredStreamingProvider();
        installOneShotMarkdownProvider();
        const el = mount();
        el.updateMessage({ status: 'streaming' });
        el.updateMessage({ content: '```aparte-btn--solid\nApprove\n```', status: 'completed' });

        expect(codeClasses(el).some((c) => /^aparte-/i.test(c))).toBe(false);
    });

    it('leaves a bubble that never streamed alone', () => {
        installOneShotMarkdownProvider();
        const el = mount();
        el.updateMessage({ content: '```ts\nok\n```', status: 'completed' });
        expect(codeClasses(el)).toEqual(['language-ts']);
    });
});
