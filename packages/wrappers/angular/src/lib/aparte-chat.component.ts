import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    Injector,
    OnDestroy,
    PLATFORM_ID,
    ViewChild,
    QueryList,
    ViewChildren,
    afterNextRender,
    contentChild,
    input,
    linkedSignal,
    output,
    signal,
    computed,
    untracked,
    ChangeDetectionStrategy,
    TemplateRef,
    inject,
    effect,
    booleanAttribute,
    numberAttribute,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';
import type {
    AparteMessage,
    AparteSegment,
    AparteSendEventDetail,
    AparteChatHostBinding,
    AparteConfig,
    AparteActionEventDetail,
    AparteChatImperativeApi,
} from '@aparte/core';
import { AparteChatHost, aparteGlobalConfig, isAwaitingReply, uuid } from '@aparte/core';
import { AparteBubbleDirective } from './aparte-bubble.directive';

/**
 * AparteChatComponent — the Angular wrapper (19.2 to 22, zone or zoneless)
 *
 * Standalone component wrapping aparté Web Components with Angular Signals.
 * The streaming / branch-navigation / host-method orchestration (orphan-stream
 * guard, lifecycle tracking, conversation lifecycle, bubble reconciliation)
 * lives in the framework-agnostic `AparteChatHost` from `@aparte/core`; this
 * component only owns the Angular-idiomatic surface (signals, template, DI) and
 * binds the host over its `messages` signal.
 */
