/**
 * The artifact card: the inline Code/Preview panel a streamed artifact renders as.
 *
 * One thing, at length — and it used to be twice this size, half of it a `getStyles()`
 * block, which is why it kept `segment-renderers.ts` at 1900 lines while that file's own
 * banners described it as a renderer registry plus nine small renderers. It is that now,
 * and the CSS has since gone to `styles/segment/artifact.css` with every other built-in's.
 *
 * The card owns the previewable path. When a segment's kind is binary (pdf/xlsx/docx)
 * it DELEGATES to `./binary-file.ts` — which is why `BINARY_FILE_KINDS` lives
 * here despite the name: the card is what consults it to decide to hand over. A
 * call-site census settled that; grouping it as "shared" was the first draft's mistake.
 *
 * The preview frame is deliberately not built at render time. It is mounted only when
 * the user presses Preview (`mountPreviewFrame`), because a previewable artifact is
 * model-authored code and mounting it unasked executes it — ratified decision #8
 * applied to a tier-(c) affordance. The document it mounts comes from
 * `./preview-document.ts`, or from the consumer's own builder.
 */
import { escapeHtml, escapeAttr } from '../../../utils/escape.js';
import { contextConfig } from '../../../config/index.js';
import type { AparteArtifactSegment, AparteSegmentRenderer } from '../../../types/index.js';
import { deriveArtifactKind } from '../../../parsers/aparte-stream-parser.js';
import { stripCodeFences, labelForKind } from './shared.js';
import { streamHighlight } from '../../highlight-stream.js';
import { PREVIEW_CSP, buildSafePreviewDocument } from './preview-document.js';
import {
    renderBinaryFileArtifact,
    setupBinaryFileArtifact,
    updateBinaryFileArtifact,
} from './binary-file.js';


const PREVIEWABLE_KINDS: ReadonlySet<string> = new Set(['react', 'html', 'svg', 'js', 'css']);

/** Binary file kinds — output of orchestrator's sandbox path. They are
 *  code-only here (downloaded by FileGenService listener side-channel). */
const BINARY_FILE_KINDS: ReadonlySet<string> = new Set(['pdf', 'xlsx', 'docx']);

