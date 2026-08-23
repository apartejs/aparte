/**
 * <aparte-elicitation> — the default elicitation presenter.
 *
 * Registers itself as the presenter for the config governing its subtree
 * (`resolveConfig(this)`), so `requestUserInput()` from a tool handler is routed
 * here WITHOUT any window events — the typed presenter contract replaces the
 * stringly-typed `aparte-ask-question-*` events that drifted in Phase 1.
 *
 * On a request it builds the schema-appropriate panel (enum / boolean / string /
 * object) and mounts it inside the nearest `<aparte-composer>` via its
 * `showPanel` API, resolving:
 *   - accept  — the send button (panel submit), when all fields are complete
 *   - decline — the inline "Skip" affordance
 *   - cancel  — the assistant turn was stopped/errored while pending
 *
 * Place anywhere inside the chat (it renders nothing itself):
 *   <aparte-elicitation></aparte-elicitation>
 */

import { resolveConfig, type AparteConfigAware } from '../../config/config-context.js';
import type { AparteConfig } from '../../config/aparte-config.js';
import { buildElicitationPanel, type BuiltElicitationPanel } from '../../elicitation/panel.js';
import type { AparteElicitationRequest, AparteElicitationResult, AparteElicitationPresenter } from '../../elicitation/types.js';

type ComposerEl = HTMLElement & {
    showPanel(panel: HTMLElement, options?: { submitEnabled?: boolean; onSubmit?: () => void }): void;
    hidePanel(): void;
    setPanelSubmitEnabled(enabled: boolean): void;
};

interface Pending {
    settle(result: AparteElicitationResult): void;
    composer: ComposerEl;
}

/**
 * @example
 * <!-- Renders nothing by itself: it registers as the presenter for its subtree, so a
 *      tool handler calling requestUserInput() gets its panel mounted in the composer. -->
 * <aparte-chat>
 *   <aparte-chat-viewport></aparte-chat-viewport>
 *   <aparte-elicitation></aparte-elicitation>
 *   <aparte-composer>
 *     <div class="aparte-composer-row">
 *       <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *   </aparte-composer>
 * </aparte-chat>
 */
export class AparteElicitation extends HTMLElement implements AparteConfigAware {
    private _pending: Pending | null = null;
    /**
     * A turn ended — cancel the open question only if it was OUR turn.
     *
     * These two listeners sit on `window` and had no instance filter at all, so a
     * Stop (or an error) in one chat cancelled the question a DIFFERENT chat was
     * waiting on — and that chat's model was told the user had refused a question
     * the user was still looking at. Same defect as the `compact()` handler that
     * emptied both chats, which its four sibling handlers in `AparteClient` already
     * guarded against.
     *
     * The leniency rule is the composer's, deliberately: an event with no
     * `targetId` is for everyone (a single-chat app never sets one), and a chat we
     * cannot identify accepts everything rather than becoming deaf. Only a
     * MISMATCH is ignored.
     */
    private _onTurnEnd = (e: Event): void => {
        const evtTargetId = (e as CustomEvent).detail?.targetId as string | undefined;
        const own = this._pendingTargetId();
        if (evtTargetId && own && evtTargetId !== own) return;
        this._cancelPending();
    };

    connectedCallback(): void {
        this.style.display = 'none';
        this._injectStyles();
        // Become the presenter for this instance's config (or the global one).
        resolveConfig(this).setElicitationPresenter(this._present);
        // Safety net: if the turn is stopped/errored while a request is open,
        // resolve it as cancelled so the client loop unblocks and the composer
        // input is restored.
        window.addEventListener('aparte-message-aborted', this._onTurnEnd);
        window.addEventListener('aparte-message-error', this._onTurnEnd);
    }

    /**
     * The boundary above us appeared, changed, or went away — move the
     * registration with it.
     *
     * `connectedCallback` alone is not enough and cannot be: registering is a
     * WRITE, and under all four wrappers it happens before `attachConfig` runs, so
     * it lands on the global singleton. `requestUserInput()` then resolves the
     * instance config, finds nothing, and answers the model `cancel` — the model
     * hears the user refuse a question the user never saw.
     *
     * See {@link AparteConfigAware}.
     */
    aparteConfigChanged(next: AparteConfig, previous: AparteConfig): void {
        if (previous.getElicitationPresenter() === this._present) previous.setElicitationPresenter(null);
        next.setElicitationPresenter(this._present);
    }