@Component({
    selector: 'aparte-chat',
    standalone: true,
    imports: [NgTemplateOutlet],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    changeDetection: ChangeDetectionStrategy.OnPush,
    // This selector is ALSO core's `<aparte-chat>` custom element, so the host gets
    // upgraded by core on insert. `framework-managed` tells that shell to keep its
    // hands off: THIS component renders the viewport + composer and drives them
    // through AparteChatHost. Without it, core injects its default composition
    // underneath ours (its own check can't see our children — they render later).
    host: { 'framework-managed': '' },
    template: `
    <div
      class="aparte-chat-container"
      [class]="containerClass()"
      [style]="containerStyle()"
      [class.aparte-chat-container--auto-center]="centerWhenEmpty()"
      [attr.overlay-composer]="overlayComposer() ? '' : null"
      [attr.data-aparte-empty]="centerWhenEmpty() && messages().length === 0 && !waiting() ? '' : null"
    >
      <aparte-chat-viewport #viewport framework-managed="" [attr.loading]="waiting() ? '' : null">
        @if (waiting()) {
          <!-- The wait, drawn here because this DOM is Angular's: the kit's skeleton
               recipe, and a line for a screen reader. -->
          <div class="aparte-viewport-loading" aria-hidden="true">
            <span class="aparte-skeleton aparte-skeleton--rect aparte-viewport-loading__user"></span>
            <span class="aparte-skeleton aparte-skeleton--text"></span>
            <span class="aparte-skeleton aparte-skeleton--text"></span>
            <span class="aparte-skeleton aparte-skeleton--text"></span>
            <span class="aparte-skeleton aparte-skeleton--text aparte-viewport-loading__last"></span>
          </div>
          <span class="aparte-viewport-loading-status aparte-sr-only" role="status">{{ loadingText }}</span>
        }
        @if (messages().length === 0 && !waiting()) {
          <!-- Welcome / placeholder shown inside the viewport while empty. -->
          <ng-content select="[slot='empty-state']"></ng-content>
        }
        @for (message of messages(); track message.id) {
          @if (bubbleTemplate() || bubbleDirective()) {
            <!-- Render your OWN element per message ([bubbleTemplate], else an
                 <ng-template aparteBubble> written as content); driven by the
                 reactive messages() signal so it streams live. -->
            <ng-container
              [ngTemplateOutlet]="bubbleTemplate() ?? bubbleDirective()?.template ?? null"
              [ngTemplateOutletContext]="{ $implicit: message }"
            ></ng-container>
          } @else {
            <aparte-chat-bubble
              #bubble
              [attr.message-id]="message.id"
              [attr.data-role]="message.role"
              [attr.data-kind]="message.compaction ? 'compaction' : null"
              [attr.timestamp]="message.timestamp"
              [attr.content]="message.content"
              [attr.streaming]="awaitingReply(message) ? '' : null"
            ></aparte-chat-bubble>
          }
        }
        <aparte-chat-status
          [attr.visible]="isTyping() ? '' : null"
          [attr.text]="typingLabel"
        ></aparte-chat-status>
      </aparte-chat-viewport>

      <!-- The presenter for a request to the human (approval gate, ask_user…).
           Renders nothing until something asks; on by default as in <aparte-chat>. -->
      @if (elicitation()) {
        <aparte-elicitation></aparte-elicitation>
      }

      <ng-content select="[slot='above-composer']"></ng-content>

      <aparte-composer
        #input
        [attr.placeholder]="placeholder()"
        [attr.disabled]="disabled() || waiting() ? '' : null"
        [attr.submit-on-enter]="submitOnEnter() ? null : 'false'"
        (aparte-send)="onAparteSend($event)"
      >
        <!-- Custom composer via [slot='composer']; falls back to the default
             shell (input · send + footer slots, plus the attachment primitives
             when the attachments input is set). Project your own
             aparte-composer-* layout for a skin-specific composer. -->
        <ng-content select="[slot='composer']">
          <div class="aparte-composer-shell">
            @if (attachments()) {
              <aparte-composer-attachments></aparte-composer-attachments>
            }
            <div class="aparte-composer-row">
              @if (attachments()) {
                <aparte-composer-add-attachment></aparte-composer-add-attachment>
              }
              <aparte-composer-input></aparte-composer-input>
              <aparte-composer-send></aparte-composer-send>
            </div>
            <!-- The composer's bottom row. ONE slot: placement is the DOM order of
                 what you project, and margin-inline-start:auto pushes a control to the
                 end (a logical property, so it reads correctly in RTL).
                 Angular cannot test whether anything projects into an ng-content, so
                 unlike the other three wrappers the element is always rendered -- but it
                 declares itself data-empty when nothing lands in it, and the stylesheet
                 hides it then. The guarantee no longer depends on Angular stripping
                 template whitespace. -->
            <aparte-composer-toolbar>
              <ng-content select="[slot='toolbar']"></ng-content>
            </aparte-composer-toolbar>
          </div>
        </ng-content>
      </aparte-composer>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .aparte-chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    aparte-chat-viewport {
      flex: 1;
      min-height: 0;
    }

    aparte-composer {
      flex-shrink: 0;
    }
  `]
})
export class AparteChatComponent implements OnDestroy, AparteChatImperativeApi {
    constructor() {
        // Reactive effect to reconcile bubbles when the messages signal updates.
        // Debounced with requestAnimationFrame so rapid token bursts only trigger
        // one sync per paint frame instead of N syncs for N tokens.
        effect(() => {
            // Read the signal so the effect tracks it — and react to EVERY value,
            // the empty list included. React, Vue and Svelte all re-sync
            // unconditionally, and emptying the transcript is exactly when the host
            // has to let go of the bubbles that just went away. With the default
            // bubbles `bubbleRefs.changes` hid the divergence; under a custom
            // `[bubbleTemplate]` that query never fires and this was the only path.
            this.messages();
            // A server render has no frame to wait for and no host to sync.
            if (!this._isBrowser || this._syncRafId !== null) return;
            this._syncRafId = requestAnimationFrame(() => {
                this._syncRafId = null;
                this._host?.syncBubbles();
            });
        });

        // A parent that empties [messages] starts a new conversation: the host lets go of
        // its render cache then — the same rule React, Vue and Svelte apply.
        effect(() => {
            if (this.messagesInput().length === 0) untracked(() => this._host?.clearRenderCache());
        });

        // [conversationId] drives the host; an echo of the id the host already holds
        // (e.g. the one it just created and reported) is a no-op.
        effect(() => {
            const next = this.conversationIdInput() ?? null;
            untracked(() => {
                if (next === this._conversationId) return;
                this._conversationId = next;
                if (this._host) void this._host.setConversationId(next);
            });
        });

        // The host touches the DOM and the custom elements: browser only, after the first
        // render (never during a server render, where there is no element to drive).
        afterNextRender(() => this._createHost());
    }

