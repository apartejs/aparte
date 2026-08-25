import { describe, it, expect, beforeEach } from 'vitest';
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { registerAllComponents } from '@aparte/core';
import {
    APARTE_ELEMENT_DIRECTIVES,
    AparteSelectDirective,
    AparteComposerDirective,
    AparteChatBubbleDirective,
    AparteConversationListDirective,
    AparteComposerSendDirective,
    AparteComposerCancelDirective,
    AparteComposerToolbarDirective,
    AparteElicitationDirective,
} from '../../generated/element.directives';

/*
 * What these prove, and why each matters more than it looks.
 *
 * The whole point of a directive per element is that the template writes what a
 * consumer would EXPECT to write — `[searchable]="true"` — and the element receives
 * what it actually observes, which is an attribute. Angular's default for
 * `[searchable]` on a custom element is to assign a PROPERTY: a silent no-op here, or
 * a throw on one of `<aparte-composer>`'s eight getter-only accessors. So every
 * assertion below is about the attribute, never about a property.
 *
 * The outputs are the other half: an event dispatched by the element must arrive as its
 * DETAIL, because `(selectChange)="pick($event.value)"` is the Angular idiom and
 * `$event.detail.value` is not.
 */

registerAllComponents();

@Component({
    standalone: true,
    imports: [...APARTE_ELEMENT_DIRECTIVES],
    template: `
        <aparte-select
            [placeholder]="placeholder"
            [searchable]="searchable"
            [disabled]="disabled"
            (selectChange)="lastChange = $event"
            (selectOpen)="opened = opened + 1"
        ></aparte-select>

        <aparte-composer [target]="target" (send)="lastSend = $event"></aparte-composer>

        <aparte-chat-bubble [messageId]="id" [messageRole]="role" [streaming]="streaming"></aparte-chat-bubble>

        <aparte-conversation-list
            [activeId]="activeId"
            (selectConversation)="picked = $event.id"
        ></aparte-conversation-list>

        @if (showViewport) {
            <aparte-chat-viewport [scrollThreshold]="threshold"></aparte-chat-viewport>
        }

        <aparte-composer-add-attachment [multiple]="multiple"></aparte-composer-add-attachment>
    `,
})
class Host {
    multiple = true;
    placeholder: string | undefined = 'Pick a model';
    searchable = false;
    disabled = false;
    target: string | undefined = 'main';
    id: string | undefined = 'a1';
    role: string | undefined = 'assistant';
    streaming = false;
    activeId: string | undefined = 'c1';
    threshold = 64;
    showViewport = true;

    lastChange: unknown = null;
    lastSend: unknown = null;
    picked = '';
    opened = 0;
}

