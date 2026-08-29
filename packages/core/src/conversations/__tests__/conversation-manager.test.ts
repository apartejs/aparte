import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';

/** The minimum viable adapter, in memory, with a spy on every write. */
function memoryAdapter(seed: AparteConversation[] = []): AparteStorageAdapter & { rows: Map<string, AparteConversation> } {
    const rows = new Map(seed.map((c) => [c.id, c]));
    return {
        rows,
        loadAll: vi.fn(async () => [...rows.values()]),
        save: vi.fn(async (conv: AparteConversation) => { rows.set(conv.id, conv); }),
        delete: vi.fn(async (id: string) => { rows.delete(id); }),
    };
}

const seeded = (): AparteConversation => ({
    id: 'c1',
    title: 'Deploy checklist',
    createdAt: 1000,
    updatedAt: 5000,
    messages: [],
});

describe('AparteConversationManager — pin / unpin', () => {
    it('pin stamps pinnedAt, saves through the adapter and leaves updatedAt alone', async () => {
        const adapter = memoryAdapter([seeded()]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();

        const seen: AparteConversation[][] = [];
        manager.subscribe((c) => seen.push(c));
        await manager.pin('c1');

        const pinned = manager.conversations.find((c) => c.id === 'c1')!;
        expect(pinned.pinnedAt).toBeTypeOf('number');
        // Metadata only: pinning must not float the row in a date-sorted list.
        expect(pinned.updatedAt).toBe(5000);
        expect(adapter.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', pinnedAt: pinned.pinnedAt }));
        expect(seen.length, 'listeners are told once').toBe(1);
    });

    it('unpin clears pinnedAt and saves', async () => {
        const adapter = memoryAdapter([{ ...seeded(), pinnedAt: 4000 }]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();

        await manager.unpin('c1');

        expect(manager.conversations.find((c) => c.id === 'c1')!.pinnedAt).toBeUndefined();
        expect(adapter.rows.get('c1')!.pinnedAt).toBeUndefined();
    });

    it('prefers the adapter\'s own pin()/unpin() when it has them, and then does not save the whole record', async () => {
        const adapter = memoryAdapter([seeded()]);
        const pin = vi.fn(async () => {});
        const unpin = vi.fn(async () => {});
        const manager = new AparteConversationManager({ ...adapter, pin, unpin });
        await manager.init();

        await manager.pin('c1');
        await manager.unpin('c1');

        expect(pin).toHaveBeenCalledWith('c1');
        expect(unpin).toHaveBeenCalledWith('c1');
        expect(adapter.save).not.toHaveBeenCalled();
    });

    it('ignores an unknown id — no write, no notification', async () => {
        const adapter = memoryAdapter([seeded()]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const listener = vi.fn();
        manager.subscribe(listener);

        await manager.pin('nope');
        await manager.unpin('nope');

        expect(adapter.save).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });
});
