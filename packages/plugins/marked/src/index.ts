import { AparteConfig } from '@aparte/core';
import { marked, type MarkedExtension } from 'marked';

/**
 * Register [marked](https://marked.js.org) as aparté's one-shot Markdown
 * provider — the renderer used for finished / re-rendered message bubbles.
 * (For token-by-token incremental rendering, add `@aparte/plugin-streaming-markdown`.)
 *
 * Call once at application startup.
 *
 * @param options Optional marked extension(s) — custom renderer, `gfm`/`breaks`
 *   flags, hooks, etc. Applied via `marked.use()`.
 *
 * @example
 * import { setupMarkedProvider } from '@aparte/plugin-marked';
 * setupMarkedProvider({ gfm: true, breaks: true });
 */
export function setupMarkedProvider(options?: MarkedExtension): void {
    if (options) marked.use(options);

    // aparté's markdown provider is synchronous `(raw) => string`; `async: false`
    // makes marked return a string rather than a Promise.
    AparteConfig.setMarkdownProvider((raw) => marked.parse(raw, { async: false }) as string);
}
