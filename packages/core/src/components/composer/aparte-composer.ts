import type { AparteSendEventDetail } from '../../types/index.js';
import { type AparteConfig } from '../../config/aparte-config.js';
import { resolveConfig } from '../../config/config-context.js';

/**
 * What the composer's one button means while a panel is up — and whether it is
 * there at all.
 *
 * `'submit'` answers, `'advance'` moves to the next question of a form, and
 * `'none'` says this panel has NO act left for that button, so it is not drawn.
 *
 * `'none'` exists because a panel could not previously say it. The composer's panel
 * mode was one fixed policy — hide the input and the attachment picker, keep the
 * strip and the toolbar, and ALWAYS keep the send button — and the approval panel
 * showed what that costs: its options settle on the first click by design, so the
 * button beside them sat permanently disabled, meaning nothing, until the optional
 * instruction field was opened. A control that is never the way forward is not
 * disabled, it is absent (ratified decision #8).
 *
 * Named rather than inlined at each of its six readers: this union is exactly the
 * kind of list this repo has watched drift when every reader kept its own copy.
 */
export type AparteComposerPanelMode = 'advance' | 'submit' | 'none';

// ─────────────────────────────────────────────────────────────────────────────
// Event map for internal pub/sub between primitives
// ─────────────────────────────────────────────────────────────────────────────
export interface AparteComposerEventMap {
    'value-change': { value: string };
    'streaming-change': { streaming: boolean };
    'disabled-change': { disabled: boolean };
    'attachments-change': { attachments: File[] };
    'submit': { value: string; attachments: File[] };
    'cancel': Record<string, never>;
    'panel-change': { active: boolean; submitEnabled: boolean; mode: AparteComposerPanelMode };
}

export type AparteComposerEventType = keyof AparteComposerEventMap;

/**
 * Public snapshot of the composer's observable state. Delivered on every
 * `aparte-composer-change` DOM event and available synchronously via
 * {@link AparteComposer.getState}. Lets an element OUTSIDE the composer package
 * (a custom send button, a footer control) mirror the composer's live state
 * without the internal `_on`/`_emit` bus.
 */
export interface AparteComposerState {
    value: string;
    streaming: boolean;
    disabled: boolean;
    attachments: File[];
    /** A panel (e.g. an elicitation form) is showing in place of the input. */
    panelActive: boolean;
    /** Whether the send button should act as "submit" while a panel is active. */
    submitEnabled: boolean;
}

/** Detail of the public `aparte-composer-change` DOM event. */
export interface AparteComposerChangeEventDetail {
    state: AparteComposerState;
    composer: AparteComposer;
}

