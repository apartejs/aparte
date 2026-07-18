/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AparteChatComponent } from '../aparte-chat.component';
import { registerAllComponents, type AparteMessage } from '@aparte/core';

// Register aparté web components so setContent/setSegments exist on bubble elements
registerAllComponents();

// Host that projects a custom composer into <aparte-chat> via the composer slot.
@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat [messages]="[]"><div slot="composer" class="my-custom-composer">custom</div></aparte-chat>`,
})
class CustomComposerHost { }

// Host that renders a custom bubble per message via [bubbleTemplate].
@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `
      <aparte-chat [messages]="messages" [bubbleTemplate]="tpl"></aparte-chat>
      <ng-template #tpl let-message>
        <div class="my-bubble" [attr.data-id]="message.id">{{ message.content }}</div>
      </ng-template>
    `,
})
class BubbleTemplateHost { messages: AparteMessage[] = []; }

// Host using the BARE boolean-attribute form — exactly what the docs/README show.
@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat [messages]="[]" centerWhenEmpty disabled></aparte-chat>`,
})
class BareBooleanAttrHost { }

// Mock browser APIs
if (typeof window !== 'undefined' && typeof HTMLElement !== 'undefined' && !Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollToBottom')) {
    (HTMLElement.prototype as unknown as Record<string, unknown>).scrollToBottom = vi.fn();
}

