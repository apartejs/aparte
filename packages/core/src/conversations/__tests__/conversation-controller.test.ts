import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteConversationManager } from '../conversation-manager.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';
import { APARTE_CONVERSATION_SCHEMA_VERSION } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

// ─── In-memory adapter ────────────────────────────────────────────────────

class MemoryAdapter implements AparteStorageAdapter {
    store = new Map<string, AparteConversation>();
    async loadAll() {
        return [...this.store.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    async save(c: AparteConversation) { this.store.set(c.id, c); }
    async delete(id: string) { this.store.delete(id); }
    async archive(id: string) {
        const c = this.store.get(id);
        if (c) this.store.set(id, { ...c, archivedAt: Date.now() });
    }
    async unarchive(id: string) {
        const c = this.store.get(id);
        if (!c) return;
        const { archivedAt: _omit, ...rest } = c;
        this.store.set(id, rest);
    }
}

// ─── Mock binding backed by a real DOM element ────────────────────────────

function makeBinding(host: HTMLElement): AparteChatBinding & { messages: AparteMessage[] } {
    const state = { messages: [] as AparteMessage[] };
    const binding: AparteChatBinding & { messages: AparteMessage[] } = {
        hostId: host.id || 'test-host',
        host,
        get messages() { return state.messages; },
        set messages(v: AparteMessage[]) { state.messages = v; },
        setMessages(msgs) { state.messages = [...msgs]; },
        appendMessage(msg) { state.messages = [...state.messages, msg as AparteMessage]; },
        getMessages() { return state.messages; },
        clearMessages() { state.messages = []; },
    };
    return binding;
}

function userMsg(content: string): AparteMessage {
    return {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
    };
}

async function flush() {
    // Resolve any queued microtasks (queueMicrotask, awaited promises).
    await Promise.resolve();
    await Promise.resolve();
}

describe('AparteConversationController', () => {
    let host: HTMLElement;
    let manager: AparteConversationManager;
    let adapter: MemoryAdapter;

    beforeEach(async () => {
        document.body.innerHTML = '';
        host = document.createElement('div');
        host.id = 'test-host';
        document.body.appendChild(host);
        adapter = new MemoryAdapter();
        manager = new AparteConversationManager(adapter);
        await manager.init();
    });

    // ─── setConversationId ────────────────────────────────────────────────

    describe('a manager registered AFTER bind() — every wrapper\'s case', () => {
        it('is still subscribed: deleting the active conversation clears the binding', async () => {
            // The wrappers call `await m.init()` then `config.setConversationManager(m)`,
            // i.e. after the mount effect that bound the controller; a subscription
            // taken only at bind() was never installed under any of them.
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding);   // no `manager` option
            ctrl.bind();
            aparteGlobalConfig.setConversationManager(manager);
            try {
                const conv = await manager.createNew('late');
                await manager.addMessage(conv.id, userMsg('hi'));
                await ctrl.setConversationId(conv.id);
                expect(binding.getMessages()).toHaveLength(1);

                await manager.delete(conv.id);
                await flush();

                expect(binding.getMessages(), 'the phantom history is gone').toHaveLength(0);
                expect(ctrl.activeId).toBeNull();
            } finally {
                ctrl.unbind();
                aparteGlobalConfig.setConversationManager(null as never);
            }
        });
    });

    describe('setConversationId', () => {
        it('loads messages from manager into binding', async () => {
            const conv = await manager.createNew('Hello');
            await manager.addMessage(conv.id, userMsg('hi'));
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();

            await ctrl.setConversationId(conv.id);

            expect(binding.getMessages()).toHaveLength(1);
            expect(binding.getMessages()[0].content).toBe('hi');
            expect(ctrl.activeId).toBe(conv.id);
            expect(manager.activeId).toBe(conv.id);
        });

        it('clears the binding when called with null', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, userMsg('x'));
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            await ctrl.setConversationId(null);

            expect(binding.getMessages()).toHaveLength(0);
            expect(ctrl.activeId).toBeNull();
            expect(manager.activeId).toBeNull();
        });

        it('is idempotent: re-snapshots from manager on same id', async () => {
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            // External mutation: someone added a message directly.
            await manager.addMessage(conv.id, userMsg('external'));
            // Binding hasn't been notified yet — same-id reload should sync.
            await ctrl.setConversationId(conv.id);

            expect(binding.getMessages().map(m => m.content)).toEqual(['external']);
        });

        it('clears when given an unknown id', async () => {
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            binding.setMessages([userMsg('stale')]);

            await ctrl.setConversationId('does-not-exist');

            expect(binding.getMessages()).toHaveLength(0);
            expect(ctrl.activeId).toBeNull();
        });

        it('dispatches aparte-abort on switch while streaming', async () => {
            const a = await manager.createNew('A');
            const b = await manager.createNew('B');
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(a.id);

            const abortSpy = vi.fn();
            window.addEventListener('aparte-abort', abortSpy as EventListener);

            // Start streaming on host → controller flips _isStreaming = true
            host.dispatchEvent(new CustomEvent('aparte-message-start'));
            await ctrl.setConversationId(b.id);

            expect(abortSpy).toHaveBeenCalledTimes(1);
            const detail = (abortSpy.mock.calls[0][0] as CustomEvent).detail;
            expect(detail.targetId).toBe(binding.hostId);

            window.removeEventListener('aparte-abort', abortSpy as EventListener);
        });

        it('does NOT abort on same-id reload', async () => {
            const a = await manager.createNew('A');
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(a.id);

            const abortSpy = vi.fn();
            window.addEventListener('aparte-abort', abortSpy as EventListener);

            host.dispatchEvent(new CustomEvent('aparte-message-start'));
            await ctrl.setConversationId(a.id);

            expect(abortSpy).not.toHaveBeenCalled();
            window.removeEventListener('aparte-abort', abortSpy as EventListener);
        });
    });

