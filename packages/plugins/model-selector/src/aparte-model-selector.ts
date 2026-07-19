/**
 * Aparté Model Selector
 *
 * Web Component for selecting an AI provider + model. Renders an `aparte-select`
 * primitive with providers grouped into `aparte-optgroup`s (a single provider
 * renders a flat list). Enables the BYOK (Bring Your Own Key) pattern.
 *
 * @element aparte-model-selector
 * @attr {boolean} auto-select - Auto-select the first model (default: false)
 * @attr {boolean} persist - Persist the selection through the config
 * @attr {boolean} searchable - Enable search in the dropdown
 * @attr {string} placeholder - Override the placeholder text
 *
 * @fires aparte-model-change - Fired when the selected model changes
 */

import {
    AparteConfig,
    resolveConfig,
    type AparteConfigClass,
    AparteSelect,
    type AparteOptgroup,
    type AparteAIProvider,
    type AparteAIModel,
    type AparteModelChangeEventDetail,
    type AparteSelectChangeDetail,
} from '@aparte/core';

interface ProviderModels {
    provider: AparteAIProvider;
    models: AparteAIModel[];
}

/**
 * Escape a value before it is interpolated into an HTML string (text node or
 * double-quoted attribute). Model names/ids come from a remote `/models`
 * endpoint and provider labels from consumer config — both hostile-by-default,
 * and both flow through `innerHTML` when the option list is (re)built.
 */
function esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class AparteModelSelector extends HTMLElement {
    private _currentProviderId: string | null = null;
    private _currentModelId: string | null = null;
    private _providerModels: ProviderModels[] = [];
    private _aparteSelect: AparteSelect | null = null;
    private _isLoading = false;
    private _isRendering = false;
    private _expandedGroups: Set<string> = new Set();

    /** Config governing THIS element — nearest instance boundary, else the global.
        Resolved on connect (multi-instance pages get their own config). */
    private _cfg: AparteConfigClass = AparteConfig;

    private _configUnsubscribe: (() => void) | null = null;

    // Bound handlers for cleanup
    private _boundHandleChange = this._handleChange.bind(this);
    private _handleOptgroupToggle = (e: Event): void => { void this._onOptgroupToggle(e); };

    static get observedAttributes(): string[] {
        return ['persist', 'auto-select', 'searchable', 'placeholder'];
    }

    async connectedCallback(): Promise<void> {
        this._cfg = resolveConfig(this);
        // Reset loading flag so a fresh mount always does a full load
        // (prevents a stale _isLoading=true from a previous mount blocking this one)
        this._isLoading = false;
        this._providerModels = [];

        this._setupEventListeners();

        // Seed selection from the resolved config first (handles race conditions)
        const config = this._cfg.getModelConfig();
        if (config.defaultProvider && config.defaultModel) {
            this._currentProviderId = config.defaultProvider;
            this._currentModelId = config.defaultModel;
        } else {
            this._loadPersistedSelection();
        }

        await this._loadAllProviderModels();
        this._render();

        // Listen for configuration changes (e.g. from an onboarding flow)
        this._configUnsubscribe = this._cfg.subscribe(() => {
            void (async () => {
                const cfg = this._cfg.getModelConfig();

                // Guard: only react if the model config actually changed relative to our state
                if (cfg.defaultProvider === this._currentProviderId &&
                    cfg.defaultModel === this._currentModelId &&
                    this._providerModels.length > 0) {
                    return;
                }

                this._loadPersistedSelection();
                await this._loadAllProviderModels();
                this._render();
            })();
        });
    }

    disconnectedCallback(): void {
        this._aparteSelect?.removeEventListener('aparte-select-change', this._boundHandleChange);
        this.removeEventListener('aparte-optgroup-toggle', this._handleOptgroupToggle);
        this._configUnsubscribe?.();
    }

    attributeChangedCallback(): void {
        if (this.isConnected && !this._isLoading) {
            this._render();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /** Current provider ID. */
    get providerId(): string | null {
        return this._currentProviderId;
    }

    /** Current model ID. */
    get modelId(): string | null {
        return this._currentModelId;
    }

    /** Programmatically set the selection. */
    setSelection(providerId: string, modelId: string): void {
        this._currentProviderId = providerId;
        this._currentModelId = modelId;

        const compositeValue = `${providerId}::${modelId}`;
        if (this._aparteSelect) {
            this._aparteSelect.value = compositeValue;
        }

        this._emitChange();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Data Loading
    // ─────────────────────────────────────────────────────────────────────────

    private async _loadAllProviderModels(): Promise<void> {
        if (this._isLoading) return;
        this._isLoading = true;

        try {
            const providers = this._cfg.getAIProviders();

            // Deduplicate providers by ID just in case
            const uniqueProviders = Array.from(new Map(providers.map(p => [p.id, p])).values());

            const config = this._cfg.getModelConfig();

            // Store in a temporary list to avoid mid-render state corruption
            const tempList: ProviderModels[] = [];

            // Fetch all providers in parallel
            await Promise.all(uniqueProviders.map(async (provider) => {
                try {
                    const models = await this._cfg.refreshProviderModels(provider.id);

                    // Apply model filters if configured
                    const filters = config.modelFilters?.[provider.id];
                    const filteredModels = filters?.length
                        ? models.filter(m => filters.includes(m.id))
                        : models;

                    if (filteredModels.length > 0) {
                        tempList.push({ provider, models: filteredModels });
                    }
                } catch (error) {
                    console.warn(`[AparteModelSelector] Failed to load models for ${provider.id}:`, error);
                }
            }));

            this._providerModels = tempList;
        } finally {
            this._isLoading = false;
        }
    }

    private async _onOptgroupToggle(e: Event): Promise<void> {
        const detail = (e as CustomEvent).detail;

        // Track expansion state
        if (detail.collapsed) {
            this._expandedGroups.delete(detail.label);
            return;
        }

        this._expandedGroups.add(detail.label);

        // Find which provider this optgroup belongs to
        const pm = this._providerModels.find(p => p.provider.getMetadata().name === detail.label);
        if (!pm || !pm.provider.fetchModels) return;

        // Show a loading state on the optgroup while we lazily fetch its models
        const groupEl = e.target as HTMLElement;
        if (groupEl && groupEl.tagName === 'APARTE-OPTGROUP') {
            (groupEl as AparteOptgroup).loading = true;
        }

        try {
            // Retrieve latest models via Config (provider-agnostic)
            const freshModels = await this._cfg.refreshProviderModels(pm.provider.id);

            if (freshModels && freshModels.length > 0) {
                pm.models = freshModels;
                this._render(true);
            }
        } catch (error) {
            console.error(`[AparteModelSelector] Lazy fetch failed for ${pm.provider.id}:`, error);
        } finally {
            const el = e.target as HTMLElement;
            if (el && el.tagName === 'APARTE-OPTGROUP') {
                (el as AparteOptgroup).loading = false;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────────────────────

    private _render(keepOpen = false): void {
        if (this._isRendering) return;
        this._isRendering = true;

        // Attribute overrides locale
        const localePlaceholder = this._cfg.getLocale()['modelSelectorPlaceholder'] || 'Select a model...';
        const placeholder = this.getAttribute('placeholder') || localePlaceholder;
        const searchable = this.hasAttribute('searchable');
        const autoSelect = this.hasAttribute('auto-select');

        // Capture current open state of aparte-select if it exists
        const wasOpen = keepOpen || this._aparteSelect?.hasAttribute('open');

        // Determine current value
        let currentValue = this._currentModelId ? `${this._currentProviderId}::${this._currentModelId}` : '';

        if (!currentValue && autoSelect) {
            const first = this._providerModels[0];
            const firstModel = first?.models[0];
            if (first && firstModel) {
                this._currentProviderId = first.provider.id;
                this._currentModelId = firstModel.id;
                currentValue = `${this._currentProviderId}::${this._currentModelId}`;
                // Emit the initial change once the element settles
                setTimeout(() => this._emitChange(), 0);
            }
        }

        // Build options HTML — single provider: flat list; multiple: grouped optgroups
        const only = this._providerModels[0];
        const singleProvider = this._providerModels.length === 1;
        const optionsHtml = singleProvider && only
            ? only.models.map(m => {
                const key = `${only.provider.id}::${m.id}`;
                return `<aparte-option value="${esc(key)}">${esc(m.name)}</aparte-option>`;
            }).join('')
            : this._providerModels.map(pm => {
                const label = pm.provider.getMetadata().name;
                const isCollapsed = !this._expandedGroups.has(label);
                return `
                    <aparte-optgroup
                        label="${esc(label)}"
                        collapsible
                        ${isCollapsed ? 'collapsed' : ''}
                    >
                        ${pm.models.map(m => {
                            const key = `${pm.provider.id}::${m.id}`;
                            return `<aparte-option value="${esc(key)}">${esc(m.name)}</aparte-option>`;
                        }).join('')}
                    </aparte-optgroup>
                `;
            }).join('');

        if (this._aparteSelect) {
            // Non-destructive update of attributes
            this._aparteSelect.setAttribute('placeholder', placeholder);
            if (currentValue) this._aparteSelect.setAttribute('value', currentValue);
            else this._aparteSelect.removeAttribute('value');

            if (searchable) this._aparteSelect.setAttribute('searchable', '');
            else this._aparteSelect.removeAttribute('searchable');

            if (wasOpen) this._aparteSelect.setAttribute('open', '');
            else this._aparteSelect.removeAttribute('open');

            if (!singleProvider) this._aparteSelect.setAttribute('grouped', '');
            else this._aparteSelect.removeAttribute('grouped');

            // Update children cleanly: prefer direct container update if available
            const optionsContainer = this._aparteSelect.querySelector('.aparte-select-options');
            if (optionsContainer) {
                // Direct update (faster, skips the observer)
                optionsContainer.innerHTML = optionsHtml;

                // Force label re-evaluation: remove then re-set value so aparte-select
                // re-scans the newly injected options (setAttribute guard blocks same-value updates)
                if (currentValue) {
                    this._aparteSelect.removeAttribute('value');
                    this._aparteSelect.setAttribute('value', currentValue);
                }
            } else {
                // Fallback: self-healing mode
                const temp = document.createElement('div');
                temp.innerHTML = optionsHtml;
                const newChildren = Array.from(temp.children);

                const childrenToRemove = Array.from(this._aparteSelect.children).filter(c =>
                    c.tagName === 'APARTE-OPTION' || c.tagName === 'APARTE-OPTGROUP'
                );
                childrenToRemove.forEach(c => c.remove());

                newChildren.forEach(c => this._aparteSelect?.appendChild(c));
            }

            // Critical: re-apply value after a microtask so AparteSelect has processed
            // the new options and can resolve the label.
            if (currentValue) {
                setTimeout(() => {
                    if (this._aparteSelect) {
                        this._aparteSelect.value = currentValue;
                    }
                }, 0);
            }
        } else {
            // Full initial render
            this.innerHTML = `
                <aparte-select
                    class="aparte-model-selector-select"
                    placeholder="${esc(placeholder)}"
                    ${currentValue ? `value="${esc(currentValue)}"` : ''}
                    ${searchable ? 'searchable' : ''}
                    ${wasOpen ? 'open' : ''}
                    ${!singleProvider ? 'grouped' : ''}
                >
                    ${optionsHtml}
                </aparte-select>
            `;
            this._aparteSelect = this.querySelector('aparte-select');
            this._setupEventListeners();
        }
        this._isRendering = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Handling
    // ─────────────────────────────────────────────────────────────────────────

    private _setupEventListeners(): void {
        this._aparteSelect?.addEventListener('aparte-select-change', this._boundHandleChange);
        this.addEventListener('aparte-optgroup-toggle', this._handleOptgroupToggle);
    }

    private _handleChange(e: Event): void {
        const detail = (e as CustomEvent<AparteSelectChangeDetail>).detail;
        const previousProviderId = this._currentProviderId;
        const previousModelId = this._currentModelId;

        // Parse composite value "providerId::modelId"
        const [providerId, modelId] = detail.value.split('::');

        this._currentProviderId = providerId || null;
        this._currentModelId = modelId || null;

        this._emitChange(previousProviderId, previousModelId);
    }

    private _emitChange(previousProviderId?: string | null, previousModelId?: string | null): void {
        const detail: AparteModelChangeEventDetail = {
            providerId: this._currentProviderId || undefined,
            modelId: this._currentModelId || '',
            previousProviderId: previousProviderId || undefined,
            previousModelId: previousModelId || undefined,
        };

        this.dispatchEvent(new CustomEvent<AparteModelChangeEventDetail>('aparte-model-change', {
            bubbles: true,
            composed: true,
            detail,
        }));

        // Persist if enabled
        if (this.hasAttribute('persist')) {
            this._persistSelection();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistence (opt-in)
    // ─────────────────────────────────────────────────────────────────────────

    private _persistSelection(): void {
        if (!this._currentProviderId || !this._currentModelId) return;

        // Sync with the config — auto-save is handled by its setModelConfig()
        // if a AparteModelPreferenceProvider has been registered by the host app.
        const currentConfig = this._cfg.getModelConfig();
        if (currentConfig.defaultProvider === this._currentProviderId &&
            currentConfig.defaultModel === this._currentModelId) {
            return;
        }

        this._cfg.setModelConfig({
            defaultProvider: this._currentProviderId,
            defaultModel: this._currentModelId,
        });
    }

    private _loadPersistedSelection(): void {
        // The resolved config is the single source of truth. The host app is
        // responsible for restoring preferences into it (via restoreModelPreference())
        // before this component mounts.
        const config = this._cfg.getModelConfig();
        if (config.defaultProvider && config.defaultModel) {
            this._currentProviderId = config.defaultProvider;
            this._currentModelId = config.defaultModel;
        }
        // else: no-op — the config is empty
    }
}

// Register the custom element
if (!customElements.get('aparte-model-selector')) {
    customElements.define('aparte-model-selector', AparteModelSelector);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-model-selector': AparteModelSelector;
    }
}