    disconnectedCallback(): void {
        const cfg = resolveConfig(this);
        if (cfg.getElicitationPresenter() === this._present) cfg.setElicitationPresenter(null);
        window.removeEventListener('aparte-message-aborted', this._onTurnEnd);
        window.removeEventListener('aparte-message-error', this._onTurnEnd);
        this._cancelPending();
    }

    private _present: AparteElicitationPresenter = (request: AparteElicitationRequest) => {
        // One request at a time — a concurrent request is declined rather than
        // clobbering the open panel.
        if (this._pending) return Promise.resolve<AparteElicitationResult>({ action: 'cancel' });
        const composer = this._getComposer();
        if (!composer) return Promise.resolve<AparteElicitationResult>({ action: 'cancel' });

        return new Promise<AparteElicitationResult>((resolve) => {
            let done = false;
            const settle = (result: AparteElicitationResult): void => {
                if (done) return;
                done = true;
                this._pending = null;
                composer.hidePanel();
                resolve(result);
            };

            // Caller-side cancellation (tool handler signal: timeout / turn abort).
            if (request.signal) {
                if (request.signal.aborted) { settle({ action: 'cancel' }); return; }
                request.signal.addEventListener('abort', () => settle({ action: 'cancel' }), { once: true });
            }

            const panel: BuiltElicitationPanel = buildElicitationPanel(request.message, request.schema, () => {
                composer.setPanelSubmitEnabled(panel.isComplete());
            });

            // Inline "Skip" → decline (MCP's decline: the user chose not to answer).
            const footer = document.createElement('div');
            footer.className = 'aparte-elic-footer';
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'aparte-elic-skip';
            skip.textContent = 'Skip';
            skip.addEventListener('click', () => settle({ action: 'decline' }));
            footer.appendChild(skip);
            panel.el.appendChild(footer);

            this._pending = { settle, composer };
            composer.showPanel(panel.el, {
                submitEnabled: panel.isComplete(),
                onSubmit: () => {
                    if (panel.isComplete()) settle({ action: 'accept', content: panel.getContent() });
                },
            });
            panel.focus();
        });
    };

    private _cancelPending(): void {
        this._pending?.settle({ action: 'cancel' });
    }

    /**
     * The host id of the chat whose composer holds the open panel.
     *
     * Walks up from the composer rather than from `this`, because the panel lives in
     * the composer and that is what the turn belongs to. Matches the hosts
     * `aparte-chat-bubble._resolveTargetId()` matches, for the reason written there:
     * Angular's wrapper root IS the `<aparte-chat>` element, while the plain-root
     * wrappers render a `[data-aparte-chat]` div instead, so matching only the tag
     * resolves `undefined` on three wrappers out of four.
     */
    private _pendingTargetId(): string | undefined {
        let el: HTMLElement | null = this._pending?.composer ?? null;
        while (el) {
            const tag = el.tagName?.toLowerCase();
            const isHost = tag === 'aparte-chat' || tag === 'aparte-chat-component' || el.hasAttribute?.('data-aparte-chat');
            if (isHost && el.id) return el.id;
            el = el.parentElement;
        }
        return undefined;
    }

