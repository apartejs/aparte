import { aparteGlobalConfig, type AparteConfig, type AparteStreamingMarkdownRenderer } from '@aparte/core';
import { Marked, marked, type MarkedExtension } from 'marked';
import remend from 'remend';

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

/** The block being written, completed so that marked reads it as it will end. */
function heal(raw: string): string {
    return remend(raw.replace(BARE_OPENER, '$1'));
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

function createRenderer(target: HTMLElement, parser: Marked, config: AparteConfig): AparteStreamingMarkdownRenderer {
    let source = '';
    let drawn: DrawnBlock[] = [];

    const draw = (healLast: boolean): void => {
        const blocks = parser.lexer(source);
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
            const html = parser.parse(healed ? heal(raw) : raw, { async: false }) as string;
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
 * @param options Optional marked extension(s), as for `setupMarkedProvider`: applied
 *   to a private marked instance, to the streaming and the finished render alike.
 * @param config The config to register on. Defaults to the global one.
 *
 * @example
 * import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';
 * setupMarkedStreamingProvider({ gfm: true });
 */
export function setupMarkedStreamingProvider(options?: MarkedExtension, config: AparteConfig = aparteGlobalConfig): void {
    // Private instance when options are given, for the reason `setupMarkedProvider` gives.
    const parser = options ? new Marked(options) : marked;
    config.setMarkdownProvider((raw) => parser.parse(raw, { async: false }) as string);
    config.setStreamingMarkdownProvider((target) => createRenderer(target, parser as Marked, config));
}