    private elementRef = inject(ElementRef);
    private readonly _injector = inject(Injector);
    private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /**
     * Template bridge to core's shared `isAwaitingReply` (an Angular template can't
     * call an imported function). One rule for the four wrappers and core itself,
     * so "is this bubble in flight" can't drift between them.
     */
    readonly awaitingReply = isAwaitingReply;

    // ── Inputs ───────────────────────────────────────────────────────────────
    //
    // Signal inputs under the same public names as before (`[messages]`, `disabled`,
    // `centerWhenEmpty`…), so no template changes. Where the chat also writes a value
    // itself (the list, the typing line), the input feeds a `linkedSignal`: a parent write
    // resets it, the chat's own writes move it, and neither emits — `messagesChange` is
    // emitted by the host's report only, never by a `set` (which is why this is not a
    // `model()`: a model emits on every write, and an optimistic append must stay silent).

    /** Messages to display. Two-way: `[(messages)]`, with `(messagesChange)` reporting the chat's own changes. */
    readonly messagesInput = input<AparteMessage[]>([], { alias: 'messages' });
    readonly messages = linkedSignal<AparteMessage[]>(() => this.messagesInput());

    /** Input placeholder text */
    readonly placeholder = input<string>('Type a message...');

    /** Whether the input is disabled */
    readonly disabled = input(false, { transform: booleanAttribute });

    /** When false, Shift+Enter submits and a bare Enter inserts a newline. */
    readonly submitOnEnter = input(true, { transform: booleanAttribute });

    /**
     * Opt in to the "centered composer when empty" layout: the composer sits
     * vertically centered with the `[slot='empty-state']` content above it while
     * the list is empty, then slides to the bottom on the first message (~0.3s).
     * Off by default — additive (adds the `--auto-center` modifier + a
     * `data-aparte-empty` attribute the shipped `aparte.css` recipe keys off).
     */
    readonly centerWhenEmpty = input(false, { transform: booleanAttribute });

    /**
     * The conversation is on its way: the viewport draws two skeleton turns, the empty
     * state stays off and the composer is disabled until it lands. The conversation
     * controller sets this itself while it fetches through your adapter's `loadFull()`;
     * the input is for a wait of your own. Off by default.
     */
    readonly loading = input(false, { transform: booleanAttribute });
    /** The controller's wait (a conversation fetched through the adapter). */
    readonly hostLoading = signal<boolean>(false);
    readonly waiting = computed(() => this.loading() || this.hostLoading());
    /** Bumped on every config change, so the two locale strings below follow a language switch under OnPush. */
    private readonly _localeTick = signal(0);
    private _unsubscribeLocale?: () => void;
    get loadingText(): string { this._localeTick(); return (this.config() ?? aparteGlobalConfig).t('loadingConversation'); }

    /**
     * Class(es) merged onto the INNER `.aparte-chat-container`, not onto this
     * component's own `<aparte-chat>` host.
     *
     * The other three wrappers have no such host: their root IS the container, so a
     * consumer's `className` / `class` lands on the div that carries
     * `.aparte-chat-container`, `[overlay-composer]` and `[data-aparte-empty]` — the
     * three selectors core's shell recipe keys on. Here a class written on the tag
     * lands one level above them, so overriding the shell needed a descendant
     * selector on Angular alone. This input is that parity. Additive: the recipe's
     * own classes stay.
     */
    readonly containerClass = input('', { alias: 'containerClass', transform: (val: string | null | undefined) => val ?? '' });

    /** Inline style for the same div — a string or a `{ prop: value }` map. */
    readonly containerStyle = input(null, {
        alias: 'containerStyle',
        transform: (val: string | Record<string, string> | null | undefined) => val ?? null,
    });

