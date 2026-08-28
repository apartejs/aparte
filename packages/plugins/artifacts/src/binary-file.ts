/**
 * The binary-artifact path: pdf, xlsx, docx.
 *
 * A different LIFETIME from the card, and that is the seam. The card renders content
 * that arrives in the stream and is complete when the stream ends. This path renders a
 * file that something ELSE produces from that content — a sandbox that runs the JS the
 * model wrote and hands back a workbook, a PDF, a document. That something is the
 * app's (`onBinary` in `setupArtifacts`): the plugin knows how to ask and how to show
 * the answer, not how to make it.
 *
 * This file used to be a protocol — three window events, a redownload/rehydrate
 * pair of host handlers, a debounce against a sandbox that was "busy", and the name of
 * a service that existed in no package. What is left is a function call and its two
 * outcomes: the bytes, or an error shown in the card.
 */
import { escapeHtml, escapeAttr, contextConfig } from '@aparte/core';
import type { ArtifactSegment } from './segment.js';
import { stripCodeFences, labelForKind } from './shared.js';
import { streamHighlight } from './highlight.js';
import { renderOptions, type ArtifactBinary } from './options.js';

const FILE_ICON_LABEL: Record<string, string> = {
    xlsx: 'XLS',
    pdf:  'PDF',
    docx: 'DOC',
};

/**
 * Bytes already produced, by segment id — so a re-mount (a branch switch, a
 * conversation toggle) shows the file again without asking the app to make it twice.
 * Bounded: each entry holds a whole file.
 */
const produced = new Map<string, ArtifactBinary>();
const MAX_PRODUCED = 24;
/** One generation in flight per segment, whatever re-mounts meanwhile. */
const inFlight = new Map<string, Promise<ArtifactBinary>>();

function remember(id: string, bin: ArtifactBinary): void {
    produced.delete(id);
    if (produced.size >= MAX_PRODUCED) {
        const oldest = produced.keys().next().value;
        if (oldest !== undefined) produced.delete(oldest);
    }
    produced.set(id, bin);
}

/** For tests: forget every produced file and every generation in flight. */
export function resetBinaryArtifacts(): void {
    produced.clear();
    inFlight.clear();
}

