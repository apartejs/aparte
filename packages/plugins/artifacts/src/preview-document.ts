/**
 * The artifact preview DOCUMENT — the security boundary of the artifact card.
 *
 * A previewable artifact is model-authored code rendered in a sandboxed iframe. What
 * that iframe is allowed to reach, and how the model's body is wrapped before it gets
 * there, is decided entirely here. Until now it decided it from line 1806 of a
 * 1900-line file, next to nine unrelated renderers.
 *
 * It is also a documented public override point:
 * `contextConfig().getArtifactPreviewBuilder() ?? buildSafePreviewDocument` means a
 * consumer can replace this whole document — so `buildSafePreviewDocument` is the
 * reference implementation their replacement is measured against, and it deserves to
 * be findable.
 *
 * Everything here is pure: `(kind, body, title) => string`. No config read, no DOM,
 * no state — which is why it can be tested directly and why moving it changes nothing.
 *
 * Two things travelled deliberately and must not be separated again:
 *   • `PREVIEW_CSP` is used twice — as the iframe's `csp` attribute and as the
 *     document's own `<meta http-equiv>`. Belt and braces: the attribute is not
 *     honoured by Firefox or Safari, so the meta tag is the one that actually applies
 *     there.
 *   • `escapeClosingScriptTag` is listed by NAME in `scripts/escaping-names.mjs`, so
 *     both escaping guards keep recognising it from its new home.
 */
import { escapeHtml, escapeAttr } from '@aparte/core';

/**
 * What a previewed artifact is allowed to FETCH. Inline script and style are
 * permitted (that IS the preview); no fetch, no XHR, no websocket, no remote image,
 * no font. Without this the sandbox still lets injected code beacon out to any
 * origin, so the policy does real work — measured blocked in Chromium, Firefox and
 * WebKit.
 *
 * WHAT IT DOES NOT STOP, stated because the sentence here used to claim otherwise:
 * the frame NAVIGATING ITSELF. Assigning `location.href` is a navigation, not a
 * fetch, and no directive in this policy governs it — CSP's `navigate-to` was
 * removed from the spec and never shipped, and the parent page's `frame-src` does
 * not apply to a navigation the frame initiates. Reproduced in all three engines;
 * in Firefox and WebKit the frame then RENDERS the attacker's page inside the card,
 * which is a phishing surface as well as an exfiltration channel.
 *
 * What still holds, and is why this is serious rather than fatal: the sandbox has
 * no `allow-same-origin`, so the frame's origin is opaque — it cannot read the host
 * page, its storage, or the API key — and no `allow-forms` or
 * `allow-top-navigation`, so it can neither POST nor move the tab.
 *
 * The honest summary for a consumer: a previewed artifact cannot reach your page or
 * your data, and can phone home once. Previewing model-authored HTML is running
 * untrusted content in a box, not running nothing.
 */
export const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/**
 * The portable half of the preview containment.
 *
 * The iframe's `csp` attribute is Chromium-only, so the same policy also goes
 * INSIDE the document as a `<meta http-equiv>`, which every engine honours. Both
 * are declared; whichever the browser understands applies.
 *
 * A model-authored full document gets one too, which it previously did not.
 *
 * This used to insert the meta only after an existing `<head>` and skip the
 * document otherwise, justified as "a `<meta>` cannot be prepended without
 * breaking the doctype". That is not true — `<html>` may be followed by a `<head>`
 * we open ourselves — and it left the ONE case that needs the policy most (a
 * `<!doctype html>` document written entirely by the model, which is passed
 * through verbatim) with no `<meta>` at all. On Firefox and Safari, where the
 * `csp` attribute does nothing, that frame ran `allow-scripts` under no policy: it
 * could beacon out, and load remote script. So a `<head>` is now created when the
 * document has none.
 *
 * Containment that held regardless: `sandbox="allow-scripts"` without
 * `allow-same-origin` gives an opaque origin, so the frame never reached the host
 * DOM, storage, or the API key.
 */