    /**
     * Overlay the composer on the transcript (the ChatGPT anatomy): the scroll
     * surface spans the whole column, the scrollbar runs edge to edge, and the
     * composer floats over it. Bound on the INNER `.aparte-chat-container` — that
     * div is this wrapper's shell (the viewport is its child, not the host's), and
     * core's recipe and the viewport's measurement both key on the attribute
     * there. Read when the viewport mounts.
     */
    readonly overlayComposer = input(false, { transform: booleanAttribute });

    /**
     * Add the file picker + chips strip to the default composer shell. **Off by
     * default**, because the capability needs a host that consumes the files: an
     * `AparteClient` inlines them per its `rawFileInject` option, but if you drive
     * your own loop you must read `event.files` on `(messageSent)` — otherwise the
     * file the user deliberately attached is dropped in silence. No effect when you
     * project a `[slot='composer']` (drop `<aparte-composer-add-attachment>` and
     * `<aparte-composer-attachments>` in it yourself).
     */
    readonly attachments = input(false, { transform: booleanAttribute });

    /**
     * Render the `<aparte-elicitation>` presenter inside the host — on by default, as
     * it is in `<aparte-chat>`: the built-in approval gate and `requestUserInput()`
     * ask through it, and it renders nothing until something asks. Set it to `false`
     * when you mount a presenter of your own (`setElicitationPresenter`) or place the
     * element yourself.
     */
    readonly elicitation = input(true, { transform: booleanAttribute });

    /** Whether the assistant is currently typing/streaming. The host turns it off on the first token. */
    readonly isTypingInput = input(false, { alias: 'isTyping', transform: booleanAttribute });
    readonly isTyping = linkedSignal<boolean>(() => this.isTypingInput());

    /** Text to show in the typing status */
    readonly typingText = input<string | undefined>(undefined);
    /** The status line's word: the input, else the locale's, like the rest of the chat. */
    get typingLabel(): string { this._localeTick(); return this.typingText() ?? (this.config() ?? aparteGlobalConfig).t('typing'); }

    /** Duration in ms to freeze spacer recalculation after a conversation swap. Read when the host is created. */
    readonly layoutTransitionMs = input(0, { transform: numberAttribute });

    /**
     * Active conversation id. When provided, the host attaches an
     * `AparteConversationController` that loads/persists messages via the
     * `AparteConversationManager` registered in `aparteGlobalConfig`. Setting a different id
     * mid-stream aborts the previous request; `null` deselects.
     */
    readonly conversationIdInput = input<string | null | undefined>(undefined, { alias: 'conversationId' });
    private _conversationId: string | null = null;

    /**
     * Instance {@link AparteConfig} for this chat. When set, aparté components
     * inside resolve THIS config instead of `aparteGlobalConfig`, so
     * several independently-configured chats can coexist on one page. Omit for the
     * global config. Read once, when the host is created after the first render.
     */
    readonly config = input<AparteConfig | undefined>(undefined);

    /**
     * Render your OWN element per message in place of `<aparte-chat-bubble>`.
     * Opt-in — provide a `<ng-template let-message>` and pass its ref, or write the
     * template as content with {@link AparteBubbleDirective} (`<ng-template aparteBubble
     * let-message>`); this input wins when both are given. Driven by the reactive
     * `messages()` signal, so it updates live during streaming. The built-in action bar
     * (retry/edit/branch) belongs to the native bubble; a custom bubble owns whatever it wires.
     * @example
     * <aparte-chat [bubbleTemplate]="tpl" />
     * <ng-template #tpl let-message>{{ message.content }}</ng-template>
     */
    readonly bubbleTemplate = input<TemplateRef<{ $implicit: AparteMessage }> | undefined>(undefined);
    /** The `<ng-template aparteBubble>` written as content, if any. */
    readonly bubbleDirective = contentChild(AparteBubbleDirective);

    // ── Outputs ────────────────────────────────────────────────────────────

