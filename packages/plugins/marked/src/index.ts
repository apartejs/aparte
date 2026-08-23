import { aparteGlobalConfig , type AparteConfig} from '@aparte/core';
import { Marked, marked, type MarkedExtension } from 'marked';

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
export function setupMarkedProvider(options?: MarkedExtension, config: AparteConfig = aparteGlobalConfig): void {
    /*
     * A PRIVATE marked instance per call when options are given, not
     * `marked.use()`.
     *
     * `marked` is a module-level singleton and `use()` mutates it cumulatively with
     * no undo — so the `config` parameter scoped WHICH config got the provider
     * while the options went page-wide. Two chats could have marked-vs-none, but
     * never two different marked configurations, and setting up the second chat
     * retroactively changed the first chat's rendering. A test covered the provider
     * scoping and could not see that half.
     *
     * With no options there is nothing to scope, so the shared singleton is used —
     * one parser instead of one per chat.
     */
    const parser = options ? new Marked(options) : marked;

    // aparté's markdown provider is synchronous `(raw) => string`; `async: false`
    // makes marked return a string rather than a Promise.
    config.setMarkdownProvider((raw) => parser.parse(raw, { async: false }) as string);
}