export function renderBinaryFileArtifact(segment: ArtifactSegment, kind: string): string {
    const cfg = contextConfig();
    const title = segment.title?.trim() || labelForKind(kind);
    const iconLabel = FILE_ICON_LABEL[kind] ?? kind.toUpperCase();
    const isStreaming = !!segment.isStreaming;
    const canProduce = typeof renderOptions(cfg).onBinary === 'function';
    const downloadLabel = escapeHtml(cfg.t('download'));
    const done = produced.get(segment.id);

    // Already produced (a re-mount): the file, at once.
    if (done && !isStreaming) {
        const preview = previewMarkup(done, kind);  // safe-text: the app's previewHtml through the config's sanitizer, or an escapeHtml'd sentence — markup on purpose, as swapToPreview() sets it
        return `
            <div class="aparte-segment aparte-card aparte-segment-artifact-file"
                 data-segment-id="${escapeHtml(segment.id)}"
                 data-artifact-type="${escapeHtml(kind)}"
                 data-state="ready">
                <div class="aparte-art-file__card">
                    <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                    <div class="aparte-art-file__meta">
                        <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(done.filename)}</div>
                        <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(formatBytes(byteLength(done.buffer)))} · ${escapeHtml(kind.toUpperCase())}</div>
                    </div>
                    <div class="aparte-art-file__actions">
                        <button type="button" class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-art-file__btn aparte-art-file__btn--primary" data-action="download">${downloadLabel}</button>
                    </div>
                </div>
                <div class="aparte-art-file__body">
                    <div class="aparte-art-file__code-pane" data-role="code-pane" hidden>
                        <pre><code class="language-js"></code></pre>
                    </div>
                    <div class="aparte-art-file__preview-pane" data-role="preview-pane">${preview}</div>
                </div>
            </div>
        `;
    }

    const cleanContent = stripCodeFences(segment.content || '');
    // Streaming: the model is still writing the source. Settled with a producer: the
    // file is being made. Settled without one: the source is all there is to show.
    const subText = isStreaming ? cfg.t('generating') : canProduce ? cfg.t('rebuildingPreview') : kind.toUpperCase();
    return `
        <div class="aparte-segment aparte-card aparte-segment-artifact-file"
             data-segment-id="${escapeHtml(segment.id)}"
             data-artifact-type="${escapeHtml(kind)}"
             data-state="${escapeAttr(isStreaming ? 'streaming' : canProduce ? 'compiling' : 'source')}">
            <div class="aparte-art-file__card">
                <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                <div class="aparte-art-file__meta">
                    <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(title)}</div>
                    <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(subText)}</div>
                </div>
                <div class="aparte-art-file__actions">
                    ${canProduce ? `<button type="button" class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-art-file__btn aparte-art-file__btn--primary" data-action="download" disabled>${downloadLabel}</button>` : ''}
                </div>
            </div>
            <div class="aparte-art-file__body">
                <div class="aparte-art-file__code-pane" data-role="code-pane">
                    <pre><code class="language-js">${escapeHtml(cleanContent)}</code></pre>
                </div>
                <div class="aparte-art-file__preview-pane" data-role="preview-pane" hidden></div>
            </div>
        </div>
    `;
}

export function setupBinaryFileArtifact(element: HTMLElement, segment: ArtifactSegment, kind: string): void {
    if (element.dataset['aparteInit'] !== 'true') {
        element.dataset['aparteInit'] = 'true';
        element.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const action = target.closest<HTMLElement>('[data-action]')?.getAttribute('data-action');
            if (action !== 'download') return;
            const bin = produced.get(segment.id);
            if (bin) downloadBinary(bin);
        });
    }
    if (segment.isStreaming) return;
    settle(element, segment, kind);
}

export function updateBinaryFileArtifact(element: HTMLElement, segment: ArtifactSegment, isStreaming: boolean): void {
    const state = element.getAttribute('data-state');
    if (state === 'ready' || state === 'error') return;

    const cleanContent = stripCodeFences(segment.content || '');
    if (isStreaming) {
        streamHighlight(element, '[data-role="code-pane"]', cleanContent, 'js', segment.id);
        return;
    }
    const codeEl = element.querySelector<HTMLElement>('[data-role="code-pane"] code');
    if (codeEl) codeEl.textContent = cleanContent;
    if (state === 'streaming') settle(element, segment, kind(element));
}

/**
 * The source is final. Highlight it, and — when the app can — ask for the file.
 * One request per segment whatever re-mounts meanwhile; the answer is remembered so a
 * later mount shows the file without asking again.
 */
function settle(element: HTMLElement, segment: ArtifactSegment, kind: string): void {
    const cfg = contextConfig(element);
    const cleanContent = stripCodeFences(segment.content || '');
    const wrapper = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (wrapper) {
        void cfg.highlightCode(cleanContent, 'js').then(html => { wrapper.innerHTML = html; })
            .catch(() => { /* best-effort: a failed highlight degrades silently */ });
    }

    const already = produced.get(segment.id);
    if (already) { swapToPreview(element, already, kind); return; }

    const resolve = renderOptions(cfg).onBinary;
    if (!resolve) { element.setAttribute('data-state', 'source'); return; }
    element.setAttribute('data-state', 'compiling');

    let job = inFlight.get(segment.id);
    if (!job) {
        job = resolve({ ...segment, content: cleanContent });
        inFlight.set(segment.id, job);
        // Both branches, or the bookkeeping chain itself rejects unhandled on failure.
        const done = (): void => { inFlight.delete(segment.id); };
        job.then(done, done);
    }
    void job.then((bin) => {
        remember(segment.id, bin);
        if (element.isConnected) swapToPreview(element, bin, kind);
    }).catch((err: unknown) => {
        if (element.isConnected) showError(element, err instanceof Error ? err.message : String(err));
    });
}

function kind(element: HTMLElement): string {
    return (element.getAttribute('data-artifact-type') || '').toLowerCase();
}

function previewMarkup(bin: ArtifactBinary, kind: string): string {
    return bin.previewHtml
        ? contextConfig().sanitizeHtml(bin.previewHtml)
        : `<div class="aparte-art-file__preview-empty">${escapeHtml(contextConfig().t('previewPending'))} ${escapeHtml(kind)}</div>`;
}

function swapToPreview(element: HTMLElement, bin: ArtifactBinary, kind: string): void {
    element.setAttribute('data-state', 'ready');
    const codePane = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (codePane) codePane.hidden = true;
    const preview = element.querySelector<HTMLElement>('[data-role="preview-pane"]');
    if (preview) {
        // `previewHtml` comes from the app and is built from file bytes the model's code
        // produced, so it goes through the sanitizer like every other innerHTML here.
        preview.innerHTML = previewMarkup(bin, kind);
        preview.hidden = false;
    }
    const nameEl = element.querySelector<HTMLElement>('[data-role="file-name"]');
    if (nameEl) nameEl.textContent = bin.filename;
    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = `${formatBytes(byteLength(bin.buffer))} · ${kind.toUpperCase()}`;
    const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
    if (dlBtn) dlBtn.disabled = false;
}

function downloadBinary(bin: ArtifactBinary): void {
    const blob = new Blob([bin.buffer], { type: bin.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bin.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function byteLength(part: BlobPart): number {
    if (typeof part === 'string') return new TextEncoder().encode(part).length;
    if (part instanceof Blob) return part.size;
    return (part as ArrayBufferView | ArrayBuffer).byteLength;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function showError(element: HTMLElement, errorMsg: string): void {
    if (element.getAttribute('data-state') === 'ready') return;
    element.setAttribute('data-state', 'error');
    const cfg = contextConfig(element);
    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = cfg.t('sandboxError');
    const body = element.querySelector<HTMLElement>('.aparte-art-file__body');
    if (body) {
        // The first line of a stack is the actionable one.
        const short = (errorMsg.split('\n')[0] ?? '').slice(0, 240);
        body.innerHTML = `
            <div class="aparte-art-file__error">
                <div class="aparte-art-file__error-title">${escapeHtml(cfg.t('sandboxError'))}</div>
                <div class="aparte-output aparte-art-file__error-msg">${escapeHtml(short)}</div>
                <div class="aparte-art-file__error-hint">${escapeHtml(cfg.t('sandboxErrorHint'))}</div>
            </div>
        `;
    }
}
