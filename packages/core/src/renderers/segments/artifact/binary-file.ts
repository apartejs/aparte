/**
 * The binary-artifact path: pdf, xlsx, docx.
 *
 * A different LIFETIME from the artifact card, and that is the seam — not the line
 * count. The card renders content that arrives in the stream and is complete when the
 * stream ends. This path renders a file ANOTHER process produces: core emits
 * `aparte-artifact-ready`, a host generates the bytes in a sandbox, and answers with
 * `aparte-file-gen-ready`. So it carries state that must survive the segment being
 * re-rendered — a preview cache keyed by segment id, a map of pending generations, and
 * a re-dispatch throttle — none of which the card has or wants.
 *
 * Both of those maps are bounded (`MAX_BINARY_ARTIFACTS`, `MAX_FILE_GEN_HANDLERS`),
 * because a page that streams artifacts for an hour must not grow without limit.
 *
 * `installArtifactReadyHook` lives here with the map it feeds, and is called from the
 * renderer-registration entry points rather than at module load — see its own comment
 * for why that matters to bundlers.
 */
import { escapeHtml } from '../../../utils/escape.js';
import { contextConfig } from '../../../config/index.js';
import type { AparteArtifactSegment } from '../../../types/index.js';
import { stripCodeFences, labelForKind, markThrottle, debounceHighlight } from './shared.js';


const FILE_ICON_LABEL: Record<string, string> = {
    xlsx: 'XLS',
    pdf:  'PDF',
    docx: 'DOC',
};

/**
 * Module-level cache of sandbox-produced previews keyed by segment.id.
 * Lets re-mounts (branch switch, conversation toggle, persisted reload after
 * a previous mount) restore the preview instantly without re-running the
 * sandbox. Lifetime = current page session; cleared on full reload.
 */
type CachedPreview = {
    buffer: Uint8Array | ArrayBuffer;
    mime: string;
    name: string;
    bytes: number;
    previewHtml: string | null;
};

const _binaryArtifactCache = new Map<string, CachedPreview>();

/** Cap the binary-artifact cache: each entry holds a full file buffer, so an
 *  unbounded Map would grow for the page's lifetime over a long session. */
const MAX_BINARY_ARTIFACTS = 24;

export function cacheBinaryArtifact(id: string, entry: CachedPreview): void {
    // delete-then-set refreshes recency; evict the oldest (first) key when full.
    _binaryArtifactCache.delete(id);
    if (_binaryArtifactCache.size >= MAX_BINARY_ARTIFACTS) {
        const oldest = _binaryArtifactCache.keys().next().value;
        if (oldest !== undefined) _binaryArtifactCache.delete(oldest);
    }
    _binaryArtifactCache.set(id, entry);
}

/** segmentId → cleanup for the file-gen window listeners (one live pair/segment). */
const _fileGenHandlers = new Map<string, () => void>();

/** Cap the live file-gen handler map: a generation that never terminates (the
 *  conversation is cleared/switched mid-flight, or no FileGenService is wired) would
 *  otherwise keep its two window listeners for the page's lifetime. */
const MAX_FILE_GEN_HANDLERS = 32;

/**
 * Tracks when an `aparte-artifact-ready` was last dispatched per segment, so
 * setup() rehydration doesn't fire a duplicate dispatch while a previous
 * sandbox run is still in flight (would trigger "Sandbox is busy" errors).
 * Populated both by aparte-client's natural dispatch (hook below) AND by our
 * own rehydration dispatches.
 */
const _lastDispatchAt = new Map<string, number>();

const RE_DISPATCH_DEBOUNCE_MS = 30_000;

let _artifactReadyHookInstalled = false;

/**
 * Record every `aparte-artifact-ready` so the binary-artifact path can tell whether
 * it has already asked the host to generate this file — see the dedupe at
 * {@link maybeRehydrateBinaryArtifact}, which is the only reader.
 *
 * ## Why this is a function and not a module-level `addEventListener`
 *
 * It WAS module-level, and it was surviving bundling by luck.
 * `packages/core/package.json` declares `sideEffects` as a short list that does NOT
 * include this file — so the module is advertised to bundlers as side-effect-FREE while
 * carrying a top-level listener, which is a side effect. It was retained only
 * because `artifactRenderer` in the same module is a used binding; a bundler was
 * within its rights to drop the file and the listener with it, and pdf/xlsx/docx
 * artifacts would then stop regenerating in a consumer's production build while
 * every local check stayed green. Verified as surviving today in a real Vite build
 * of the Svelte example — but "it happens to survive" is not a contract.
 *
 * `sideEffects` cannot simply be corrected to name this file, either: the build
 * bundles into a CONTENT-HASHED shared chunk, so there is no stable path to list.
 *
 * Installed from the two registration entry points instead. That is not later in
 * any way that matters: an artifact can only render once a renderer is registered,
 * and the map is read only while rendering one.
 */
