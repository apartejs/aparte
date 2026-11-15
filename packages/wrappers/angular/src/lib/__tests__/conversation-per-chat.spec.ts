/**
 * What `<aparte-chat>` does with the conversation it is given, and with a `config` that changes.
 * React's suite of the same name says why; this one adds the binding Angular makes natural, the
 * input bound to `ConversationManagerService.activeId` — which names the new conversation BEFORE
 * the chat that is creating it holds the id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@angular/compiler';
import { Component, inject, provideExperimentalZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
    AparteClient, AparteConfig, registerAllComponents, resolveConfig,
    type AparteConversation, type AparteMessage, type AparteStorageAdapter,
} from '@aparte/core';
import { AparteChatComponent } from '../aparte-chat.component';
import { ConversationManagerService } from '../conversation-manager.service';

registerAllComponents();

/** What a bubble reads: the text, whether the message carries it in `content` or in text segments. */
const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

function gatedClient(config: AparteConfig, chatId: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const client = new AparteClient({
        config,
        autoRegister: false,
        scopeToTargetId: chatId,
        streamRunner: async (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Hel' });
            await gate;
            opts.emitter({ type: 'text-delta', delta: 'lo' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    client.start();
    return { client, release };
}

const sharedConfig = new AparteConfig();

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat id="chat-a" [config]="config" [conversationId]="created()" (conversationCreated)="created.set($event)" />`,
})
class FromTheCallbackHost {
    readonly config = sharedConfig;
    readonly created = signal<string | null>(null);
    readonly chat = viewChild.required(AparteChatComponent);
}

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat id="chat-a" [config]="config" [conversationId]="cm.activeId()" />`,
})
class FromTheManagerHost {
    readonly config = sharedConfig;
    readonly cm = inject(ConversationManagerService);
    readonly chat = viewChild.required(AparteChatComponent);
}

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat id="chat-c" [config]="config()" />`,
})
class ConfigHost {
    readonly config = signal(new AparteConfig());
    readonly chat = viewChild.required(AparteChatComponent);
}

afterEach(() => TestBed.resetTestingModule());

describe.each([
    ['conversationCreated', FromTheCallbackHost],
    ['ConversationManagerService.activeId', FromTheManagerHost],
] as const)('<aparte-chat> given back the conversation it created through %s', (_name, Host) => {
    it('keeps the first reply in its bubble and the person\'s message in place', async () => {
        TestBed.configureTestingModule({ imports: [Host], providers: [provideExperimentalZonelessChangeDetection()] });
        await TestBed.inject(ConversationManagerService).init(memoryAdapter(), sharedConfig);
        const { client, release } = gatedClient(sharedConfig, 'chat-a');
        const fixture = TestBed.createComponent(Host);
        fixture.autoDetectChanges();
        await fixture.whenStable();
        const chat = fixture.componentInstance.chat();

        (fixture.nativeElement as HTMLElement).querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', targetId: 'chat-a', timestamp: Date.now() }, bubbles: true, composed: true,
        }));
        await vi.waitFor(() => expect(chat.getConversationId()).toBeTruthy());
        await fixture.whenStable();
        expect(chat.isStreaming()).toBe(true);
        release();
        await vi.waitFor(() => expect(chat.isStreaming()).toBe(false));
        await fixture.whenStable();

        expect(chat.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]);
        client.stop();
    });
});

describe('<aparte-chat [config]>', () => {
    it('follows a new config, once the turn in flight has ended', async () => {
        TestBed.configureTestingModule({ imports: [ConfigHost], providers: [provideExperimentalZonelessChangeDetection()] });
        const fixture = TestBed.createComponent(ConfigHost);
        fixture.detectChanges();
        await fixture.whenStable();
        const first = fixture.componentInstance.config();
        const second = new AparteConfig();
        const root = fixture.componentInstance.chat().getElement()!;
        expect(resolveConfig(root)).toBe(first);

        fixture.componentInstance.config.set(second);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(resolveConfig(root)).toBe(second);

        root.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        fixture.componentInstance.config.set(first);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(resolveConfig(root)).toBe(second);
        root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } }));
        expect(resolveConfig(root)).toBe(first);
    });
});