describe('the element directives', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
    let host: Host;
    const el = (tag: string): HTMLElement =>
        fixture.nativeElement.querySelector(tag) as HTMLElement;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [Host] });
        fixture = TestBed.createComponent(Host);
        host = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('writes a string input as an ATTRIBUTE, not a property', () => {
        // The distinction is the reason the directive exists: `<aparte-composer>`'s
        // `placeholder` accessor is getter-only, so a property assignment throws.
        expect(el('aparte-select').getAttribute('placeholder')).toBe('Pick a model');
        expect(el('aparte-composer').getAttribute('target')).toBe('main');
    });

    it('turns a true boolean input into the empty presence attribute', () => {
        host.searchable = true;
        fixture.detectChanges();

        // `searchable=""`, never `searchable="true"`: the element tests presence, and a
        // literal "false" would read as ON — the trap the template types exist to stop.
        expect(el('aparte-select').getAttribute('searchable')).toBe('');
    });

    it('REMOVES the attribute when a boolean input goes false', () => {
        host.streaming = true;
        fixture.detectChanges();
        expect(el('aparte-chat-bubble').hasAttribute('streaming')).toBe(true);

        host.streaming = false;
        fixture.detectChanges();
        expect(el('aparte-chat-bubble').hasAttribute('streaming')).toBe(false);
    });

    it('maps a camelCase input onto the element\'s real kebab attribute', () => {
        // `messageRole` writes `data-role`, `messageId` writes `message-id`. A consumer
        // never has to know which of the element's names is which.
        const bubble = el('aparte-chat-bubble');
        expect(bubble.getAttribute('data-role')).toBe('assistant');
        expect(bubble.getAttribute('message-id')).toBe('a1');
    });

    it('coerces a numeric input through numberAttribute', () => {
        expect(el('aparte-chat-viewport').getAttribute('scroll-threshold')).toBe('64');
    });

    /*
     * A THREE-STATE boolean, and the direction nothing used to test.
     *
     * `<aparte-composer-add-attachment>` reads
     * `!hasAttribute('multiple') || getAttribute('multiple') !== 'false'` — default ON,
     * off only via the literal string. Treated as a presence attribute, `false` REMOVED
     * the attribute, which that expression reads as TRUE: `[multiple]="false"` turned
     * multi-file selection ON. The suite asserted only `[multiple]="true"`, so the
     * inversion was invisible.
     */
    it('turns a three-state boolean OFF with the string, not by removing the attribute', () => {
        host.multiple = false;
        fixture.detectChanges();

        const picker = el('aparte-composer-add-attachment');
        expect(picker.getAttribute('multiple'), 'removing it would read as ON').toBe('false');

        // And the element itself agrees — the assertion that would have caught it.
        expect(picker.hasAttribute('multiple')).toBe(true);
        expect(picker.getAttribute('multiple') !== 'false').toBe(false);
    });

    it('turns a three-state boolean back ON with the presence value', () => {
        host.multiple = false;
        fixture.detectChanges();
        host.multiple = true;
        fixture.detectChanges();

        // `''`, not removal: both read as ON, and keeping it present says so in the DOM.
        expect(el('aparte-composer-add-attachment').getAttribute('multiple')).toBe('');
    });

    it('emits the event DETAIL, not the CustomEvent', () => {
        el('aparte-select').dispatchEvent(new CustomEvent('aparte-select-change', {
            detail: { value: 'gpt-4o-mini', label: 'GPT-4o mini', previousValue: '' },
        }));

        // `(selectChange)="pick($event.value)"` is the idiom; `$event.detail.value`
        // would make the directive a worse `addEventListener`.
        expect(host.lastChange).toEqual({ value: 'gpt-4o-mini', label: 'GPT-4o mini', previousValue: '' });
    });

    it('emits a detail-free event as void', () => {
        el('aparte-select').dispatchEvent(new CustomEvent('aparte-select-open'));
        el('aparte-select').dispatchEvent(new CustomEvent('aparte-select-open'));
        expect(host.opened).toBe(2);
    });

    it('wires every event of an element that had NONE in the manifest', () => {
        // <aparte-conversation-list> reported zero events until this lot: all four of
        // its dispatches happen in an arrow class field, invisible to the analyser.
        el('aparte-conversation-list').dispatchEvent(
            new CustomEvent('aparte-select-conversation', { detail: { id: 'c2' } }),
        );
        expect(host.picked).toBe('c2');
    });

    it('forwards the composer\'s send detail', () => {
        el('aparte-composer').dispatchEvent(new CustomEvent('aparte-send', {
            detail: { value: 'hello', attachments: [], targetId: 'main' },
        }));
        expect(host.lastSend).toMatchObject({ value: 'hello', targetId: 'main' });
    });

    it('puts the element in the template, so control flow reaches it', () => {
        // The thing <aparte-ui> cannot do: it creates its element imperatively in
        // ngAfterViewInit, so no @if, @for or projection ever applies to it.
        expect(el('aparte-chat-viewport')).not.toBeNull();

        host.showViewport = false;
        fixture.detectChanges();
        expect(el('aparte-chat-viewport')).toBeNull();
    });

    it('claims its tag, which is what spares the consumer CUSTOM_ELEMENTS_SCHEMA', () => {
        // Host declares no `schemas`. Compiling at all is the assertion — the Angular
        // example carried `schemas: [CUSTOM_ELEMENTS_SCHEMA] // for <aparte-model-selector>`
        // until these existed, and that switches checking off for EVERY unknown tag.
        expect(fixture.componentInstance).toBeInstanceOf(Host);
        expect(APARTE_ELEMENT_DIRECTIVES).toContain(AparteSelectDirective);
        expect(APARTE_ELEMENT_DIRECTIVES).toContain(AparteComposerDirective);
        expect(APARTE_ELEMENT_DIRECTIVES).toContain(AparteChatBubbleDirective);
        expect(APARTE_ELEMENT_DIRECTIVES).toContain(AparteConversationListDirective);
    });
});

