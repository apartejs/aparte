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
import { escapeHtml, escapeAttr, copyText, contextConfig, renderCodeLanguages } from '@aparte/core';
import type { AparteSegmentRenderer } from '@aparte/core';
import { ARTIFACT_SEGMENT_TYPE, type ArtifactSegment } from './segment.js';
import { deriveArtifactKind } from './kinds.js';
import { stripCodeFences, labelForKind } from './shared.js';
import { streamHighlight } from './highlight.js';
import { PREVIEW_CSP, buildSafePreviewDocument } from './preview-document.js';
import { renderOptions, type ArtifactOpenEventDetail } from './options.js';
import {
    renderBinaryFileArtifact,
    setupBinaryFileArtifact,
    updateBinaryFileArtifact,
} from './binary-file.js';
import artifactStyles from './artifact.css?raw';

/** The segment shape the card draws — exported for a consumer's own tests and renderers. */
export type AparteArtifactSegment = ArtifactSegment;

const PREVIEWABLE_KINDS: ReadonlySet<string> = new Set(['react', 'html', 'svg', 'js', 'css']);

/**
 * One id space per rendered card, monotonic — the same shape `aparte-optgroup` uses
 * for its label ids, and for the same reason: the id has to be UNIQUE on the page,
 * and nothing about the content can promise that.
 */
let cardIdSeq = 0;

/** Binary file kinds: their source is implementation noise; the app produces the file. */
const BINARY_FILE_KINDS: ReadonlySet<string> = new Set(['pdf', 'xlsx', 'docx']);

/** What each card's code pane holds, so an update that changes nothing does not rewrite it. */
const paneContent = new WeakMap<Element, string>();

/**
 * The previews a person opened, per chat config: the artifact's id AND its content, so only
 * that very document is shown again. A framework redraws a message's segments when its
 * conversation is saved (a card it does not hold as a component is drawn anew), and the new
 * card opened on Code: the preview the person had just asked for was gone. Remembered for
 * the page's lifetime only — a reload starts on Code, as the gesture rule wants — and only
 * for what a gesture already ran.
 */
const openedPreviews = new WeakMap<object, Set<string>>();

/** The document as the card shows, copies and downloads it. */
function documentOf(segment: AparteArtifactSegment): string {
    return stripCodeFences(segment.content || '', (segment.artifactType || '').toLowerCase());
}

/** The key of one artifact's preview: its id and a hash of its content (FNV-1a). */
function previewKey(segment: AparteArtifactSegment): string {
    const content = documentOf(segment);
    let h = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) h = Math.imul(h ^ content.charCodeAt(i), 0x01000193);
    return `${segment.id}\u0000${content.length}:${(h >>> 0).toString(36)}`;
}

/** Whether the Preview tab exists at all, per the app's `preview` option. */
function previewEnabled(): boolean {
    return renderOptions(contextConfig()).preview !== false;
}

/**
 * Where a card is drawn. In a reply (the default) it is the card as it always was. As the
 * body of the document panel (`./panel`) it is the same card, with two differences: no
 * Open button (it is open), and a Markdown document is shown rendered, for reading, with
 * its source one tab away.
 */
export interface ArtifactCardOptions {
    surface?: 'reply' | 'panel';
}

/** How each mounted card was asked to be drawn, for the handlers that run later. */
const cardOptions = new WeakMap<Element, ArtifactCardOptions>();

/**
 * A Markdown document read as prose: in the panel only. Rendering it runs nothing (the
 * Markdown provider's output goes through core's sanitizer), so unlike a page or a
 * component it needs no gesture, and the panel opens on it.
 */
function readsAsProse(kind: string, options: ArtifactCardOptions): boolean {
    return options.surface === 'panel' && kind === 'markdown';
}

/** The rendered Markdown of a document, in the wrapper a reply's own text wears. */
function proseMarkup(content: string): string {
    return `<div class="aparte-art-card__prose aparte-segment-text"><div class="aparte-segment-content" dir="auto">${contextConfig().renderMarkdown(content)}</div></div>`;
}

