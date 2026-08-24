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
    AparteTerminalRunEventDetail,
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
            ? `<span class="terminal-running"><span class="spinner"></span><span class="terminal-running-label">${contextConfig().t('running')}</span></span>`
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
    /**
     * The icon, the two action buttons, and the running pill's label.
     *
     * The run button exists only when a host registered a `terminalRun` handler, and
     * the running pill only while the command is in flight — so both are guarded
     * rather than assumed. The label sits in its own span precisely so this can
     * rewrite it without touching the spinner beside it, which the no-child-node rule
     * forbids.
     */
    relabel: (element) => {
        const cfg = contextConfig();
        const icon = element.querySelector('.terminal-icon');
        if (icon) icon.innerHTML = cfg.getIcon('terminal');

        const running = element.querySelector('.terminal-running-label');
        if (running) running.textContent = cfg.t('running');

        const run = element.querySelector('.terminal-run-btn');
        if (run) {
            const label = cfg.t('run');
            run.textContent = label;
            run.setAttribute('aria-label', label);
            run.setAttribute('title', label);
        }

        const copy = element.querySelector('.terminal-copy-btn');
        if (copy) {
            const label = cfg.t('copy');
            copy.setAttribute('aria-label', label);
            copy.setAttribute('title', label);
            copy.innerHTML = cfg.getIcon('copy');
        }
    },
    setup: (element, segment) => {
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

        // Run button dispatches a custom event.
        //
        // Read from the SEGMENT, not from the DOM. The id used to come off a
        // `data-segment-id` attribute — hence the old `string | null` on the detail
        // — and the message id was simply missing, so a consumer knew a command had
        // been asked for and could not say which turn asked. `addSegment` stamps
        // both onto the object now, and the object is right here.
        const runBtn = element.querySelector('.terminal-run-btn');
        if (runBtn) {
            runBtn.addEventListener('click', () => {
                element.dispatchEvent(new CustomEvent<AparteTerminalRunEventDetail>('aparte-terminal-run', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        segmentId: segment.id,
                        messageId: segment.messageId,
                        command: command?.textContent || ''
                    }
                }));
            });
        }
    },
    getStyles: () => ``
};