export function installArtifactReadyHook(): void {
    if (_artifactReadyHookInstalled || typeof window === 'undefined') return;
    _artifactReadyHookInstalled = true;
    window.addEventListener('aparte-artifact-ready', (event: Event) => {
        const segId = (event as CustomEvent).detail?.segmentId as string | undefined;
        if (segId) markThrottle(_lastDispatchAt, segId, Date.now());
    });
}

export function renderBinaryFileArtifact(segment: AparteArtifactSegment, kind: string): string {
    const title = segment.title?.trim() || labelForKind(kind);
    const iconLabel = FILE_ICON_LABEL[kind] ?? kind.toUpperCase();
    const isStreaming = !!segment.isStreaming;

    // Cache hit (branch switch back, re-render of an already-built segment) :
    // render in 'ready' state with the preview HTML so the user sees the
    // file immediately — no setup() round-trip required, which matters when
    // Angular reuses the DOM via trackBy and our setup may not re-fire.
    // Download on a binary artifact means "app, re-generate this file" — core holds
    // no bytes for pdf/xlsx/docx. No declaration, no button.
    const canRedownload = contextConfig().getHostHandlers().artifactRedownload;
    // Declared here rather than beside its first use: this function has TWO early
    // returns before the last one, and each renders its own download button.
    const loc = contextConfig().getLocale();
    const downloadLabel = escapeHtml(loc.download ?? 'Download');

    const cached = _binaryArtifactCache.get(segment.id);
    if (cached && !isStreaming) {
        const previewBody = cached.previewHtml
            ? contextConfig().sanitizeHtml(cached.previewHtml)
            : `<div class="aparte-art-file__preview-empty">Preview not available for ${escapeHtml(kind)} yet</div>`;
        return `
            <div class="segment segment-artifact-file"
                 data-segment-id="${escapeHtml(segment.id)}"
                 data-artifact-type="${escapeHtml(kind)}"
                 data-state="ready">
                <div class="aparte-art-file__card">
                    <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                    <div class="aparte-art-file__meta">
                        <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(cached.name)}</div>
                        <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(formatBytes(cached.bytes))} · ${escapeHtml(kind.toUpperCase())}</div>
                    </div>
                    <div class="aparte-art-file__actions">
                        ${canRedownload ? `<button type="button" class="aparte-art-file__btn aparte-art-file__btn--primary" data-action="download">${downloadLabel}</button>` : ''}
                    </div>
                </div>
                <div class="aparte-art-file__body">
                    <div class="aparte-art-file__code-pane" data-role="code-pane" hidden>
                        <pre><code class="language-js"></code></pre>
                    </div>
                    <div class="aparte-art-file__preview-pane" data-role="preview-pane">${previewBody}</div>
                </div>
            </div>
        `;
    }

    const cleanContent = stripCodeFences(segment.content || '');
    const subText = isStreaming
        ? (loc.generating ?? 'Generating…')
        : (loc.rebuildingPreview ?? 'Rebuilding preview…');
    return `
        <div class="segment segment-artifact-file"
             data-segment-id="${escapeHtml(segment.id)}"
             data-artifact-type="${escapeHtml(kind)}"
             data-state="${isStreaming ? 'streaming' : 'compiling'}">
            <div class="aparte-art-file__card">
                <div class="aparte-art-file__icon" data-kind="${escapeHtml(kind)}">${escapeHtml(iconLabel)}</div>
                <div class="aparte-art-file__meta">
                    <div class="aparte-art-file__meta-name" data-role="file-name">${escapeHtml(title)}</div>
                    <div class="aparte-art-file__meta-sub" data-role="file-sub">${escapeHtml(subText)}</div>
                </div>
                <div class="aparte-art-file__actions">
                    ${canRedownload ? `<button type="button" class="aparte-art-file__btn aparte-art-file__btn--primary" data-action="download" disabled>${downloadLabel}</button>` : ''}
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

export function setupBinaryFileArtifact(element: HTMLElement, segment: AparteArtifactSegment, kind: string): void {
    // Per-element click handler reads the live cache entry so the Download
    // button works regardless of whether the buffer came from a fresh run or
    // from the module cache (branch switch / re-mount).
    if (element.dataset['aparteInit'] !== 'true') {
        element.dataset['aparteInit'] = 'true';

        // A branch switch replaces this element with a fresh one (aparteInit
        // unset), so setup runs again for the same segment id. Drop the prior
        // element's listeners first — one live pair per segment id — otherwise
        // the detached element leaks (its handlers keep it referenced forever).
        _fileGenHandlers.get(segment.id)?.();
        const cleanup = (): void => {
            window.removeEventListener('aparte-file-gen-ready', onReady);
            window.removeEventListener('aparte-file-gen-error', onError);
            _fileGenHandlers.delete(segment.id);
        };

        const onReady = (event: Event): void => {
            const detail = (event as CustomEvent).detail as {
                segmentId: string;
                filename: string;
                bytes: number;
                mime: string;
                buffer: Uint8Array | ArrayBuffer;
                previewHtml: string | null;
            };
            if (!detail || detail.segmentId !== segment.id) return;
            cacheBinaryArtifact(segment.id, {
                buffer: detail.buffer,
                mime: detail.mime,
                name: detail.filename,
                bytes: detail.bytes,
                previewHtml: detail.previewHtml,
            });
            swapToPreview(element, detail, kind);
            cleanup(); // terminal — generation delivered
        };
        window.addEventListener('aparte-file-gen-ready', onReady);

        // Sandbox failed — show an inline error in the card so the user gets
        // feedback instead of an indefinite "Running sandbox…" spinner. The
        // model often emits buggy code (drawText with array, undefined font
        // refs, etc.) — we surface that rather than hide it.
        const onError = (event: Event): void => {
            const detail = (event as CustomEvent).detail as {
                segmentId: string;
                phase?: string;
                error?: string;
            };
            if (!detail || detail.segmentId !== segment.id) return;
            showSandboxError(element, detail.phase ?? 'exec', detail.error ?? 'Unknown error');
            cleanup(); // terminal — generation failed
        };
        window.addEventListener('aparte-file-gen-error', onError);
        // Evict (and clean up the listeners of) the oldest handler when at capacity,
        // so a never-terminating generation can't leak listeners without bound.
        if (_fileGenHandlers.size >= MAX_FILE_GEN_HANDLERS) {
            const oldest = _fileGenHandlers.keys().next().value;
            if (oldest !== undefined) _fileGenHandlers.get(oldest)?.();
        }
        _fileGenHandlers.set(segment.id, cleanup);

        element.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const action = target.closest<HTMLElement>('[data-action]')?.getAttribute('data-action');
            if (action !== 'download') return;
            const cached = _binaryArtifactCache.get(segment.id);
            if (!cached) return;
            const blob = new Blob([cached.buffer as BlobPart], { type: cached.mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = cached.name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    // ─── Rehydration : runs on EVERY setup() call. ──────────────────
    const currentState = element.getAttribute('data-state');
    if (segment.isStreaming || currentState === 'ready') return;

    // Cache hit (branch switch back, conversation toggle) → swap instantly,
    // no sandbox re-run.
    const cached = _binaryArtifactCache.get(segment.id);
    if (cached) {
        swapToPreview(
            element,
            { filename: cached.name, bytes: cached.bytes, previewHtml: cached.previewHtml },
            kind,
        );
        return;
    }

    // OPT-IN: re-running a persisted artifact's generation is not automatic.
    //
    // Everything below asks the host app to execute model-authored content — the
    // comment further down says so itself ("kick off the sandbox"). On a live
    // stream that follows a turn the user asked for. Here it follows nothing: it
    // runs from `setup()`, so merely RE-OPENING a saved conversation re-fires
    // whatever a prompt injection persuaded the model to emit, on every reload.
    //
    // This is ratified decision #8 applied to the sibling of the artifact preview:
    // that path was made gesture-gated 700 lines up in this same file, for exactly
    // this reason, and this one was left automatic. Core owns no sandbox and no
    // file generator, so it cannot honour the affordance end to end either — with
    // nothing listening the card simply stays at "generating".
    if (!contextConfig().getHostHandlers().artifactRehydrate) return;

    // Dedupe : if an artifact-ready was dispatched recently for this segment
    // (either by aparte-client's natural stream-end flow OR by a previous
    // rehydration), don't fire another one — the sandbox is in flight and
    // the file-gen-ready listener will catch the result soon. Without this
    // we'd hit "Sandbox is busy with a previous execution" errors.
    const lastAt = _lastDispatchAt.get(segment.id) ?? 0;
    if (Date.now() - lastAt < RE_DISPATCH_DEBOUNCE_MS) return;
    markThrottle(_lastDispatchAt, segment.id, Date.now());

    // First time we see this segment in the current page session : kick off
    // the sandbox via FileGenService. Date.now() in the messageId bypasses
    // its `${msgId}::${segId}` dedupe so the event always reaches us.
    const reloadMessageId = `__reload__${Date.now()}`;
    queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('aparte-artifact-ready', {
            detail: {
                messageId: reloadMessageId,
                segmentId: segment.id,
                mimeType: segment.mimeType,
                artifactType: segment.artifactType,
                title: segment.title,
                content: stripCodeFences(segment.content || ''),
            },
        }));
    });
    // Re-highlight the code (visible until the sandbox finishes).
    const wrapper = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (wrapper) {
        const cleanContent = stripCodeFences(segment.content || '');
        void contextConfig(element).highlightCode(cleanContent, 'js').then(html => {
            wrapper.innerHTML = html;
        }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
    }
}

export function updateBinaryFileArtifact(element: HTMLElement, segment: AparteArtifactSegment, isStreaming: boolean): void {
    const state = element.getAttribute('data-state');
    // Once we've swapped to preview we don't touch the body again.
    if (state === 'ready') return;

    const cleanContent = stripCodeFences(segment.content || '');
    // Live-update the streaming code via textContent (cheap), then schedule
    // a debounced syntax-highlight so colors appear progressively without
    // saturating the main thread.
    const codeEl = element.querySelector<HTMLElement>('[data-role="code-pane"] code');
    if (codeEl) {
        codeEl.textContent = cleanContent;
    }
    if (isStreaming) {
        debounceHighlight(element, '[data-role="code-pane"]', cleanContent, 'js', segment.id);
    }

    if (!isStreaming && state === 'streaming') {
        element.setAttribute('data-state', 'compiling');
        // Re-highlight once the code is final. The pane stays visible until
        // `aparte-file-gen-ready` fires and swapToPreview() flips it.
        const wrapper = element.querySelector<HTMLElement>('[data-role="code-pane"]');
        if (wrapper) {
            void contextConfig(element).highlightCode(cleanContent, 'js').then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }
        const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
        if (sub) sub.textContent = 'Running sandbox…';
    }
}

function swapToPreview(
    element: HTMLElement,
    detail: { filename: string; bytes: number; previewHtml: string | null },
    kind: string,
): void {
    element.setAttribute('data-state', 'ready');

    // Replace the code pane with the file preview.
    const codePane = element.querySelector<HTMLElement>('[data-role="code-pane"]');
    if (codePane) codePane.hidden = true;
    const preview = element.querySelector<HTMLElement>('[data-role="preview-pane"]');
    if (preview) {
        // previewHtml comes from the app (e.g. SheetJS table for xlsx) and is built
        // from potentially untrusted file bytes, so route it through the sanitizer
        // like every other innerHTML in this file (renderMarkdown/highlightCode do).
        preview.innerHTML = detail.previewHtml
            ? contextConfig().sanitizeHtml(detail.previewHtml)
            : `<div class="aparte-art-file__preview-empty">Preview not available for ${escapeHtml(kind)} yet</div>`;
        preview.hidden = false;
    }

    // Update the footer card to its "ready" state.
    const nameEl = element.querySelector<HTMLElement>('[data-role="file-name"]');
    if (nameEl) nameEl.textContent = detail.filename;
    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = `${formatBytes(detail.bytes)} · ${kind.toUpperCase()}`;
    const dlBtn = element.querySelector<HTMLButtonElement>('[data-action="download"]');
    if (dlBtn) dlBtn.disabled = false;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function showSandboxError(element: HTMLElement, phase: string, errorMsg: string): void {
    // Don't clobber a successful preview — only flip to error if still
    // pre-ready (streaming/compiling).
    const state = element.getAttribute('data-state');
    if (state === 'ready') return;
    element.setAttribute('data-state', 'error');

    const sub = element.querySelector<HTMLElement>('[data-role="file-sub"]');
    if (sub) sub.textContent = `Error (${phase})`;

    const body = element.querySelector<HTMLElement>('.aparte-art-file__body');
    if (body) {
        // Truncate gnarly stack traces — first line is usually the actionable bit.
        const short = (errorMsg.split('\n')[0] ?? '').slice(0, 240);
        body.innerHTML = `
            <div class="aparte-art-file__error">
                <div class="aparte-art-file__error-title">The sandbox failed during generation.</div>
                <div class="aparte-art-file__error-msg">${escapeHtml(short)}</div>
                <div class="aparte-art-file__error-hint">Common cause: the model produced invalid code (undefined variable, wrong argument type). Retry the request — the model may produce different code.</div>
            </div>
        `;
    }
}
