import { aparteGlobalConfig, type AparteConfig, type AparteStreamingMarkdownRenderer } from '@aparte/core';
import { Marked, marked } from 'marked';
import remend from 'remend';
import { markedMath } from './math.js';
import { maskMath } from './scan.js';
import type { MarkedProviderOptions } from './index.js';

export type { MarkedProviderOptions } from './index.js';

/*
 * What remend writes where a link or an image has no destination yet. Not a URL
 * anyone can follow: a pending link loses its `href`, so it reads as a link from its
 * first character without going anywhere, and a pending image is left out, since
 * there is nothing to show until its URL is complete.
 */
const PENDING = 'streamdown:';

/*
 * A marker that opens and has nothing after it yet — `I am a **`. remend completes
 * `**scr` but has nothing to complete here, so the marker would show as typed until
 * the next chunk. After a space it can only open (a closer follows a character, not
 * a space), so holding it back never hides one that closes.
 */
const BARE_OPENER = /(^|[ \t])[*_~`]+$/;

/**
 * The block being written, completed so that marked reads it as it will end.
 *
 * With maths on, the formulas are hidden from remend first: it reads TeX as Markdown,
 * so it "completed" `\[ a+b` into a link and the `_` of `x_1` into emphasis. A formula
 * still open is the parser's to handle, as one arriving.
 */
function heal(raw: string, math: boolean): string {
    const text = raw.replace(BARE_OPENER, '$1');
    if (!math) return remend(text);
    const { masked, unmask } = maskMath(text);
    // A single `$` still open may be a formula on its way (`$[a, b]` of an interval):
    // completing its bracket into a link would draw a link that becomes maths a token later.
    return unmask(remend(masked, { katex: false }));
}

/** One top-level Markdown block as it was last drawn. */
interface DrawnBlock {
    /** The block's source, which is what decides whether it has to be drawn again. */
    raw: string;
    /** Whether it was drawn completed by remend, as the block still being written is. */
    healed: boolean;
    /** The nodes it put in the target, in order. */
    nodes: ChildNode[];
}

function blockNodes(html: string, healed: boolean, config: AparteConfig): ChildNode[] {
    const template = document.createElement('template');
    template.innerHTML = html;
    if (healed) {
        for (const a of template.content.querySelectorAll(`a[href^="${PENDING}"]`)) a.removeAttribute('href');
        for (const img of template.content.querySelectorAll(`img[src^="${PENDING}"]`)) img.remove();
    }
    // Model-authored, like everything a Markdown provider returns: the config's own
    // sanitizer runs before any of it reaches the page, external links included.
    template.innerHTML = config.sanitizeHtml(template.innerHTML);
    return Array.from(template.content.childNodes);
}

/** The parsers one streamed reply uses: one for the blocks it has finished, one for the block it is writing. */
interface ReplyParsers {
    finished: Marked;
    arriving: Marked;
    math: boolean;
}

function createRenderer(target: HTMLElement, parsers: ReplyParsers, config: AparteConfig): AparteStreamingMarkdownRenderer {
    let source = '';
    let drawn: DrawnBlock[] = [];

    const draw = (healLast: boolean): void => {
        // The arriving parser splits the blocks: it reads an unclosed `$$` as one block
        // running to the end, as an unclosed fence is.
        const blocks = (healLast ? parsers.arriving : parsers.finished).lexer(source);
        // The first block whose source moved; everything before it keeps its DOM.
        let from = 0;
        while (from < blocks.length && from < drawn.length) {
            const healed = healLast && from === blocks.length - 1;
            const old = drawn[from]!;
            if (old.raw !== blocks[from]!.raw || old.healed !== healed) break;
            from++;
        }
        for (const old of drawn.slice(from)) for (const node of old.nodes) node.remove();
        const next = drawn.slice(0, from);
        for (let i = from; i < blocks.length; i++) {
            const raw = blocks[i]!.raw;
            const healed = healLast && i === blocks.length - 1;
            const html = healed
                ? parsers.arriving.parse(heal(raw, parsers.math), { async: false }) as string
                : parsers.finished.parse(raw, { async: false }) as string;
            const nodes = blockNodes(html, healed, config);
            target.append(...nodes);
            next.push({ raw, healed, nodes });
        }
        drawn = next;
    };

    return {
        write(chunk: string): void {
            source += chunk;
            draw(true);
        },
        end(): void {
            draw(false);
        },
    };
}

/**
 * Register [marked](https://marked.js.org) as aparté's Markdown renderer for a reply
 * WHILE it streams and once it is finished — one parser on both sides, so a reply
 * looks the same at its last chunk as when it settles.
 *
 * While a reply streams, the block being written is completed by Vercel's
 * [`remend`](https://www.npmjs.com/package/remend) before marked parses it:
 * `**bold` shows bold before its closing `**` arrives, and a link shows as a link
 * from its first character, clickable once its URL is complete. Blocks already
 * written are not drawn again, so a selection in them survives the stream. Every
 * block goes through the config's sanitizer before it reaches the page.
 *
 * It takes both of aparté's Markdown seams — `setMarkdownProvider` and
 * `setStreamingMarkdownProvider` — so it replaces `setupMarkedProvider` and
 * `@aparte/plugin-streaming-markdown` rather than going beside them.
 *
 * Call once at application startup.
 *
 * Maths is recognised as soon as a `math` renderer is registered (`@aparte/plugin-katex`),
 * and a formula is drawn while it arrives: the parser reads an unclosed `$$`, `\[` or
 * `\(` in the block being written as a formula still arriving. A single `$` is read
 * only once it closes — until then it could be a price.
 *
 * @param options Optional marked extension(s), as for `setupMarkedProvider`: applied
 *   to a private marked instance, to the streaming and the finished render alike; and `math`.
 * @param config The config to register on. Defaults to the global one.
 *
 * @example
 * import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';
 * setupMarkedStreamingProvider({ gfm: true });
 */
export function setupMarkedStreamingProvider(options?: MarkedProviderOptions, config: AparteConfig = aparteGlobalConfig): void {
    // A private instance when options are given, for the reason `setupMarkedProvider`
    // gives; the parsers that recognise maths are made on first use.
    const { math, ...extension } = options ?? {};
    const scoped = options !== undefined && (math === undefined || Object.keys(extension).length > 0);
    const plain = scoped ? new Marked(extension) : marked;
    let finished: Marked | undefined;
    let arriving: Marked | undefined;
    const mathOn = (): boolean => math ?? config.hasCodeLanguageRenderer('math');
    const withMath = (): Marked => (finished ??= new Marked(extension, markedMath()));
    const arrivingMath = (): Marked => (arriving ??= new Marked(extension, markedMath({ live: true })));

    config.setMarkdownProvider((raw) => (mathOn() ? withMath() : plain).parse(raw, { async: false }) as string);
    // Decided once per reply, so a renderer registered mid-stream does not switch the
    // parser under blocks already drawn; the settle draws the reply again anyway.
    config.setStreamingMarkdownProvider((target) => {
        const on = mathOn();
        return createRenderer(target, on
            ? { finished: withMath(), arriving: arrivingMath(), math: true }
            : { finished: plain as Marked, arriving: plain as Marked, math: false }, config);
    });
}
