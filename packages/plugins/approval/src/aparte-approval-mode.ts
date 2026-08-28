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
    resolveConfig, subscribeConfigChange, escapeHtml, escapeAttr,
    type AparteConfig, type AparteConfigAware, type AparteSelectChangeDetail,
    type AparteApprovalModeChangeEventDetail,
} from '@aparte/core';
import { getApprovalController, type ApprovalController } from './approval.js';
import { APPROVAL_MODES, type ApprovalMode } from './policy.js';

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
    private _cfg: AparteConfig | null = null;
    private _controller: ApprovalController | undefined;
    private _unsubscribe: (() => void) | null = null;
    private _configUnsubscribe: (() => void) | null = null;
    private _bound = false;
    private _labels: Partial<Record<ApprovalMode, string>> = {};
    private readonly _onChange = (e: Event): void => {
        const detail = (e as CustomEvent<AparteSelectChangeDetail>).detail;
        const next = detail?.value as ApprovalMode;
        if (!this._controller || !APPROVAL_MODES.includes(next)) return;
        const previous = this._controller.getMode();
        this._controller.setMode(next);
        if (this._controller.getMode() !== previous) {
            this.dispatchEvent(new CustomEvent<AparteApprovalModeChangeEventDetail>('aparte-approval-mode-change', {
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
        // A setup that arrives AFTER this element mounted (a later script, a dynamic
        // import), or one that goes away (`dispose()`, `config.reset()`): the config
        // notifies on `setApprovalPolicy`, and the switch re-resolves its controller
        // rather than staying disabled — or wired to nothing — for the life of the page.
        this._configUnsubscribe = subscribeConfigChange(this, () => this._bind(resolveConfig(this)));
    }

    disconnectedCallback(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._configUnsubscribe?.();
        this._configUnsubscribe = null;
        this._bound = false;
        this.querySelector('aparte-select')?.removeEventListener('aparte-select-change', this._onChange);
    }

    /** See `AparteConfigAware`: a boundary moved, so the controller may be another one. */
    aparteConfigChanged(next: AparteConfig): void {
        this._bind(next);
    }

    private _bind(cfg: AparteConfig): void {
        const next = getApprovalController(cfg);
        // An unrelated notify (a locale, a provider) must not rebuild the select under an
        // open dropdown: same config, same controller, nothing to rebind.
        if (this._bound && cfg === this._cfg && next === this._controller) return;
        this._bound = true;
        this._cfg = cfg;
        this._unsubscribe?.();
        this._controller = next;
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
            `<aparte-option value="${escapeAttr(m)}">${escapeHtml(this._labels[m] ?? DEFAULT_LABELS[m])}</aparte-option>`).join('');
        this.querySelector('aparte-select')?.removeEventListener('aparte-select-change', this._onChange);
        // The select carries no class of ours: `aparte-approval-mode aparte-select` is
        // already the address a consumer restyling it writes.
        // The accessible name follows the locale like the option labels do — a
        // literal here was the one string a localised host could not translate.
        const aria = String(this._cfg?.getLocale()['approvalModeLabel'] || 'Approval mode');
        this.innerHTML = `<aparte-select${current ? ` value="${escapeAttr(current)}"` : ''}${controller ? '' : ' disabled'} aria-label="${escapeAttr(aria)}">${options}</aparte-select>`;
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
