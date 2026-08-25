/**
 * A typed Angular surface for every aparté element.
 *
 * ## Why Angular needs code where the other three wrappers need only types
 *
 * React, Vue and Svelte type the raw tag through a declaration merge and emit nothing
 * at runtime. Angular cannot, for two structural reasons:
 *
 *  1. Its template compiler rejects an unknown element unless something claims the tag.
 *     Without a directive, every consuming component needs `CUSTOM_ELEMENTS_SCHEMA` —
 *     which also switches off checking for every other unknown tag in that template.
 *  2. `[placeholder]="x"` on a custom element writes a PROPERTY. aparté elements are
 *     attribute-driven (`observedAttributes`), so a property write is a silent no-op —
 *     or throws, because `<aparte-composer>` exposes eight getter-only accessors
 *     (`value`, `streaming`, `disabled`, `submitOnEnter`, `attachments`, `placeholder`,
 *     `targetId`, `panelActive`). A consumer had to know to write `[attr.placeholder]`.
 *
 * A directive whose selector IS the tag solves both, and gets the thing `<aparte-ui>`
 * can never give: the element is really in the template, so `@if`, `@for` and content
 * projection all work on it. `<aparte-ui>` creates its element imperatively in
 * `ngAfterViewInit`, which is why none of them do.
 *
 * ## What is deliberately not here
 *
 * The attribute facts are not restated — they come from `AparteElementAttributes` in
 * core, the same registry React's JSX intrinsics are derived from. Event details are
 * not restated either: `@aparte/core` augments `HTMLElementEventMap`, so the detail
 * types below are the ones `scripts/check-event-map.mjs` already guards in both
 * directions.
 *
 * Outputs emit the DETAIL, not the `CustomEvent`, because that is the Angular idiom —
 * `(selectChange)="pick($event.value)"`. Reach the event itself with a plain host
 * listener when you need `stopPropagation`.
 */
import {
    Directive,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    Output,
    booleanAttribute,
    inject,
    numberAttribute,
} from '@angular/core';
import { applyElementProps } from '@aparte/core';
import type {
    AparteAttachmentPreviewEventDetail,
    AparteActionEventDetail,
    AparteActionClickEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteFeedbackEventDetail,
    AparteMessageInfoEventDetail,
    AparteBranchNavigateEventDetail,
    AparteSendEventDetail,
    AparteComposerChangeEventDetail,
    AparteSegmentUpdateEventDetail,
    ApartePathChangedEventDetail,
    AparteConversationSelectDetail,
    AparteConversationDeleteDetail,
    AparteConversationArchiveDetail,
    AparteSelectChangeDetail,
    AparteOptgroupToggleEventDetail,
    AparteModelChangeEventDetail,
} from '@aparte/core';

/**
 * Writes one declared attribute onto the host element.
 *
 * `applyElementProps` is core's own rule and is reused rather than reimplemented: a
 * primitive goes through `setAttribute`, `true` becomes the empty presence attribute,
 * `false`/`null`/`undefined` remove it, and only a value an attribute cannot carry is
 * handed over as a property. That is exactly the decision every setter below needs, and
 * it is already covered by the tests behind `<aparte-ui>`.
 */
@Directive()
abstract class AparteElementBase {
    protected readonly host = inject(ElementRef<HTMLElement>);