export const artifactRenderer: AparteSegmentRenderer<AparteArtifactSegment> = {
    type: 'artifact',
    render: (segment: AparteArtifactSegment) => {
        const kind = (segment.artifactType || 'unknown').toLowerCase();
        // Binary file kinds (xlsx/pdf/docx) follow a separate UX track : the
        // generated JS is implementation noise the user doesn't care about,
        // so we hide it. Streaming → terminal-like progress, then
        // `aparte-file-gen-ready` swaps to a file card with download + preview.
        if (BINARY_FILE_KINDS.has(kind)) {
            return renderBinaryFileArtifact(segment, kind);
        }
        const title = segment.title?.trim() || labelForKind(kind);
        const displayLang = languageForKind(kind);
        const isStreaming = !!segment.isStreaming;
        const previewable = PREVIEWABLE_KINDS.has(kind);
        // `t()`, not `getLocale().x ?? 'X'`: `t()` already falls back to
        // APARTE_DEFAULT_LOCALE, so the English lives in ONE place instead of being
        // re-typed at each call site — and `setLocale()` REPLACES rather than merges,
        // which makes a partial locale the normal case rather than an edge one.
        // `download` is title AND aria-label: they disagreed on the button next door,
        // whose title went through `t('copy')` while its aria-label said "Copy" in
        // every language.
        const cfg = contextConfig();
        const downloadLabel = cfg.t('download');
        const previewLabel = cfg.t('preview');
        const codeLabel = cfg.t('code');
        const isBinary = BINARY_FILE_KINDS.has(kind);
        const cleanContent = stripCodeFences(segment.content || '');
        /*
         * Ids, so the tabs can POINT at their panels.
         *
         * The card announced `role="tablist"` with `role="tab"` buttons and shipped none
         * of the pattern's obligations: no `aria-controls`, no `role="tabpanel"`, no ids
         * and no arrow keys. A role is a promise about behaviour — declaring tablist and
         * then behaving like two ordinary buttons tells a screen-reader user to expect a
         * relationship and a keyboard model that are not there, which is worse than the
         * plain buttons it actually was.
         *
         * Scoped to the segment id because a transcript holds many cards, and duplicate
         * ids would make `aria-controls` point at whichever one parsed first.
         *
         * Escaped HERE rather than inside an id-building helper: `check:attr-escaping`
         * follows a local produced by an escaper and cannot see through a function, and
         * teaching it to trust the helper's NAME is precisely the hole that guard was
         * just tightened to close.
         */
        const cardId = escapeAttr(segment.id);
        // The card ALWAYS opens on the code tab, and the preview frame is not built
        // here at all — it is mounted only when the user presses Preview
        // (`mountPreviewFrame`, called from the tab handler).
        //
        // It used to open on Preview for any artifact that was not streaming, i.e.
        // every render of a completed one — so reloading a persisted conversation
        // executed the model's JS with no gesture. Defaulting the tab is not enough
        // on its own either: a `display:none` iframe still loads and still runs
        // scripts, so the frame has to be ABSENT, not hidden.
        //
        // Ratified decision #8, applied to a tier-(c) affordance: content the app
        // did not produce does not get to act on its own.

        return `
            <div class="aparte-segment aparte-card aparte-segment-artifact-card"
                 data-segment-id="${escapeHtml(segment.id)}"
                 data-artifact-type="${escapeHtml(kind)}"
                 data-streaming="${isStreaming ? 'true' : 'false'}"
                 data-tab="code"
                 data-previewable="${previewable ? 'true' : 'false'}"
                 data-binary="${isBinary ? 'true' : 'false'}">
                <header class="aparte-art-card__header">
                    <div class="aparte-art-card__title-block">
                        <span class="aparte-badge aparte-badge--outline aparte-art-card__kind" data-kind="${escapeHtml(kind)}">${escapeHtml(displayLang)}</span>
                        <span class="aparte-art-card__title">${escapeHtml(title)}</span>
                        ${isStreaming ? '<span class="aparte-dot aparte-art-card__pulse" aria-label="Streaming"></span>' : ''}
                    </div>
                    <div class="aparte-art-card__actions">
                        <button type="button" class="aparte-btn aparte-btn--icon aparte-art-card__btn" data-action="copy" title="${escapeAttr(contextConfig().t('copy'))}" aria-label="${escapeAttr(contextConfig().t('copy'))}">
                            ${contextConfig().getIcon('copy')}
                        </button>
                        <button type="button" class="aparte-btn aparte-btn--icon aparte-art-card__btn" data-action="download" title="${escapeAttr(downloadLabel)}" aria-label="${escapeAttr(downloadLabel)}" ${isStreaming ? 'disabled' : ''}>
                            ${contextConfig().getIcon('download')}
                        </button>
                    </div>
                </header>
                <nav class="aparte-tabs aparte-tabs--underline aparte-art-card__tabs" role="tablist">
                    <button type="button" class="aparte-tabs__tab" role="tab" id="aparte-art-${cardId}-tab-code" aria-controls="aparte-art-${cardId}-pane-code" aria-selected="true" tabindex="0" data-tab-target="code">${escapeHtml(codeLabel)}</button>
                    ${previewable ? `<button type="button" class="aparte-tabs__tab" role="tab" id="aparte-art-${cardId}-tab-preview" aria-controls="aparte-art-${cardId}-pane-preview" aria-selected="false" tabindex="-1" data-tab-target="preview" ${isStreaming ? 'disabled' : ''}>${escapeHtml(previewLabel)}</button>` : ''}
                </nav>
                <div class="aparte-art-card__body">
                    <div class="aparte-art-card__pane" role="tabpanel" id="aparte-art-${cardId}-pane-code" aria-labelledby="aparte-art-${cardId}-tab-code" tabindex="0" data-pane="code">
                        <div class="aparte-code-content-wrapper">
                            <pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>
                        </div>
                    </div>
                    ${previewable ? `
                        <div class="aparte-art-card__pane" role="tabpanel" id="aparte-art-${cardId}-pane-preview" aria-labelledby="aparte-art-${cardId}-tab-preview" tabindex="0" data-pane="preview">
                            <div class="aparte-art-card__pending">${escapeHtml(cfg.t('previewPending'))}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    /**
     * Every string this card shows: the copy button's tooltip, glyph and accessible
     * name, the download button's title and label, and the two tab names. They were
     * all hardcoded literals until they got locale keys — including the copy button's
     * `aria-label`, which said "Copy" while its own `title` one attribute away already
     * went through `t('copy')`, so a French reader got a French tooltip and an English
     * announcement.
     *
     * Nothing here touches the tab state or the preview pane: a mounted iframe is
     * running model-authored code, and re-rendering this card is exactly what the
     * hook exists to avoid.
     */
    relabel: (element: HTMLElement) => {
        const cfg = contextConfig();
        const copyBtn = element.querySelector('.aparte-art-card__btn[data-action="copy"]');
        if (copyBtn) {
            copyBtn.setAttribute('title', cfg.t('copy'));
            copyBtn.setAttribute('aria-label', cfg.t('copy'));
            copyBtn.innerHTML = cfg.getIcon('copy');
        }
        const dl = element.querySelector('.aparte-art-card__btn[data-action="download"]');
        if (dl) {
            const label = cfg.t('download');
            dl.setAttribute('title', label);
            dl.setAttribute('aria-label', label);
        }
        // Text only, and never `aria-selected` or `data-tab`: which pane is open is
        // the reader's state, not the locale's. A relabel that touched it would close
        // a preview somebody had opened.
        const previewTab = element.querySelector('[data-tab-target="preview"]');
        if (previewTab) previewTab.textContent = cfg.t('preview');
        const codeTab = element.querySelector('[data-tab-target="code"]');
        if (codeTab) codeTab.textContent = cfg.t('code');
    },
    setup: (element: HTMLElement, segment: AparteArtifactSegment) => {
        latestSegment.set(element, segment);
        const kind = (segment.artifactType || '').toLowerCase();
        if (BINARY_FILE_KINDS.has(kind)) {
            setupBinaryFileArtifact(element, segment, kind);
            return;
        }
        // Async highlight on the code pane
        const wrapper = element.querySelector('.aparte-code-content-wrapper');
        if (wrapper) {
            const displayLang = languageForKind(kind);
            const cleanContent = stripCodeFences(segment.content || '');
            void contextConfig().highlightCode(cleanContent, displayLang).then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }

        /*
         * Tab switching — and, for Preview, the one place the frame is created.
         *
         * A `tablist` is a SINGLE tab stop with arrow keys inside it, not N tab stops.
         * This shipped as two ordinary buttons under a tablist role: Tab landed on each
         * in turn and the arrows did nothing, so the role promised a keyboard model the
         * card did not have. The roving `tabindex` and the arrow handling below are that
         * model; `aria-controls` / `role="tabpanel"` in the markup are the other half.
         */
        const tabs = [...element.querySelectorAll<HTMLButtonElement>('[data-tab-target]')];
        const select = (btn: HTMLButtonElement, focus: boolean): void => {
            const target = btn.getAttribute('data-tab-target');
            if (!target || btn.disabled) return;
            if (target === 'preview') mountPreviewFrame(element, segment);
            element.setAttribute('data-tab', target);
            for (const b of tabs) {
                const on = b === btn;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
            }
            if (focus) btn.focus();
        };
        for (const [i, btn] of tabs.entries()) {
            btn.addEventListener('click', () => select(btn, false));
            btn.addEventListener('keydown', (e) => {
                // Home/End as well as the arrows: both are in the pattern, and on a
                // two-tab list they are the fastest way to the one you are not on.
                const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                let next = -1;
                if (step) next = (i + step + tabs.length) % tabs.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = tabs.length - 1;
                if (next < 0) return;
                e.preventDefault();
                // Skip a disabled tab rather than trapping focus on it: Preview is
                // disabled while the artifact still streams.
                for (let n = 0; n < tabs.length; n++) {
                    const candidate = tabs[(next + n * (step || 1) + tabs.length) % tabs.length];
                    if (candidate && !candidate.disabled) { select(candidate, true); return; }
                }
            });
        }

        // Copy
        const copyBtn = element.querySelector<HTMLButtonElement>('[data-action="copy"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — resolve from the element.
                const code = stripCodeFences(segment.content || '');
                void navigator.clipboard.writeText(code).catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = original;
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }

        // Download — emits aparte-artifact-redownload for the host app to handle
        // (binary kinds are handled by FileGenService side-channel; for
        // previewable/text kinds we trigger a download from raw content).
        const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                if (dlBtn.disabled) return;
                const kind = (segment.artifactType || '').toLowerCase();
                const isBinary = BINARY_FILE_KINDS.has(kind);
                if (isBinary) {
                    // Re-dispatch the artifact-ready event so FileGenService
                    // re-runs the sandbox and downloads the file.
                    element.dispatchEvent(new CustomEvent('aparte-artifact-redownload', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            segmentId: segment.id,
                            mimeType: segment.mimeType,
                            artifactType: segment.artifactType,
                            title: segment.title,
                            content: stripCodeFences(segment.content || ''),
                        },
                    }));
                    return;
                }
                downloadTextArtifact(segment);
            });
        }
    },
    update: (element: HTMLElement, segment: AparteArtifactSegment) => {
        // Keep the click handler's view of the artifact current, and throw away a
        // frame that is now showing stale content so the next press rebuilds it.
        const previous = latestSegment.get(element);
        latestSegment.set(element, segment);
        if (previous && previous.content !== segment.content) {
            element.querySelector('.aparte-art-card__pane[data-pane="preview"] iframe')?.remove();
        }
        const isStreaming = !!segment.isStreaming;
        const kind = (segment.artifactType || '').toLowerCase();
        if (BINARY_FILE_KINDS.has(kind)) {
            updateBinaryFileArtifact(element, segment, isStreaming);
            return;
        }
        const wasStreaming = element.getAttribute('data-streaming') === 'true';
        const cleanContent = stripCodeFences(segment.content || '');

        // 1. Live-update the code pane during streaming.
        //
        // One call owns both halves — the plain tail every token and the coloured
        // prefix on a throttle. Setting `textContent` here as well is what made the
        // pane flicker: it erased the highlighter's spans on every token.
        if (isStreaming) {
            const segId = element.getAttribute('data-segment-id') ?? segment.id;
            streamHighlight(element, '.aparte-code-content-wrapper', cleanContent, languageForKind(kind), segId);
        } else {
            const codeEl = element.querySelector('.aparte-code-content-wrapper code');
            if (codeEl) {
                codeEl.textContent = cleanContent;
            } else {
                const wrapper = element.querySelector('.aparte-code-content-wrapper');
                if (wrapper) {
                    const displayLang = languageForKind(kind);
                    wrapper.innerHTML = `<pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>`;
                }
            }
        }

        // 2. On stream-completion: highlight + build preview iframe + auto-switch
        if (wasStreaming && !isStreaming) {
            element.setAttribute('data-streaming', 'false');

            // The pulse says "the model is still writing this". `render()` painted it
            // and nothing ever took it away, so a finished document kept claiming to be
            // in flight — forever, at 1.2s a cycle. Unnoticed until the artifact demo
            // actually streamed: the indicator had never been exercised.
            element.querySelector('.aparte-art-card__pulse')?.remove();

            // Re-run syntax highlight now that content is final
            const wrapper = element.querySelector('.aparte-code-content-wrapper');
            if (wrapper) {
                const displayLang = languageForKind(kind);
                void contextConfig().highlightCode(cleanContent, displayLang).then(html => {
                    wrapper.innerHTML = html;
                }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
            }

            // Enable previously-disabled buttons (download, preview tab)
            element.querySelectorAll<HTMLButtonElement>('button[disabled]').forEach(b => {
                b.disabled = false;
            });

            // Nothing to build and nothing to switch: enabling the Preview button
            // above is the whole of it. The frame is mounted by the tab handler, on
            // a real user press — see the note at `initialTab`.
        }
    },
    // CSS lives in styles/segment/ — see that folder for why a
    // built-in's rules belong there. `getStyles` stays for a CONSUMER's renderer, which
    // has no other way onto the page.
    getStyles: () => '',
};

