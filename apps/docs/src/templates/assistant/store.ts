/**
 * The Assistant's storage: an in-memory `AparteStorageAdapter` over the seeded conversations.
 *
 * The library's conversation manager reads and writes through it — the list, a rename or a
 * delete from a row's menu, every finished turn — so swapping it for a real store (IndexedDB,
 * your API) is the only change a real app makes here. It keeps what this visit does and forgets
 * it on reload.
 */
import type { AparteConversation, AparteStorageAdapter } from '@aparte/core';

export function createMemoryStore(seed: AparteConversation[]): AparteStorageAdapter {
    // Copies, so a rename or a delete never touches the seed.
    const rows = new Map(seed.map((c): [string, AparteConversation] => [c.id, { ...c, messages: [...c.messages] }]));
    return {
        async loadAll() {
            return [...rows.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        },
        async save(conversation) {
            rows.set(conversation.id, conversation);
        },
        async delete(id) {
            rows.delete(id);
        },
    };
}
