/**
 * <aparte-elicitation> — the default elicitation presenter.
 *
 * Registers itself as the presenter for the config governing its subtree
 * (`resolveConfig(this)`), so `requestUserInput()` from a tool handler is routed
 * here, through the typed presenter contract rather than window events.
 *
 * On a request it builds the schema-appropriate panel (enum / boolean / string /
 * object) and mounts it inside the nearest `<aparte-composer>` via its
 * `showPanel` API, resolving:
 *   - accept  — the send button (panel submit), when all fields are complete
 *   - decline — the inline "Skip" affordance
 * and rejecting with an `AparteElicitationAbortError` when the turn is stopped or
 * errors while the question is open, or when the panel is evicted.
 *
 * Its CSS ships in `@aparte/core/styles.css` like every other component, so it can be
 * themed and its variables appear in the generated CSS reference.
 *
 * Place anywhere inside the chat (it renders nothing itself):
 *   <aparte-elicitation></aparte-elicitation>
 */

import { resolveConfig, runWithConfig, type AparteConfigAware } from '../../config/config-context.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';
import type { AparteConfig } from '../../config/aparte-config.js';
import type { AparteComposer, AparteComposerPanelMode } from '../composer/aparte-composer.js';
import { buildElicitationPanel, type BuiltElicitationPanel } from '../../elicitation/panel.js';
import { buildApprovalPanel } from '../../elicitation/approval-panel.js';
import type { AparteElicitationRequest, AparteElicitationResult, AparteElicitationPresenter } from '../../elicitation/types.js';
import { AparteElicitationAbortError } from '../../elicitation/types.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';

/**
 * The slice of the composer this presenter drives.
 *
 * DERIVED from the component rather than re-typed by hand, so a parameter added to the
 * real `setPanelSubmitEnabled` is followed here instead of leaving a stale twin.
 * `import type` is erased, so nothing here pulls the composer element into a runtime
 * import.
 */
type ComposerEl = HTMLElement & Pick<AparteComposer, 'showPanel' | 'hidePanel' | 'setPanelSubmitEnabled'>;

interface Pending {
    /** End the request without an answer — see `AparteElicitationAbortError`. */
    abort(): void;
    composer: ComposerEl;
    /**
     * Re-apply every string this request took from the locale, in place.
     *
     * ONE function for the whole request, whatever its kind: a question's strings and
     * an approval's live in different places, and a field per kind is how the two
     * would drift.
     */
    relabel(): void;
}