// ─────────────────────────────────────────────────────────────────────────────
// AparteComposer — root context provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The root context for every `aparte-composer-*` primitive. It imposes no visual
 * layout — the consumer owns the structure — and holds the shared state the parts
 * read: the value, the streaming flag, pending attachments, whether a panel is up.
 *
 * It renders nothing of its own — no shadow root, no markup, no default children — so
 * an `<aparte-composer>` with nothing inside is an empty block. The parts that need
 * that state locate it with `closest('aparte-composer')`, which is why they may sit at
 * any depth and why the opt-in `.aparte-composer-shell` / `.aparte-composer-row`
 * wrappers can exist without this element knowing about them.
 * Not every part looks it up, though: `<aparte-composer-toolbar>` is purely structural
 * — it lays its children out and never resolves this element at all.
 *
 * WHAT GOES INSIDE — ordinary light-DOM children. Core has no shadow root and no
 * `<slot>`, so there is no slot name to write: drop in `<aparte-composer-input>`,
 * `<aparte-composer-send>`, `<aparte-composer-cancel>`,
 * `<aparte-composer-attachments>`, `<aparte-composer-add-attachment>`,
 * `<aparte-composer-action>`, `<aparte-composer-toolbar>`, plus whatever markup you
 * wrap them in. Order and nesting are yours. Two behaviours read the tree rather than a
 * flag, so they depend on what you put in: `focus()` forwards to the first
 * `<aparte-composer-input>` descendant, and `showPanel()` inserts the panel right after
 * it (appending to the host when there is none).
 *
 * A PANEL is neither markup you write nor a named slot: `showPanel()` takes the element,
 * stamps it `data-aparte-panel` and inserts it, `hidePanel()` removes it. One at a time
 * — a second `showPanel()` evicts the first and calls its `onEvict`. While one is up the
 * host carries `[data-panel-active]`, which hides `<aparte-composer-input>` and
 * `<aparte-composer-add-attachment>` and leaves the attachments strip and the toolbar in
 * place.
 *
 * It is not a transport either. `submit()` trims, checks the gates (disabled, empty,
 * no model selected), dispatches `aparte-send` and clears — nothing here talks to a
 * model, so without `AparteClient` or a listener of your own a send is a dispatched
 * event and no answer. With no panel up it doubles as the stop button: while `streaming`
 * it routes to `cancel()`, which is why the `getState` example below keeps a custom send
 * button clickable rather than disabling it mid-stream. With a panel up it means "answer
 * the question" instead — it calls the panel's `onSubmit` and returns, so neither the
 * stop branch nor a send is reached.
 *
 * The streaming flag comes from WINDOW lifecycle events, filtered by target. On a page
 * with two chats, give the composer a `target` — or put it under a chat host that has
 * an `id` — otherwise it answers to every chat's events, and one chat's Stop resets the
 * other's composer and evicts its open panel.
 *
 * Prose first, on purpose: when `@element` opens a docblock there is no free text
 * left for the analyser to use, and this component's description came out empty in
 * the manifest and blank on the generated reference page.
 *
 * `aparte-abort` and `aparte-message-aborted` have to be declared by hand and always
 * will: they go out through `window.dispatchEvent` (they concern the whole page, not
 * this subtree), and the analyser's fallback only recognises `this.dispatchEvent`.
 *
 * @element aparte-composer
 *
 * @attr {string} placeholder - Fallback placeholder for `<aparte-composer-input>`, which
 *   reads it off this element when it carries none of its own. Read when that input
 *   renders, not pushed: changing it here leaves an input already on the page as it was.
 * @attr {boolean} disabled - Disables the composer's own controls — the input, send,
 *   add-attachment and `<aparte-composer-action>` buttons each read it. What you put in
 *   the toolbar is yours to disable.
 * @attr {string} target - The id of the `<aparte-chat>` this composer drives.
 * @attr {boolean} submit-on-enter - Enter sends and Shift+Enter breaks the line (the
 *   default); set it to the string `"false"` to swap them. Read lazily by the
 *   `submitOnEnter` getter rather than observed, which is why it was missing from the
 *   manifest — and so from every typed surface — while all four wrappers wrote it.
 *
 * @fires {CustomEvent<AparteSendEventDetail>} aparte-send - A message was submitted: the text, its attachments and the target.
 * @fires aparte-cancel - The stop button was pressed. No detail; the two window events below carry the target.
 * @fires {CustomEvent<AparteAbortEventDetail>} aparte-abort - Dispatched on `window`: stop the run for this target.
 * @fires {CustomEvent<AparteMessageAbortedEventDetail>} aparte-message-aborted - The run for this target ended early — the user pressed Stop, or `abort()` was called. This element dispatches it on `window`; `AparteClient` also dispatches it on the chat host, so it is listenable on either.
 * @fires {CustomEvent<AparteComposerChangeEventDetail>} aparte-composer-change - Any of value / streaming / disabled / attachments / panel changed, folded into one event.
 *
 * @cssprop [--aparte-composer-control-size=44px] - Width and height of the composer's
 *   own control buttons (each is an `.aparte-btn--icon`, so it needs the opt-in
 *   `.aparte-composer-row` wrapper, which is what carries the size down) and the
 *   minimum height of the input's editor, which needs no wrapper. One knob for the
 *   whole control set, so buttons stay aligned with a single line of text and anchored
 *   to the bottom once the input grows. It reaches the buttons by declaration, not by
 *   out-specifying them, so a panel mounted in the row keeps its own content's sizing.
 * @cssprop [--aparte-input-bg=var(--aparte-surface-1)] - Background of the opt-in
 *   `.aparte-composer-shell` wrapper.
 * @cssprop [--aparte-input-border=var(--aparte-border)] - Border colour of that shell.
 *   Its `:focus-within` colour is `--aparte-primary`, a global token rather than a
 *   composer one.
 * @cssprop [--aparte-radius-input=var(--aparte-radius-lg)] - Corner radius of the shell,
 *   and of the dashed outline drawn while files are dragged over the composer.
 * @cssprop [--aparte-message-max-width=800px] - Max width of the shell, which is
 *   `margin: 0 auto` at this width — the same width `.aparte-message` uses, so the
 *   composer keeps the transcript's column. Set on THIS element it moves the shell only:
 *   custom properties inherit downward and the transcript is a sibling subtree, so set
 *   it on a shared ancestor (the chat host, `:root`) to move both.
 *
 * @example
 * <!-- It renders nothing of its own — no shadow root, no default children — so this
 *      markup IS the component. The shell draws the border; the row keeps the controls
 *      on the bottom edge of the text as it grows. Both are opt-in classes: drop them
 *      and the parts still work, they just sit wherever your own layout puts them. -->
 * <aparte-composer placeholder="Ask anything…">
 *   <div class="aparte-composer-shell">
 *     <div class="aparte-composer-row">
 *       <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *   </div>
 * </aparte-composer>
 */