    /**
     * User submitted a message from the composer. It is **appended to the thread
     * automatically** (optimistic UI) before this fires — do NOT add it again in
     * the handler (uncontrolled → duplicates; controlled → mirror it into your
     * own `[messages]`). For side-effects: scroll, analytics, send.
     */
    readonly messageSent = output<AparteSendEventDetail>();
    /**
     * Emitted when a custom bubble action (registered via
     * `aparteGlobalConfig.registerAction` with `zones: ['bubble']`) is clicked — a typed
     * wrapper over the bubbling `aparte-action` DOM event. Switch on `$event.actionId`.
     */
    readonly action = output<AparteActionEventDetail>();
    /** Emitted when messages are updated internally (e.g. by AparteClient) */
    readonly messagesChange = output<AparteMessage[]>();
    /** Emitted when a message is added internally (e.g. by appendMessage) */
    readonly messageAppended = output<AparteMessage>();
    /** The typing/"thinking" indicator toggled (the host flips it off on the first streamed token). */
    readonly typingChange = output<boolean>();
    /** Emitted when the controller lazily creates a conversation on first send. */
    readonly conversationCreated = output<string>();

    // ── View Children ────────────────────────────────────────────────────────
    @ViewChild('viewport') viewportRef?: ElementRef<HTMLElement>;
    @ViewChild('input') inputRef?: ElementRef<HTMLElement>;
    @ViewChildren('bubble') bubbleRefs!: QueryList<ElementRef<HTMLElement>>;

    // ── Private State ────────────────────────────────────────────────────────
    /** Mirror of the host's streaming target id (drives `isStreaming`). */
    private readonly _streamingId = signal<string | null>(null);
    /** Computed: is currently streaming */
    readonly isStreaming = computed(() => this._streamingId() !== null);

    /** rAF id used to coalesce rapid signal updates during streaming */
    private _syncRafId: number | null = null;

    /** The framework-agnostic chat-host orchestrator (created after the first render, in the browser). */
    private _host?: AparteChatHost;
    private _unbindHost?: () => void;
    /** QueryList.changes subscription — released in ngOnDestroy so SPA route
     *  churn doesn't leak a live subscription per mount. */
    private _bubbleRefsSub?: { unsubscribe(): void };
    /** Set by ngOnDestroy: an afterNextRender that lands after a destroy must not build a host. */
    private _destroyed = false;

    private _createHost(): void {
        if (this._destroyed || this._host) return;
        this._unsubscribeLocale = (this.config() ?? aparteGlobalConfig).subscribe(() => this._localeTick.update((n) => n + 1));
        const host = this.elementRef.nativeElement as HTMLElement;

        // Ensure a stable id so aparte-composer can reference the host via `target`,
        // letting AparteClient find it without DOM traversal across re-renders.
        if (!host.id) host.id = `aparte-chat-${uuid()}`;
        const composerEl = this.inputRef?.nativeElement;
        if (composerEl) composerEl.setAttribute('target', host.id);

        const binding: AparteChatHostBinding = {
            hostId: host.id,
            host,
            viewport: this.viewportRef?.nativeElement ?? null,
            getMessages: () => this.messages(),
            setMessages: (msgs) => this.messages.set(msgs as AparteMessage[]),
            onMessagesChange: (msgs) => this.messagesChange.emit(msgs as AparteMessage[]),
            onMessageAppended: (msg) => this.messageAppended.emit(msg as AparteMessage),
            onTypingChange: (typing) => { this.isTyping.set(typing); this.typingChange.emit(typing); },
            onStreamingChange: (id) => this._streamingId.set(id),
            onLoadingChange: (on) => this.hostLoading.set(on),
            // Sibling-info / deferred work runs after Angular has re-rendered — Angular's
            // own hook for exactly that, which also holds under zoneless.
            afterRender: (cb) => { afterNextRender(cb, { injector: this._injector }); },
            resetComposer: () => {
                (this.inputRef?.nativeElement as unknown as { reset?: () => void })?.reset?.();
            },
        };

        this._host = new AparteChatHost(binding, {
            layoutTransitionMs: this.layoutTransitionMs(),
            conversationId: this._conversationId,
            onConversationCreated: (id) => {
                this._conversationId = id;
                this.conversationCreated.emit(id);
            },
            config: this.config(),
        });
        this._unbindHost = this._host.bind();

        // Custom bubble actions bubble to the host as `aparte-action`; surface them as
        // the typed `action` output. (addEventListener, not @HostListener: Angular
        // parses a colon in the event name as a `target:event` global target.)
        host.addEventListener('aparte-action', this._onAction);

        // Re-reconcile bubbles whenever Angular's @for materialises/destroys them.
        this._host.syncBubbles();
        this._bubbleRefsSub = this.bubbleRefs.changes.subscribe(() => this._host?.syncBubbles());
    }

