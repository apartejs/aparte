/**
 * `<aparte-approval-mode>` — the switch between the four modes, for the composer's toolbar.
 *
 * Mounted where the host wants it, like `<aparte-model-selector>`: the composer is light
 * DOM with no registry, so a control is placed by writing its tag inside
 * `<aparte-composer-toolbar>`. It resolves the config it sits in (`resolveConfig`) and the
 * controller `setupApproval` installed there — with none, it renders disabled and says
 * so once in the console, the way core does for a missing presenter: an affordance that
 * cannot act is not offered.
 */
import {
    resolveConfig, escapeHtml,
    type AparteConfig, type AparteConfigAware, type AparteSelectChangeDetail,
} from '@aparte/core';
import { getApprovalController, type ApprovalController } from './approval.js';
import { APPROVAL_MODES, type ApprovalMode } from './policy.js';

/** `aparte-approval-mode-change` detail. */
export interface AparteApprovalModeChangeDetail {
    mode: ApprovalMode;
    previousMode: ApprovalMode;
}

const DEFAULT_LABELS: Record<ApprovalMode, string> = {
    plan: 'Plan',
    ask: 'Ask',
    'auto-edit': 'Auto-edit',
    auto: 'Auto',
};

/**
 * A select over the four approval modes — plan, ask, auto-edit, auto — bound to the
 * `setupApproval()` of the config this element resolves.
 *
 * @element aparte-approval-mode
 *
 * @example Beside the model selector, in the composer's toolbar
 * ```html
 * <aparte-composer>
 *   <aparte-composer-input></aparte-composer-input>
 *   <aparte-composer-toolbar>
 *     <aparte-approval-mode></aparte-approval-mode>
 *   </aparte-composer-toolbar>
 * </aparte-composer>
 * ```
 *
 * @fires aparte-approval-mode-change - After a switch: `{ mode, previousMode }`. Bubbles and crosses shadow roots.
 */
export class AparteApprovalMode extends HTMLElement implements AparteConfigAware {
    private _controller: ApprovalController | undefined;
    private _unsubscribe: (() => void) | null = null;
    private _labels: Partial<Record<ApprovalMode, string>> = {};
    private readonly _onChange = (e: Event): void => {
        const detail = (e as CustomEvent<AparteSelectChangeDetail>).detail;
        const next = detail?.value as ApprovalMode;
        if (!this._controller || !APPROVAL_MODES.includes(next)) return;
        const previous = this._controller.getMode();
        this._controller.setMode(next);
        if (this._controller.getMode() !== previous) {
            this.dispatchEvent(new CustomEvent<AparteApprovalModeChangeDetail>('aparte-approval-mode-change', {
                bubbles: true, composed: true, detail: { mode: next, previousMode: previous },
            }));
        }
    };

    /** The label of each mode, for a localised host. Missing entries keep the English default. */
    get labels(): Partial<Record<ApprovalMode, string>> { return this._labels; }
    set labels(next: Partial<Record<ApprovalMode, string>>) {
        this._labels = next ?? {};
        if (this.isConnected) this._render();
    }

    /** The current mode, or `null` with no setup. */
    get mode(): ApprovalMode | null { return this._controller?.getMode() ?? null; }

    connectedCallback(): void {
        this._bind(resolveConfig(this));
    }

    disconnectedCallback(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this.querySelector('aparte-select')?.removeEventListener('aparte-select-change', this._onChange);
    }

    /** See `AparteConfigAware`: a boundary moved, so the controller may be another one. */
    aparteConfigChanged(next: AparteConfig): void {
        this._bind(next);
    }

    private _bind(cfg: AparteConfig): void {
        this._unsubscribe?.();
        this._controller = getApprovalController(cfg);
        if (!this._controller) {
            console.warn('[aparte] <aparte-approval-mode> found no approval setup on the config it resolves — call setupApproval() from @aparte/plugin-approval on that config (the scoped one if you passed a `config`, aparteGlobalConfig otherwise).');
        }
        this._unsubscribe = this._controller?.subscribe(() => this._syncValue()) ?? null;
        this._render();
    }

    private _render(): void {
        const controller = this._controller;
        const current = controller?.getMode();
        const options = APPROVAL_MODES.map((m) =>
            `<aparte-option value="${m}">${escapeHtml(this._labels[m] ?? DEFAULT_LABELS[m])}</aparte-option>`).join('');
        this.querySelector('aparte-select')?.removeEventListener('aparte-select-change', this._onChange);
        // The select carries no class of ours: `aparte-approval-mode aparte-select` is
        // already the address a consumer restyling it writes.
        this.innerHTML = `<aparte-select${current ? ` value="${current}"` : ''}${controller ? '' : ' disabled'} aria-label="Approval mode">${options}</aparte-select>`;
        this.querySelector('aparte-select')?.addEventListener('aparte-select-change', this._onChange);
    }

    private _syncValue(): void {
        const select = this.querySelector('aparte-select') as (HTMLElement & { value: string }) | null;
        const mode = this._controller?.getMode();
        if (select && mode && select.value !== mode) select.value = mode;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-approval-mode')) {
    customElements.define('aparte-approval-mode', AparteApprovalMode);
}
