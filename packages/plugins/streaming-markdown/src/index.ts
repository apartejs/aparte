import { aparteGlobalConfig, isSafeUrl , type AparteConfig} from '@aparte/core';
import { parser, parser_write, parser_end, default_renderer, HREF, SRC } from 'streaming-markdown';

/*
 * The external-link rule, copied — deliberately and minimally — from its OWNER,
 * core's `config/sanitize.ts`. Core exports `isSafeUrl` (used above) but not this
 * pair, and the streaming path needs the same answer live: the one-shot
 * re-sanitisation at settle sends a model's external link to its own tab, so
 * without this every streamed link is a bare, clickable, frame-navigating anchor
 * for the whole length of the reply. If core ever exports the predicate, this
 * goes and the import comes back.
 *
 * `//host` and a value written with leading whitespace resolve off-site just the
 * same, which is why the value is normalised before the test — the same
 * normalisation the accept path (`isSafeUrl`) applies. So do two spellings a
 * reader does not expect: a BACKSLASH is a slash to a URL parser on a special
 * scheme, and a SINGLE slash after an explicit scheme differing from the page's
 * enters authority state. Measured with Node's WHATWG URL against base
 * `https://site.example/chat/`: `/\evil.example` → `https://evil.example/`,
 * `http:/evil.example` and `http:/\evil.example` → `http://evil.example/`.
 */
const EXTERNAL_URL = /^(?:https?:)?[/\\]{2}|^https?:[/\\]/i;
// eslint-disable-next-line no-control-regex -- stripping C0 control chars is intentional (anti-obfuscation)
const CONTROL_WS = /[\u0000-\u0020]+/g;

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
 * bypasses the one-shot `aparteGlobalConfig.sanitizeHtml`. To keep the same URL policy
 * live (an attacker-controlled `[x](javascript:…)` streamed token would produce
 * a clickable `javascript:` link before the final re-render sanitises it), the
 * renderer's `set_attr` is wrapped to drop any `href`/`src` whose scheme fails
 * {@link isSafeUrl}, and to send an external `href` to its own tab
 * (`target="_blank" rel="noopener noreferrer"`) as the one-shot path does — a
 * link is clickable from the moment it streams in, and a bare anchor navigates
 * the frame the chat lives in. The one-shot re-render at `end()` remains the
 * full-fidelity re-sanitisation.
 *
 * Call once at application startup.
 */
export function setupStreamingMarkdownProvider(config: AparteConfig = aparteGlobalConfig): void {
    config.setStreamingMarkdownProvider((target: HTMLElement) => {
        const renderer = default_renderer(target);
        const originalSetAttr = renderer.set_attr;
        renderer.set_attr = (data, type, value) => {
            if (type === HREF && !isSafeUrl(value, 'a')) return;
            if (type === SRC && !isSafeUrl(value, 'img')) return;
            originalSetAttr(data, type, value);
            if (type === HREF && EXTERNAL_URL.test(value.replace(CONTROL_WS, ''))) {
                const node = data.nodes[data.index];
                if (node && node.tagName === 'A') {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer');
                }
            }
        };
        const p = parser(renderer);
        return {
            write: (chunk: string): void => { parser_write(p, chunk); },
            end: (): void => { parser_end(p); },
        };
    });
}
