import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    OnDestroy,
    ViewChild,
    QueryList,
    ViewChildren,
    output,
    signal,
    computed,
    ChangeDetectionStrategy,
    AfterViewInit,
    Input,
    TemplateRef,
    inject,
    effect,
    booleanAttribute,
    numberAttribute,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Observable } from 'rxjs';
import type {
    AparteMessage,
    AparteSegment,
    AparteSendEventDetail,
    AparteChatHostBinding,
    AparteConfigClass,
    AparteActionEventDetail,
} from '@aparte/core';
import { AparteChatHost } from '@aparte/core';

/**
 * AparteChatComponent — Angular 19 Wrapper
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
      [class.aparte-chat-container--auto-center]="centerWhenEmpty()"
      [attr.data-aparte-empty]="centerWhenEmpty() && messages().length === 0 ? '' : null"
    >
      <aparte-chat-viewport #viewport framework-managed="">
        @if (messages().length === 0) {
          <!-- Welcome / placeholder shown inside the viewport while empty. -->
          <ng-content select="[slot='empty-state']"></ng-content>
        }
        @for (message of messages(); track message.id) {
          @if (bubbleTemplate) {
            <!-- Render your OWN element per message; driven by the reactive
                 messages() signal so it streams live. -->
            <ng-container
              [ngTemplateOutlet]="bubbleTemplate"
              [ngTemplateOutletContext]="{ $implicit: message }"
            ></ng-container>
          } @else {
            <aparte-chat-bubble
              #bubble
              [attr.message-id]="message.id"
              [attr.data-role]="message.role"
              [attr.timestamp]="message.timestamp"
              [attr.content]="message.content"
              [attr.streaming]="(message.status === 'streaming' || message.status === 'pending') ? '' : null"
            ></aparte-chat-bubble>
          }
        }
        <aparte-chat-status
          [attr.visible]="isTyping() ? '' : null"
          [attr.text]="typingText()"
        ></aparte-chat-status>
      </aparte-chat-viewport>

      <ng-content select="[slot='above-composer']"></ng-content>

      <aparte-composer
        #input
        [attr.placeholder]="placeholder()"
        [attr.disabled]="disabled() ? '' : null"
        [attr.submit-on-enter]="submitOnEnter() ? null : 'false'"
        (aparte-send)="onAparteSend($event)"
      >
        <!-- Custom composer via [slot='composer']; falls back to the default
             shell (add-attachment · input · send + footer slots). Project your
             own aparte-composer-* layout for a skin-specific composer. -->
        <ng-content select="[slot='composer']">
          <div class="aparte-composer-shell">
            <aparte-composer-attachments></aparte-composer-attachments>
            <div class="aparte-composer-row">
              <aparte-composer-add-attachment></aparte-composer-add-attachment>
              <aparte-composer-input></aparte-composer-input>
              <aparte-composer-send></aparte-composer-send>
            </div>
            <div class="aparte-composer-footer">
              <ng-content select="[slot='footer-left']"></ng-content>
              <ng-content select="[slot='footer-center']"></ng-content>
              <ng-content select="[slot='footer-right']"></ng-content>
            </div>
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
export class AparteChatComponent implements AfterViewInit, OnDestroy {
    constructor() {
        // Reactive effect to reconcile bubbles when the messages signal updates.
        // Debounced with requestAnimationFrame so rapid token bursts only trigger
        // one sync per paint frame instead of N syncs for N tokens.
        effect(() => {
            const msgs = this.messages();
            if (msgs.length > 0) {
                if (this._syncRafId !== null) return;
                this._syncRafId = requestAnimationFrame(() => {
                    this._syncRafId = null;
                    this._host?.syncBubbles();
                });
            }
        });
    }

    private elementRef = inject(ElementRef);

    // ── Input Signals ────────────────────────────────────────────────────────

    /** Messages to display */
    @Input('messages') set messagesInput(val: AparteMessage[]) {
        this.messages.set(val);
        // When messages are cleared (new conversation), reset the host's render cache
        // so the next conversation starts clean — same as React/Vue/Svelte do. (The
        // viewport's own clearMessages() is @deprecated in core and only clears its
        // repo; the host's clearAll() path already owns the real teardown.)
        if (val.length === 0) this._host?.clearRenderCache();
    }
    readonly messages = signal<AparteMessage[]>([]);

    /** Input placeholder text */
    @Input('placeholder') set placeholderInput(val: string) { this.placeholder.set(val); }
    readonly placeholder = signal<string>('Type a message...');

    /** Whether the input is disabled */
    @Input({ alias: 'disabled', transform: booleanAttribute }) set disabledInput(val: boolean) { this.disabled.set(val); }
    readonly disabled = signal<boolean>(false);

    /** When false, Shift+Enter submits and a bare Enter inserts a newline. */
    @Input({ alias: 'submitOnEnter', transform: booleanAttribute }) set submitOnEnterInput(val: boolean) { this.submitOnEnter.set(val); }
    readonly submitOnEnter = signal<boolean>(true);

    /**
     * Opt in to the "centered composer when empty" layout: the composer sits
     * vertically centered with the `[slot='empty-state']` content above it while
     * the list is empty, then slides to the bottom on the first message (~0.3s).
     * Off by default — additive (adds the `--auto-center` modifier + a
     * `data-aparte-empty` attribute the shipped `aparte.css` recipe keys off).
     */
    @Input({ alias: 'centerWhenEmpty', transform: booleanAttribute }) set centerWhenEmptyInput(val: boolean) { this.centerWhenEmpty.set(val); }
    readonly centerWhenEmpty = signal<boolean>(false);

    /** Whether the assistant is currently typing/streaming */
    @Input({ alias: 'isTyping', transform: booleanAttribute }) set isTypingInput(val: boolean) { this.isTyping.set(val); }
    readonly isTyping = signal<boolean>(false);

    /** Text to show in the typing status */
    @Input('typingText') set typingTextInput(val: string) { this.typingText.set(val); }
    readonly typingText = signal<string>('Assistant is thinking...');

    /** Duration in ms to freeze spacer recalculation after a conversation swap. */
    @Input({ alias: 'layoutTransitionMs', transform: numberAttribute }) layoutTransitionMs = 0;

    /**
     * Active conversation id. When provided, the host attaches an
     * `AparteConversationController` that loads/persists messages via the
     * `ConversationManager` registered in `AparteConfig`. Setting a different id
     * mid-stream aborts the previous request; `null` deselects.
     */
    @Input('conversationId') set conversationIdInput(val: string | null | undefined) {
        const next = val ?? null;
        if (next === this._conversationId) return;
        this._conversationId = next;
        if (this._host) void this._host.setConversationId(next);
    }
    private _conversationId: string | null = null;

    /**
     * Instance {@link AparteConfigClass} for this chat. When set, aparté components
     * inside resolve THIS config instead of the global `AparteConfig` singleton, so
     * several independently-configured chats can coexist on one page. Omit for the
     * global config. Read once in `ngAfterViewInit` when the host is created.
     */
    @Input() config?: AparteConfigClass;

    /**
     * Render your OWN element per message in place of `<aparte-chat-bubble>`.
     * Opt-in — provide a `<ng-template let-message>` and pass its ref. Driven by
     * the reactive `messages()` signal, so it updates live during streaming.
     * The built-in action bar (retry/edit/branch) belongs to the native bubble;
     * a custom bubble owns whatever it wires.
     * @example
     * <aparte-chat [bubbleTemplate]="tpl" />
     * <ng-template #tpl let-message>{{ message.content }}</ng-template>
     */
    @Input() bubbleTemplate?: TemplateRef<{ $implicit: AparteMessage }>;

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
     * `AparteConfig.registerAction` with `zones: ['bubble']`) is clicked — a typed
     * wrapper over the bubbling `aparte:action` DOM event. Switch on `$event.actionId`.
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

    /** The framework-agnostic chat-host orchestrator (created in ngAfterViewInit). */
    private _host?: AparteChatHost;
    private _unbindHost?: () => void;

    ngAfterViewInit(): void {
        const host = this.elementRef.nativeElement as HTMLElement;

        // Ensure a stable id so aparte-composer can reference the host via `target`,
        // letting AparteClient find it without DOM traversal across re-renders.
        if (!host.id) host.id = `aparte-chat-${crypto.randomUUID()}`;
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
            // Sibling-info / deferred work runs after Angular has re-rendered.
            afterRender: (cb) => { setTimeout(cb, 0); },
            resetComposer: () => {
                (this.inputRef?.nativeElement as unknown as { reset?: () => void })?.reset?.();
            },
        };

        this._host = new AparteChatHost(binding, {
            layoutTransitionMs: this.layoutTransitionMs,
            conversationId: this._conversationId,
            onConversationCreated: (id) => {
                this._conversationId = id;
                this.conversationCreated.emit(id);
            },
            config: this.config,
        });
        this._unbindHost = this._host.bind();

        // Custom bubble actions bubble to the host as `aparte:action`; surface them as
        // the typed `action` output. (addEventListener, not @HostListener: Angular
        // parses a colon in the event name as a `target:event` global target.)
        host.addEventListener('aparte:action', this._onAction);

        // Re-reconcile bubbles whenever Angular's @for materialises/destroys them.
        this._host.syncBubbles();
        this.bubbleRefs.changes.subscribe(() => this._host?.syncBubbles());
    }

    private readonly _onAction = (event: Event): void => {
        this.action.emit((event as CustomEvent<AparteActionEventDetail>).detail);
    };

    ngOnDestroy(): void {
        if (this._syncRafId !== null) {
            cancelAnimationFrame(this._syncRafId);
            this._syncRafId = null;
        }
        (this.elementRef.nativeElement as HTMLElement).removeEventListener('aparte:action', this._onAction);
        this._unbindHost?.();
        this._unbindHost = undefined;
        this._host = undefined;
    }

    // ── Public imperative API (delegates to the host) ──────────────────────────

    /** Append a message optimistically. */
    appendMessage(message: AparteMessage): void { this._host?.appendMessage(message); }
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
    /** Clear all messages + reset state. */
    clearMessages(): void { this._host?.clearMessages(); }
    /** Scroll the viewport to the latest message. */
    scrollToBottom(): void {
        (this.viewportRef?.nativeElement as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.();
    }
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

    // ── Token streaming (Angular-idiomatic Observable adapter) ─────────────────

    /**
     * Inject a token stream for LLM streaming. Adapts the RxJS `Observable` into
     * the host's agnostic `streamTokens(AsyncIterable)` so the orphan-stream
     * guard + id tracking stay in one place (the host).
     */
    async injectTokenStream(messageId: string, stream: Observable<string>): Promise<void> {
        if (!this._host) return;
        await this._host.streamTokens(messageId, this._observableToAsyncIterable(stream));
    }

    /** Stop any active token stream. */
    stopTokenStream(): void { this._host?.stopTokenStream(); }

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
