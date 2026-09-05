// @vitest-environment jsdom
/**
 * Split storage (`loadMeta()` + `loadFull()`) is safe: a conversation whose messages
 * are not in memory is never written back without them, a write that lands during a
 * fetch survives it, and the controller's wait always ends.
 *
 * Every case here is a defect the cold audit of 2026-09-05 reproduced (RA-1..5, RA-9,
 * RA-12, RA-23, CR-1, SAB-01/03/04/07/08/09/10/13/14/15). The common shape: the
 * manager read a snapshot, awaited something, and wrote the snapshot back — or wrote
 * a row whose `messages` was the `[]` the list came with.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { aparteGlobalConfig } from '../../config/index.js';
import { APARTE_DERIVED_SEGMENTS } from '../../types/models.js';
import type { AparteConversation, AparteConversationMeta, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

const msg = (id: string, content: string, role: AparteMessage['role'] = 'user'): AparteMessage => ({ id, role, content, timestamp: 1 });
const conv = (id: string, ...messages: AparteMessage[]): AparteConversation => ({ id, title: id, createdAt: 1, updatedAt: 1, messages });
const meta = ({ messages: _m, tree: _t, ...rest }: AparteConversation): AparteConversationMeta => rest;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** A split store whose `loadFull` answers when told to. */
function splitStore(seed: AparteConversation[]) {
    const rows = new Map(seed.map((c) => [c.id, JSON.parse(JSON.stringify(c)) as AparteConversation]));
    const gates = new Map<string, (v: AparteConversation | null) => void>();
    const saves: AparteConversation[] = [];
    const adapter: AparteStorageAdapter = {
        async loadAll() { return [...rows.values()]; },
        async loadMeta() { return [...rows.values()].map(meta); },
        loadFull(id) { return new Promise((resolve) => gates.set(id, resolve)); },
        async save(c) { rows.set(c.id, JSON.parse(JSON.stringify(c))); saves.push(c); },
        async delete(id) { rows.delete(id); },
    };
    const answer = (id: string, value?: AparteConversation | null) => {
        const gate = gates.get(id);
        if (!gate) throw new Error(`no fetch in flight for ${id}`);
        gate(value === undefined ? (rows.get(id) ?? null) : value);
    };
    return { adapter, rows, saves, answer };
}

function binding(): AparteChatBinding & { loading: boolean; messages: AparteMessage[] } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const b = {
        hostId: 'h', host, loading: false, messages: [] as AparteMessage[],
        getMessages: () => b.messages,
        setMessages: (m: AparteMessage[]) => { b.messages = m; },
        appendMessage: (m: AparteMessage) => { b.messages = [...b.messages, m]; },
        clearMessages: () => { b.messages = []; },
        setLoading: (on: boolean) => { b.loading = on; },
    };
    return b;
}