/** The element that really holds the focus: through open shadow roots, down to the field. */
function deepActiveElement(root: Document | ShadowRoot): Element | null {
    let active = root.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/** `ancestor.contains(node)`, across shadow roots: a field inside a component inside the chat is in the chat. */
function isWithin(node: Node, ancestor: Node): boolean {
    for (let n: Node | null = node; n; n = n.parentNode ?? (n instanceof ShadowRoot ? n.host : null)) {
        if (n === ancestor) return true;
    }
    return false;
}

/**
 * A way to put an open panel aside and read the transcript behind it — the same for a
 * question and an approval, since both open here. Hiding leaves a one-line bar that says an
 * answer is waiting and brings the panel back; the request stays open either way, and the
 * composer's editor stays hidden, because the question still waits for its answer. While it is
 * aside the composer's button has no act — what is out of sight cannot be sent — so `onToggle`
 * lets the caller recompute it on both moves.
 *
 * The hide button goes FIRST in the corner, before a question's Skip, so the two never
 * swap places between a question and an approval.
 */
function addRetract(panelEl: HTMLElement, corner: HTMLElement, cfg: AparteConfig, reopen: () => void, onToggle: () => void): { relabel(next: AparteConfig): void } {
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'aparte-btn aparte-btn--icon aparte-btn--sm aparte-btn--ghost aparte-elic-hide';
    hide.setAttribute('aria-expanded', 'true');
    hide.innerHTML = cfg.getIcon('expand');

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'aparte-btn aparte-btn--ghost aparte-elic-reveal';
    reveal.setAttribute('aria-expanded', 'false');
    const revealText = document.createElement('span');
    reveal.append(revealText);
    reveal.insertAdjacentHTML('beforeend', cfg.getIcon('collapse'));

    const relabel = (next: AparteConfig): void => {
        const label = next.t('elicitationHide');
        hide.setAttribute('aria-label', label);
        hide.title = label;
        revealText.textContent = next.t('elicitationWaiting');
    };
    relabel(cfg);

    hide.addEventListener('click', () => {
        panelEl.setAttribute('data-collapsed', '');
        onToggle();
        reveal.focus();
    });
    reveal.addEventListener('click', () => {
        panelEl.removeAttribute('data-collapsed');
        onToggle();
        reopen();
    });
    corner.prepend(hide);
    panelEl.append(reveal);
    return { relabel };
}

/**
 * The default presenter for a request to the human. It renders nothing itself: it
 * registers as the presenter for the config governing its subtree, and mounts a panel
 * inside the nearest `<aparte-composer>` when something asks — a tool handler calling
 * `requestUserInput`, or core's own approval gate.
 *
 * It dispatches no events on purpose. A request is answered through the typed presenter
 * contract, not by listening for one.
 *
 * It has no children to project: `connectedCallback` sets
 * `display: none`, and the composer it presents in is found by walking UP from
 * `this.parentElement` — anything placed inside this element is only hidden with it.
 * So its position matters but its content does not: mount it anywhere inside the
 * `<aparte-chat>` whose questions it should answer.
 *
 * Not the element to reach for when you want a question UI of your own shape. It is
 * one caller of `setElicitationPresenter`, and among presenters registered for the
 * same chat the most recent one wins — so an app with a framework-native presenter
 * registers that and does not mount this, and a second `<aparte-elicitation>` in one
 * chat is redundant rather than additive. It is also not usable outside a chat that
 * has an `<aparte-composer>`: with nowhere to mount a panel the request is REJECTED,
 * on purpose, rather than borrowed into another chat's composer.
 *
 * The panel it mounts is styled by `@aparte/core/styles.css` — the `--aparte-elic-*`
 * and `--aparte-approval-*` knobs below theme it. They are declared here rather than
 * on the composer because this presenter is what builds the panel; the composer only
 * lends it the slot.
 *
 * @element aparte-elicitation
 *
 * @cssprop [--aparte-elic-gap=var(--aparte-space-3)] - Vertical gap between the panel's rows (message, body, tabs).
 * @cssprop [--aparte-elic-padding=max(var(--aparte-space-3), calc(var(--aparte-focus-outline-width) + var(--aparte-focus-outline-offset))) max(var(--aparte-space-2), calc(var(--aparte-focus-outline-width) + var(--aparte-focus-outline-offset)))] - Padding inside the panel; never less than the focus ring's reach, so a focused option's ring is not cut.
 * @cssprop [--aparte-elic-max-height=50vh] - Cap on the panel's height; its body scrolls, the panel does not.
 * @cssprop [--aparte-elic-field-gap=var(--aparte-space-4)] - Space and separator padding between two fields of an object schema.
 * @cssprop [--aparte-elic-message-size=var(--aparte-font-size-base)] - Font size of the question text at the top of the panel.
 * @cssprop [--aparte-elic-title-size=var(--aparte-font-size-base)] - Font size of a field's title.
 * @cssprop [--aparte-elic-desc-size=var(--aparte-font-size-sm)] - Font size of a field's description.
 * @cssprop [--aparte-elic-option-padding=var(--aparte-space-4) var(--aparte-space-5)] - Padding of one enum/boolean option row.
 * @cssprop [--aparte-elic-option-radius=var(--aparte-radius-md)] - Corner radius of an option row.
 * @cssprop [--aparte-elic-option-title-size=var(--aparte-font-size-md)] - Font size of an option's label, and of the text inputs.
 * @cssprop [--aparte-elic-option-desc-size=var(--aparte-font-size-sm)] - Font size of an option's secondary line.
 * @cssprop [--aparte-elic-control-size=15px] - Size of the radio/checkbox control in an option row.
 * @cssprop [--aparte-elic-input-radius=var(--aparte-radius-md)] - Corner radius of the text inputs and of the Skip button.
 * @cssprop [--aparte-elic-textarea-min-height=64px] - Minimum height of a multi-line string field.
 * @cssprop [--aparte-elic-input-size=0.85rem] - Font size of the approval panel's instruction field (the free-text note the user writes).
 * @cssprop [--aparte-elic-skip-size=var(--aparte-font-size-md)] - Font size of the corner "Skip" affordance (the decline).
 * @cssprop [--aparte-elic-step-size=var(--aparte-font-size-sm)] - Font size of a step tab, when the schema is asked one field at a time.
 * @cssprop [--aparte-elic-step-padding=var(--aparte-space-2) var(--aparte-space-1)] - Padding of a step tab.
 * @cssprop [--aparte-elic-step-gap=var(--aparte-space-7)] - Gap between step tabs.
 * @cssprop [--aparte-elic-step-underline=2px] - Thickness of the current step's underline (a tab, not a pill).
 * @cssprop [--aparte-elic-dismiss-room=104px] - Space the tab rail and the question message keep clear for the corner: the hide button and, on a question, Skip. Widen it for a locale whose "Skip" word is wider.
 * @cssprop [--aparte-approval-gap=calc(var(--aparte-focus-outline-width) + var(--aparte-focus-outline-offset) + var(--aparte-space-1))] - Gap between the stacked options of an approval request; by default wider than the focus ring's reach.
 * @cssprop [--aparte-approval-option-size=0.85rem] - Font size of an approval option button.
 * @cssprop [--aparte-approval-option-padding=8px 10px] - Padding of an approval option button.
 * @cssprop [--aparte-approval-option-radius=8px] - Corner radius of an approval option button.
 * @cssprop [--aparte-approval-args-max-height=8.5rem] - Height cap of the arguments block before it scrolls.
 * @cssprop [--aparte-approval-args-size=var(--aparte-font-size-sm)] - Font size of the arguments block.
 *
 * @example
 * <!-- Renders nothing by itself: it registers as the presenter for its subtree, so a
 *      tool handler calling requestUserInput() gets its panel mounted in the composer. -->
 * <aparte-chat style="height: 20rem">
 *   <aparte-chat-viewport></aparte-chat-viewport>
 *   <aparte-elicitation></aparte-elicitation>
 *   <aparte-composer>
 *     <div class="aparte-composer-shell">
 *       <div class="aparte-composer-row">
 *         <aparte-composer-input></aparte-composer-input>
 *         <aparte-composer-send></aparte-composer-send>
 *       </div>
 *     </div>
 *   </aparte-composer>
 * </aparte-chat>
 *
 * <script>
 *   // `aparte` is the `@aparte/core` module the frame exposes; in your app this line is
 *   // `import { requestUserInput } from '@aparte/core'`. A tool handler asks; the panel
 *   // mounts in the composer of the chat whose presenter this element is.
 *   aparte.requestUserInput({
 *     message: 'Which environment should I deploy to?',
 *     schema: {
 *       type: 'enum',
 *       options: [
 *         { value: 'staging', label: 'Staging', recommended: true },
 *         { value: 'prod', label: 'Production', description: 'Live traffic' },
 *       ],
 *     },
 *   });
 * </script>
 */
export class AparteElicitation extends HTMLElement implements AparteConfigAware {
    private _pending: Pending | null = null;
    /**
     * A turn ended — cancel the open question only if it was OUR turn.
     *
     * These two listeners sit on `window`, so they filter by instance: a Stop (or an
     * error) in one chat must not cancel the question a DIFFERENT chat is waiting on,
     * whose model would be told the user refused a question they were still looking at.
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

    private _unsubscribeConfig: (() => void) | null = null;

    connectedCallback(): void {
        this.style.display = 'none';
        // A language switch while a question is OPEN. Every other live-config
        // consumer in core got this seam; the panel could not use it because it kept
        // no reference to itself — see `Pending.panel`.
        this._unsubscribeConfig = subscribeConfigChange(this, () => this._relabelPending());
        // Become the presenter for this instance's config (or the global one).
        // `this` as the owner: it is what lets a request naming a `target` reach the
        // presenter in the SAME chat, instead of whichever one mounted last.
        resolveConfig(this).setElicitationPresenter(this._present, this);
        // Safety net: if the turn is stopped/errored while a request is open,
        // end it without an answer (a rejection) so the client loop unblocks and the
        // composer input is restored.
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
     * instance config, finds nothing, and rejects the request — the model
     * hears the user refuse a question the user never saw.
     *
     * See {@link AparteConfigAware}.
     */
    aparteConfigChanged(next: AparteConfig, previous: AparteConfig): void {
        // Withdraw OURS by name. `setElicitationPresenter(null)` cleared the whole
        // registry, so moving one chat's registration took every other mounted chat's
        // presenter down with it.
        previous.removeElicitationPresenter(this._present);
        next.setElicitationPresenter(this._present, this);
    }

    disconnectedCallback(): void {
        // Ours only: clearing the slot whenever it holds a presenter would leave a
        // still-mounted sibling chat unable to ask anything, silently, since the
        // no-presenter warning fires once.
        resolveConfig(this).removeElicitationPresenter(this._present);
        window.removeEventListener('aparte-message-aborted', this._onTurnEnd);
        window.removeEventListener('aparte-message-error', this._onTurnEnd);
        this._unsubscribeConfig?.();
        this._unsubscribeConfig = null;
        this._cancelPending();
    }

    /**
     * Re-apply the open question's strings, in place.
     *
     * Two owners, and both have to move or the panel goes bilingual: the panel's own
     * defaults (`relabel`), and the Skip button, which this file builds and this file
     * therefore has to re-text. The composer's one button is a third, and it already
     * follows — `aparte-composer-send` remembers the panel state it was given.
     */
    private _relabelPending(): void {
        if (!this._pending) return;
        const cfg = resolveConfig(this);
        runWithConfig(cfg, () => this._pending!.relabel());
    }

    private _present: AparteElicitationPresenter = (request: AparteElicitationRequest) => {
        /*
         * No concurrency guard here any more — `AparteConfig.requestUserInput` queues,
         * so a second request arrives only once this one has settled.
         *
         * What was here answered the second request `cancel` immediately: a refusal
         * invented for a question nobody was shown. And it protected only requests
         * that came through THIS presenter, so a consumer's own presenter had nothing.
         * If two ever do overlap, `showPanel` now evicts and NOTIFIES the first, which
         * degrades to a settled request instead of a wedged one.
         */
        const composer = this._getComposer();
        // Mounted outside a chat that has a composer: there is nowhere to put the
        // panel, which is the same situation as no presenter at all.
        if (!composer) return Promise.reject(new AparteElicitationAbortError('no-presenter'));

        return new Promise<AparteElicitationResult>((resolve, reject) => {
            let done = false;
            /**
             * The slot this request owns, once `showPanel` has handed it over.
             *
             * `settle` can run BEFORE that — an already-aborted signal settles on the
             * spot — so it starts absent, and `hidePanel(undefined)` then closes whatever
             * is there, which is correct because nothing of ours is open yet.
             *
             * A holder rather than a `let`: `settle` reads it before `showPanel` assigns
             * it, which is exactly the shape `prefer-const` rejects, and the object says
             * "not handed over yet" more plainly than an unassigned binding.
             */
            const slot: { token?: symbol } = {};
            /**
             * Who had the focus before the panel took it.
             *
             * The panel focuses itself on open (`panel.focus()`, both branches below)
             * and the focus has to be given back on close: otherwise a keyboard user who
             * approved a tool call lands at the top of the document and has to tab
             * through the whole page to write their next message (WCAG SC 2.4.3, and the
             * ARIA Authoring Practices Guide requires it of every dialogue-shaped pattern).
             *
             * Captured HERE rather than beside `panel.focus()` because there are two
             * branches that open a panel and one `close()` that ends both; a value read
             * once, before either, cannot disagree with itself.
             */
            const focusedBefore = deepActiveElement(document);
            /*
             * Where the focus goes, in one rule.
             *
             * The focus is how the panel is announced, so it is taken — unless the reader is
             * busy elsewhere: writing in a field outside this chat, in another chat, or inside
             * an iframe. Then it stays where it is and a polite status says a question waits.
             *
             * From a field of THIS chat (typing the next message while a reply streams), it
             * goes to the panel itself, not to its first option: the next key the reader
             * presses must not be Enter on "Approve". From a button (this chat's or the app's
             * own beside it) or from nobody (`<body>`: a click in Safari, a screen reader's
             * activation, a script), it goes to the first control, without the page jumping
             * when it came from nobody.
             */
            const messageText = (): string => { const m = request.message as unknown; return typeof m === 'function' ? String((m as () => unknown)()) : String(m ?? ''); };
            const CHAT = 'aparte-chat, [data-aparte-chat], [data-aparte-host]';
            const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
            const chatRoot = composer.closest(CHAT) ?? composer.parentElement ?? composer;
            const fromNobody = !(focusedBefore instanceof HTMLElement) || focusedBefore === document.body;
            const before = fromNobody ? null : (focusedBefore as HTMLElement);
            const inChat = before !== null && isWithin(before, chatRoot);
            const typing = before !== null && before.matches(EDITABLE);
            const busyElsewhere = before !== null && !inChat
                && (typing || before.tagName === 'IFRAME' || before.closest(CHAT) !== null);
            const status = (text: string): void => {
                let region = composer.querySelector<HTMLElement>(':scope > .aparte-elic-status');
                if (!region) {
                    region = document.createElement('span');
                    region.className = 'aparte-sr-only aparte-elic-status';
                    region.setAttribute('role', 'status');
                    composer.appendChild(region);
                }
                const live = region;
                live.textContent = '';
                // A region announces a CHANGE: filled a moment after it exists, not with it.
                if (text) setTimeout(() => { if (live.isConnected) live.textContent = text; }, 60);
            };
            const focusPanel = (panel: { el: HTMLElement; focus(): void }, message: string): void => {
                if (busyElsewhere) { status(message); return; }
                const x = window.scrollX, y = window.scrollY;
                if (typing && inChat) {
                    if (!panel.el.hasAttribute('tabindex')) panel.el.setAttribute('tabindex', '-1');
                    if (!panel.el.hasAttribute('role')) panel.el.setAttribute('role', 'group');
                    if (message && !panel.el.hasAttribute('aria-label')) panel.el.setAttribute('aria-label', message);
                    panel.el.focus();
                } else {
                    panel.focus();
                }
                if (fromNobody && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo(x, y);
            };
            const close = (): boolean => {
                if (done) return false;
                done = true;
                this._pending = null;
                /*
                 * Read BEFORE `hidePanel`, because that removes the focused element and
                 * the browser then drops focus to `<body>` — after which there is no
                 * way to tell whether the user was still in the panel or had moved on.
                 *
                 * And only if they were still in it. A request can settle late — an
                 * abort, or a model that answered while the reader clicked elsewhere —
                 * and pulling the focus back from wherever they went would be the same
                 * theft in the other direction.
                 */
                const active = deepActiveElement(document);
                const focusWasInPanel = active instanceof Node && isWithin(active, composer);

                // Scoped to our own panel: finishing late must not tear down the panel
                // that replaced ours.
                composer.hidePanel(slot.token);
                status('');

                /*
                 * Back to whoever had it, when that is still a place to be: connected, not
                 * `<body>`, not inside the composer whose panel just closed, and someone the
                 * panel took it from. Otherwise the composer — the editor is where a reader
                 * who just answered writes next, and `<body>` would drop a keyboard user at
                 * the top of the page (2.4.3).
                 */
                if (focusWasInPanel) {
                    const back = !busyElsewhere && before !== null && before.isConnected && !isWithin(before, composer) ? before : null;
                    (back ?? composer).focus();
                }
                return true;
            };
            const settle = (result: AparteElicitationResult): void => {
                if (close()) resolve(result);
            };
            /**
             * End it without an answer.
             *
             * A rejection rather than a third `action`, because a value is easy to
             * mistake for an answer: a `cancel` read as a refusal would tell the model
             * the user had refused a tool they had only stopped.
             */
            const fail = (reason: 'aborted' | 'no-presenter' = 'aborted'): void => {
                if (close()) reject(new AparteElicitationAbortError(reason));
            };

            // Caller-side cancellation (tool handler signal: timeout / turn abort).
            if (request.signal) {
                if (request.signal.aborted) { fail(); return; }
                request.signal.addEventListener('abort', () => fail(), { once: true });
            }

            // Built INSIDE this instance's config, so the panel's own strings come
            // from the locale of the chat that asked — `contextConfig()` reads the
            // ambient render config, and without this it would fall back to the
            // global one on a page where each chat has its own.
            const cfg = resolveConfig(this);

            /*
             * An APPROVAL: a decision, not a value.
             *
             * Same slot, same queue, same teardown — only what goes inside the panel
             * differs, which is the whole claim of one mechanism with two
             * presentations. The options come with the request because only the
             * requester can write them.
             *
             * There is always an exit here without touching the composer's own
             * controls: every option is a button. That matters because a panel takes
             * the send button over, so Stop is unreachable while one is open — for a
             * question the escape is the corner, for an approval it is a refusal.
             */
            if (request.kind === 'approval') {
                /*
                 * The button exists only once an INSTRUCTION has been written.
                 *
                 * The options never route through it — a decision is its own click —
                 * so with `mode: 'submit'` from the start it sat there permanently
                 * disabled beside them, offering an act that did not exist. It is the
                 * written text, and only that, which is the act this button already
                 * means; until there is some, the panel has none for it.
                 */
                const sendable = (): boolean => panel.isComplete() && !panel.el.hasAttribute('data-collapsed');
                const approvalMode = (): AparteComposerPanelMode => (sendable() ? 'submit' : 'none');
                const syncSubmit = (): void => composer.setPanelSubmitEnabled(sendable(), approvalMode());
                const panel = runWithConfig(cfg, () =>
                    buildApprovalPanel(request.message, request.options ?? [], syncSubmit, request.details));
                panel.onSettle((answer) => settle({ action: 'accept', content: answer }));
                const retract = addRetract(panel.el, panel.dismiss, cfg, () => panel.focus(), syncSubmit);
                this._pending = {
                    abort: () => fail(),
                    composer,
                    relabel: () => { panel.relabel(); retract.relabel(resolveConfig(this)); },
                };
                slot.token = composer.showPanel(panel.el, {
                    submitEnabled: panel.isComplete(),
                    mode: approvalMode(),
                    onSubmit: () => { if (panel.isComplete()) settle({ action: 'accept', content: panel.getContent() }); },
                    onEvict: () => fail(),
                });
                focusPanel(panel, messageText());
                return;
            }
            // A question without a schema has nothing to collect; that is an approval,
            // and it was handled above. The fallback keeps this branch total rather
            // than throwing on a shape the type already forbids.
            const schema = request.schema ?? { type: 'string' as const };
            const syncSubmit = (): void => {
                const aside = panel.el.hasAttribute('data-collapsed');
                composer.setPanelSubmitEnabled(!aside && panel.canProceed(), aside ? 'none' : panel.mode());
            };
            const panel: BuiltElicitationPanel = runWithConfig(cfg, () =>
                buildElicitationPanel(request.message, schema, syncSubmit));

            // "Skip" → decline (MCP's decline: the user chose not to answer), in the
            // panel's CORNER. It sat beside the button that advances through the form,
            // and that adjacency read as "skip this question" while it declines the
            // whole request — see `dismiss` on BuiltElicitationPanel.
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'aparte-btn aparte-elic-skip';
            skip.textContent = cfg.t('elicitationSkip');
            skip.addEventListener('click', () => settle({ action: 'decline' }));
            panel.dismiss.appendChild(skip);
            const retract = addRetract(panel.el, panel.dismiss, cfg, () => panel.focus(), syncSubmit);

            /*
             * The click that IS the answer — a single question whose options are
             * buttons. Same wiring as the approval panel's, because it is the same
             * act; the panel decides which of its shapes has it, and reports through
             * `mode()` that the composer's button has nothing to do.
             */
            panel.onSettle((content) => settle({ action: 'accept', content }));

            this._pending = {
                abort: () => fail(),
                composer,
                relabel: () => {
                    panel.relabel();
                    const now = resolveConfig(this);
                    skip.textContent = now.t('elicitationSkip');
                    retract.relabel(now);
                },
            };
            slot.token = composer.showPanel(panel.el, {
                submitEnabled: panel.canProceed(),
                mode: panel.mode(),
                /*
                 * Something else took the slot — another request, a conversation switch,
                 * or a turn ending. The composer tears the panel down either way; only
                 * this callback can settle the promise, and without it the request hung
                 * AND `_pending` stayed set, so every later question was short-circuited
                 * for the life of the page. A rejection (`aborted`), not `decline`:
                 * nobody declined anything, the question was taken away.
                 */
                onEvict: () => fail(),
                onSubmit: () => {
                    // One meaning: submit the lot. Moving between questions is the chips'.
                    if (panel.isComplete()) settle({ action: 'accept', content: panel.getContent() });
                },
            });
            focusPanel(panel, messageText());
        });
    };

    private _cancelPending(): void {
        this._pending?.abort();
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
            const isHost = tag === 'aparte-chat' || el.hasAttribute?.('data-aparte-chat');
            if (isHost && el.id) return el.id;
            el = el.parentElement;
        }
        return undefined;
    }

    /**
     * The composer to present in: the nearest one in an ancestor subtree, and
     * nothing else.
     *
     * There is no `document.querySelector('aparte-composer')` fallback: on a page with
     * two chats, an elicitation that could not find its own composer would mount its
     * panel in the OTHER chat's, so one conversation's question would appear under the
     * other conversation, and answering it would resolve a tool call belonging to a
     * chat the user was not looking at.
     *
     * Returning `null` instead REJECTS the request, which is honest: nothing was
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
            const isChatBoundary = tag === 'aparte-chat' || node.hasAttribute?.('data-aparte-chat');
            if (isChatBoundary) break;
            node = node.parentElement;
        }
        console.warn(
            '[aparte-elicitation] No <aparte-composer> in this element\'s subtree, so the request '
            + 'could not be shown, so it REJECTED and the turn halted. Nothing was told to the '
            + 'model — there is nothing true to tell it. Move <aparte-elicitation> '
            + 'inside the <aparte-chat> it belongs to. It is deliberately NOT borrowing another '
            + 'chat\'s composer: on a page with two chats that put the question under the wrong one.',
        );
        return null;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-elicitation')) {
deferHydrationOf(AparteElicitation);
    customElements.define('aparte-elicitation', AparteElicitation);
}
