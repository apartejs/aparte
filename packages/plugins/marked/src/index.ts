import { aparteGlobalConfig , type AparteConfig} from '@aparte/core';
import { Marked, marked, type MarkedExtension } from 'marked';
import { markedMath } from './math.js';

/**
 * Options for the marked providers: marked's own (a renderer, `gfm`/`breaks`, hooks),
 * and whether maths is recognised.
 */
export interface MarkedProviderOptions extends MarkedExtension {
    /**
     * Recognise maths — `$…$`, `$$…$$`, `\(…\)`, `\[…\]` — and hand it to the `math`
     * renderer (`@aparte/plugin-katex`) instead of reading it as Markdown. By default it
     * is on exactly when a `math` renderer is registered on the config, so installing
     * one is enough; `true` or `false` forces it.
     */
    math?: boolean;
}

/**
 * The parsers a provider picks from on each render: plain Markdown, and Markdown that
 * recognises maths — made on first use, so a chat without maths never builds it.
 * (`/streaming` keeps a copy of this with a third parser, for the block still arriving.)
 *
 * With no options there is nothing to scope, so plain Markdown is the shared `marked`
 * singleton — one parser instead of one per chat. Options go to a PRIVATE instance,
 * not `marked.use()`: `marked` is module-level and `use()` mutates it cumulatively
 * with no undo, so a second chat set up with other options would have changed the first
 * chat's rendering.
 */
function markedParsers(options: MarkedProviderOptions | undefined, config: AparteConfig) {
    const { math, ...extension } = options ?? {};
    const scoped = options !== undefined && (math === undefined || Object.keys(extension).length > 0);
    const plain = scoped ? new Marked(extension) : marked;
    let withMath: Marked | undefined;
    return {
        /** Whether maths is recognised right now — a renderer may be registered later. */
        mathOn: (): boolean => math ?? config.hasCodeLanguageRenderer('math'),
        plain,
        finished: (): Marked => (withMath ??= new Marked(extension, markedMath())),
    };
}

/**
 * Register [marked](https://marked.js.org) as aparté's one-shot Markdown
 * provider — the renderer used for finished / re-rendered message bubbles.
 * (For token-by-token incremental rendering, add `@aparte/plugin-streaming-markdown`.)
 *
 * Maths is recognised as soon as a `math` renderer is registered
 * (`@aparte/plugin-katex`); see {@link MarkedProviderOptions.math}.
 *
 * Call once at application startup.
 *
 * @param options Optional marked extension(s) — custom renderer, `gfm`/`breaks`
 *   flags, hooks, etc. — applied to a private marked instance; and `math`.
 *
 * @example
 * import { setupMarkedProvider } from '@aparte/plugin-marked';
 * setupMarkedProvider({ gfm: true, breaks: true });
 */
export function setupMarkedProvider(options?: MarkedProviderOptions, config: AparteConfig = aparteGlobalConfig): void {
    const parsers = markedParsers(options, config);
    // aparté's markdown provider is synchronous `(raw) => string`; `async: false`
    // makes marked return a string rather than a Promise.
    config.setMarkdownProvider((raw) =>
        (parsers.mathOn() ? parsers.finished() : parsers.plain).parse(raw, { async: false }) as string);
}
