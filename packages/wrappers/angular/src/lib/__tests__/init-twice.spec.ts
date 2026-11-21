/**
 * The conversation helper's `init()`, called a second time, replaces the manager. It used to
 * leave its subscription on the first one, whose notifications went on writing the helper's
 * lists and `activeId`.
 */
import { describe, it, expect } from 'vitest';
import '@angular/compiler';
import { AparteConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { ConversationManagerService } from '../conversation-manager.service';

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

describe('ConversationManagerService.init, called twice', () => {
    it('leaves no subscription on the manager it replaced', async () => {
        const service = new ConversationManagerService();
        const config = new AparteConfig();
        await service.init(memoryAdapter(), config);
        const firstManager = service.manager!;
        await service.init(memoryAdapter(), config);
        await firstManager.createNew('stale');
        expect(service.conversations()).toHaveLength(0);
        service.ngOnDestroy();
    });
});

function slowAdapter(): { adapter: AparteStorageAdapter; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    return { adapter: { async loadAll() { await gate; return []; }, async save() {}, async delete() {} }, release };
}

describe('ConversationManagerService.init, overtaken by a newer one', () => {
    it('registers nothing when it resolves after the newer init', async () => {
        const service = new ConversationManagerService();
        const config = new AparteConfig();
        const slow = slowAdapter();
        const first = service.init(slow.adapter, config);
        await service.init(memoryAdapter(), config);
        const newer = service.manager;
        // An active conversation in the newer store: the stale init must not write its own over it.
        await newer!.createNew('fresh');
        slow.release();
        await first;
        expect(config.getConversationManager()).toBe(newer);
        expect(service.manager).toBe(newer);
        expect(service.activeId()).not.toBeNull();
        expect(service.activeId()).toBe(newer!.activeId);
        service.ngOnDestroy();
    });
});

/** Two saved conversations: `a` started first and changed last, `b` started last and changed first. */
function twoConversations(): AparteStorageAdapter {
    const rows = [
        { id: 'a', title: 'A', createdAt: 1, updatedAt: 30, messages: [] },
        { id: 'b', title: 'B', createdAt: 2, updatedAt: 10, messages: [] },
    ] as unknown as AparteConversation[];
    return { async loadAll() { return rows; }, async save() {}, async delete() {} };
}

describe('ConversationManagerService with orderBy', () => {
    // The service sorted its own lists by the latest change again, whatever the manager was told.
    it('lists in the order the manager was given', async () => {
        const service = new ConversationManagerService();
        await service.init(twoConversations(), new AparteConfig(), { orderBy: 'created' });
        expect(service.activeConversations().map((c) => c.id)).toEqual(['b', 'a']);
        service.ngOnDestroy();
    });
});
