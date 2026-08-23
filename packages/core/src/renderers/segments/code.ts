/**
 * Fenced code — highlighted through the opt-in provider, plain when there is none.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteCodeSegment,
} from '../../types/index.js';

export const codeRenderer: AparteSegmentRenderer<AparteCodeSegment> = {
    type: 'code',
    render: (segment) => `
        <div class="segment segment-code" data-segment-id="${escapeHtml(segment.id)}">
            <div class="code-header">
                ${segment.filename
                    ? `<span class="code-filename">${escapeHtml(segment.filename)}</span>`
                    : `<span class="code-header-filler"></span>`}
                <span class="code-language">${escapeHtml(segment.language || '')}</span>
                <button class="code-copy" data-action="copy" title="${escapeAttr(contextConfig().t('copy'))}">
                    ${contextConfig().getIcon('copy')}
                </button>
            </div>
            <div class="code-content-wrapper">
                <pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>
            </div>
        </div>
    `,
    setup: (element, segment) => {
        // Async highlight: replace plain <pre><code> with highlighted HTML once ready
        const wrapper = element.querySelector('.code-content-wrapper');
        if (wrapper) {
            void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }

        const copyBtn = element.querySelector('.code-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — the ambient render config is
                // gone; resolve from the connected element instead.
                void navigator.clipboard.writeText(segment.content || '').catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }
    },
    update: (element, segment) => {
        if (segment.isStreaming) {
            // During streaming: update raw text only to avoid firing highlight on every token.
            // The code-content-wrapper may contain either the plain <pre><code> (initial render)
            // or highlighted HTML (from a previous async highlight). Update the innermost
            // <code> element if present; otherwise fall back to the wrapper itself.
            const codeEl = element.querySelector('.code-content-wrapper code');
            if (codeEl) {
                codeEl.textContent = segment.content;
            } else {
                const wrapper = element.querySelector('.code-content-wrapper');
                if (wrapper) wrapper.innerHTML = `<pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>`;
            }
        } else {
            // Streaming complete — run the highlight provider for polished output.
            const wrapper = element.querySelector('.code-content-wrapper');
            if (wrapper) {
                void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                    wrapper.innerHTML = html;
                }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
            }
        }
    },
    getStyles: () => ``
};
