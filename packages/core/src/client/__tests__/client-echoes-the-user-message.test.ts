// @vitest-environment jsdom
/**
 * The client echoes the user's message by default (#cowork-2).
 *
 * The bare path used to leave the optimistic USER bubble to the host: everyone
 * wrote the same `aparte-send` handler, and whoever forgot shipped a chat where
 * the user's message never appears — it compiles, it streams, and the person
 * cannot see what they typed. A consumer building from the docs alone shipped
 * exactly that, after reading the docs AND asking the question.
 *
 * So the echo is opt-OUT: `echoUserMessage: false` for a host that owns its own
 * transcript (the four wrappers' ConversationController does, and passes it).
 * The wire cannot double: `_toHistoryMessages` already cuts trailing unanswered
 * user messages, which is what the fresh echo is at build time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage, AparteChatMessage } from '../../types/index.js';

// jsdom has no createObjectURL; every real browser does. The attachment chip's url
// is not what this suite asserts — only that the files became attachments at all.
if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:vitest';
}

interface Harness {
    cfg: AparteConfig;
    el: HTMLElement;
    appended: () => AparteMessage[];
    lastRequestMessages: () => AparteChatMessage[] | null;
}

function harness(): Harness {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }],
    } as never);
    cfg.setKeyProvider(() => 'k');
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });

    let lastMessages: AparteChatMessage[] | null = null;
    cfg.setTransport({
        // The transport's first argument is the PROVIDER; the request rides second.
        chat: (_provider: unknown, request: { messages: AparteChatMessage[] }) => {
            lastMessages = request.messages;
            return new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'done' });
                    controller.close();
                },
            });
        },
    } as never);

    // A viewport-shaped store: what gets appended is what history reads back.
    const store: AparteMessage[] = [];
    const el = document.createElement('div');
    el.id = 'chat-under-test';
    Object.assign(el as unknown as Record<string, unknown>, {
        appendMessage: (m: AparteMessage) => { store.push(m); },
        getMessages: () => [...store],
        updateMessage: () => {},
        addSegment: () => {},
        updateSegment: () => {},
        setUsage: () => {},
    });
    document.body.appendChild(el);
    return { cfg, el, appended: () => store, lastRequestMessages: () => lastMessages };
}

function send(el: HTMLElement, content: string, files?: File[]): void {
    el.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, timestamp: 1, targetId: el.id, ...(files ? { files } : {}) },
        bubbles: true,
        composed: true,
    }));
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the client echoes the user message', () => {
    it('by default: the user bubble appears, before the assistant placeholder', async () => {
        const { cfg, el, appended } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        send(el, 'what I typed');
        await vi.waitFor(() => expect(appended().length).toBeGreaterThanOrEqual(2));
        const [first, second] = appended();
        expect(first.role).toBe('user');
        expect(first.content).toBe('what I typed');
        expect(second.role).toBe('assistant');
        client.stop();
    });

    it('echoUserMessage: false leaves the transcript to the host', async () => {
        const { cfg, el, appended } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false, echoUserMessage: false });
        client.start();
        send(el, 'host-owned');
        await vi.waitFor(() => expect(appended().length).toBeGreaterThanOrEqual(1));
        expect(appended().every((m) => m.role !== 'user')).toBe(true);
        client.stop();
    });

    it('the wire carries the user message ONCE — the echo does not double it', async () => {
        const { cfg, el, lastRequestMessages } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        send(el, 'once on the wire');
        await vi.waitFor(() => expect(lastRequestMessages()).not.toBeNull());
        const users = (lastRequestMessages() ?? []).filter((m) => m.role === 'user');
        expect(users.length).toBe(1);
        expect(users[0]?.content).toBe('once on the wire');
        client.stop();
    });

    it('a detail already marked echoed is not echoed again — the controller handshake', async () => {
        // The ConversationController (capture phase, so always first) appends the
        // user message and marks the event; the client must yield to the mark, or
        // every controller-plus-raw-client pairing doubles — 111 e2e reds' worth.
        const { cfg, el, appended } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        el.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'controller owns me', timestamp: 1, targetId: el.id, echoed: true },
            bubbles: true,
            composed: true,
        }));
        await vi.waitFor(() => expect(appended().length).toBeGreaterThanOrEqual(1));
        expect(appended().every((m) => m.role !== 'user')).toBe(true);
        client.stop();
    });

    it('the client marks the detail after echoing — a second client cannot double', async () => {
        const { cfg, el, appended } = harness();
        const detail = { content: 'once, whoever listens', timestamp: 1, targetId: el.id } as { echoed?: boolean };
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        el.dispatchEvent(new CustomEvent('aparte-send', { detail, bubbles: true, composed: true }));
        await vi.waitFor(() => expect(appended().some((m) => m.role === 'user')).toBe(true));
        expect(detail.echoed).toBe(true);
        client.stop();
    });

    it('an unreadable file fails the send into the error path — echoed, not silent', async () => {
        // Covers the FileReader onerror callbacks (image and text branches): the
        // person's bubble stays (they DID send), and the failure is a lifecycle
        // error on the assistant message, not a silent drop.
        const { cfg, el, appended } = harness();
        const failures: unknown[] = [];
        Object.assign(el as unknown as Record<string, unknown>, {
            updateMessage: (_id: string, patch: { status?: string }) => { if (patch.status === 'error') failures.push(patch); },
        });
        const RealReader = globalThis.FileReader;
        class FailingReader {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            result: string | null = null;
            readAsDataURL(): void { queueMicrotask(() => this.onerror?.()); }
            readAsText(): void { queueMicrotask(() => this.onerror?.()); }
        }
        (globalThis as unknown as { FileReader: unknown }).FileReader = FailingReader;
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        try {
            send(el, 'two doomed files', [
                new File(['x'], 'pic.png', { type: 'image/png' }),
                new File(['y'], 'note.txt', { type: 'text/plain' }),
            ]);
            await vi.waitFor(() => expect(failures.length).toBeGreaterThan(0));
            expect(appended().some((m) => m.role === 'user')).toBe(true);
        } finally {
            (globalThis as unknown as { FileReader: unknown }).FileReader = RealReader;
            client.stop();
        }
    });

    it('attached files ride the echoed bubble as attachments', async () => {
        const { cfg, el, appended } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        send(el, 'with a file', [new File(['x'], 'note.txt', { type: 'text/plain' })]);
        await vi.waitFor(() => expect(appended().some((m) => m.role === 'user')).toBe(true));
        const user = appended().find((m) => m.role === 'user');
        expect(user?.attachments?.length).toBe(1);
        expect(user?.attachments?.[0]?.name).toBe('note.txt');
        client.stop();
    });
});