export class AparteComposer extends HTMLElement {
    private _value = '';
    private _streaming = false;
    private _attachments: File[] = [];
    private _listeners = new Map<string, Set<(payload: unknown) => void>>();
    private _panelActive = false;
    /** What the send button means while a panel is up — see `showPanel`. */
    private _panelMode: AparteComposerPanelMode = 'submit';
    private _panelSubmitEnabled = false;
    private _panelOnSubmit: (() => void) | null = null;
    /**
     * Who owns the one panel slot, and how to tell them they lost it.
     *
     * There is exactly one slot, `showPanel` empties it unconditionally, and nothing
     * used to say whose it was. Three paths therefore closed a panel whose owner was
     * still awaiting an answer, and none of them told the owner: a second `showPanel`,
     * the owner-of-record's own `hidePanel`, and — the one that actually bit —
     * `_handleMessageDone`, which fires on EVERY turn end. A question still open when a
     * turn finished lost its panel while `<aparte-elicitation>` kept `_pending` set,
     * so the request never settled AND every later request was short-circuited for the
     * life of the page.
     */
    private _panelToken: symbol | null = null;
    private _panelOnEvict: (() => void) | null = null;

    // Internal bus events that represent an observable STATE change — these are
    // mirrored to the public `aparte-composer-change` DOM event. `submit`/`cancel`
    // are actions, not state, and are covered by `aparte-send`/`aparte-cancel`.
    private static readonly _STATE_EVENTS: ReadonlySet<AparteComposerEventType> = new Set([
        'value-change', 'streaming-change', 'disabled-change', 'attachments-change', 'panel-change',
    ]);

    // Window event bindings
    private _onMessageStart = this._handleMessageStart.bind(this);
    private _onMessageDone = this._handleMessageDone.bind(this);