/*
 * The suite above proves the MECHANISM on five elements. This proves the SURFACE on all
 * of them, which is a different claim: every declared input reaches its attribute, and
 * every declared event reaches its output. A setter that was never wired, or a listener
 * naming an event the element does not dispatch, is invisible to a sample and caught
 * here.
 */
@Component({
    standalone: true,
    imports: [...APARTE_ELEMENT_DIRECTIVES],
    template: `
        <aparte-chat-viewport [scrollThreshold]="1" [maxRenderedBubbles]="2" [maxMessages]="3"
            (segmentUpdate)="seen['segmentUpdate'] = true"
            (resetDone)="seen['resetDone'] = true"
            (pathChanged)="seen['pathChanged'] = true"></aparte-chat-viewport>

        <aparte-chat-bubble messageId="b1" messageRole="user" content="hi" [timestamp]="7"
            name="You" [streaming]="true"
            (action)="seen['action'] = true" (retry)="seen['retry'] = true"
            (edit)="seen['edit'] = true" (feedback)="seen['feedback'] = true"
            (messageInfo)="seen['messageInfo'] = true"
            (branchNavigate)="seen['branchNavigate'] = true"
            (attachmentPreview)="seen['bubblePreview'] = true"></aparte-chat-bubble>

        <aparte-chat-status [visible]="true" text="Working"></aparte-chat-status>

        <aparte-composer placeholder="Ask" target="t" [disabled]="true" [submitOnEnter]="false"
            (send)="seen['send'] = true" (cancel)="seen['cancel'] = true"
            (composerChange)="seen['composerChange'] = true"></aparte-composer>

        <aparte-composer-input placeholder="Ask" [disabled]="true" [maxHeight]="200" [minHeight]="44"
            (composerSubmit)="seen['composerSubmit'] = true"></aparte-composer-input>

        <aparte-composer-action icon="mic" label="Dictate" [disabled]="true" actionId="mic"
            (actionClick)="lastAction = $event"></aparte-composer-action>

        <aparte-composer-add-attachment accept="image/*" [multiple]="true" [disabled]="true"></aparte-composer-add-attachment>

        <aparte-composer-attachments (attachmentPreview)="seen['stripPreview'] = true"></aparte-composer-attachments>

        <aparte-composer-send></aparte-composer-send>
        <aparte-composer-cancel></aparte-composer-cancel>
        <aparte-composer-toolbar></aparte-composer-toolbar>
        <aparte-elicitation></aparte-elicitation>

        <aparte-select value="v" placeholder="p" [disabled]="true" [grouped]="true"
            [searchable]="true" [open]="true"
            (selectChange)="seen['selectChange'] = true" (selectOpen)="seen['selectOpen'] = true"
            (selectClose)="seen['selectClose'] = true"></aparte-select>

        <aparte-option value="o" dataStatus="ready" [disabled]="true" [selected]="true"></aparte-option>

        <aparte-optgroup label="g" [collapsible]="true" [collapsed]="true" [loading]="true"
            (optgroupToggle)="seen['optgroupToggle'] = true"></aparte-optgroup>

        <aparte-conversation-list activeId="c1"
            (selectConversation)="seen['selectConversation'] = true"
            (deleteConversation)="seen['deleteConversation'] = true"
            (archiveConversation)="seen['archiveConversation'] = true"
            (unarchiveConversation)="seen['unarchiveConversation'] = true"></aparte-conversation-list>

        <aparte-progress-spinner [value]="42"></aparte-progress-spinner>
    `,
})
class EverythingHost {
    readonly seen: Record<string, boolean> = {};
    lastAction: { actionId?: string } | null = null;
}

