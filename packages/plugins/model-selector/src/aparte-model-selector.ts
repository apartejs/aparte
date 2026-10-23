import {
    aparteGlobalConfig,
    escapeAttr,
    resolveConfig,
    type AparteConfig,
    type AparteConfigAware,
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
    // Coerce, then delegate: core owns the escaping. This local copy used to
    // inline it and, like two of its eight siblings across the scope, left the
    // apostrophe through — enough to break out of a single-quoted attribute.
    return escapeAttr(String(value ?? ''));
}

/**
 * Selects an AI provider and a model. Renders an `<aparte-select>` with providers
 * grouped into `<aparte-optgroup>`s — a single provider renders a flat list — which is
 * what makes the BYOK pattern possible without core knowing about any vendor.
 *
 * These tags sat at the top of the file, above the imports and a helper, so nothing
 * read them: TypeScript associates only the comment adjacent to the declaration. This
 * package ships no manifest of its own today (only `@aparte/core` runs `cem analyze`),
 * so the loss was invisible to tooling — but it is also what an editor shows on hover,
 * and what a typed framework wrapper is written from.
 *
 * @element aparte-model-selector
 * @attr {boolean} auto-select - Selects the first model as soon as one is available.
 * @attr {boolean} persist - Writes the selection into the config, which is what the next message is sent with.
 *   Without it the picker only fires `aparte-model-change`, and applying the choice is the app's. It does not
 *   outlive a reload on its own: that takes `setModelPreferenceProvider()` and `restoreModelPreference()`.
 * @attr {boolean} searchable - Adds the dropdown's filter field.
 * @attr {boolean} details - Shows, under each model's name, its `description` and its `contextWindow` — the metadata a provider already declares. The trigger keeps the name alone; the filter searches the line too.
 * @attr {string} placeholder - Overrides the text shown while nothing is selected.
 * @attr {boolean} disabled - Disables the picker. Inside an `<aparte-composer>` it also follows the
 *   composer's own `disabled`, so a disabled composer does not leave its model picker operable.
 *
 * @fires {CustomEvent<AparteModelChangeEventDetail>} aparte-model-change - The provider or the model changed; carries both ids.
 *
 * @example
 * <!-- Mount it in the composer's toolbar; it reads the models the config already knows. -->
 * <aparte-composer-toolbar>
 *   <aparte-model-selector searchable placeholder="Pick a model"></aparte-model-selector>
 * </aparte-composer-toolbar>
 */
export class AparteModelSelector extends HTMLElement implements AparteConfigAware {
    private _currentProviderId: string | null = null;
    private _currentModelId: string | null = null;
    private _providerModels: ProviderModels[] = [];
    private _aparteSelect: AparteSelect | null = null;
    private _isLoading = false;
    private _isRendering = false;
    /** A load was asked for while one ran; the running one goes round again. */
    private _reloadQueued = false;
    /** Bumped by {@link _restartLoading}: a load of an older generation discards its result. */
    private _loadGeneration = 0;
    /** The providers the current list was built from, as {@link _providersKey} gives them. */
    private _loadedProvidersKey = '';
    private _expandedGroups: Set<string> = new Set();

    /**
     * Config governing THIS element — nearest instance boundary, else the global.
     *
     * Cached rather than resolved per call, because this element does not only
     * READ it: it holds a `subscribe()` registration keyed on the object. That
     * cache is only correct if something tells us when the boundary changes, and
     * under all four wrappers it does change after we connect —
     * `AparteChatHost.bind()` runs `attachConfig` from a post-mount hook. Hence
     * {@link AparteConfigAware}; without it this element served the global config's
     * providers to a chat that was given its own.
     */
    private _cfg: AparteConfig = aparteGlobalConfig;

    private _configUnsubscribe: (() => void) | null = null;

    // Bound handlers for cleanup
    private _boundHandleChange = this._handleChange.bind(this);
    private _handleOptgroupToggle = (e: Event): void => { void this._onOptgroupToggle(e); };
    /** The composer we sit in, if any — its `disabled` is ours too. */
    private _composer: Element | null = null;
    private _boundComposerChange = (): void => { this._syncDisabled(); };

    static get observedAttributes(): string[] {
        return ['persist', 'auto-select', 'searchable', 'placeholder', 'disabled', 'details'];
    }

