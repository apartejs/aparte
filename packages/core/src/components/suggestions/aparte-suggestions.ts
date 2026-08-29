import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from '../composer/aparte-composer.js';

/**
 * One prompt starter: the text sent, or a visible label over a longer prompt.
 *
 * A string is both. The object form is for the case every welcome screen has —
 * "Write a haiku" on the chip, "Write a haiku about web components." in the request.
 */
export type AparteSuggestion = string | { label: string; prompt?: string };

/** Detail of `aparte-suggestion`: what was shown and what will be sent. */
export interface AparteSuggestionEventDetail {
    label: string;
    prompt: string;
}

const isSuggestion = (value: unknown): value is AparteSuggestion =>
    typeof value === 'string'
    || (typeof value === 'object' && value !== null && typeof (value as { label?: unknown }).label === 'string');

const labelOf = (s: AparteSuggestion): string => (typeof s === 'string' ? s : s.label);
const promptOf = (s: AparteSuggestion): string => (typeof s === 'string' ? s : (s.prompt ?? s.label));

/**
 * Prompt starters — a row of suggested prompts a reader clicks instead of typing.
 *
 * Every chat product opens on three or four of these, and the example app used to
 * hand-roll them: four `<button class="chip">`, a click handler, a CSS recipe of its
 * own. This element is that pattern done once, wearing the button recipe.
 *
 * A click goes THROUGH the composer — `setValue()` then `submit()` — never a synthetic
 * `aparte-send`. The composer's `submit()` is where every gate lives (disabled, already
 * streaming, `requireModelSelection`), and a chip that bypassed them once sent a
 * request with an empty model id while the composer was visibly greyed out. So the
 * element needs a composer: the nearest `<aparte-composer>` ancestor, else the one
 * serving the chat named by `target`, else the first one in the document.
 *
 * Tier (a) of ratified decision #8: core honours the click alone, so it is live by
 * default. `aparte-suggestion` fires first and is cancelable — `preventDefault()`
 * leaves the composer untouched, for an app that wants the prompt for itself.
 *
 * It declares no custom property of its own: the gap comes from the global
 * `--aparte-space-*` tokens and the chips from the `aparte-btn` recipe, so it inherits
 * a theme rather than exposing knobs to re-set.
 *
 * @element aparte-suggestions
 *
 * @attr {string} suggestions - The starters, as a JSON array: strings, or
 *     `{ "label", "prompt" }` objects when the visible label and the sent text differ.
 *     The `suggestions` PROPERTY takes the same shape without the JSON.
 * @attr {string} mode - `send` (default): the click fills the composer and submits.
 *     `fill`: the click fills the composer and focuses it, so the reader edits first.
 * @attr {boolean} empty-only - Hides the row (`hidden`) once its composer has sent
 *     something. Remove the attribute, or `hidden`, to show it again.
 * @attr {string} target - The id of the `<aparte-chat>` whose composer should receive
 *     the click, when the element is not inside that composer.
 * @attr {boolean} data-empty - Reflected BY the element while it has no suggestion to
 *     show; the stylesheet hides it then. Read-only, do not set it yourself.
 *
 * @fires {CustomEvent<AparteSuggestionEventDetail>} aparte-suggestion - A starter was
 *     clicked. Bubbles, and is cancelable: `preventDefault()` stops the composer from
 *     being filled or submitted.
 *
 * @example
 * <!-- The starters sit above the input, inside the composer; a click fills and sends. -->
 * <aparte-composer>
 *   <aparte-suggestions empty-only
 *     suggestions='["What is aparté?", {"label": "Write a haiku", "prompt": "Write a haiku about web components."}]'>
 *   </aparte-suggestions>
 *   <div class="aparte-composer-shell">
 *     <div class="aparte-composer-row">
 *       <aparte-composer-input></aparte-composer-input>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *   </div>
 * </aparte-composer>
 */