/** The card's hooks, each taking how the card is drawn. The renderer below is these with no options. */
const card = {
    render: (segment: ArtifactSegment, options: ArtifactCardOptions = {}): string => {
        const kind = (segment.artifactType || 'unknown').toLowerCase();
        // Binary file kinds (xlsx/pdf/docx) follow a separate track: the generated JS
        // is implementation noise, so the file card shows progress, then the file.
        if (BINARY_FILE_KINDS.has(kind)) {
            return renderBinaryFileArtifact(segment, kind);
        }
        const title = segment.title?.trim() || labelForKind(kind);
        const displayLang = languageForKind(kind);
        const isStreaming = !!segment.isStreaming;
        const prose = readsAsProse(kind, options);
        const previewable = prose || (PREVIEWABLE_KINDS.has(kind) && previewEnabled());
        // `t()`, not `getLocale().x ?? 'X'`: `t()` already falls back to
        // APARTE_DEFAULT_LOCALE, so the English lives in ONE place instead of being
        // re-typed at each call site — and `setLocale()` REPLACES rather than merges,
        // which makes a partial locale the normal case rather than an edge one.
        // `download` is title AND aria-label: they disagreed on the button next door,
        // whose title went through `t('copy')` while its aria-label said "Copy" in
        // every language.
        const cfg = contextConfig();
        const downloadLabel = cfg.t('download');
        const openLabel = cfg.t('openArtifact');
        const openable = renderOptions(cfg).open === true && options.surface !== 'panel';
        // Prose opens on its rendering and can be read while it is written; everything
        // else opens on Code, and its preview waits for a press (see below).
        const firstTab = prose ? 'preview' : 'code';
        const previewLocked = isStreaming && !prose;
        const previewLabel = cfg.t('preview');
        const codeLabel = cfg.t('code');
        const isBinary = BINARY_FILE_KINDS.has(kind);
        const cleanContent = documentOf(segment);
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
         * A COUNTER, not the segment's id. The segment's id is the model's — a tool-call
         * segment is `tool-${toolCallId}` straight off the wire — so two calls answering
         * to one id gave two cards the same `id` and the same `aria-controls`, and
         * `getElementById` returns whichever parsed first: exactly the collision this
         * scoping exists to prevent. An author-chosen `id` is also the DOM-clobbering
         * shape core's sanitizer refuses on model markup.
         *
         * Escaped HERE rather than inside an id-building helper: `check:attr-escaping`
         * follows a local produced by an escaper and cannot see through a function, and
         * teaching it to trust the helper's NAME is precisely the hole that guard was
         * just tightened to close. (The value is digits; the escaper is what the reader
         * and the guard are owed, since the position is what makes the rule.)
         */
        const cardId = escapeAttr(String(++cardIdSeq));
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
                 data-tab="${firstTab}"
                 data-previewable="${previewable ? 'true' : 'false'}"
                 data-binary="${isBinary ? 'true' : 'false'}">
                <header class="aparte-art-card__header">
                    <div class="aparte-art-card__title-block">
                        <span class="aparte-badge aparte-badge--outline aparte-art-card__kind" data-kind="${escapeHtml(kind)}">${escapeHtml(displayLang)}</span>
                        <span class="aparte-art-card__title">${escapeHtml(title)}</span>
                        ${isStreaming ? `<span class="aparte-dot aparte-art-card__pulse" role="img" aria-label="${escapeAttr(cfg.t('generating'))}"></span>` : ''}
                    </div>
                    <div class="aparte-art-card__actions">
                        <button type="button" class="aparte-btn aparte-btn--icon aparte-art-card__btn" data-action="copy" title="${escapeAttr(contextConfig().t('copy'))}" aria-label="${escapeAttr(contextConfig().t('copy'))}">
                            ${contextConfig().getIcon('copy')}
                        </button>
                        <button type="button" class="aparte-btn aparte-btn--icon aparte-art-card__btn" data-action="download" title="${escapeAttr(downloadLabel)}" aria-label="${escapeAttr(downloadLabel)}" ${isStreaming ? 'disabled' : ''}>
                            ${contextConfig().getIcon('download')}
                        </button>
                        ${openable ? `<button type="button" class="aparte-btn aparte-btn--icon aparte-art-card__btn" data-action="open" title="${escapeAttr(openLabel)}" aria-label="${escapeAttr(openLabel)}" ${isStreaming ? 'disabled' : ''}>${contextConfig().getIcon('expand')}</button>` : ''}
                    </div>
                </header>
                <nav class="aparte-tabs aparte-tabs--underline aparte-art-card__tabs" role="tablist">
                    <button type="button" class="aparte-tabs__tab" role="tab" id="aparte-art-${cardId}-tab-code" aria-controls="aparte-art-${cardId}-pane-code" aria-selected="${prose ? 'false' : 'true'}" tabindex="${prose ? '-1' : '0'}" data-tab-target="code">${escapeHtml(codeLabel)}</button>
                    ${previewable ? `<button type="button" class="aparte-tabs__tab" role="tab" id="aparte-art-${cardId}-tab-preview" aria-controls="aparte-art-${cardId}-pane-preview" aria-selected="${prose ? 'true' : 'false'}" tabindex="${prose ? '0' : '-1'}" data-tab-target="preview" ${previewLocked ? 'disabled' : ''}>${escapeHtml(previewLabel)}</button>` : ''}
                </nav>
                <div class="aparte-art-card__body">
                    <div class="aparte-art-card__pane" role="tabpanel" id="aparte-art-${cardId}-pane-code" aria-labelledby="aparte-art-${cardId}-tab-code" tabindex="0" data-pane="code">
                        <div class="aparte-code-content-wrapper">
                            <pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>
                        </div>
                    </div>
                    ${previewable ? `
                        <div class="aparte-art-card__pane" role="tabpanel" id="aparte-art-${cardId}-pane-preview" aria-labelledby="aparte-art-${cardId}-tab-preview" tabindex="0" data-pane="preview">
                            ${prose ? proseMarkup(cleanContent) : `<div class="aparte-art-card__pending">${escapeHtml(cfg.t('previewPending'))}</div>`}
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
        const open = element.querySelector('.aparte-art-card__btn[data-action="open"]');
        if (open) {
            const label = cfg.t('openArtifact');
            open.setAttribute('title', label);
            open.setAttribute('aria-label', label);
        }
        // Text only, and never `aria-selected` or `data-tab`: which pane is open is
        // the reader's state, not the locale's. A relabel that touched it would close
        // a preview somebody had opened.
        const previewTab = element.querySelector('[data-tab-target="preview"]');
        if (previewTab) previewTab.textContent = cfg.t('preview');
        const codeTab = element.querySelector('[data-tab-target="code"]');
        if (codeTab) codeTab.textContent = cfg.t('code');
    },
    setup: (element: HTMLElement, segment: AparteArtifactSegment, options: ArtifactCardOptions = {}): void => {
        cardOptions.set(element, options);
        latestSegment.set(element, segment);
        announceChange(element, options);
        // A document read as prose has its charts and diagrams drawn, as a reply's are.
        const prosePane = element.querySelector('.aparte-art-card__prose');
        if (prosePane) renderCodeLanguages(prosePane);
        const kind = (segment.artifactType || '').toLowerCase();
        if (BINARY_FILE_KINDS.has(kind)) {
            setupBinaryFileArtifact(element, segment, kind);
            return;
        }
        // Async highlight on the code pane
        const wrapper = element.querySelector('.aparte-code-content-wrapper');
        if (wrapper) {
            const displayLang = languageForKind(kind);
            const cleanContent = documentOf(segment);
            paneContent.set(element, cleanContent);
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
        // Read now, while the chat's config is the one setting the card up: a click runs later.
        const cfg = contextConfig();
        const tabs = [...element.querySelectorAll<HTMLButtonElement>('[data-tab-target]')];
        const select = (btn: HTMLButtonElement, focus: boolean): void => {
            const target = btn.getAttribute('data-tab-target');
            if (!target || btn.disabled) return;
            if (target === 'preview') mountPreviewFrame(element, segment);
            element.setAttribute('data-tab', target);
            // What the person chose, kept for this card drawn again (see `openedPreviews`).
            const opened = openedPreviews.get(cfg) ?? new Set<string>();
            openedPreviews.set(cfg, opened);
            const key = previewKey(latestSegment.get(element) ?? segment);
            if (target === 'preview') opened.add(key);
            else opened.delete(key);
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
                // two-tab list they are the fastest way to the one you are not on. The
                // next tab is to the left in a right-to-left list.
                const forward = getComputedStyle(btn.parentElement ?? btn).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
                const back = forward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
                const step = e.key === forward ? 1 : e.key === back ? -1 : 0;
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

        // Drawn again after the person opened its preview: open again, the same document.
        // Never while it streams (the tab is disabled), never a document nobody previewed.
        const previewTab = tabs.find((b) => b.getAttribute('data-tab-target') === 'preview');
        if (previewTab && !previewTab.disabled && openedPreviews.get(cfg)?.has(previewKey(segment))) select(previewTab, false);

        // Open — handed to the app, which shows it where it wants. The LATEST segment.
        const openBtn = element.querySelector<HTMLButtonElement>('[data-action="open"]');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                // Not while it streams, like Download: the app would get a half-written document.
                if (openBtn.disabled) return;
                const latest = latestSegment.get(element) ?? segment;
                // As the card shows it, copies it and downloads it: without the code fences a
                // model may wrap the content in.
                const artifact = { ...latest, content: documentOf(latest) };
                element.dispatchEvent(new CustomEvent<ArtifactOpenEventDetail>('aparte-artifact-open', {
                    bubbles: true,
                    composed: true,
                    // Which document, and which appearance of it: what a panel needs to show
                    // this very version among the document's others (`artifactDocuments`).
                    detail: { artifact, documentId: latest.documentId ?? latest.id, segmentId: latest.id },
                }));
            });
        }

        // Copy
        const copyBtn = element.querySelector<HTMLButtonElement>('[data-action="copy"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — resolve from the element, and copy the
                // latest segment, not the one this closure captured: see `latestSegment`.
                const code = documentOf(latestSegment.get(element) ?? segment);
                void copyText(code).catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = original;
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }

        // Download — a text artifact downloads from its own content. (A binary one
        // never reaches here: its setup returned above, and its file card owns the
        // button.) The LATEST segment, not the one this closure captured.
        const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                if (dlBtn.disabled) return;
                downloadTextArtifact(latestSegment.get(element) ?? segment);
            });
        }
    },
    update: (element: HTMLElement, segment: AparteArtifactSegment) => {
        // Keep the click handler's view of the artifact current, and throw away a
        // frame that is now showing stale content so the next press rebuilds it.
        const previous = latestSegment.get(element);
        latestSegment.set(element, segment);
        announceChange(element, cardOptions.get(element) ?? {});
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
        const cleanContent = documentOf(segment);

        // 0. The prose of a Markdown document in the panel follows what is written: at most
        //    once a frame, since rendering Markdown costs the whole document each time.
        if (readsAsProse(kind, cardOptions.get(element) ?? {}) && previous?.content !== segment.content) scheduleProse(element);

        // 1. Live-update the code pane during streaming.
        //
        // One call owns both halves — the plain tail every token and the coloured
        // prefix on a throttle. Setting `textContent` here as well is what made the
        // pane flicker: it erased the highlighter's spans on every token.
        if (isStreaming) {
            const segId = element.getAttribute('data-segment-id') ?? segment.id;
            streamHighlight(element, '.aparte-code-content-wrapper', cleanContent, languageForKind(kind), segId);
        } else if (paneContent.get(element) !== cleanContent) {
            // Only a CHANGED content is written. A card built from a tool result is settled
            // from its first paint and still receives every update the tool segment gets;
            // writing `textContent` each time wiped the token spans `setup` had painted, and
            // with no stream ending there was no second highlight — a plain block in a Shiki
            // frame. A changed one is written and coloured again.
            paneContent.set(element, cleanContent);
            const displayLang = languageForKind(kind);
            const wrapper = element.querySelector('.aparte-code-content-wrapper');
            const codeEl = wrapper?.querySelector('code');
            if (codeEl) {
                codeEl.textContent = cleanContent;
            } else if (wrapper) {
                wrapper.innerHTML = `<pre><code class="language-${escapeHtml(displayLang)}">${escapeHtml(cleanContent)}</code></pre>`;
            }
            if (wrapper && !wasStreaming) {
                void contextConfig().highlightCode(cleanContent, displayLang).then(html => {
                    if (paneContent.get(element) === cleanContent) wrapper.innerHTML = html;
                }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
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
};

export const artifactRenderer: AparteSegmentRenderer<ArtifactSegment> = {
    type: ARTIFACT_SEGMENT_TYPE,
    render: (segment) => card.render(segment),
    relabel: card.relabel,
    setup: (element, segment) => card.setup(element, segment),
    update: card.update,
    // The card's sheet, injected once per document by core — the seam a renderer that
    // is not core's has onto the page. It is a real `.css` file, inlined at build.
    getStyles: () => artifactStyles,
};

/** The card's hooks with their options, for the document panel: the same card, drawn as its body. */
export const artifactCard = card;

/**
 * Tell the page a card in a reply was drawn or changed: a panel beside the chat reads the
 * conversation again. Not from the panel's own card, which would be telling itself.
 */
function announceChange(element: HTMLElement, options: ArtifactCardOptions): void {
    if (options.surface === 'panel') return;
    /**
     * A document card in a reply was drawn or changed, so the conversation's documents may
     * have changed: read them again (`artifactDocuments`). Bubbles out of the chat and out
     * of shadow roots; no detail. `<aparte-artifact-panel>` listens to it.
     *
     * @event aparte-artifact-change
     */
    element.dispatchEvent(new CustomEvent('aparte-artifact-change', { bubbles: true, composed: true }));
}

/** The cards whose prose is waiting for the next frame. */
const proseScheduled = new WeakSet<Element>();

function scheduleProse(element: HTMLElement): void {
    if (proseScheduled.has(element)) return;
    proseScheduled.add(element);
    const paint = (): void => {
        proseScheduled.delete(element);
        const pane = element.querySelector('.aparte-art-card__pane[data-pane="preview"]');
        const segment = latestSegment.get(element);
        // Static markup built by `proseMarkup`: the Markdown provider's output, sanitised by core.
        if (!pane || !segment) return;
        pane.innerHTML = proseMarkup(documentOf(segment));
        renderCodeLanguages(pane);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint);
    else paint();
}

export function languageForKind(kind: string): string {
    if (kind === 'react') return 'jsx';
    if (kind === 'markdown') return 'md';
    if (kind === 'pdf' || kind === 'xlsx' || kind === 'docx') return 'js';
    return kind || 'text';
}

function downloadTextArtifact(segment: AparteArtifactSegment): void {
    const content = documentOf(segment);
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
    // Lower-cased like every other reader of the kind in this file: an app-built
    // segment with `artifactType: 'HTML'` rendered an enabled Preview tab whose press
    // did nothing, because `PREVIEWABLE_KINDS.has('HTML')` is false.
    const kind = (segment.artifactType || deriveArtifactKind(segment.mimeType ?? '', 'text')).toLowerCase();
    if (!PREVIEWABLE_KINDS.has(kind) || !previewEnabled()) return;

    const title = segment.title?.trim() || labelForKind(kind);
    // The app's builder when it gave one (`preview: (kind, body, title) => srcdoc`),
    // else the built-in document with its CSP.
    const option = renderOptions(contextConfig(element)).preview;
    const build = typeof option === 'function' ? option : buildSafePreviewDocument;
    const srcdoc = build(kind, documentOf(segment), title);

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
