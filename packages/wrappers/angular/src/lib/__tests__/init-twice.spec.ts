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