    protected write(name: string, value: unknown): void {
        applyElementProps(this.host.nativeElement, { [name]: value });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `<aparte-chat-viewport>` — the transcript surface.
 *
 * @example
 * <aparte-chat-viewport [scrollThreshold]="64" (pathChanged)="onBranch($event)" />
 */
@Directive({ selector: 'aparte-chat-viewport', standalone: true })
export class AparteChatViewportDirective extends AparteElementBase {
    @Input({ transform: numberAttribute }) set scrollThreshold(v: number) { this.write('scroll-threshold', v); }
    @Input({ transform: numberAttribute }) set maxRenderedBubbles(v: number) { this.write('max-rendered-bubbles', v); }
    /** @deprecated Use {@link maxRenderedBubbles}; the element warns when this is set. */
    @Input({ transform: numberAttribute }) set maxMessages(v: number) { this.write('max-messages', v); }

    @Output() readonly segmentUpdate = new EventEmitter<AparteSegmentUpdateEventDetail>();
    @Output() readonly resetDone = new EventEmitter<void>();
    @Output() readonly pathChanged = new EventEmitter<ApartePathChangedEventDetail>();

    @HostListener('aparte-segment-update', ['$event'])
    protected onSegmentUpdate(e: CustomEvent<AparteSegmentUpdateEventDetail>): void { this.segmentUpdate.emit(e.detail); }
    @HostListener('aparte-reset-done')
    protected onResetDone(): void { this.resetDone.emit(); }
    @HostListener('aparte-path-changed', ['$event'])
    protected onPathChanged(e: CustomEvent<ApartePathChangedEventDetail>): void { this.pathChanged.emit(e.detail); }
}

/**
 * `<aparte-chat-bubble>` — one message.
 *
 * `role` is spelled `messageRole` here and writes `data-role`. The element observes a
 * bare `role` too, but that name is ARIA's, and an Input called `role` on a directive
 * would shadow it in every template.
 *
 * @example
 * <aparte-chat-bubble messageId="a1" messageRole="assistant" [streaming]="waiting" />
 */
@Directive({ selector: 'aparte-chat-bubble', standalone: true })
export class AparteChatBubbleDirective extends AparteElementBase {
    @Input() set messageRole(v: string | undefined) { this.write('data-role', v); }
    @Input() set content(v: string | undefined) { this.write('content', v); }
    @Input() set timestamp(v: number | string | undefined) { this.write('timestamp', v); }
    @Input() set messageId(v: string | undefined) { this.write('message-id', v); }
    @Input() set name(v: string | undefined) { this.write('name', v); }
    @Input({ transform: booleanAttribute }) set streaming(v: boolean) { this.write('streaming', v); }

    @Output() readonly action = new EventEmitter<AparteActionEventDetail>();
    @Output() readonly retry = new EventEmitter<AparteRetryEventDetail>();
    @Output() readonly edit = new EventEmitter<AparteEditEventDetail>();
    @Output() readonly feedback = new EventEmitter<AparteFeedbackEventDetail>();
    @Output() readonly messageInfo = new EventEmitter<AparteMessageInfoEventDetail>();
    @Output() readonly branchNavigate = new EventEmitter<AparteBranchNavigateEventDetail>();
    @Output() readonly attachmentPreview = new EventEmitter<AparteAttachmentPreviewEventDetail>();

    @HostListener('aparte-action', ['$event'])
    protected onAction(e: CustomEvent<AparteActionEventDetail>): void { this.action.emit(e.detail); }
    @HostListener('aparte-retry', ['$event'])
    protected onRetry(e: CustomEvent<AparteRetryEventDetail>): void { this.retry.emit(e.detail); }
    @HostListener('aparte-edit', ['$event'])
    protected onEdit(e: CustomEvent<AparteEditEventDetail>): void { this.edit.emit(e.detail); }
    @HostListener('aparte-feedback', ['$event'])
    protected onFeedback(e: CustomEvent<AparteFeedbackEventDetail>): void { this.feedback.emit(e.detail); }
    @HostListener('aparte-message-info', ['$event'])
    protected onMessageInfo(e: CustomEvent<AparteMessageInfoEventDetail>): void { this.messageInfo.emit(e.detail); }
    @HostListener('aparte-branch-navigate', ['$event'])
    protected onBranchNavigate(e: CustomEvent<AparteBranchNavigateEventDetail>): void { this.branchNavigate.emit(e.detail); }
    @HostListener('aparte-attachment-preview', ['$event'])
    protected onAttachmentPreview(e: CustomEvent<AparteAttachmentPreviewEventDetail>): void { this.attachmentPreview.emit(e.detail); }
}

/**
 * `<aparte-chat-status>` — a status line the app owns; core never turns it on.
 *
 * @example
 * <aparte-chat-status [visible]="searching" text="Searching the docs…" />
 */
@Directive({ selector: 'aparte-chat-status', standalone: true })
export class AparteChatStatusDirective extends AparteElementBase {
    @Input({ transform: booleanAttribute }) set visible(v: boolean) { this.write('visible', v); }
    @Input() set text(v: string | undefined) { this.write('text', v); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `<aparte-composer>` — the root context for every composer part.
 *
 * `abort` and `messageAborted` are NOT outputs here, and cannot be: the element
 * dispatches them on `window`, because they concern the whole page rather than this
 * subtree. Listen for them on `window`.
 *
 * @example
 * <aparte-composer target="main" [disabled]="busy" (send)="ask($event.value)" />
 */
@Directive({ selector: 'aparte-composer', standalone: true })
export class AparteComposerDirective extends AparteElementBase {
    @Input() set placeholder(v: string | undefined) { this.write('placeholder', v); }
    @Input() set target(v: string | undefined) { this.write('target', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }

    @Output() readonly send = new EventEmitter<AparteSendEventDetail>();
    @Output() readonly cancel = new EventEmitter<void>();
    @Output() readonly composerChange = new EventEmitter<AparteComposerChangeEventDetail>();

    @HostListener('aparte-send', ['$event'])
    protected onSend(e: CustomEvent<AparteSendEventDetail>): void { this.send.emit(e.detail); }
    @HostListener('aparte-cancel')
    protected onCancel(): void { this.cancel.emit(); }
    @HostListener('aparte-composer-change', ['$event'])
    protected onChange(e: CustomEvent<AparteComposerChangeEventDetail>): void { this.composerChange.emit(e.detail); }
}

/**
 * `<aparte-composer-input>` — the contenteditable field.
 *
 * @example
 * <aparte-composer-input placeholder="Ask anything…" [maxHeight]="320" />
 */
@Directive({ selector: 'aparte-composer-input', standalone: true })
export class AparteComposerInputDirective extends AparteElementBase {
    @Input() set placeholder(v: string | undefined) { this.write('placeholder', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }
    @Input({ transform: numberAttribute }) set maxHeight(v: number) { this.write('max-height', v); }
    @Input({ transform: numberAttribute }) set minHeight(v: number) { this.write('min-height', v); }

    /** Enter was pressed with content. The composer reads its own value; there is no detail. */
    @Output() readonly composerSubmit = new EventEmitter<void>();

    @HostListener('aparte-composer-submit')
    protected onSubmit(): void { this.composerSubmit.emit(); }
}

/**
 * `<aparte-composer-action>` — a generic action button.
 *
 * @example
 * <aparte-composer-action icon="mic" label="Dictate" (actionClick)="dictate()" />
 */
@Directive({ selector: 'aparte-composer-action', standalone: true })
export class AparteComposerActionDirective extends AparteElementBase {
    @Input() set icon(v: string | undefined) { this.write('icon', v); }
    @Input() set label(v: string | undefined) { this.write('label', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }

    @Output() readonly actionClick = new EventEmitter<AparteActionClickEventDetail>();

    @HostListener('aparte-action-click', ['$event'])
    protected onClick(e: CustomEvent<AparteActionClickEventDetail>): void { this.actionClick.emit(e.detail); }
}

/**
 * `<aparte-composer-add-attachment>` — the file picker.
 *
 * @example
 * <aparte-composer-add-attachment accept="image/*,.pdf" [multiple]="true" />
 */
@Directive({ selector: 'aparte-composer-add-attachment', standalone: true })
export class AparteComposerAddAttachmentDirective extends AparteElementBase {
    @Input() set accept(v: string | undefined) { this.write('accept', v); }
    @Input({ transform: booleanAttribute }) set multiple(v: boolean) { this.write('multiple', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }
}

/**
 * `<aparte-composer-attachments>` — the thumbnail strip. No attributes; it reads the
 * composer's state.
 *
 * @example
 * <aparte-composer-attachments (attachmentPreview)="open($event.url)" />
 */
@Directive({ selector: 'aparte-composer-attachments', standalone: true })
export class AparteComposerAttachmentsDirective {
    @Output() readonly attachmentPreview = new EventEmitter<AparteAttachmentPreviewEventDetail>();

    @HostListener('aparte-attachment-preview', ['$event'])
    protected onPreview(e: CustomEvent<AparteAttachmentPreviewEventDetail>): void { this.attachmentPreview.emit(e.detail); }
}

// ─────────────────────────────────────────────────────────────────────────────
// The select primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `<aparte-select>` — the dropdown primitive.
 *
 * @example
 * <aparte-select [searchable]="true" placeholder="Pick a model" (selectChange)="pick($event.value)">
 *   <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
 * </aparte-select>
 */
@Directive({ selector: 'aparte-select', standalone: true })
export class AparteSelectDirective extends AparteElementBase {
    @Input() set value(v: string | undefined) { this.write('value', v); }
    @Input() set placeholder(v: string | undefined) { this.write('placeholder', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }
    @Input({ transform: booleanAttribute }) set grouped(v: boolean) { this.write('grouped', v); }
    @Input({ transform: booleanAttribute }) set searchable(v: boolean) { this.write('searchable', v); }
    @Input({ transform: booleanAttribute }) set open(v: boolean) { this.write('open', v); }

    @Output() readonly selectChange = new EventEmitter<AparteSelectChangeDetail>();
    @Output() readonly selectOpen = new EventEmitter<void>();
    @Output() readonly selectClose = new EventEmitter<void>();

    @HostListener('aparte-select-change', ['$event'])
    protected onChange(e: CustomEvent<AparteSelectChangeDetail>): void { this.selectChange.emit(e.detail); }
    @HostListener('aparte-select-open')
    protected onOpen(): void { this.selectOpen.emit(); }
    @HostListener('aparte-select-close')
    protected onClose(): void { this.selectClose.emit(); }
}

/**
 * `<aparte-option>` — one option.
 *
 * @example
 * <aparte-option value="gpt-4o-mini" [selected]="true">GPT-4o mini</aparte-option>
 */
@Directive({ selector: 'aparte-option', standalone: true })
export class AparteOptionDirective extends AparteElementBase {
    @Input() set value(v: string | undefined) { this.write('value', v); }
    @Input() set dataStatus(v: string | undefined) { this.write('data-status', v); }
    @Input({ transform: booleanAttribute }) set disabled(v: boolean) { this.write('disabled', v); }
    @Input({ transform: booleanAttribute }) set selected(v: boolean) { this.write('selected', v); }
}

/**
 * `<aparte-optgroup>` — a collapsible group of options.
 *
 * @example
 * <aparte-optgroup label="OpenAI" [collapsible]="true" (optgroupToggle)="remember($event)" />
 */
@Directive({ selector: 'aparte-optgroup', standalone: true })
export class AparteOptgroupDirective extends AparteElementBase {
    @Input() set label(v: string | undefined) { this.write('label', v); }
    @Input({ transform: booleanAttribute }) set collapsible(v: boolean) { this.write('collapsible', v); }
    @Input({ transform: booleanAttribute }) set collapsed(v: boolean) { this.write('collapsed', v); }
    @Input({ transform: booleanAttribute }) set loading(v: boolean) { this.write('loading', v); }

    @Output() readonly optgroupToggle = new EventEmitter<AparteOptgroupToggleEventDetail>();

    @HostListener('aparte-optgroup-toggle', ['$event'])
    protected onToggle(e: CustomEvent<AparteOptgroupToggleEventDetail>): void { this.optgroupToggle.emit(e.detail); }
}

// ─────────────────────────────────────────────────────────────────────────────
// The rest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `<aparte-conversation-list>` — the history sidebar. It reports intent and acts on
 * nothing: the host owns the data.
 *
 * @example
 * <aparte-conversation-list [activeId]="current" (selectConversation)="load($event.id)" />
 */
@Directive({ selector: 'aparte-conversation-list', standalone: true })
export class AparteConversationListDirective extends AparteElementBase {
    @Input() set activeId(v: string | undefined) { this.write('active-id', v); }

    @Output() readonly selectConversation = new EventEmitter<AparteConversationSelectDetail>();
    @Output() readonly deleteConversation = new EventEmitter<AparteConversationDeleteDetail>();
    @Output() readonly archiveConversation = new EventEmitter<AparteConversationArchiveDetail>();
    @Output() readonly unarchiveConversation = new EventEmitter<AparteConversationArchiveDetail>();

    @HostListener('aparte-select-conversation', ['$event'])
    protected onSelect(e: CustomEvent<AparteConversationSelectDetail>): void { this.selectConversation.emit(e.detail); }
    @HostListener('aparte-delete-conversation', ['$event'])
    protected onDelete(e: CustomEvent<AparteConversationDeleteDetail>): void { this.deleteConversation.emit(e.detail); }
    @HostListener('aparte-archive-conversation', ['$event'])
    protected onArchive(e: CustomEvent<AparteConversationArchiveDetail>): void { this.archiveConversation.emit(e.detail); }
    @HostListener('aparte-unarchive-conversation', ['$event'])
    protected onUnarchive(e: CustomEvent<AparteConversationArchiveDetail>): void { this.unarchiveConversation.emit(e.detail); }
}

/**
 * `<aparte-progress-spinner>` — determinate with `value`, indeterminate without.
 *
 * @example
 * <aparte-progress-spinner [value]="percent" />
 */
@Directive({ selector: 'aparte-progress-spinner', standalone: true })
export class AparteProgressSpinnerDirective extends AparteElementBase {
    @Input({ transform: numberAttribute }) set value(v: number) { this.write('value', v); }
}

/**
 * `<aparte-composer-send>`, `<aparte-composer-cancel>`, `<aparte-composer-toolbar>` and
 * `<aparte-elicitation>` get a directive with no members at all — and that is the point.
 * They observe no attribute and dispatch nothing, so there is nothing to type; the
 * directive exists only to CLAIM THE TAG, which is what spares the consuming component
 * `CUSTOM_ELEMENTS_SCHEMA`. Without them, one unknown tag in a template turns checking
 * off for every unknown tag in that template.
 *
 * `<aparte-composer-toolbar>`'s `data-empty` is not an Input: the element reflects it
 * onto itself while it holds no child. Binding it would let a template fight the element
 * for a value the element owns.
 */
@Directive({ selector: 'aparte-composer-send', standalone: true })
export class AparteComposerSendDirective {}

/** @see AparteComposerSendDirective */
@Directive({ selector: 'aparte-composer-cancel', standalone: true })
export class AparteComposerCancelDirective {}

/** @see AparteComposerSendDirective */
@Directive({ selector: 'aparte-composer-toolbar', standalone: true })
export class AparteComposerToolbarDirective {}

/** @see AparteComposerSendDirective */
@Directive({ selector: 'aparte-elicitation', standalone: true })
export class AparteElicitationDirective {}

/**
 * `<aparte-model-selector>` — from `@aparte/plugin-model-selector`.
 *
 * The directive lives HERE and not in that package, because a plugin must not gain an
 * Angular dependency (the framework lives only in its own wrapper). It needs nothing
 * from the plugin either: the element's attributes are declared in core's registry and
 * `AparteModelChangeEventDetail` is a core type, so this compiles with no new edge in
 * the dependency graph.
 *
 * This is the element the Angular example needed `CUSTOM_ELEMENTS_SCHEMA` for, with the
 * reason written in a trailing comment. That schema switches checking off for every
 * unknown tag in the template, not just this one.
 *
 * @example
 * <aparte-model-selector persist searchable (modelChange)="use($event.modelId)" />
 */
@Directive({ selector: 'aparte-model-selector', standalone: true })
export class AparteModelSelectorDirective extends AparteElementBase {
    @Input() set placeholder(v: string | undefined) { this.write('placeholder', v); }
    @Input({ transform: booleanAttribute }) set autoSelect(v: boolean) { this.write('auto-select', v); }
    @Input({ transform: booleanAttribute }) set persist(v: boolean) { this.write('persist', v); }
    @Input({ transform: booleanAttribute }) set searchable(v: boolean) { this.write('searchable', v); }

    @Output() readonly modelChange = new EventEmitter<AparteModelChangeEventDetail>();

    @HostListener('aparte-model-change', ['$event'])
    protected onModelChange(e: CustomEvent<AparteModelChangeEventDetail>): void { this.modelChange.emit(e.detail); }
}

/** `<aparte-ask-user>` — the presenter under its intent-revealing name. @see AparteComposerSendDirective */
@Directive({ selector: 'aparte-ask-user', standalone: true })
export class AparteAskUserDirective {}

/**
 * Every element directive, for one import in a standalone component.
 *
 * ```ts
 * @Component({ imports: [...APARTE_ELEMENT_DIRECTIVES], template: `…` })
 * ```
 *
 * `<aparte-chat>` is absent on purpose: `AparteChatComponent` already claims that tag
 * and renders the whole turn through `AparteChatHost`. A directive for it would be a
 * second thing fighting for the same selector.
 */
export const APARTE_ELEMENT_DIRECTIVES = [
    AparteChatViewportDirective,
    AparteChatBubbleDirective,
    AparteChatStatusDirective,
    AparteComposerDirective,
    AparteComposerInputDirective,
    AparteComposerActionDirective,
    AparteComposerAddAttachmentDirective,
    AparteComposerAttachmentsDirective,
    AparteComposerSendDirective,
    AparteComposerCancelDirective,
    AparteComposerToolbarDirective,
    AparteSelectDirective,
    AparteOptionDirective,
    AparteOptgroupDirective,
    AparteConversationListDirective,
    AparteProgressSpinnerDirective,
    AparteElicitationDirective,
    AparteModelSelectorDirective,
    AparteAskUserDirective,
] as const;