    async connectedCallback(): Promise<void> {
        this._cfg = resolveConfig(this);
        // A fresh mount always does a full load, whatever a previous mount left running.
        this._restartLoading();
        this._providerModels = [];

        this._setupEventListeners();
        // The public event, not the composer's private bus: a disabled composer says so
        // through `aparte-composer-change`, and the picker inside it follows.
        this._composer = this.closest('aparte-composer');
        this._composer?.addEventListener('aparte-composer-change', this._boundComposerChange);

        // Seed selection from the resolved config first (handles race conditions)
        this._seenConfigSelection = this._configSelectionKey();
        const config = this._cfg.getModelConfig();
        if (config.defaultProvider && config.defaultModel) {
            this._currentProviderId = config.defaultProvider;
            this._currentModelId = config.defaultModel;
        } else {
            this._loadPersistedSelection();
        }

        // Subscribe BEFORE the first load, not after it. Importing this plugin defines the
        // element, and a tag already in the page connects right then — before the module
        // that imported it has run the rest of its body, which is where the providers get
        // registered. Subscribed after the `await`, that registration fired into nothing
        // and the picker stayed empty for the life of the page.
        this._subscribeToConfig();
        if (await this._loadAllProviderModels()) this._render();
    }

    /**
     * The config's own selection when this element last read it. A change to IT is someone
     * choosing a model (an onboarding flow, `setModelConfig`); every other config change — a
     * language, a provider, an icon — leaves the person's own pick alone. Compared with the
     * pick instead, a pick made without `persist` (which writes nothing to the config) was
     * put back to the config's default by the next unrelated change.
     */
    private _seenConfigSelection = '';

    private _configSelectionKey(): string {
        const c = this._cfg.getModelConfig();
        return `${c.defaultProvider ?? ''}::${c.defaultModel ?? ''}`;
    }

    /** The registered providers, as one comparable string: what the list was built from. */
    private _providersKey(): string {
        return this._cfg.getAIProviders().map(p => p.id).join('\n');
    }

    /** Listen for configuration changes (e.g. from an onboarding flow). */
    private _subscribeToConfig(): void {
        this._configUnsubscribe?.();
        this._configUnsubscribe = this._cfg.subscribe(() => {
            void (async () => {
                // Guard: only react if the model config actually changed relative to what we
                // read — its selection, or the set of providers the list was built from
                // (an app that registers a provider once a key is typed in its settings).
                const selectionMoved = this._configSelectionKey() !== this._seenConfigSelection;
                if (!selectionMoved &&
                    this._providerModels.length > 0 &&
                    this._providersKey() === this._loadedProvidersKey) {
                    // …but a config change is not only a MODEL change. A language
                    // switch fires this subscription too, hit this guard, and left
                    // the placeholder in the previous language — the one string this
                    // element takes from the locale, and the only one a user sees
                    // before opening the list.
                    //
                    // The guard stays: a full `_render()` re-loads every provider's
                    // models asynchronously and would close an open dropdown and
                    // discard a typed search. So the cheap path is a relabel — one
                    // attribute, no rebuild — which is the same contract a segment
                    // renderer's `relabel` works under.
                    this._relabel();
                    return;
                }

                if (selectionMoved) {
                    this._seenConfigSelection = this._configSelectionKey();
                    this._loadPersistedSelection();
                }
                if (await this._loadAllProviderModels()) this._render();
            })();
        });
    }

    /**
     * Re-apply the one string this element takes from the locale, in place.
     *
     * An explicit `placeholder` attribute still wins, exactly as it does at render
     * time: the app's own copy is not the locale's to overwrite.
     */
    private _relabel(): void {
        if (!this._aparteSelect) return;
        const fromLocale = this._cfg.getLocale()['modelSelectorPlaceholder'] || 'Select a model...';
        this._aparteSelect.setAttribute('placeholder', this.getAttribute('placeholder') || fromLocale);
        // The `details` lines are locale text too ("{n} context", the number's format): written
        // in place, so an open list and a typed search survive the language switch.
        if (!this.hasAttribute('details')) return;
        // One lookup of the options and one number format for the whole list: a catalogue
        // of hundreds of models is relabelled on every config change.
        const options = new Map(Array.from(this.querySelectorAll('aparte-option'), (o) => [o.getAttribute('value'), o]));
        const tokens = this._tokenFormat();
        for (const pm of this._providerModels) {
            for (const m of pm.models) {
                const line = options.get(`${pm.provider.id}::${m.id}`)?.querySelector('.aparte-option__meta');
                if (line) line.textContent = this._metaText(m, tokens);
            }
        }
    }