    // ─── Send → lazy create + persist ─────────────────────────────────────

    describe('aparte-send capture', () => {
        it('marks the event echoed once it appends — the handshake AparteClient yields to', () => {
            // The controller captures first (by design); without the mark, a raw
            // AparteClient beside it — the documented pairing — echoes a second
            // user bubble on every send.
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            const detail: { content: string; targetId: string; echoed?: boolean } =
                { content: 'mark me', targetId: binding.hostId };
            host.dispatchEvent(new CustomEvent('aparte-send', { detail }));
            expect(binding.messages.some((m) => m.role === 'user')).toBe(true);
            expect(detail.echoed).toBe(true);
            ctrl.unbind?.();
        });

        it('creates a conversation on first send and persists the user message', async () => {
            const created = vi.fn();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, {
                manager,
                onConversationCreated: created,
            });
            ctrl.bind();

            host.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'first message', targetId: binding.hostId },
            }));
            await flush();
            await flush();

            expect(created).toHaveBeenCalledTimes(1);
            const newId = created.mock.calls[0][0] as string;
            expect(ctrl.activeId).toBe(newId);
            expect(manager.conversations).toHaveLength(1);
            expect(manager.conversations[0].messages).toHaveLength(1);
            expect(manager.conversations[0].messages[0].content).toBe('first message');
        });

        it('ignores aparte-send targeted at another binding', async () => {
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();

            host.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'x', targetId: 'other-host' },
            }));
            await flush();

            expect(manager.conversations).toHaveLength(0);
            expect(binding.getMessages()).toHaveLength(0);
        });

        it('race-guard: discards orphan conv when user switches mid-create', async () => {
            const existing = await manager.createNew('Existing');
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            // Start with no active conv.
            expect(ctrl.activeId).toBeNull();

            // Slow down createNew so we can switch while it's in flight.
            const realCreate = manager.createNew.bind(manager);
            let resolveCreate: (() => void) | null = null;
            const block = new Promise<void>(r => { resolveCreate = r; });
            vi.spyOn(manager, 'createNew').mockImplementationOnce(async (title?: string) => {
                await block;
                return realCreate(title);
            });

            host.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'queued', targetId: binding.hostId },
            }));
            // Switch to an existing conv while createNew is pending.
            await ctrl.setConversationId(existing.id);
            // Now release createNew.
            resolveCreate!();
            await flush();
            await flush();
            await flush();

            // Active conv must still be `existing`, not the orphan.
            expect(ctrl.activeId).toBe(existing.id);
            // The orphan must have been deleted: only `existing` remains.
            expect(manager.conversations).toHaveLength(1);
            expect(manager.conversations[0].id).toBe(existing.id);
        });
    });

    // ─── Stream terminal events trigger persistence ───────────────────────

    describe('persistence on stream completion', () => {
        it('persists messages on aparte-message-done', async () => {
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            // Simulate a streamed assistant turn finishing.
            binding.appendMessage(userMsg('user q'));
            binding.appendMessage({ id: crypto.randomUUID(), role: 'assistant', content: 'assistant a', timestamp: Date.now() });
            host.dispatchEvent(new CustomEvent('aparte-message-done'));
            await flush();
            await flush();

            const stored = manager.conversations.find(c => c.id === conv.id)!;
            expect(stored.messages).toHaveLength(2);
            expect(stored.messages[1].content).toBe('assistant a');
        });

        it('persists on error and aborted as well', async () => {
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            binding.appendMessage(userMsg('q1'));
            host.dispatchEvent(new CustomEvent('aparte-message-error'));
            await flush(); await flush();
            expect(manager.conversations[0].messages).toHaveLength(1);

            binding.appendMessage(userMsg('q2'));
            host.dispatchEvent(new CustomEvent('aparte-message-aborted'));
            await flush(); await flush();
            expect(manager.conversations[0].messages).toHaveLength(2);
        });

        it('persists a turn a server paused, so a reload can still answer it', async () => {
            // The turn is not over — it ends after the resume — but a person who closes the
            // tab while a panel waits comes back to the saved conversation, and the paused
            // call (with the server's ticket) has to be in it.
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            binding.appendMessage(userMsg('delete a'));
            binding.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: Date.now(), status: 'completed', segments: [
                { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: {} }, deferred: { reason: 'approval', ticket: 'T' } },
            ] } as AparteMessage);
            host.dispatchEvent(new CustomEvent('aparte-message-paused', { detail: { messageId: 'a1' } }));
            await flush(); await flush();
            const saved = manager.conversations[0].messages[1]!;
            expect(saved.segments![0]).toMatchObject({ status: 'awaiting-approval', deferred: { ticket: 'T' } });
        });
    });

    // ─── Global aparte-conversation-select listener ─────────────────────────

    describe('aparte-conversation-select window event', () => {
        it('switches active conversation on event', async () => {
            const a = await manager.createNew('A');
            const b = await manager.createNew('B');
            await manager.addMessage(b.id, userMsg('only-in-B'));

            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(a.id);

            window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: b.id } }));
            await flush();

            expect(ctrl.activeId).toBe(b.id);
            expect(binding.getMessages().map(m => m.content)).toEqual(['only-in-B']);
        });

        it('respects targetId scoping', async () => {
            const a = await manager.createNew('A');
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();

            window.dispatchEvent(new CustomEvent('aparte-conversation-select', {
                detail: { id: a.id, targetId: 'someone-else' },
            }));
            await flush();

            expect(ctrl.activeId).toBeNull();
        });
    });

    // ─── Manager subscription: react to external delete ───────────────────

    describe('manager subscription', () => {
        it('clears the binding when active conv is deleted externally', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, userMsg('x'));
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);
            expect(binding.getMessages()).toHaveLength(1);

            await manager.delete(conv.id);
            await flush();

            expect(ctrl.activeId).toBeNull();
            expect(binding.getMessages()).toHaveLength(0);
        });

        it('clears the binding when active conv is archived externally', async () => {
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            await manager.archive(conv.id);
            await flush();

            expect(ctrl.activeId).toBeNull();
            expect(binding.getMessages()).toHaveLength(0);
        });
    });

    // ─── Race condition: manager-hydrating + setConversationId ────────────
    //
    // Regression test for the "[ConversationController] unknown id" bug
    // observed in a consumer app:
    //   1. <aparte-chat> mounts with [conversationId]=id (from router).
    //   2. ConversationManagerService.init() is still hydrating from IndexedDB
    //      → manager.conversations is [] at this instant.
    //   3. controller.setConversationId(id) runs → manager.conversations.find()
    //      returns undefined → CURRENTLY it calls _binding.clearMessages() →
    //      the conversation tree is wiped from the binding signal.
    //   4. When hydration finishes (manager._notify fires), the binding is
    //      already empty. The user types a message → request.messages is
    //      `[system, current_user]` only, no history → LLM behaves stateless.
    //
    // Expected behaviour: when the manager is present but not yet hydrated,
    // the controller must DEFER clearing and retry once the manager emits
    // with the requested conv now present. The binding must then load the
    // persisted messages, not stay empty.
    describe('race: setConversationId before manager.init() resolves', () => {
        it('does NOT clear the binding when manager is hydrating', async () => {
            // Pre-seed the adapter with a conv (3 messages) — this is what
            // a real user has after a few turns persisted to IndexedDB.
            const seededId = 'pre-existing-conv-id';
            const seeded: AparteConversation = {
                id: seededId,
                title: 'Persisted chat',
                createdAt: 1000,
                updatedAt: 2000,
                messages: [
                    userMsg('hello'),
                    { id: crypto.randomUUID(), role: 'assistant', content: 'hi there', status: 'completed', timestamp: 1100 } as AparteMessage,
                    userMsg('how are you'),
                ],
                schemaVersion: APARTE_CONVERSATION_SCHEMA_VERSION,
            };
            // Bypass `manager.init()` so the manager is in the "constructed
            // but not hydrated" state — exactly the window where the bug
            // happens in a consumer app (Angular APP_INITIALIZER race).
            adapter.store.set(seededId, seeded);
            const freshManager = new AparteConversationManager(adapter);
            // Note: NO `await freshManager.init()` here.

            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager: freshManager });
            ctrl.bind();

            // Pre-existing state on the binding (e.g. a previous conv left
            // some messages mounted). The bug used to wipe these.
            binding.setMessages([userMsg('previous turn from before nav')]);

            // setConversationId with an id the manager doesn't know about yet.
            await ctrl.setConversationId(seededId);
            await flush();

            // Now the manager finishes hydrating (real-world: IndexedDB
            // adapter.loadAll() resolves).
            await freshManager.init();
            await flush(); await flush();

            // After hydration, the binding MUST contain the 3 persisted
            // messages, NOT an empty array. Without the race fix, this
            // assertion FAILS — the binding was cleared at step (3) above
            // and never reloaded.
            const loaded = binding.getMessages();
            expect(loaded.length).toBe(3);
            expect(loaded[0]?.content).toBe('hello');
            expect(loaded[2]?.content).toBe('how are you');
        });

        it('does NOT log the "unknown id" warning during hydration window', async () => {
            // Same scenario, but assert the noisy console.warn doesn't fire
            // when the manager will eventually know the id — that warning is
            // reserved for truly-unknown ids (deleted convs, stale URLs).
            const seededId = 'pre-existing-conv-id';
            adapter.store.set(seededId, {
                id: seededId,
                title: 'x',
                createdAt: 1, updatedAt: 2,
                messages: [userMsg('m')],
                schemaVersion: APARTE_CONVERSATION_SCHEMA_VERSION,
            });
            const freshManager = new AparteConversationManager(adapter);
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager: freshManager });
            ctrl.bind();

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            await ctrl.setConversationId(seededId);
            await freshManager.init();
            await flush(); await flush();

            const unknownIdCalls = warnSpy.mock.calls.filter(args =>
                String(args[0] ?? '').includes('unknown id or no manager')
            );
            expect(unknownIdCalls).toHaveLength(0);
            warnSpy.mockRestore();
        });

        it('still clears for a truly-unknown id even after hydration', async () => {
            // Make sure the fix doesn't silence the legitimate clear path —
            // when the manager has hydrated and the id is genuinely not
            // present, clearing is the correct behaviour.
            await manager.init();  // hydrated
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            binding.setMessages([userMsg('stale message from another conv')]);

            await ctrl.setConversationId('completely-unknown-id');
            await flush(); await flush();

            // Genuine "unknown id" — binding cleared, activeId reset.
            expect(binding.getMessages()).toEqual([]);
            expect(ctrl.activeId).toBeNull();
        });
    });

    // ─── unbind ───────────────────────────────────────────────────────────

    describe('unbind', () => {
        it('detaches all listeners', async () => {
            const conv = await manager.createNew();
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            const stop = ctrl.bind();
            await ctrl.setConversationId(conv.id);

            stop();

            // After unbind, send events must NOT mutate the manager.
            const before = manager.conversations[0].messages.length;
            host.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'after unbind', targetId: binding.hostId },
            }));
            await flush(); await flush();
            expect(manager.conversations[0].messages.length).toBe(before);

            // window event must also be ignored.
            window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: null } }));
            await flush();
            expect(ctrl.activeId).toBe(conv.id);
        });
    });

    // ─── compaction ───────────────────────────────────────────────────────
    describe('a compaction', () => {
        it('is saved as soon as it is done, not at the next message', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, userMsg('a long talk'));
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            // What the plugin leaves on screen: the summary and the turns it kept.
            binding.setMessages([{ id: 's1', role: 'user', compaction: true, content: 'Summary', timestamp: 2, status: 'completed' } as AparteMessage]);
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 'Summary', kept: 0, dropped: 1, targetId: 'test-host' } }));
            await flush();
            await flush();
            expect(adapter.store.get(conv.id)!.messages.map((m) => m.id)).toEqual(['s1']);
        });

        /*
         * A transcript kept in a framework store (the plugin's `resolveTarget` writes the
         * store) reaches the binding only when that framework renders. Saved on the
         * microtask, the conversation was written as it stood BEFORE the compaction.
         */
        it('waits for a store-backed transcript to reach the binding, then saves it', async () => {
            const conv = await manager.createNew();
            const talk = userMsg('a long talk');
            await manager.addMessage(conv.id, talk);
            const binding = makeBinding(host);
            const renders: Array<() => void> = [];
            binding.afterRender = (cb) => { renders.push(cb); };
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);

            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 'The talk so far', kept: 0, dropped: 1, targetId: 'test-host' } }));
            await flush();
            await flush();
            // The framework renders: the store's list is now the binding's.
            binding.messages = [{ id: 's1', role: 'user', compaction: true, content: '**Summary**\n\nThe talk so far', timestamp: 2, status: 'completed' } as AparteMessage];
            for (const render of renders.splice(0)) render();
            await flush();
            await flush();
            expect(adapter.store.get(conv.id)!.messages.map((m) => m.id)).toEqual(['s1']);
        });

        /*
         * The checkpoint is written onto a message and nothing is replaced: the save waits for
         * THAT message to carry it (with the stamp a half-written one lacks), not for a summary
         * message that no longer exists.
         */
        describe('that writes a checkpoint', () => {
            const checkpoint = { summary: 'The talk so far', count: 2, createdAt: 5 };

            it('is saved with the checkpoint on the message it names', async () => {
                const conv = await manager.createNew();
                await manager.addMessage(conv.id, userMsg('a long talk'));
                const binding = makeBinding(host);
                const ctrl = new AparteConversationController(binding, { manager });
                ctrl.bind();
                await ctrl.setConversationId(conv.id);
                const [first] = binding.getMessages();

                binding.setMessages([{ ...first!, contextSummary: checkpoint }]);
                window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 'The talk so far', messageId: first!.id, count: 2, kept: 1, dropped: 2, targetId: 'test-host' } }));
                await flush();
                await flush();

                expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary).toEqual(checkpoint);
            });

            it('waits for a framework-owned list to carry the checkpoint, then saves it', async () => {
                const conv = await manager.createNew();
                await manager.addMessage(conv.id, userMsg('a long talk'));
                const binding = makeBinding(host);
                const renders: Array<() => void> = [];
                binding.afterRender = (cb) => { renders.push(cb); };
                const ctrl = new AparteConversationController(binding, { manager });
                ctrl.bind();
                await ctrl.setConversationId(conv.id);
                const [first] = binding.getMessages();

                window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { messageId: first!.id, count: 2, targetId: 'test-host' } }));
                await flush();
                await flush();
                expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary, 'not saved before the list has it').toBeUndefined();
                expect(renders.length, 'it is waiting for a render').toBeGreaterThan(0);

                binding.messages = [{ ...first!, contextSummary: checkpoint }];
                for (const render of renders.splice(0)) render();
                await flush();
                await flush();
                expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary).toEqual(checkpoint);
            });

            it('does not take a checkpoint with no stamp for a written one, and gives up after a bounded wait', async () => {
                const conv = await manager.createNew();
                await manager.addMessage(conv.id, userMsg('a long talk'));
                const binding = makeBinding(host);
                let renders = 0;
                binding.afterRender = (cb) => { renders += 1; cb(); };
                const ctrl = new AparteConversationController(binding, { manager });
                ctrl.bind();
                await ctrl.setConversationId(conv.id);
                const [first] = binding.getMessages();
                binding.setMessages([{ ...first!, contextSummary: { summary: 's', count: 1 } as never }]);

                window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { messageId: first!.id, targetId: 'test-host' } }));
                await flush();
                await flush();
                expect(renders, 'waited, then stopped waiting').toBe(6);
                // A bounded wait ends in a save of what is there, as ever.
                expect(adapter.store.get(conv.id)!.messages).toHaveLength(1);
            });
        });

        it('that was a Restore is saved without the checkpoints', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, { ...userMsg('a long talk'), contextSummary: { summary: 'before', count: 2, createdAt: 5 } });
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);
            const [first] = binding.getMessages();
            expect(first!.contextSummary, 'loaded with it').toBeDefined();

            binding.setMessages([{ ...first!, contextSummary: undefined }]);
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, messageId: first!.id, targetId: 'test-host' } }));
            await flush();
            await flush();

            expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary).toBeUndefined();
        });

        it('that was a Restore waits for a framework-owned list to drop the checkpoints', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, { ...userMsg('a long talk'), contextSummary: { summary: 'before', count: 2, createdAt: 5 } });
            const binding = makeBinding(host);
            const renders: Array<() => void> = [];
            binding.afterRender = (cb) => { renders.push(cb); };
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);
            const [first] = binding.getMessages();

            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, targetId: 'test-host' } }));
            await flush();
            await flush();
            expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary, 'the list still carries it: not saved yet').toBeDefined();

            binding.messages = [{ ...first!, contextSummary: undefined }];
            for (const render of renders.splice(0)) render();
            await flush();
            await flush();
            expect(adapter.store.get(conv.id)!.messages[0]!.contextSummary).toBeUndefined();
        });

        it('that was skipped is saved as it stands, with nothing to wait for', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, userMsg('mine'));
            const binding = makeBinding(host);
            const renders: Array<() => void> = [];
            binding.afterRender = (cb) => { renders.push(cb); };
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);
            binding.setMessages([...binding.getMessages(), userMsg('typed since')]);

            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true, reason: 'nothing-to-drop', targetId: 'test-host' } }));
            await flush();
            await flush();

            expect(renders).toHaveLength(0);
            expect(adapter.store.get(conv.id)!.messages).toHaveLength(2);
        });

        it('of another chat is not this one to save', async () => {
            const conv = await manager.createNew();
            await manager.addMessage(conv.id, userMsg('mine'));
            const binding = makeBinding(host);
            const ctrl = new AparteConversationController(binding, { manager });
            ctrl.bind();
            await ctrl.setConversationId(conv.id);
            binding.setMessages([]);
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 'x', kept: 0, dropped: 1, targetId: 'another-chat' } }));
            await flush();
            await flush();
            expect(adapter.store.get(conv.id)!.messages.map((m) => m.content)).toEqual(['mine']);
        });
    });
});
