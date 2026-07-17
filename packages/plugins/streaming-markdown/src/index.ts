import { AparteConfig, isSafeUrl } from '@aparte/core';
import { parser, parser_write, parser_end, default_renderer, HREF, SRC } from 'streaming-markdown';

/**
 * Register `streaming-markdown` as aparté's incremental (streaming) Markdown
 * renderer.
 *
 * Once registered, the chat bubble feeds each streamed token chunk to a
 * persistent incremental parser that parses only the new text and APPENDS DOM
 * nodes — O(n) over the whole message, with no per-token re-parse or
 * `innerHTML` rebuild. Finished / re-rendered messages still go through the
 * one-shot `setMarkdownProvider` (e.g. `@aparte/plugin-marked`).
 *
 * Framework-agnostic — vanilla DOM, no framework imports.
 *
 * **Security**: the streaming path writes DOM nodes directly and therefore
 * bypasses the one-shot `AparteConfig.sanitizeHtml`. To keep the same URL policy
 * live (an attacker-controlled `[x](javascript:…)` streamed token would produce
 * a clickable `javascript:` link before the final re-render sanitises it), the
 * renderer's `set_attr` is wrapped to drop any `href`/`src` whose scheme fails
 * {@link isSafeUrl}. The one-shot re-render at `end()` remains the full-fidelity
 * re-sanitisation.
 *
 * Call once at application startup.
 */
export function setupStreamingMarkdownProvider(): void {
    AparteConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        const renderer = default_renderer(target);
        const originalSetAttr = renderer.set_attr;
        renderer.set_attr = (data, type, value) => {
            if (type === HREF && !isSafeUrl(value, 'a')) return;
            if (type === SRC && !isSafeUrl(value, 'img')) return;
            originalSetAttr(data, type, value);
        };
        const p = parser(renderer);
        return {
            write: (chunk: string): void => { parser_write(p, chunk); },
            end: (): void => { parser_end(p); },
        };
    });
}