    private readonly _onAction = (event: Event): void => {
        this.action.emit((event as CustomEvent<AparteActionEventDetail>).detail);
    };

    ngOnDestroy(): void {
        this._destroyed = true;
        this._unsubscribeLocale?.();
        this._unsubscribeLocale = undefined;
        if (this._syncRafId !== null) {
            cancelAnimationFrame(this._syncRafId);
            this._syncRafId = null;
        }
        (this.elementRef.nativeElement as HTMLElement).removeEventListener('aparte-action', this._onAction);
        this._bubbleRefsSub?.unsubscribe();
        this._bubbleRefsSub = undefined;
        this._unbindHost?.();
        this._unbindHost = undefined;
        this._host = undefined;
    }

    // ── Public imperative API (delegates to the host) ──────────────────────────

    /** Append a message optimistically — `{ historical: true }` for one restored from your own store. */
    appendMessage(message: AparteMessage, options?: { historical?: boolean }): void {
        this._host?.appendMessage(message, options);
    }
    /** Atomic update for a message. */
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void {
        this._host?.updateMessage(messageId, updates);
    }
    /** Update the last message content (streaming text). */
    updateLastMessage(content: string, options?: { append?: boolean }): void {
        this._host?.updateLastMessage(content, options);
    }
    /** Add a segment to the last message. */
    addSegment(segment: AparteSegment): void { this._host?.addSegment(segment); }
    /** Update a segment in the last message. */
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void {
        this._host?.updateSegment(segmentId, updates);
    }
    /** Remove a transient segment. */
    removeSegment(segmentId: string): void { this._host?.removeSegment(segmentId); }
    /** Append content to a segment in the last message. */
    appendToSegment(segmentId: string, content: string): void {
        this._host?.appendToSegment(segmentId, content);
    }
    /** Read the current message list. */
    getMessages(): AparteMessage[] { return this._host?.getMessages() ?? this.messages(); }
    /**
     * Clear all messages + reset state. `{ revokeAttachments: false }` keeps the
     * attachments' object URLs alive — pass it when the same messages are going back.
     */
    clearMessages(options?: { revokeAttachments?: boolean }): void { this._host?.clearMessages(options); }
    /** Scroll the viewport to the latest message. */
    scrollToBottom(): void {
        (this.viewportRef?.nativeElement as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.();
    }
    /**
     * The `<aparte-chat-viewport>` element — for custom scroll handling, an
     * IntersectionObserver, etc. Same `getViewport()` accessor on all four
     * wrappers.
     */
    getViewport(): HTMLElement | null { return this.viewportRef?.nativeElement ?? null; }
    /** Focus the composer input. */
    focusInput(): void {
        (this.inputRef?.nativeElement as unknown as { focus?: () => void })?.focus?.();
    }
    /** Create a new branch from a message (returns the new sibling index). */
    addBranch(messageId: string): number { return this._host?.addBranch(messageId) ?? 0; }
    /** Add a sibling of an existing message (returns the new id). */
    addSiblingOf(existingId: string, newMessage: AparteMessage): string | null {
        return this._host?.addSiblingOf(existingId, newMessage) ?? null;
    }
    /** Remove a message and all descendants (edit flow). */
    truncateFrom(messageId: string): void { this._host?.truncateFrom(messageId); }
    /** Keep up to and including a user message, drop later responses (retry). */
    truncateResponsesAfter(userMessageId: string): void {
        this._host?.truncateResponsesAfter(userMessageId);
    }

    // ── Token streaming (cross-wrapper contract + Observable adapter) ──────────

    /**
     * Inject a token stream for LLM streaming. Takes the cross-wrapper
     * `AsyncIterable<string>` contract (the exact call that works on
     * React/Vue/Svelte) — or an Angular-idiomatic RxJS `Observable<string>`,
     * adapted into the host's agnostic `streamTokens(AsyncIterable)` so the
     * orphan-stream guard + id tracking stay in one place (the host).
     */
    async injectTokenStream(
        messageId: string,
        stream: Observable<string> | AsyncIterable<string>,
    ): Promise<void> {
        if (!this._host) return;
        const tokens = Symbol.asyncIterator in stream
            ? (stream as AsyncIterable<string>)
            : this._observableToAsyncIterable(stream as Observable<string>);
        await this._host.streamTokens(messageId, tokens);
    }

    /** Stop any active token stream. */
    stopTokenStream(): void { this._host?.stopTokenStream(); }

    /**
     * Set the active conversation id imperatively — parity with the other
     * wrappers' handles (the `conversationId` `@Input` remains the declarative
     * path). Delegates to the host, which loads/persists via the registered
     * `AparteConversationManager`.
     */
    setConversationId(id: string | null): Promise<void> {
        return this._host?.setConversationId(id) ?? Promise.resolve();
    }

    private _observableToAsyncIterable(stream: Observable<string>): AsyncIterable<string> {
        return {
            [Symbol.asyncIterator](): AsyncIterator<string> {
                const buffer: string[] = [];
                let finished = false;
                let failure: unknown = null;
                let pending: {
                    resolve: (r: IteratorResult<string>) => void;
                    reject: (e: unknown) => void;
                } | null = null;
                const settle = () => {
                    if (!pending) return;
                    if (failure !== null) { const p = pending; pending = null; p.reject(failure); return; }
                    if (buffer.length) {
                        const p = pending; pending = null;
                        p.resolve({ value: buffer.shift() as string, done: false });
                        return;
                    }
                    if (finished) {
                        const p = pending; pending = null;
                        p.resolve({ value: undefined as unknown as string, done: true });
                    }
                };
                const sub = stream.subscribe({
                    next: (v) => { buffer.push(v); settle(); },
                    error: (e) => { failure = e; settle(); },
                    complete: () => { finished = true; settle(); },
                });
                return {
                    next(): Promise<IteratorResult<string>> {
                        if (failure !== null) return Promise.reject(failure);
                        if (buffer.length) {
                            return Promise.resolve({ value: buffer.shift() as string, done: false });
                        }
                        if (finished) {
                            return Promise.resolve({ value: undefined as unknown as string, done: true });
                        }
                        return new Promise((resolve, reject) => { pending = { resolve, reject }; });
                    },
                    return(): Promise<IteratorResult<string>> {
                        sub.unsubscribe();
                        // If a consumer is mid-`await next()` on an empty buffer (e.g. the
                        // orphan-stream guard calling `return()` on stop/teardown), settle
                        // that pending promise now with done:true — otherwise it hangs
                        // forever, since unsubscribing means `next` and `complete` will
                        // never fire again to resolve it.
                        if (pending) {
                            const p = pending;
                            pending = null;
                            p.resolve({ value: undefined as unknown as string, done: true });
                        }
                        finished = true;
                        return Promise.resolve({ value: undefined as unknown as string, done: true });
                    },
                };
            },
        };
    }

    /** Handle aparte-send event from the composer Web Component. */
    onAparteSend(event: Event): void {
        const detail = (event as CustomEvent<AparteSendEventDetail>).detail;
        // Smooth-scroll the next auto-scroll (when Angular adds the user bubble).
        (this.viewportRef?.nativeElement as unknown as { requestSmoothScroll?: () => void })
            ?.requestSmoothScroll?.();
        this.messageSent.emit(detail);
    }
}