    /**
     * The composer to present in: the nearest one in an ancestor subtree, and
     * nothing else.
     *
     * There used to be a `document.querySelector('aparte-composer')` fallback, which
     * is the "first chat on the page" bug this repo has now fixed in four other
     * places: on a page with two chats, an elicitation that could not find its own
     * composer mounted its panel in the OTHER chat's — so one conversation's question
     * appeared under the other conversation, and answering it resolved a tool call
     * belonging to a chat the user was not looking at.
     *
     * Returning `null` instead resolves `cancel`, which is honest: nothing was
     * shown, so nothing was answered. The warning names the fix, because this is a
     * setup mistake and only the developer can correct it — the guide's own example
     * puts `<aparte-elicitation>` inside `<aparte-chat>`.
     */
    private _getComposer(): ComposerEl | null {
        let node: Element | null = this.parentElement;
        while (node) {
            const composer = node.querySelector('aparte-composer') as ComposerEl | null;
            if (composer && typeof composer.showPanel === 'function') return composer;
            // Stop AT the chat boundary. Removing the explicit
            // `document.querySelector` fallback was not enough on its own: this walk
            // reached `<body>`, and a `querySelector` from there searches the whole
            // document — so it found another chat's composer anyway, by a longer
            // route. The two-chat test caught exactly that.
            const tag = node.tagName?.toLowerCase();
            const isChatBoundary = tag === 'aparte-chat' || tag === 'aparte-chat-component' || node.hasAttribute?.('data-aparte-chat');
            if (isChatBoundary) break;
            node = node.parentElement;
        }
        console.warn(
            '[aparte-elicitation] No <aparte-composer> in this element\'s subtree, so the request '
            + 'was cancelled — the model will read that as a refusal. Move <aparte-elicitation> '
            + 'inside the <aparte-chat> it belongs to. It is deliberately NOT borrowing another '
            + 'chat\'s composer: on a page with two chats that put the question under the wrong one.',
        );
        return null;
    }

    private _injectStyles(): void {
        const id = 'aparte-elicitation-styles';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
.aparte-elic-panel { display:flex; flex-direction:column; gap:6px; padding:6px 4px; width:100%; box-sizing:border-box; max-height:50vh; overflow-y:auto; }
.aparte-elic-message { margin:0 6px 6px; font-size:.82rem; font-weight:600; color:var(--aparte-text); line-height:1.4; }
.aparte-elic-field + .aparte-elic-field { margin-top:8px; padding-top:8px; border-top:1px solid var(--aparte-border, rgba(128,128,128,0.12)); }
.aparte-elic-title { margin:0 6px 4px; font-size:.8rem; font-weight:600; color:var(--aparte-text); }
.aparte-elic-desc { margin:0 6px 6px; font-size:.76rem; color:var(--aparte-text-muted, rgba(128,128,128,0.75)); }
.aparte-elic-options { display:flex; flex-direction:column; gap:1px; }
.aparte-elic-option { display:flex; align-items:flex-start; gap:10px; padding:7px 10px; border-radius:8px; cursor:pointer; border:1px solid transparent; transition:background .12s,border-color .12s; }
.aparte-elic-option:hover { background:var(--aparte-surface-2, rgba(128,128,128,0.08)); border-color:var(--aparte-border, rgba(128,128,128,0.15)); }
.aparte-elic-control { margin-top:3px; flex-shrink:0; accent-color:var(--aparte-primary, #6366f1); width:15px; height:15px; cursor:pointer; }
.aparte-elic-option-body { display:flex; flex-direction:column; gap:2px; flex:1; }
.aparte-elic-option-title { font-size:.875rem; font-weight:500; color:var(--aparte-text, inherit); line-height:1.4; }
.aparte-elic-option-desc { font-size:.78rem; color:var(--aparte-text-muted, rgba(128,128,128,0.75)); line-height:1.4; }
.aparte-elic-other-input, .aparte-elic-text { margin-top:4px; width:100%; padding:6px 8px; border:1px solid var(--aparte-border, rgba(128,128,128,0.2)); border-radius:6px; font-size:.875rem; background:var(--aparte-surface-2, rgba(128,128,128,0.06)); color:var(--aparte-text, inherit); outline:none; box-sizing:border-box; font-family:inherit; }
textarea.aparte-elic-text { min-height:64px; resize:vertical; }
.aparte-elic-other-input:focus, .aparte-elic-text:focus { border-color:var(--aparte-primary, #6366f1); }
.aparte-elic-option--recommended { border-color:var(--aparte-primary, #6366f1) !important; background:color-mix(in srgb, var(--aparte-primary, #6366f1) 6%, transparent); }
.aparte-elic-footer { display:flex; justify-content:flex-end; margin-top:6px; }
.aparte-elic-skip { border:none; background:transparent; color:var(--aparte-text-muted, rgba(128,128,128,0.75)); font-size:.8rem; cursor:pointer; padding:4px 8px; border-radius:6px; font-family:inherit; }
.aparte-elic-skip:hover { background:var(--aparte-surface-2, rgba(128,128,128,0.08)); color:var(--aparte-text); }
`;
        document.head.appendChild(style);
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-elicitation')) {
    customElements.define('aparte-elicitation', AparteElicitation);
}