describe('AparteChatComponent (Angular Wrapper)', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AparteChatComponent]
        }).compileComponents();
    });

    const mockMessages: AparteMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() + 1000 }
    ];

    it('renders correct number of messages', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);

        (fixture.componentRef as any).setInput('messages', mockMessages);

        fixture.detectChanges();
        await fixture.whenStable();

        const bubbles = fixture.nativeElement.querySelectorAll('aparte-chat-bubble');
        expect(bubbles.length).toBe(2);
        expect(bubbles[0].getAttribute('message-id')).toBe('1');
        expect(bubbles[1].getAttribute('message-id')).toBe('2');
    });

    it('adds --auto-center + data-aparte-empty only while centerWhenEmpty and empty', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        (fixture.componentRef as any).setInput('centerWhenEmpty', true);
        (fixture.componentRef as any).setInput('messages', []);
        fixture.detectChanges();
        await fixture.whenStable();

        const box = fixture.nativeElement.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
        expect(box.getAttribute('data-aparte-empty')).toBe('');

        // First message → the empty flag drops (composer slides to the bottom).
        (fixture.componentRef as any).setInput('messages', mockMessages);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('never opts in when centerWhenEmpty is off (default)', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        (fixture.componentRef as any).setInput('messages', []);
        fixture.detectChanges();
        await fixture.whenStable();
        const box = fixture.nativeElement.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(false);
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('renders a custom bubble via [bubbleTemplate] in place of the native one', async () => {
        const fixture = TestBed.createComponent(BubbleTemplateHost);
        fixture.componentInstance.messages = mockMessages;
        fixture.detectChanges();
        await fixture.whenStable();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelectorAll('aparte-chat-bubble').length).toBe(0);
        const custom = host.querySelectorAll('.my-bubble');
        expect(custom.length).toBe(2);
        expect(custom[0].getAttribute('data-id')).toBe('1');
        expect(custom[0].textContent?.trim()).toBe('Hello');
    });

    it('re-renders the custom bubble when message content changes (streaming channel)', async () => {
        const fixture = TestBed.createComponent(BubbleTemplateHost);
        fixture.componentInstance.messages = [{ id: '1', role: 'assistant', content: 'Hel', timestamp: 0 }];
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('.my-bubble')?.textContent?.trim()).toBe('Hel');

        fixture.componentInstance.messages = [{ id: '1', role: 'assistant', content: 'Hello world', timestamp: 0 }];
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('.my-bubble')?.textContent?.trim()).toBe('Hello world');
    });

    it('projects custom composer content in place of the default shell', async () => {
        const fixture = TestBed.createComponent(CustomComposerHost);
        fixture.detectChanges();
        await fixture.whenStable();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.my-custom-composer')).not.toBeNull();
        expect(host.querySelector('.aparte-composer-shell')).toBeNull();
    });

    it('coerces BARE boolean attributes — the form the docs show — via booleanAttribute', async () => {
        // Angular passes a bare attribute as the literal string '' (falsy), so without
        // `transform: booleanAttribute` the documented `<aparte-chat centerWhenEmpty>`
        // silently did nothing (and doesn't type-check under strictTemplates).
        // React/Vue/Svelte all treat a bare boolean prop as true by framework convention.
        const fixture = TestBed.createComponent(BareBooleanAttrHost);
        fixture.detectChanges();
        await fixture.whenStable();

        const box = fixture.nativeElement.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
        expect(box.getAttribute('data-aparte-empty')).toBe('');
        const composer = fixture.nativeElement.querySelector('aparte-composer') as HTMLElement;
        expect(composer.hasAttribute('disabled')).toBe(true);
    });

    it('leaves the composer footer row empty when no footer slot is projected', async () => {
        // Angular divergence, deliberate: React/Vue/Svelte omit the footer NODE
        // entirely (they can test slot presence — $slots / $$slots / props). Angular
        // has no equivalent for `<ng-content select="[slot=…]">`: content queries match
        // directives, not CSS selectors, and the projected nodes aren't attached until
        // the ng-content itself renders (so a "does anything project?" check would be
        // circular). The row is therefore always rendered but stays EMPTY, and core's
        // `.aparte-composer-footer:empty { display: none }` hides it — same visual
        // result. This test locks that it really is empty (Angular strips template
        // whitespace by default, so `:empty` genuinely matches).
        const fixture = TestBed.createComponent(AparteChatComponent);
        (fixture.componentRef as any).setInput('messages', []);
        fixture.detectChanges();
        await fixture.whenStable();

        const footer = fixture.nativeElement.querySelector('.aparte-composer-footer') as HTMLElement;
        expect(footer).not.toBeNull();
        expect(footer.childNodes.length).toBe(0);
    });

    it('renders aparte-chat-status reflecting isTyping (parity with React/Vue/Svelte)', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        (fixture.componentRef as any).setInput('isTyping', false);
        fixture.detectChanges();
        await fixture.whenStable();

        const status = fixture.nativeElement.querySelector('aparte-chat-status') as HTMLElement;
        expect(status).not.toBeNull();
        expect(status.getAttribute('visible')).toBeNull();

        (fixture.componentRef as any).setInput('isTyping', true);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(status.getAttribute('visible')).toBe('');
    });

    it('emits messageSent when aparte-send event is received', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;

        let emitted: any = null;
        component.messageSent.subscribe(val => emitted = val);

        fixture.detectChanges();

        const input = fixture.nativeElement.querySelector('aparte-composer');
        const detail = { content: 'New message', timestamp: Date.now() };

        if (input) {
            const event = new CustomEvent('aparte-send', {
                detail,
                bubbles: true,
                composed: true
            });
            input.dispatchEvent(event);
        }

        expect(emitted).toEqual(detail);
    });

    it('emits action for a bubbling aparte-action DOM event', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;

        let emitted: any = null;
        component.action.subscribe((v: any) => emitted = v);

        (fixture.componentRef as any).setInput('messages', mockMessages);
        fixture.detectChanges();
        await fixture.whenStable();

        // A custom bubble action (registerAction with zones:['bubble']) dispatches
        // aparte-action, which bubbles to the host — the wrapper re-emits it as the
        // typed `action` output.
        const bubble = fixture.nativeElement.querySelector('aparte-chat-bubble') as HTMLElement;
        expect(bubble).not.toBeNull();
        bubble.dispatchEvent(new CustomEvent('aparte-action', {
            detail: { actionId: 'share', messageId: '1', role: 'user' },
            bubbles: true, composed: true,
        }));

        expect(emitted?.actionId).toBe('share');
    });

    it('emits typingChange when the host toggles the typing indicator (parity with React/Vue/Svelte)', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;

        let emitted: boolean | null = null;
        component.typingChange.subscribe((v: boolean) => emitted = v);

        (fixture.componentRef as any).setInput('messages', [
            { id: '1', role: 'assistant', content: '', timestamp: 0 },
        ]);
        (fixture.componentRef as any).setInput('isTyping', true);
        fixture.detectChanges();
        await fixture.whenStable();

        // updateLastMessage(..., { append: true }) makes the host flip typing off.
        component.updateLastMessage('token', { append: true });
        expect(emitted).toBe(false);
    });

    it('exposes public API methods', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;
        expect(component.injectTokenStream).toBeDefined();
        // Parity with React/Vue/Svelte (the canonical AparteChatImperativeApi).
        expect(typeof component.scrollToBottom).toBe('function');
        expect(typeof component.focusInput).toBe('function');
        expect(typeof component.setConversationId).toBe('function');
        expect(typeof component.getViewport).toBe('function');
        fixture.detectChanges();
        await fixture.whenStable();
        expect(() => { component.scrollToBottom(); component.focusInput(); }).not.toThrow();
    });

    it('getViewport() returns the <aparte-chat-viewport> element (cross-wrapper accessor)', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        const viewport = fixture.componentInstance.getViewport();
        expect(viewport).not.toBeNull();
        expect(viewport!.tagName.toLowerCase()).toBe('aparte-chat-viewport');
    });

    it('injectTokenStream feeds the host from an AsyncIterable AND from an RxJS Observable', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        const component = fixture.componentInstance;

        // Intercept at the wrapper/host seam: what matters HERE is that both
        // input shapes reach `streamTokens` as a working AsyncIterable (the
        // streaming pipeline itself is covered by the core host suite).
        const seen: string[][] = [];
        (component as any)._host.streamTokens = vi.fn(async (_id: string, tokens: AsyncIterable<string>) => {
            const got: string[] = [];
            for await (const t of tokens) got.push(t);
            seen.push(got);
        });

        async function* gen() { yield 'a'; yield 'b'; }
        await component.injectTokenStream('m1', gen());       // cross-wrapper contract
        await component.injectTokenStream('m1', of('c', 'd')); // Angular-idiomatic

        expect(seen).toEqual([['a', 'b'], ['c', 'd']]);
    });

    // ─── Regression: Bug 1 — path-change must re-populate re-created bubbles ─
    //
    // When the user navigates back to a branch with descendants (e.g. a2 →
    // a2r → back to a2 which has u3, a3 below), Angular's @for trackBy:id
    // destroys the bubbles that left the path and creates fresh DOM elements
    // for those that re-entered. Those new bubbles are EMPTY: only the
    // [attr.content] binding propagates synchronously; segments must be
    // re-injected via setSegments().
    it('repopulates re-created bubbles after a aparte-path-changed event (segments restored)', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const initial: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'r1', timestamp: 2 },
        ];
        (fixture.componentRef as any).setInput('messages', initial);
        fixture.detectChanges();
        await fixture.whenStable();

        // Sanity: both bubbles rendered, a1 has content.
        const before = fixture.nativeElement.querySelectorAll('aparte-chat-bubble') as NodeListOf<HTMLElement>;
        expect(before.length).toBe(2);
        expect((before[1] as any).getContent?.() ?? before[1].getAttribute('content')).toContain('r1');

        // Simulate a path-changed event from the viewport: a1 is replaced by
        // a "branch-restored" message a1bis with rich segments. Angular's
        // @for will create a NEW <aparte-chat-bubble> for a1bis (different id).
        const a1bis: AparteMessage = {
            id: 'a1bis',
            role: 'assistant',
            content: '',
            segments: [
                { id: 's1', type: 'text', content: 'restored segment content' } as any,
            ],
            timestamp: 3,
        };
        const newPath: AparteMessage[] = [initial[0], a1bis];
        const viewportEl: HTMLElement = fixture.nativeElement.querySelector('aparte-chat-viewport');
        viewportEl.dispatchEvent(new CustomEvent('aparte-path-changed', {
            bubbles: true,
            composed: true,
            detail: {
                messages: newPath,
                siblings: newPath.map((m) => ({ id: m.id, count: 1, index: 0 })),
            },
        }));

        // Wait for: signal update → @for re-render → bubbleRefs.changes → syncBubbles
        fixture.detectChanges();
        await fixture.whenStable();
        // Allow the deferred effect (setTimeout 0) to flush.
        await new Promise(r => setTimeout(r, 10));
        fixture.detectChanges();
        await fixture.whenStable();

        const after = fixture.nativeElement.querySelectorAll('aparte-chat-bubble') as NodeListOf<HTMLElement>;
        expect(after.length).toBe(2);
        const a1bisBubble = after[1] as any;
        // The bubble for a1bis is a NEW DOM element. setSegments must have
        // been called on it so the rich content is visible to the user.
        expect(a1bisBubble.getSegments?.().length).toBe(1);
        expect(a1bisBubble.getSegments?.()[0].id).toBe('s1');
    });

    // ─── Regression: 2nd-turn user message must remain visible ──────────────
    //
    // If at any point during streaming the wrapper emits a `messagesChange` built
    // from a stale signal (i.e. without u2), the parent overwrites its own array,
    // u2 IS LOST, and the bubble disappears on the next render.
    it('keeps the 2nd user message visible across the optimistic-append + parent-push race', async () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;

        // Initial state after the first turn completed.
        const u1: AparteMessage = { id: 'u1', role: 'user', content: 'q1', timestamp: 1 };
        const a1: AparteMessage = { id: 'a1', role: 'assistant', content: 'r1', timestamp: 2 };
        (fixture.componentRef as any).setInput('messages', [u1, a1]);
        fixture.detectChanges();
        await fixture.whenStable();

        // Track parent state and what gets pushed back via [messages].
        let parentMessages: AparteMessage[] = [u1, a1];
        component.messagesChange.subscribe((m: AparteMessage[]) => {
            parentMessages = m;
        });

        // Step 2: parent's onMessageSent (synchronous via messageSent.emit).
        const u2: AparteMessage = { id: 'u2', role: 'user', content: 'q2', timestamp: 3 };
        parentMessages = [...parentMessages, u2];

        // Step 3: AparteClient calls host.appendMessage with the placeholder,
        // BEFORE the parent push for u2 has propagated into the signal.
        const newAssistant: AparteMessage = {
            id: 'a2', role: 'assistant', content: '', status: 'pending', timestamp: 4,
        };
        component.appendMessage(newAssistant);

        // Step 4: parent's onMessageAppended now adds the assistant placeholder.
        parentMessages = [...parentMessages, newAssistant];

        // Step 5: CD pushes the parent array via [messages] to the wrapper.
        (fixture.componentRef as any).setInput('messages', parentMessages);
        fixture.detectChanges();
        await fixture.whenStable();

        // Step 6: streaming starts — first token arrives.
        component.updateLastMessage('Hello!', { append: true });
        fixture.detectChanges();
        await fixture.whenStable();

        // The wrapper's signal MUST contain u2.
        const finalMsgs = component.messages();
        expect(finalMsgs.map(m => m.id)).toEqual([u1.id, a1.id, u2.id, newAssistant.id]);
        expect(finalMsgs.find(m => m.id === u2.id)?.content).toBe('q2');
        // The streamed content must land on the assistant, not on u2.
        expect(finalMsgs.find(m => m.id === newAssistant.id)?.content).toBe('Hello!');
        // The parent must also still see u2 (no overwrite from a stale messagesChange).
        expect(parentMessages.map(m => m.id)).toEqual([u1.id, a1.id, u2.id, newAssistant.id]);
    });

    // ─── Regression: Bug 2 — appendMessage must update local signal sync ────
    //
    // Editing an old user message goes: truncate → appendMessage(newAssistant)
    // → stream into newAssistant. If appendMessage did NOT update the local
    // signal, streaming would land on the PREVIOUS last message and overwrite
    // the user's edited text.
    it('appendMessage updates the local signal synchronously (so updateLastMessage targets the new message)', () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;

        const initial: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'edited question', timestamp: 1 },
        ];
        (fixture.componentRef as any).setInput('messages', initial);
        fixture.detectChanges();

        const newAssistant: AparteMessage = {
            id: 'a-new',
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: 2,
        };
        component.appendMessage(newAssistant);

        // Without waiting for the parent to push back, stream a token.
        component.updateLastMessage('Hello!', { append: true });

        const msgs = component.messages();
        // The user message must NOT have been overwritten.
        expect(msgs[0].id).toBe('u1');
        expect(msgs[0].content).toBe('edited question');
        // The assistant message must hold the streamed token.
        expect(msgs[msgs.length - 1].id).toBe('a-new');
        expect(msgs[msgs.length - 1].content).toBe('Hello!');
    });

    // ─── Regression: orphan stream after conversation switch ────────────────
    //
    // Late SSE events for conv A must not mutate conv B's last message after a
    // switch. The host tracks the streaming id and refuses to mutate when
    // last.id !== streamingId.
    it('drops orphan stream events that arrive after a conversation switch (no overwrite of the new conv last message)', () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;
        const host = fixture.nativeElement as HTMLElement;
        fixture.detectChanges(); // run ngAfterViewInit so the listeners are bound

        // Conv A active with one user message + a streaming assistant placeholder.
        const userA: AparteMessage = { id: 'uA', role: 'user', content: 'q in A', timestamp: 1 };
        const assistantPendingA: AparteMessage = {
            id: 'aA-pending', role: 'assistant', content: '', status: 'pending', timestamp: 2,
        };
        (fixture.componentRef as any).setInput('messages', [userA]);
        component.appendMessage(assistantPendingA);

        // AparteClient announces the start of the assistant stream — this is the
        // event the host uses to lock the target id.
        host.dispatchEvent(new CustomEvent('aparte-message-start', {
            detail: { messageId: assistantPendingA.id, role: 'assistant' },
            bubbles: true,
        }));

        // First delta lands correctly on the assistant placeholder.
        component.updateLastMessage('partial-A', { append: true });
        expect(component.messages().find(m => m.id === 'aA-pending')?.content).toBe('partial-A');

        // ── Conversation switch to B.
        const userB: AparteMessage = { id: 'uB', role: 'user', content: 'q in B', timestamp: 10 };
        (fixture.componentRef as any).setInput('messages', [userB]);
        fixture.detectChanges();

        // ── Late SSE events for Conv A's stream keep arriving — dropped by the guard.
        component.updateLastMessage('late-A-token', { append: true });
        component.appendToSegment('non-existent-segment', 'late-A-segment');

        const msgs = component.messages();
        expect(msgs.length).toBe(1);
        expect(msgs[0].id).toBe('uB');
        // userB.content MUST be untouched.
        expect(msgs[0].content).toBe('q in B');
    });

    // ─── Regression: lazy-create echo must NOT clobber the optimistic pair ──
    //
    // When the controller lazily creates a conversation on first send, Angular CD
    // pushes the SAME id back via [conversationId]. Re-setting it would re-snapshot
    // the (still empty) manager and wipe the optimistic messages.
    it('@Input(conversationId) echo with the same id is a no-op (does not clobber optimistic messages)', () => {
        const fixture = TestBed.createComponent(AparteChatComponent);
        const component = fixture.componentInstance;
        fixture.detectChanges(); // run ngAfterViewInit (creates the host + controller)

        // Simulate the controller's onConversationCreated path.
        const newId = 'new-conv-id';
        (component as any)._conversationId = newId;

        // Optimistic messages already present (user + assistant placeholder).
        const userMsg: AparteMessage = { id: 'u1', role: 'user', content: 'first', timestamp: 1 };
        const assistMsg: AparteMessage = { id: 'a1', role: 'assistant', content: '', status: 'pending', timestamp: 2 };
        component.appendMessage(userMsg);
        component.appendMessage(assistMsg);

        // Streaming has started — emulate the messagestart lifecycle event.
        const host = fixture.nativeElement as HTMLElement;
        host.dispatchEvent(new CustomEvent('aparte-message-start', {
            detail: { messageId: assistMsg.id, role: 'assistant' },
            bubbles: true,
        }));

        // Spy: setConversationId must NOT be called when the value didn't change.
        const spy = vi.spyOn((component as any)._host, 'setConversationId');

        // Now Angular CD pushes the SAME id back via @Input.
        (fixture.componentRef as any).setInput('conversationId', newId);

        expect(spy).not.toHaveBeenCalled();
        // Optimistic state intact.
        expect(component.messages().map(m => m.id)).toEqual(['u1', 'a1']);

        // First SSE delta arrives: streamingId is still set, last is assist.
        component.updateLastMessage('hello', { append: true });
        const final = component.messages();
        expect(final.find(m => m.id === 'u1')?.content).toBe('first');
        expect(final.find(m => m.id === 'a1')?.content).toBe('hello');
    });
});