function withMetaCsp(doc: string): string {  // safe-text: doc is the model-authored artifact HTML this function INJECTS a CSP into — escaping it would destroy the document it is protecting
    const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(PREVIEW_CSP)}">`;

    // FIRST, always — after the doctype when there is one, otherwise at the very
    // front. Not "after the model's `<head>`", which is what this used to do.
    //
    // A `<meta http-equiv>` policy governs only what FOLLOWS it, and the model
    // writes this document: it can put a `<script>` before its own `<head>`, or
    // before `<html>`. The parser hoists that script into an implicitly-opened
    // head, where it sits EARLIER in document order than a meta inserted after a
    // tag the model declared later — so the script ran outside the policy.
    // Reproduced end to end in Firefox, WebKit, and Chromium with the `csp`
    // attribute absent: the beacon fired. And since that attribute is
    // Chromium-only, on Firefox and Safari this meta is the frame's ONLY policy.
    //
    // Prepending is safe in every shape, which the previously-correct third branch
    // already demonstrated across all three engines: content before `<html>` is
    // hoisted into an implicit head, the model's own `<html>`/`<head>` then merge
    // into the one already open. One branch replaces three, and it is the branch
    // that was right.
    const doctype = doc.match(/^\s*<!doctype[^>]*>/i);
    const at = doctype ? doctype[0].length : 0;
    return `${doc.slice(0, at)}<head>${meta}</head>${doc.slice(at)}`;
}

export function buildSafePreviewDocument(kind: string, body: string, title: string): string {
    return withMetaCsp(buildPreviewBody(kind, body, title));
}

function buildPreviewBody(
    kind: string,
    body: string,  // safe-text: the model-authored artifact SOURCE, wrapped for a sandboxed CSP-constrained iframe — escaping it would render the code as text, which is the bug the sandbox exists to avoid
    title: string,
): string {
    switch (kind) {
        case 'html': {
            if (startsWithDoctype(body)) return body;
            return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeAttr(title)}</title></head><body>${body}</body></html>`;
        }
        // An SVG with only a `viewBox` — the recommended, responsive form, and the one
        // a model writes most often — has NO intrinsic size. As a flex item its cross
        // size then collapses to zero and the frame is blank: the preview worked for an
        // SVG that declared `width`/`height` and silently showed nothing for the
        // idiomatic one. Reported from the landing the moment its demo payload became a
        // real file instead of a hand-written chart with dimensions on it.
        //
        // The rule is narrowed by attribute selector rather than applied to every SVG,
        // so an SVG that DOES state its size keeps the size it asked for.
        case 'svg':
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:90%;max-height:90%}svg:not([width]):not([height]){width:90%;height:90%}</style>
</head><body>${body}</body></html>`;
        case 'js': {
            const safeBody = escapeClosingScriptTag(body);
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;padding:1rem;background:#fff;color:#0f172a}</style>
</head><body><div id="root"></div><script>
try { ${safeBody}
} catch (e) { document.getElementById('root').innerHTML = '<pre style="color:#b91c1c">' + (e && e.stack || e) + '</pre>'; }
</script></body></html>`;
        }
        case 'css':
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>${body}</style></head><body>
<div class="demo">
  <h1>Heading</h1>
  <p>Paragraph with a <a href="#">link</a> and <strong>strong</strong> text.</p>
  <button>Button</button>
  <input placeholder="Input"/>
  <ul><li>One</li><li>Two</li><li>Three</li></ul>
</div></body></html>`;
        default:
            // react / unknown — no live preview offline; show the code read-only.
            return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title>
<style>body{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:1rem;background:#fff;color:#0f172a}pre{white-space:pre-wrap;word-break:break-word;margin:0}</style>
</head><body><pre>${escapeHtml(body)}</pre></body></html>`;
    }
}

/** Char-based check for `<!doctype` (case-insensitive) at start of string,
 *  ignoring leading whitespace. */
function startsWithDoctype(s: string): boolean {
    let i = 0;
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
    const probe = s.slice(i, i + 9).toLowerCase();
    return probe === '<!doctype';
}

/** Escape any literal `</script` inside the body so it cannot terminate the
 *  outer <script> tag we wrap user code in. The HTML spec closes a script on
 *  `</script` followed by whitespace, `/` or `>` (not only the exact `</script>`),
 *  so match the 8-char prefix + a terminator. Char-based. */
function escapeClosingScriptTag(body: string): string {
    let out = '';
    let i = 0;
    while (i < body.length) {
        if (body[i] === '<' && body.slice(i, i + 8).toLowerCase() === '</script') {
            const next = body[i + 8];
            // A real closing tag needs a terminator after `</script` (space/tab/
            // newline/form-feed, `/`, `>`) or end-of-input.
            if (next === undefined || next === '/' || next === '>' || /\s/.test(next)) {
                out += '<\\/script'; // neutralise the `<` so the browser sees no tag
                i += 8;
                continue;
            }
        }
        out += body[i];
        i++;
    }
    return out;
}
