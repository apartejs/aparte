/**
 * Terminal output, with the Run affordance a host must declare before it appears.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteTerminalSegment,
} from '../../types/index.js';

export const terminalRenderer: AparteSegmentRenderer<AparteTerminalSegment> = {
    type: 'terminal',
    render: (segment) => `
        <div class="segment segment-terminal" data-segment-id="${escapeHtml(segment.id)}">
            <div class="terminal-command-block">
                <div class="terminal-icon">
                    ${contextConfig().getIcon('terminal')}
                </div>
                <code class="terminal-command">${escapeHtml(segment.command || '')}</code>
                <div class="terminal-actions">
                    ${segment.isRunning
            ? `<span class="terminal-running"><span class="spinner"></span>${contextConfig().t('running')}</span>`
            : contextConfig().getHostHandlers().terminalRun
                ? `<button class="terminal-run-btn" data-action="run" aria-label="${escapeAttr(contextConfig().t('run'))}" title="${escapeAttr(contextConfig().t('run'))}">${contextConfig().t('run')}</button>`
                : ''}
                    <button class="terminal-copy-btn" data-action="copy" aria-label="${escapeAttr(contextConfig().t('copy'))}" title="${escapeAttr(contextConfig().t('copy'))}">
                        ${contextConfig().getIcon('copy')}
                    </button>
                </div>
            </div>
            ${segment.output ? `<div class="terminal-output">${escapeHtml(segment.output)}</div>` : ''}
            ${segment.exitCode !== undefined && segment.exitCode !== 0
            ? `<div class="terminal-error">Command failed with exit code ${segment.exitCode}</div>`
            : ''}
        </div>
    `,
    setup: (element) => {
        const copyBtn = element.querySelector('.terminal-copy-btn');
        const command = element.querySelector('.terminal-command');
        if (copyBtn && command) {
            copyBtn.addEventListener('click', () => {
                // Late execution (user click) — resolve from the element.
                void navigator.clipboard.writeText(command.textContent || '').catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                }, 1500);
            });
        }

        // Run button dispatches a custom event
        const runBtn = element.querySelector('.terminal-run-btn');
        if (runBtn) {
            runBtn.addEventListener('click', () => {
                const segmentId = element.getAttribute('data-segment-id');
                element.dispatchEvent(new CustomEvent('aparte-terminal-run', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        segmentId,
                        command: command?.textContent || ''
                    }
                }));
            });
        }
    },
    getStyles: () => ``
};