describe('a metadata change on a conversation that was never fetched', () => {
    it('keeps its stored messages — rename, pin, archive', async () => {
        const { adapter, rows, answer } = splitStore([conv('a', msg('a1', 'one'), msg('a2', 'two'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        expect(manager.isLoaded('a')).toBe(false);
        const rename = manager.updateTitle('a', 'Renamed');
        await tick(); answer('a'); await rename;
        expect(rows.get('a')!.messages.map((m) => m.id)).toEqual(['a1', 'a2']);
        expect(rows.get('a')!.title).toBe('Renamed');
        await manager.pin('a');
        await manager.archive('a');
        expect(rows.get('a')!.messages.map((m) => m.id)).toEqual(['a1', 'a2']);
        expect(rows.get('a')!.pinnedAt).toBeTypeOf('number');
        expect(rows.get('a')!.archivedAt).toBeTypeOf('number');
    });

    it('uses the adapter’s rename hook when it has one, and fetches nothing', async () => {
        const { adapter, rows } = splitStore([conv('a', msg('a1', 'one'))]);
        const rename = vi.fn(async (id: string, title: string) => { rows.get(id)!.title = title; });
        const manager = new AparteConversationManager({ ...adapter, rename });
        await manager.init();
        await manager.updateTitle('a', 'Hooked');
        expect(rename).toHaveBeenCalledWith('a', 'Hooked');
        expect(rows.get('a')!.title).toBe('Hooked');
        expect(rows.get('a')!.messages.map((m) => m.id)).toEqual(['a1']);
    });
});

describe('ensureFull()', () => {
    it('a message written during the fetch lands after the stored ones, in memory and in the store', async () => {
        const { adapter, rows, answer } = splitStore([conv('a', msg('a1', 'stored'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const fetching = manager.ensureFull('a');
        const adding = manager.addMessage('a', msg('u9', 'typed while it loaded'));
        await tick();
        answer('a');
        await fetching;
        await adding;
        expect(manager.conversations[0]!.messages.map((m) => m.id)).toEqual(['a1', 'u9']);
        expect(rows.get('a')!.messages.map((m) => m.id)).toEqual(['a1', 'u9']);
    });

    it('does not count a null answer as loaded, and says so', async () => {
        const { adapter, answer } = splitStore([conv('a', msg('a1', 'one'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const p = manager.ensureFull('a');
        answer('a', null);
        await expect(p).resolves.toBe(false);
        expect(manager.isLoaded('a')).toBe(false);
    });

    it('ignores an answer carrying another conversation’s id, and warns', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { adapter, answer } = splitStore([conv('a', msg('a1', 'one')), conv('b', msg('b1', 'two'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const p = manager.ensureFull('a');
        answer('a', conv('b', msg('b1', 'two')));
        await expect(p).resolves.toBe(false);
        expect(manager.conversations.find((c) => c.id === 'a')!.messages).toEqual([]);
        expect(manager.conversations.find((c) => c.id === 'a')!.title).toBe('a');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('reads a record whose messages are missing as empty', async () => {
        const { adapter, answer } = splitStore([conv('a')]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const p = manager.ensureFull('a');
        answer('a', { id: 'a', title: 'a', createdAt: 1, updatedAt: 1 } as unknown as AparteConversation);
        await expect(p).resolves.toBe(true);
        expect(manager.conversations[0]!.messages).toEqual([]);
    });
});

describe('a write that awaits', () => {
    it('addMessage() writes over the current record, not the one it read before the title provider answered', async () => {
        const { adapter, rows } = splitStore([]);
        let releaseTitle: (t: string) => void = () => {};
        const manager = new AparteConversationManager(adapter, {
            titleProvider: () => new Promise<string>((r) => { releaseTitle = r; }),
        });
        await manager.init();
        const created = await manager.createNew();
        const adding = manager.addMessage(created.id, msg('u1', 'first'));
        await tick();
        await manager.updateMessages(created.id, [msg('u1', 'first'), msg('a1', 'reply', 'assistant')]);
        releaseTitle('Titled');
        await adding;
        expect(manager.conversations[0]!.messages.map((m) => m.id)).toEqual(['u1', 'a1']);
        expect(rows.get(created.id)!.messages.map((m) => m.id)).toEqual(['u1', 'a1']);
        expect(manager.conversations[0]!.title).toBe('Titled');
    });

    it('refuses to replace the messages of a conversation that is not in memory', async () => {
        const { adapter, rows, saves } = splitStore([conv('a', msg('a1', 'one'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        await manager.updateMessages('a', []);
        expect(saves).toHaveLength(0);
        expect(rows.get('a')!.messages.map((m) => m.id)).toEqual(['a1']);
    });

    it('does not bump updatedAt for a conversation merely opened: derived segments are not a change', async () => {
        const stored = conv('a', msg('u1', 'Show me.'), { id: 'a1', role: 'assistant', content: '```ts\nconst a = 1;\n```', timestamp: 2 });
        const { adapter, answer } = splitStore([stored]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const p = manager.ensureFull('a'); answer('a'); await p;
        // What a viewport hands back after display: the same messages, plus segments it
        // derived from the markdown, marked as derived (a non-enumerable symbol).
        const shown = manager.conversations[0]!.messages.map((m) => {
            if (m.role !== 'assistant') return { ...m };
            const withSegments = { ...m, segments: [{ id: 's1', type: 'code', content: 'const a = 1;', language: 'ts' }] } as AparteMessage;
            Object.defineProperty(withSegments, APARTE_DERIVED_SEGMENTS, { value: true, enumerable: false });
            return withSegments;
        });
        await manager.updateMessages('a', shown);
        expect(manager.conversations[0]!.updatedAt).toBe(1);
    });

    it('titles from the first user message the caller sent, not the one retention kept', async () => {
        const { adapter } = splitStore([]);
        const manager = new AparteConversationManager(adapter, { retention: { maxMessages: 2 } });
        await manager.init();
        const created = await manager.createNew();
        await manager.addMessage(created.id, msg('u1', 'The first question'));
        const title = manager.conversations[0]!.title;
        await manager.updateMessages(created.id, [msg('u1', 'The first question'), msg('a1', 'r', 'assistant'), msg('u2', 'Another question'), msg('a2', 'r2', 'assistant')]);
        expect(manager.conversations[0]!.title).toBe(title);
    });
});

describe('init()', () => {
    it('forgets what was loaded when it runs again', async () => {
        const { adapter, answer } = splitStore([conv('a', msg('a1', 'one'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const p = manager.ensureFull('a'); answer('a'); await p;
        expect(manager.isLoaded('a')).toBe(true);
        await manager.init();
        expect(manager.isLoaded('a')).toBe(false);
    });

    it('keeps a conversation created while the list was on its way', async () => {
        let release: () => void = () => {};
        const { adapter } = splitStore([conv('a', msg('a1', 'one'))]);
        const slow: AparteStorageAdapter = { ...adapter, loadMeta: () => new Promise((r) => { release = () => r([meta(conv('a'))]); }) };
        const manager = new AparteConversationManager(slow);
        const init = manager.init();
        const creating = manager.createNew();
        await tick();
        release();
        await init;
        const created = await creating;
        expect(manager.conversations.map((c) => c.id)).toContain(created.id);
        expect(manager.activeId).toBe(created.id);
    });

    it('keeps one row per id when the list repeats one', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { adapter } = splitStore([conv('a', msg('a1', 'one'))]);
        const twice: AparteStorageAdapter = { ...adapter, loadMeta: async () => [meta(conv('a')), meta(conv('a'))] };
        const manager = new AparteConversationManager(twice);
        await manager.init();
        expect(manager.conversations.map((c) => c.id)).toEqual(['a']);
        warn.mockRestore();
    });

    it('warns when an adapter lists through loadMeta but cannot loadFull', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { adapter } = splitStore([conv('a', msg('a1', 'one'))]);
        const half: AparteStorageAdapter = { loadAll: adapter.loadAll, loadMeta: adapter.loadMeta, save: adapter.save, delete: adapter.delete };
        const manager = new AparteConversationManager(half);
        await manager.init();
        expect(manager.isLoaded('a')).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('warns on a title change for an id it does not know', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { adapter } = splitStore([]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        await manager.updateTitle('ghost', 'x');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('the controller’s wait', () => {
    function wire(seed: AparteConversation[]) {
        const store = splitStore(seed);
        const manager = new AparteConversationManager(store.adapter);
        aparteGlobalConfig.setConversationManager(manager);
        const b = binding();
        const controller = new AparteConversationController(b);
        const unbind = controller.bind();
        return { ...store, manager, b, controller, unbind };
    }

    it('ends when an already-loaded conversation replaces the one being fetched', async () => {
        const { manager, b, controller, answer, unbind } = wire([conv('a', msg('a1', 'A')), conv('b', msg('b1', 'B'))]);
        await manager.init();
        const pb = manager.ensureFull('b'); answer('b'); await pb;
        const first = controller.setConversationId('a');
        expect(b.loading).toBe(true);
        await controller.setConversationId('b');
        expect(b.messages.map((m) => m.content)).toEqual(['B']);
        expect(b.loading).toBe(false);
        answer('a'); await first;
        expect(b.loading).toBe(false);
        expect(b.messages.map((m) => m.content)).toEqual(['B']);
        unbind();
    });

    it('ends when a new chat replaces the one being fetched', async () => {
        const { manager, b, controller, answer, unbind } = wire([conv('a', msg('a1', 'A'))]);
        await manager.init();
        const first = controller.setConversationId('a');
        expect(b.loading).toBe(true);
        await controller.setConversationId(null);
        expect(b.loading).toBe(false);
        answer('a'); await first;
        expect(b.loading).toBe(false);
        expect(b.messages).toEqual([]);
        unbind();
    });

    it('ends when the conversation being fetched is deleted', async () => {
        const { manager, b, controller, answer, unbind } = wire([conv('a', msg('a1', 'A'))]);
        await manager.init();
        const first = controller.setConversationId('a');
        expect(b.loading).toBe(true);
        await manager.delete('a');
        await tick();
        expect(b.loading).toBe(false);
        expect(controller.activeId).toBeNull();
        // The store answers late, for a row that is gone: nothing lands.
        answer('a', null);
        await expect(first).resolves.toBeUndefined();
        expect(b.loading).toBe(false);
        expect(b.messages).toEqual([]);
        unbind();
    });

    it('ends, at home, with nothing written, when the fetch fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { manager, b, controller, saves, unbind } = wire([conv('a', msg('a1', 'A'))]);
        (manager as unknown as { _adapter: AparteStorageAdapter })._adapter.loadFull = () => Promise.reject(new Error('store down'));
        await manager.init();
        await controller.setConversationId('a');
        expect(b.loading).toBe(false);
        expect(controller.activeId).toBeNull();
        expect(manager.activeId).toBeNull();
        expect(saves).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        unbind();
    });
});

describe('persisting around a fetch', () => {
    it('a switch while a reply streams does not write the emptied binding into the conversation being fetched', async () => {
        const store = splitStore([conv('a', msg('a1', 'A one')), conv('b', msg('b1', 'B one'), msg('b2', 'B two'))]);
        const manager = new AparteConversationManager(store.adapter);
        await manager.init();
        aparteGlobalConfig.setConversationManager(manager);
        const b = binding();
        const controller = new AparteConversationController(b);
        const unbind = controller.bind();
        const openA = controller.setConversationId('a');
        await tick(); store.answer('a'); await openA;
        expect(b.messages.map((m) => m.id)).toEqual(['a1']);
        b.host.dispatchEvent(new CustomEvent('aparte-message-start'));
        const openB = controller.setConversationId('b');
        b.host.dispatchEvent(new CustomEvent('aparte-message-aborted'));
        await tick(); await tick();
        store.answer('b'); await openB; await tick();
        expect(store.rows.get('b')!.messages.map((m) => m.id)).toEqual(['b1', 'b2']);
        expect(b.messages.map((m) => m.id)).toEqual(['b1', 'b2']);
        unbind();
    });

    it('the first send survives a save() that throws once', async () => {
        const store = splitStore([]);
        let failures = 1;
        const flaky: AparteStorageAdapter = { ...store.adapter, save: async (c) => { if (failures-- > 0) throw new Error('disk full'); await store.adapter.save(c); } };
        const manager = new AparteConversationManager(flaky);
        await manager.init();
        aparteGlobalConfig.setConversationManager(manager);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const b = binding();
        const controller = new AparteConversationController(b);
        const unbind = controller.bind();
        b.host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'first', targetId: 'h' } }));
        await tick(); await tick(); await tick();
        expect(controller.activeId).not.toBeNull();
        b.host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'second', targetId: 'h' } }));
        await tick(); await tick(); await tick();
        const saved = store.rows.get(controller.activeId!);
        expect(saved?.messages.map((m) => m.content)).toEqual(['first', 'second']);
        warn.mockRestore();
        unbind();
    });
});

describe('two sends while the first one is still creating the conversation', () => {
    it('both land in one conversation, and the transcript stays', async () => {
        let release: () => void = () => {};
        const store = splitStore([]);
        const slow: AparteStorageAdapter = { ...store.adapter, loadMeta: () => new Promise((r) => { release = () => r([]); }) };
        const manager = new AparteConversationManager(slow);
        const init = manager.init();
        aparteGlobalConfig.setConversationManager(manager);
        const b = binding();
        const controller = new AparteConversationController(b);
        const unbind = controller.bind();
        b.host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'first', targetId: 'h' } }));
        await tick();
        b.host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'second', targetId: 'h' } }));
        await tick();
        release();
        await init;
        for (let i = 0; i < 6; i++) await tick();
        expect(b.messages.map((m) => m.content)).toEqual(['first', 'second']);
        expect(manager.conversations).toHaveLength(1);
        const saved = store.rows.get(controller.activeId!);
        expect(saved?.messages.map((m) => m.content)).toEqual(['first', 'second']);
        unbind();
    });
});