export class AparteSuggestions extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['suggestions', 'target'];
    }

    private _suggestions: AparteSuggestion[] = [];
    private _composer: AparteComposer | null = null;

    private _onSend = (): void => {
        if (this.hasAttribute('empty-only')) this.hidden = true;
    };

    private _onConfigChange = (): void => {
        const row = this.querySelector('.aparte-suggestions');
        if (row) row.setAttribute('aria-label', this._groupLabel());
    };

    /** The starters. Setting it re-renders; the `suggestions` attribute is the JSON form. */
    get suggestions(): AparteSuggestion[] {
        return this._suggestions;
    }

    set suggestions(value: AparteSuggestion[]) {
        this._suggestions = Array.isArray(value) ? value.filter(isSuggestion) : [];
        if (this.isConnected) this._render();
    }

    connectedCallback(): void {
        if (this.hasAttribute('suggestions')) this._readAttribute();
        this._render();
        this._watchComposer();
        window.addEventListener('aparte-config-change', this._onConfigChange);
    }

    disconnectedCallback(): void {
        this._composer?.removeEventListener('aparte-send', this._onSend);
        this._composer = null;
        window.removeEventListener('aparte-config-change', this._onConfigChange);
    }

    attributeChangedCallback(name: string): void {
        if (!this.isConnected) return;
        if (name === 'suggestions') {
            this._readAttribute();
            this._render();
        } else if (name === 'target') {
            this._watchComposer();
        }
    }

    private _groupLabel(): string {
        return resolveConfig(this).t('suggestionsLabel') || 'Suggested prompts';
    }

    private _parsed: string | null = null;

    /**
     * Parse the `suggestions` attribute once per value. The attribute callback and
     * `connectedCallback` both arrive for a parsed element, in an order the parser
     * decides; without this, an invalid value warned twice.
     */
    private _readAttribute(): void {
        const raw = this.getAttribute('suggestions');
        if (raw === null || raw === this._parsed) return;
        this._parsed = raw;
        try {
            const parsed: unknown = JSON.parse(raw);
            this._suggestions = Array.isArray(parsed) ? parsed.filter(isSuggestion) : [];
        } catch {
            console.warn('[aparte-suggestions] `suggestions` is not a JSON array. Use ["…"] or [{"label": "…", "prompt": "…"}].');
            this._suggestions = [];
        }
    }

    /**
     * The composer the click goes through, resolved the way the composer's own parts
     * resolve it — by ancestry first. Outside a composer, `target` names the chat and the
     * composer serving it is either inside that chat or points at it; the first composer
     * on the page is the last resort, so the one-chat page needs no attribute at all.
     */
    private _resolveComposer(): AparteComposer | null {
        const nearest = this.closest('aparte-composer');
        if (nearest) return nearest as AparteComposer;
        const target = this.getAttribute('target');
        if (target) {
            const scope = document.getElementById(target);
            const inside = scope?.querySelector('aparte-composer');
            if (inside) return inside as AparteComposer;
            for (const composer of document.querySelectorAll('aparte-composer[target]')) {
                if (composer.getAttribute('target') === target) return composer as AparteComposer;
            }
        }
        return document.querySelector('aparte-composer') as AparteComposer | null;
    }

    private _watchComposer(): void {
        this._composer?.removeEventListener('aparte-send', this._onSend);
        this._composer = this._resolveComposer();
        this._composer?.addEventListener('aparte-send', this._onSend);
    }

    private _render(): void {
        this.replaceChildren();
        if (this._suggestions.length === 0) {
            this.setAttribute('data-empty', '');
            return;
        }
        this.removeAttribute('data-empty');
        const row = document.createElement('div');
        row.className = 'aparte-suggestions';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', this._groupLabel());
        for (const suggestion of this._suggestions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'aparte-btn aparte-btn--surface aparte-btn--pill aparte-suggestion';
            button.textContent = labelOf(suggestion);
            const prompt = promptOf(suggestion);
            // The full prompt on hover when the chip shows a shorter label for it.
            if (prompt !== button.textContent) button.title = prompt;
            button.addEventListener('click', () => this._activate(suggestion));
            row.appendChild(button);
        }
        this.appendChild(row);
    }

    private _activate(suggestion: AparteSuggestion): void {
        const detail: AparteSuggestionEventDetail = { label: labelOf(suggestion), prompt: promptOf(suggestion) };
        const proceed = this.dispatchEvent(new CustomEvent<AparteSuggestionEventDetail>('aparte-suggestion', {
            detail, bubbles: true, composed: true, cancelable: true,
        }));
        if (!proceed) return;
        // Resolved again at click time: on a page that builds its composer after this
        // element, the one found at connection may have been nothing.
        const composer = this._composer ?? this._resolveComposer();
        if (!composer) {
            console.warn('[aparte-suggestions] no <aparte-composer> to send through — put the element inside one, or point `target` at the chat it serves.');
            return;
        }
        if (composer !== this._composer) this._watchComposer();
        composer.setValue(detail.prompt);
        if (this.getAttribute('mode') === 'fill') composer.focus();
        else composer.submit();
    }
}

if (!customElements.get('aparte-suggestions')) {
    customElements.define('aparte-suggestions', AparteSuggestions);
}