function languageForKind(kind: string): string {
    if (kind === 'react') return 'jsx';
    if (kind === 'markdown') return 'md';
    if (kind === 'pdf' || kind === 'xlsx' || kind === 'docx') return 'js';
    return kind || 'text';
}

function downloadTextArtifact(segment: AparteArtifactSegment): void {
    const content = stripCodeFences(segment.content || '');
    const kind = (segment.artifactType || '').toLowerCase();
    const ext = ({
        react: 'jsx', html: 'html', svg: 'svg', js: 'js', css: 'css',
        json: 'json', markdown: 'md', csv: 'csv', text: 'txt',
        python: 'py', typescript: 'ts', bash: 'sh', sql: 'sql',
    } as Record<string, string>)[kind] ?? 'txt';
    const baseTitle = (segment.title ?? labelForKind(kind)).trim();
    const safeBase = slugifyForFilename(baseTitle) || 'artifact';
    const filename = `${safeBase}.${ext}`;
    const mime = segment.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugifyForFilename(text: string): string {
    const lower = text.trim().toLowerCase();
    let out = '';
    let prevDash = false;
    for (let i = 0; i < lower.length && out.length < 40; i++) {
        const ch = lower[i]!;
        const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
        if (isAlnum) { out += ch; prevDash = false; continue; }
        if (!prevDash && out.length > 0) { out += '-'; prevDash = true; }
    }
    if (out.endsWith('-')) out = out.slice(0, -1);
    return out;
}

/**
 * The LATEST segment for a mounted artifact card.
 *
 * `setup()` runs once and closes over the segment it was handed; the bubble builds a
 * fresh object on every `updateSegment`, so that closure freezes the artifact as it
 * was when it was ADDED — which for anything streamed is `content: ''`. Pressing
 * Preview then ran an empty document. Gesture-gating the frame moved the read from
 * `update()` (which always had the current segment) into a closure that did not, and
 * the test written with it never streamed, so it could not see this.
 */
const latestSegment = new WeakMap<HTMLElement, AparteArtifactSegment>();

function mountPreviewFrame(element: HTMLElement, fallback: AparteArtifactSegment): void {
    const pane = element.querySelector('.aparte-art-card__pane[data-pane="preview"]');
    if (!pane || pane.querySelector('iframe')) return;

    // The latest segment, not the one the closure captured — see `latestSegment`.
    const segment = latestSegment.get(element) ?? fallback;
    const kind = segment.artifactType || deriveArtifactKind(segment.mimeType ?? '', 'text');
    if (!PREVIEWABLE_KINDS.has(kind)) return;

    const title = segment.title?.trim() || labelForKind(kind);
    const build = contextConfig().getArtifactPreviewBuilder() ?? buildSafePreviewDocument;
    const srcdoc = build(kind, stripCodeFences(segment.content || ''), title);

    /*
     * `sandbox="allow-scripts"` and nothing else: no `allow-same-origin` (opaque
     * origin — the frame cannot read this page, its storage, or the key), no
     * `allow-forms` (it cannot POST out), no `allow-top-navigation` (it cannot move
     * the tab), no `allow-popups`.
     *
     * It CAN navigate itself, which no sandbox token and no CSP directive prevents —
     * see the note on PREVIEW_CSP. `referrerpolicy="no-referrer"` at least keeps the
     * host URL out of that request.
     */
    pane.innerHTML = `<iframe class="aparte-art-card__frame"`
        + ` sandbox="allow-scripts"`
        + ` csp="${escapeAttr(PREVIEW_CSP)}"`
        + ` referrerpolicy="no-referrer" loading="lazy"`
        + ` title="${escapeAttr(title)}" srcdoc="${escapeAttr(srcdoc)}"></iframe>`;
}