    /** How a token count is written in the locale's language: 128K, 128 k… */
    private _tokenFormat(): Intl.NumberFormat {
        return new Intl.NumberFormat(this._cfg.getLocale().tag || undefined, { notation: 'compact', maximumFractionDigits: 1 });
    }

    /** The line under a model's name with `details`: what its provider declares about it. */
    private _metaText(m: { description?: string; contextWindow?: number }, tokens: Intl.NumberFormat): string {
        const parts: string[] = [];
        if (m.description) parts.push(m.description);
        if (m.contextWindow && m.contextWindow > 0) {
            const size = tokens.format(m.contextWindow);
            parts.push((this._cfg.t('modelContextWindow') || '{n} context').replace('{n}', () => size));
        }
        return parts.join(' · ');
    }

    disconnectedCallback(): void {
        this._aparteSelect?.removeEventListener('aparte-select-change', this._boundHandleChange);
        this.removeEventListener('aparte-optgroup-toggle', this._handleOptgroupToggle);
        this._composer?.removeEventListener('aparte-composer-change', this._boundComposerChange);
        this._composer = null;
        this._configUnsubscribe?.();
    }

    /**
     * The boundary above us appeared or changed: move the subscription and reload,
     * because a different config means different providers and a different
     * selection.
     *
     * See {@link AparteConfigAware}. The element's own per-instance tests passed
     * before this existed only because they mount the boundary FIRST — the one
     * ordering no wrapper produces.
     */
    aparteConfigChanged(next: AparteConfig): void {
        this._configUnsubscribe?.();
        this._configUnsubscribe = null;
        this._cfg = next;
        if (!this.isConnected) return;
        void (async () => {
            this._restartLoading();
            this._providerModels = [];
            this._seenConfigSelection = this._configSelectionKey();
            const model = this._cfg.getModelConfig();
            if (model.defaultProvider && model.defaultModel) {
                this._currentProviderId = model.defaultProvider;
                this._currentModelId = model.defaultModel;
            } else {
                this._loadPersistedSelection();
            }
            this._subscribeToConfig();
            if (await this._loadAllProviderModels()) this._render();
        })();
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

    /**
     * Load every provider's models. A call that arrives while a load runs does not start a
     * second one and does not vanish either: the running load goes round again, reading
     * what changed meanwhile, and answers `false` so its caller leaves the render to the
     * load that is still running.
     */
    private async _loadAllProviderModels(): Promise<boolean> {
        if (this._isLoading) {
            this._reloadQueued = true;
            return false;
        }
        const generation = this._loadGeneration;
        this._isLoading = true;
        try {
            do {
                this._reloadQueued = false;
                await this._loadOnce(generation);
            } while (this._reloadQueued && this.isConnected && generation === this._loadGeneration);
        } finally {
            // A restart already handed the flag to the load that replaced this one.
            if (generation === this._loadGeneration) this._isLoading = false;
        }
        return generation === this._loadGeneration;
    }

    /**
     * Start over: a mount, or a new config above us. A load still in flight from before
     * keeps running — its fetches cannot be called back — but it is now of an older
     * generation, so it discards what it brings back instead of writing it over the list
     * the new load builds. Under every wrapper this is the normal order: the element
     * connects on the global config, then `bind()` attaches the chat's own, and a slow
     * global `/models` used to land last and win.
     */
    private _restartLoading(): void {
        this._loadGeneration++;
        this._isLoading = false;
        this._reloadQueued = false;
    }

    private async _loadOnce(generation: number): Promise<void> {
        const providersKey = this._providersKey();
        const providers = this._cfg.getAIProviders();

        // Deduplicate providers by ID just in case
        const uniqueProviders = Array.from(new Map(providers.map(p => [p.id, p])).values());

        const config = this._cfg.getModelConfig();

        // Store in a temporary list to avoid mid-render state corruption.
        //
        // Indexed by REGISTRATION order, not filled by completion order. The
        // fetches run in parallel, so a `push` here ordered the dropdown — and
        // therefore what `auto-select` picks — by whichever /models endpoint
        // answered first. A cloud provider on a CDN beats a local server that
        // has to wake up, so an app registering `[OLLAMA, LMSTUDIO, OPENROUTER]`
        // could silently land on the paid one, and land on a different one on
        // the next reload. `auto-select` documents itself as "the first model";
        // first has to mean first, not fastest.
        const tempList: (ProviderModels | undefined)[] = new Array(uniqueProviders.length);

        // Fetch all providers in parallel
        await Promise.all(uniqueProviders.map(async (provider, i) => {
            try {
                // A provider with a fixed list has no `fetchModels`: its `getModels()` IS the
                // list, and `refreshProviderModels` answers `[]` for it.
                const models = provider.fetchModels
                    ? await this._cfg.refreshProviderModels(provider.id)
                    : provider.getModels();

                // Apply model filters if configured
                const filters = config.modelFilters?.[provider.id];
                const filteredModels = filters?.length
                    ? models.filter(m => filters.includes(m.id))
                    : models;

                if (filteredModels.length > 0) {
                    tempList[i] = { provider, models: filteredModels };
                }
            } catch (error) {
                console.warn(`[AparteModelSelector] Failed to load models for ${provider.id}:`, error);
            }
        }));

        if (generation !== this._loadGeneration) return;
        // The holes are the providers that failed or returned nothing: dropped,
        // which keeps the order of the survivors.
        this._providerModels = tempList.filter((pm): pm is ProviderModels => pm !== undefined);
        this._loadedProvidersKey = providersKey;
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

    /** Our own attribute, or the disabled state of the composer we sit in. */
    private _isDisabled(): boolean {
        return this.hasAttribute('disabled') || (this._composer?.hasAttribute('disabled') ?? false);
    }

    private _syncDisabled(): void {
        this._aparteSelect?.toggleAttribute('disabled', this._isDisabled());
    }

    private _render(keepOpen = false): void {
        if (this._isRendering) return;
        this._isRendering = true;

        try {
            this._renderImpl(keepOpen);
        } finally {
            this._isRendering = false;
        }
    }

    private _renderImpl(keepOpen: boolean): void {
        // Attribute overrides locale
        const localePlaceholder = this._cfg.getLocale()['modelSelectorPlaceholder'] || 'Select a model...';
        const placeholder = this.getAttribute('placeholder') || localePlaceholder;
        const searchable = this.hasAttribute('searchable');
        // The line under a name: what the provider declares about the model, when asked for.
        const details = this.hasAttribute('details');
        const tokens = details ? this._tokenFormat() : null;
        const meta = (m: { description?: string; contextWindow?: number }): string => {
            const text = tokens ? this._metaText(m, tokens) : '';
            return text ? `<span class="aparte-option__meta">${esc(text)}</span>` : '';
        };
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
        const optionsHtml = singleProvider && only  // safe-text: every value below goes through esc(); the tags are this file's own
            ? only.models.map(m => {
                const key = `${only.provider.id}::${m.id}`;
                return `<aparte-option value="${esc(key)}">${esc(m.name)}${meta(m)}</aparte-option>`;
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
                            return `<aparte-option value="${esc(key)}">${esc(m.name)}${meta(m)}</aparte-option>`;
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

            this._syncDisabled();

            if (wasOpen) this._aparteSelect.setAttribute('open', '');
            else this._aparteSelect.removeAttribute('open');

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
            // Full initial render.
            //
            // The select carries no class of ours: this element is already addressable
            // as `aparte-model-selector aparte-select`, which is what a consumer
            // restyling it writes. The `aparte-model-selector-select` that used to be
            // here carried no CSS and was queried by nothing — it named the element a
            // second time, and a class that neither styles nor selects is not a hook.
            this.innerHTML = `
                <aparte-select
                    placeholder="${esc(placeholder)}"
                    ${currentValue ? `value="${esc(currentValue)}"` : ''}
                    ${searchable ? 'searchable' : ''}
                    ${this._isDisabled() ? 'disabled' : ''}
                    ${wasOpen ? 'open' : ''}
                >
                    ${optionsHtml}
                </aparte-select>
            `;
            this._aparteSelect = this.querySelector('aparte-select');
            this._setupEventListeners();
        }
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

        this._seenConfigSelection = `${this._currentProviderId}::${this._currentModelId}`;
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