describe('the element directives, across the whole surface', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EverythingHost>>;

    const at = (tag: string): HTMLElement => fixture.nativeElement.querySelector(tag) as HTMLElement;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [EverythingHost] });
        fixture = TestBed.createComponent(EverythingHost);
        fixture.detectChanges();
    });

    /** tag, attribute, the value it must carry once written. */
    const ATTRS: ReadonlyArray<readonly [string, string, string]> = [
        ['aparte-chat-viewport', 'scroll-threshold', '1'],
        ['aparte-chat-viewport', 'max-rendered-bubbles', '2'],
        ['aparte-chat-viewport', 'max-messages', '3'],
        ['aparte-chat-bubble', 'message-id', 'b1'],
        ['aparte-chat-bubble', 'data-role', 'user'],
        ['aparte-chat-bubble', 'content', 'hi'],
        ['aparte-chat-bubble', 'timestamp', '7'],
        ['aparte-chat-bubble', 'name', 'You'],
        ['aparte-chat-bubble', 'streaming', ''],
        ['aparte-chat-status', 'visible', ''],
        ['aparte-chat-status', 'text', 'Working'],
        ['aparte-composer', 'placeholder', 'Ask'],
        ['aparte-composer', 'target', 't'],
        ['aparte-composer', 'disabled', ''],
        // Read lazily by a getter, so the analyser never saw it until it was declared.
        ['aparte-composer', 'submit-on-enter', 'false'],
        ['aparte-composer-input', 'max-height', '200'],
        ['aparte-composer-input', 'min-height', '44'],
        ['aparte-composer-action', 'icon', 'mic'],
        ['aparte-composer-action', 'label', 'Dictate'],
        // The only way to tell two custom buttons apart; also undeclared until now.
        ['aparte-composer-action', 'action-id', 'mic'],
        ['aparte-composer-add-attachment', 'accept', 'image/*'],
        ['aparte-composer-add-attachment', 'multiple', ''],
        ['aparte-select', 'value', 'v'],
        ['aparte-select', 'placeholder', 'p'],
        ['aparte-select', 'grouped', ''],
        ['aparte-select', 'searchable', ''],
        ['aparte-select', 'open', ''],
        ['aparte-option', 'value', 'o'],
        ['aparte-option', 'data-status', 'ready'],
        ['aparte-option', 'selected', ''],
        ['aparte-optgroup', 'label', 'g'],
        ['aparte-optgroup', 'collapsible', ''],
        ['aparte-optgroup', 'collapsed', ''],
        ['aparte-optgroup', 'loading', ''],
        ['aparte-conversation-list', 'active-id', 'c1'],
        ['aparte-progress-spinner', 'value', '42'],
    ];

    it.each(ATTRS)('%s writes [%s]', (tag, attr, expected) => {
        expect(at(tag).getAttribute(attr)).toBe(expected);
    });

    /** tag, event name, the key the host records it under. */
    const EVENTS: ReadonlyArray<readonly [string, string, string]> = [
        ['aparte-chat-viewport', 'aparte-segment-update', 'segmentUpdate'],
        ['aparte-chat-viewport', 'aparte-reset-done', 'resetDone'],
        ['aparte-chat-viewport', 'aparte-path-changed', 'pathChanged'],
        ['aparte-chat-bubble', 'aparte-action', 'action'],
        ['aparte-chat-bubble', 'aparte-retry', 'retry'],
        ['aparte-chat-bubble', 'aparte-edit', 'edit'],
        ['aparte-chat-bubble', 'aparte-feedback', 'feedback'],
        ['aparte-chat-bubble', 'aparte-message-info', 'messageInfo'],
        ['aparte-chat-bubble', 'aparte-branch-navigate', 'branchNavigate'],
        ['aparte-chat-bubble', 'aparte-attachment-preview', 'bubblePreview'],
        ['aparte-composer', 'aparte-send', 'send'],
        ['aparte-composer', 'aparte-cancel', 'cancel'],
        ['aparte-composer', 'aparte-composer-change', 'composerChange'],
        ['aparte-composer-input', 'aparte-composer-submit', 'composerSubmit'],

        ['aparte-composer-attachments', 'aparte-attachment-preview', 'stripPreview'],
        ['aparte-select', 'aparte-select-change', 'selectChange'],
        ['aparte-select', 'aparte-select-open', 'selectOpen'],
        ['aparte-select', 'aparte-select-close', 'selectClose'],
        ['aparte-optgroup', 'aparte-optgroup-toggle', 'optgroupToggle'],
        ['aparte-conversation-list', 'aparte-select-conversation', 'selectConversation'],
        ['aparte-conversation-list', 'aparte-delete-conversation', 'deleteConversation'],
        ['aparte-conversation-list', 'aparte-archive-conversation', 'archiveConversation'],
        ['aparte-conversation-list', 'aparte-unarchive-conversation', 'unarchiveConversation'],
    ];

    it.each(EVENTS)('%s forwards %s', (tag, event, key) => {
        at(tag).dispatchEvent(new CustomEvent(event, { detail: { id: 'x', value: 'x', modelId: 'm' } }));
        expect(fixture.componentInstance.seen[key]).toBe(true);
    });

    /*
     * The PAYLOAD, not just that it fired — which is what the table row used to assert.
     *
     * `aparte-composer-action` carried a BARE `@fires`, so the manifest recorded
     * `CustomEvent` with no type argument and the generator fell to its `void` branch:
     * `EventEmitter<void>` with a `@HostListener` that dropped `$event`. Two custom
     * composer buttons were indistinguishable, and a boolean "it fired" assertion could
     * never see it. Every detail-carrying event needs one of these; this is the one whose
     * absence cost something.
     */
    it('carries the action detail, so two buttons are distinguishable', () => {
        at('aparte-composer-action').dispatchEvent(new CustomEvent('aparte-action-click', {
            detail: { actionId: 'mic', composer: null },
        }));
        expect(fixture.componentInstance.lastAction?.actionId).toBe('mic');
    });

    it('adds nothing of its own to a tag it only claims', () => {
        /*
         * The claim is about the DIRECTIVE, so it is asserted on the directive.
         *
         * Two earlier drafts asserted `element.attributes.length === 0` and both were
         * wrong, because the ELEMENTS configure themselves:
         * `<aparte-composer-toolbar>` reflects `data-empty` while it holds no element
         * child (documented "read it, do not set it" — which is exactly why no Input
         * exposes it), and `<aparte-elicitation>` sets `style="display:none"` in its
         * `connectedCallback` because it renders nothing itself. Counting attributes
         * measured the element; what needed measuring was the directive.
         */
        for (const D of [AparteComposerSendDirective, AparteComposerCancelDirective,
            AparteComposerToolbarDirective, AparteElicitationDirective]) {
            expect(Object.keys(new D()), D.name).toEqual([]);
        }
    });

    it('still lets the element reflect its own state', () => {
        // `data-empty` arrives from the toolbar itself, with nothing bound to it.
        expect(at('aparte-composer-toolbar').hasAttribute('data-empty')).toBe(true);
    });
});