    /** Config governing THIS composer (nearest instance boundary, else global). */
    /**
     * Resolved LIVE, not cached at connect.
     *
     * A wrapper runs `AparteChatHost.bind()` — which calls `attachConfig` — from its
     * POST-mount hook, so this element connects BEFORE the boundary exists. Caching
     * here latched the global config forever: an instance `config` carrying an RTL
     * locale flipped the transcript and not the composer, and the
     * `requireModelSelection` gate was read off the wrong object. `aparte-chat-bubble`
     * has always resolved live, and its JSDoc names this exact race.
     */
    private get _cfg(): AparteConfig {
        return resolveConfig(this);
    }
    /** Only OUR config: a change on another chat's instance must not touch us. */
    private _onConfigChangeEvent = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
        if (detail?.config && detail.config !== this._cfg) return;
        this._onConfigChange();
    };
    /** True while `requireModelSelection` is on AND no model is selected — blocks send. */
    private _modelGated = false;
    private _onConfigChange = (): void => { this._evaluateModelGate(); this._applyDirection(); };

    /**
     * Mirror `locale.direction` onto ourselves, so everything inside — input, buttons,
     * the toolbar row and whatever the consumer put in it — inherits it.
     *
     * The direction used to stop at the transcript: only the viewport applied `dir`, so
     * an RTL locale flipped the conversation and left the composer left-to-right. It is
     * also what makes the toolbar's placement idiom real: `margin-inline-start: auto` in
     * a subtree that inherits no direction is just `margin-left`.
     *
     * One attribute on the host rather than a stamp per child: inheritance is the
     * mechanism, so nothing needs to know about the consumer's markup.
     */
    private _applyDirection(): void {
        const direction = (this._cfg ?? resolveConfig(this)).getLocale().direction;
        if (direction) this.setAttribute('dir', direction);
        else this.removeAttribute('dir');
    }

    static get observedAttributes(): string[] {
        return ['placeholder', 'disabled', 'target'];
    }

    connectedCallback(): void {
        window.addEventListener('aparte-message-start', this._onMessageStart);
        window.addEventListener('aparte-message-done', this._onMessageDone);
        window.addEventListener('aparte-message-error', this._onMessageDone);
        window.addEventListener('aparte-message-aborted', this._onMessageDone);
        // Model-selection gate (opt-in via aparteGlobalConfig.setRequireModelSelection).
        // A window listener rather than `_cfg.subscribe(...)`: subscribing binds to
        // whichever config was resolvable AT CONNECT, which is the bug above wearing
        // a different hat. `_notify()` dispatches `aparte-config-change` with
        // `detail.config`, so the same information arrives without the early binding
        // — and the filter below compares against the LIVE config.
        window.addEventListener('aparte-config-change', this._onConfigChangeEvent);
        this._evaluateModelGate();
        this._applyDirection();
    }

    disconnectedCallback(): void {
        window.removeEventListener('aparte-message-start', this._onMessageStart);
        window.removeEventListener('aparte-message-done', this._onMessageDone);
        window.removeEventListener('aparte-message-error', this._onMessageDone);
        window.removeEventListener('aparte-message-aborted', this._onMessageDone);
        window.removeEventListener('aparte-config-change', this._onConfigChangeEvent);
        this._listeners.clear();
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (name === 'disabled') {
            this._emit('disabled-change', { disabled: value !== null });
        }
        if (name === 'placeholder') {
            // Primitives read this directly via closest() — no event needed
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    get value(): string { return this._value; }
    get streaming(): boolean { return this._streaming; }
    get disabled(): boolean { return this.hasAttribute('disabled'); }
    /**
     * When false, Shift+Enter submits and a bare Enter inserts a newline —
     * the inverse of the default. Driven by the `submit-on-enter` attribute.
     */
    get submitOnEnter(): boolean { return this.getAttribute('submit-on-enter') !== 'false'; }
    get attachments(): File[] { return this._attachments; }
    get placeholder(): string { return this.getAttribute('placeholder') ?? ''; }
    get targetId(): string | null { return this.getAttribute('target'); }

    /**
     * Snapshot of the composer's observable state. Pair with the
     * `aparte-composer-change` DOM event to drive a custom send button or footer
     * control that lives outside the composer package:
     *
     * @example
     * // A custom send button. Keep it CLICKABLE while streaming — submit()
     * // routes to cancel() when a response is in flight, so one button is
     * // Send/Stop. Disabling it on `streaming` would make "stop" unreachable.
     * composer.addEventListener('aparte-composer-change', (e) => {
     *   const { streaming, disabled, value, attachments } = e.detail.state;
     *   myButton.textContent = streaming ? 'Stop' : 'Send';
     *   myButton.disabled = disabled || (!streaming && !value.trim() && attachments.length === 0);
     * });
     * myButton.addEventListener('click', () => composer.submit()); // send or stop
     */
    getState(): AparteComposerState {
        return {
            value: this._value,
            streaming: this._streaming,
            disabled: this.disabled,
            attachments: [...this._attachments],
            panelActive: this._panelActive,
            submitEnabled: this._panelSubmitEnabled,
        };
    }

    /**
     * Set the composer's value — both what a send will submit and what the editor
     * shows. `<aparte-composer-input>` writes through any value it does not already
     * hold, so this prefills the visible field (a template button, a restored draft)
     * as readily as it stages text for an immediate `submit()`.
     */
    setValue(value: string): void {
        this._value = value;
        this._emit('value-change', { value });
    }

    /** Append files to the pending attachments and notify. Does not de-duplicate. */
    addAttachments(files: FileList | File[]): void {
        this._attachments = [...this._attachments, ...Array.from(files)];
        this._emit('attachments-change', { attachments: this._attachments });
    }

    /**
     * Drop one pending attachment and notify. Matched by IDENTITY — pass the same
     * `File` object the composer handed you, not an equal one; two picks of the same
     * file on disk are two distinct objects.
     */
    removeAttachment(file: File): void {
        this._attachments = this._attachments.filter(f => f !== file);
        this._emit('attachments-change', { attachments: this._attachments });
    }

    /** Drop every pending attachment and notify. */
    clearAttachments(): void {
        this._attachments = [];
        this._emit('attachments-change', { attachments: [] });
    }

    /**
     * Inject a panel into the composer. The send button calls `onSubmit` when clicked.
     *
     * While a panel is up, the composer is answering a QUESTION, not composing a
     * message — so the affordances that lead nowhere go away with the text input:
     * the attachment picker above all, which stayed clickable while the user was
     * being asked something ("on voyait encore l'icône de upload", reported from a
     * real session). Ratified decision #8: an affordance nothing can honour is not
     * rendered.
     *
     * What STAYS, deliberately: the attachments strip, because pending attachments
     * are the user's state and not an action to offer — hiding them would look like
     * losing them; and the toolbar, because switching model still does something.
     *
     * The send button is the part the PANEL decides, through `mode`. `'submit'` and
     * `'advance'` keep it; `'none'` says this panel has no act for it and it is not
     * drawn. That third value is what a panel whose options settle on the first click
     * needs — a single-choice question, an approval — and until it existed such a
     * panel left a permanently disabled button beside options that never routed
     * through it. Flip between them at any time with {@link setPanelSubmitEnabled},
     * which is how a panel that grows an act (an "Other…" field, a written
     * instruction) turns the button back on.
     *
     * Declared with an attribute + CSS rather than the inline `style.display` this
     * used to set on a child: an attribute is themeable, is visible to a consumer's
     * own rules, and does not clobber a `display` the consumer had set (the restore
     * wrote `''`, not the previous value).
     *
     * Returns the TOKEN for this panel. Pass it back to `hidePanel` so a presenter
     * that has already lost the slot cannot close the panel that replaced it, and
     * supply `onEvict` to be told when that happens — an owner that is not told is an
     * owner whose promise nobody can settle.
     */
    showPanel(
        panel: HTMLElement,
        options?: {
            submitEnabled?: boolean;
            onSubmit?: () => void;
            /**
             * What the send button means for this panel — `'none'` if it has no act
             * for it, in which case the button is not drawn. See
             * {@link AparteComposerPanelMode}.
             */
            mode?: AparteComposerPanelMode;
            /** Called when something other than this owner closes the panel. */
            onEvict?: () => void;
        },
    ): symbol {
        // Evict rather than hide: the previous owner is awaiting an answer it will
        // never get, and it is the only thing that can settle its own promise.
        this._evictPanel();
        const inputEl = this.querySelector('aparte-composer-input') as HTMLElement | null;
        this.setAttribute('data-panel-active', '');
        panel.dataset['apartePanel'] = 'true';
        if (inputEl) {
            inputEl.insertAdjacentElement('afterend', panel);
        } else {
            this.appendChild(panel);
        }
        this._panelActive = true;
        this._panelSubmitEnabled = options?.submitEnabled ?? false;
        this._panelMode = options?.mode ?? 'submit';
        this._reflectPanelMode();
        this._panelOnSubmit = options?.onSubmit ?? null;
        this._panelOnEvict = options?.onEvict ?? null;
        const token = Symbol('aparte-composer-panel');
        this._panelToken = token;
        this._emit('panel-change', { active: true, submitEnabled: this._panelSubmitEnabled, mode: this._panelMode });
        return token;
    }

    /**
     * Remove the panel, tell its owner, and restore the composer's own controls.
     *
     * With a `token`, this closes the panel only if that token still owns the slot —
     * so a presenter settling late cannot tear down the panel that replaced it. With
     * no token it closes whatever is there, which is what a consumer driving the
     * composer directly means.
     *
     * BOTH forms notify. The no-token form used to call `_teardownPanel` directly,
     * which nulls `_panelOnEvict` without ever calling it — so the documented public
     * `hidePanel()` closed an open approval panel and left its request pending
     * forever. The turn hung on "waiting for you", and because
     * `AparteConfig.requestUserInput` chains each request on the previous one, NO
     * further question or approval on that config was ever presented again, for the
     * life of the page.
     *
     * The old JSDoc justified the silent branch as "what `reset()` needs". It was not:
     * `reset()` calls `_evictPanel()`, which notifies. The branch had no consumer and
     * one failure mode.
     *
     * The two forms differ on purpose, and the difference is who already knows:
     *
     * - **With a matching token** the OWNER is closing its own panel, which is what
     *   `<aparte-elicitation>`'s `close()` does right after it resolves. It must NOT be
     *   notified — telling it "you were evicted" for a request it just settled would
     *   fire `onEvict` against a finished promise.
     * - **With no token** somebody else is closing a panel they do not own, so the owner
     *   cannot know and has to be told. That includes the presenter's own defensive
     *   `hidePanel(undefined)` when it settles before `showPanel` ran: whatever is open
     *   then belongs to another request, and that request must not orphan.
     */
    hidePanel(token?: symbol): void {
        if (token !== undefined) {
            if (token !== this._panelToken) return;
            this._teardownPanel();
            return;
        }
        this._evictPanel();
    }

    /** Close the panel AND tell its owner, so a pending request never orphans. */
    private _evictPanel(): void {
        const onEvict = this._panelOnEvict;
        // State first, callback second: the owner's settle path calls `hidePanel` with
        // its own token, which must find the slot already empty rather than recurse.
        this._teardownPanel();
        onEvict?.();
    }

    private _teardownPanel(): void {
        const existing = this.querySelector('[data-aparte-panel]') as HTMLElement | null;
        if (existing) existing.remove();
        this.removeAttribute('data-panel-active');
        this._panelActive = false;
        this._panelSubmitEnabled = false;
        this._panelMode = 'submit';
        this._reflectPanelMode();
        this._panelOnSubmit = null;
        this._panelOnEvict = null;
        this._panelToken = null;
        this._emit('panel-change', { active: false, submitEnabled: false, mode: 'submit' });
        this.focus();
    }

    /**
     * Update the send button's state while a panel is active.
     *
     * `mode` moves with it because both change on the same event — answering the
     * question you are on can enable the button AND turn it from "advance" into
     * "submit" (when it was the last one), and two separate calls would flash a
     * wrong icon between them.
     */
    setPanelSubmitEnabled(enabled: boolean, mode?: AparteComposerPanelMode): void {
        if (!this._panelActive) return;
        this._panelSubmitEnabled = enabled;
        if (mode) this._panelMode = mode;
        this._reflectPanelMode();
        this._emit('panel-change', { active: true, submitEnabled: enabled, mode: this._panelMode });
    }

    /**
     * Publish the panel mode as an attribute, so CSS can act on it.
     *
     * The same reasoning `data-panel-active` is set for and the same one that took
     * the old `style.display` off a child: an attribute is themeable, is visible to
     * a consumer's own rules, and does not clobber what the consumer set. It is what
     * lets `'none'` remove the send button without this component reaching into it.
     */
    private _reflectPanelMode(): void {
        if (this._panelActive) this.setAttribute('data-panel-mode', this._panelMode);
        else this.removeAttribute('data-panel-mode');
    }

    get panelActive(): boolean { return this._panelActive; }

    /**
     * Recompute the model gate from the resolved config. When
     * `requireModelSelection` is on and no model is selected, block sending and
     * reflect `data-model-gated` so the shipped CSS greys the composer. Re-runs on
     * every config change (e.g. the model selector's auto-select firing).
     */
    private _evaluateModelGate(): void {
        const gated = this._cfg.getRequireModelSelection() && !this._cfg.hasSelectedModel();
        if (gated === this._modelGated) return;
        this._modelGated = gated;
        this.toggleAttribute('data-model-gated', gated);
    }

    /** Submit the current value. Called by aparte-composer-send or programmatically. */
    submit(): void {
        if (this._panelActive) {
            // `'none'` is authoritative over `submitEnabled`, and deliberately so: the
            // two are set by the same caller and can disagree, and the mode is the one
            // that says whether an act exists at all. Reached by Enter inside the panel
            // and by a consumer calling `submit()` directly — the button itself is not
            // drawn in this mode.
            if (this._panelMode !== 'none' && this._panelSubmitEnabled) this._panelOnSubmit?.();
            return;
        }
        if (this._streaming) {
            this.cancel();
            return;
        }
        const value = this._value.trim();
        if (!value && this._attachments.length === 0) return;
        if (this.disabled) return;
        if (this._modelGated) return; // no model selected yet (require-model gate)

        this._emit('submit', { value, attachments: this._attachments });

        const detail: AparteSendEventDetail = {
            content: value,
            timestamp: Date.now(),
            targetId: this.targetId ?? undefined,
            files: this._attachments.length > 0 ? [...this._attachments] : undefined,
        };

        this.dispatchEvent(new CustomEvent<AparteSendEventDetail>('aparte-send', {
            bubbles: true,
            composed: true,
            detail,
        }));

        // Clear after send
        this.setValue('');
        this.clearAttachments();
    }

    /** Cancel the current streaming response. */
    cancel(): void {
        this._emit('cancel', {});
        // Public, element-scoped signal — symmetric with `aparte-send` on submit,
        // for consumers that want to observe cancel on the composer itself.
        this.dispatchEvent(new CustomEvent('aparte-cancel', { bubbles: true, composed: true }));
        // aparte-abort → tells AparteClient to actually stop the stream
        // aparte-message-aborted → resets the composer's own streaming state
        // Scope the abort to this composer's host so cancelling one chat doesn't
        // abort every scoped client / reset every composer on the page.
        /*
         * `_ownTargetId()`, not the bare attribute.
         *
         * The receive side got this fix and the SEND side did not, which left the whole
         * scoping inert in raw core: nothing writes the `target` attribute in the
         * hand-written markup the quick start shows, so this detail carried
         * `targetId: undefined` — and `_isForThisComposer` treats a missing id as "for
         * everyone". So Stop in chat A still tore down chat B's open panel, which is
         * exactly the failure `_ownTargetId`'s own docblock describes as fixed.
         *
         * Both sides now resolve the same way: the attribute if the wrapper set one,
         * otherwise the id of the chat host above us.
         */
        const abortDetail = { targetId: this._ownTargetId() };
        window.dispatchEvent(new CustomEvent('aparte-abort', { bubbles: false, detail: abortDetail }));
        window.dispatchEvent(new CustomEvent('aparte-message-aborted', { bubbles: false, detail: abortDetail }));
    }

    /**
     * Reset the composer to its initial state.
     * Clears value, attachments, and hides any active panel.
     * Call this when switching conversations.
     */
    reset(): void {
        this.setValue('');
        this.clearAttachments();
        if (this._panelActive) this._evictPanel();
    }

    /** Focus the input primitive inside this composer. */
    override focus(): void {
        const input = this.querySelector('aparte-composer-input') as HTMLElement | null;
        input?.focus();
    }

    // ── Internal pub/sub ────────────────────────────────────────────────────

    _emit<K extends AparteComposerEventType>(event: K, payload: AparteComposerEventMap[K]): void {
        this._listeners.get(event)?.forEach(cb => cb(payload));
        // Mirror state changes to a public DOM event so elements outside the
        // composer package can observe them without the private bus.
        if (AparteComposer._STATE_EVENTS.has(event)) {
            this.dispatchEvent(new CustomEvent<AparteComposerChangeEventDetail>('aparte-composer-change', {
                bubbles: true,
                composed: true,
                detail: { state: this.getState(), composer: this },
            }));
        }
    }

    _on<K extends AparteComposerEventType>(event: K, cb: (payload: AparteComposerEventMap[K]) => void): () => void {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event)!.add(cb as unknown as (payload: unknown) => void);
        return () => this._listeners.get(event)?.delete(cb as unknown as (payload: unknown) => void);
    }

    // ── Window events ───────────────────────────────────────────────────────

    /** A window lifecycle event is for THIS composer when neither side is scoped
     *  (single-instance broadcast) or the target ids match (multi-chat page).
     *  Without this filter, streaming in one chat flips every composer's state. */
    private _isForThisComposer(e: Event): boolean {
        const evtTargetId = (e as CustomEvent).detail?.targetId as string | undefined;
        return !evtTargetId || !this._ownTargetId() || evtTargetId === this._ownTargetId();
    }

    /**
     * Which chat this composer belongs to: its `target` attribute, or the id of the
     * chat host above it.
     *
     * All four wrappers set `target` themselves, so the attribute alone identified a
     * composer there. In RAW core — the documented quick start, where the markup is
     * hand-written — nothing sets it, so `!this.targetId` was true and this composer
     * accepted every chat's lifecycle events: on a two-chat page, one chat's Stop
     * tore down the other's open elicitation panel while its tool call kept waiting,
     * i.e. the question vanished and the turn hung.
     *
     * Found by a two-chat test written for the elicitation presenter, which is the
     * only reason it surfaced: raw core with two chats is a shape nothing exercised.
     * The hosts matched are the ones `aparte-chat-bubble._resolveTargetId()` matches,
     * for the reason written there — Angular's wrapper root IS `<aparte-chat>`, the
     * other three render a `[data-aparte-chat]` div.
     */
    private _ownTargetId(): string | undefined {
        const attr = this.targetId;
        if (attr) return attr;
        let el: HTMLElement | null = this.parentElement;
        while (el) {
            const tag = el.tagName?.toLowerCase();
            const isHost = tag === 'aparte-chat' || tag === 'aparte-chat-component' || el.hasAttribute?.('data-aparte-chat');
            if (isHost && el.id) return el.id;
            el = el.parentElement;
        }
        return undefined;
    }

    private _handleMessageStart(e: Event): void {
        if (!this._isForThisComposer(e)) return;
        this._streaming = true;
        this._emit('streaming-change', { streaming: true });
    }

    private _handleMessageDone(e: Event): void {
        if (!this._isForThisComposer(e)) return;
        this._streaming = false;
        this._emit('streaming-change', { streaming: false });
        // Always hide any active panel when a message lifecycle ends
        if (this._panelActive) this._evictPanel();
    }
}

if (!customElements.get('aparte-composer')) {
    customElements.define('aparte-composer', AparteComposer);
}
