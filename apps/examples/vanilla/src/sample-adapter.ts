/**
 * A storage adapter that takes its time — the shape of a real one, over the sample data.
 *
 * `AparteStorageAdapter` can split what it stores: `loadMeta()` is the list without the
 * messages, `loadFull(id)` is one conversation on demand. A server, IndexedDB or a sync
 * engine answers neither in the same tick, and a page wired to data that arrives at once
 * hides everything that happens in between — the list that is not there yet, the
 * transcript between the click and its messages, two clicks racing each other. This
 * adapter answers after a delay so the site shows those moments; the delays are the
 * only thing it fakes, and `?fast` in the URL sets them to zero for a test.
 *
 * What the manager does with it: `init()` calls `loadMeta()`, `setConversationId(id)`
 * on the controller calls `loadFull(id)` the first time and sets the viewport's
 * `loading` while it waits. Nothing in this file knows about skeletons.
 */
import type { AparteConversation, AparteConversationMeta, AparteStorageAdapter } from '@aparte/core';
import { SAMPLE_CONVERSATIONS } from './sample-conversations';

const fast = new URLSearchParams(location.search).has('fast');

/** A wait of `ms` — none under `?fast`. */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, fast ? 0 : ms));

/** Somewhere between `min` and `max`, so two loads never take the same time. */
const between = (min: number, max: number): number => min + Math.random() * (max - min);

export function createSampleAdapter(): AparteStorageAdapter {
    // Copies of the samples, so a rename or a delete in this session never touches them.
    const rows = new Map<string, AparteConversation>(
        SAMPLE_CONVERSATIONS.map((c): [string, AparteConversation] => [c.id, { ...c, createdAt: c.updatedAt ?? Date.now(), updatedAt: c.updatedAt ?? Date.now(), messages: [...c.messages] }]),
    );
    const meta = ({ messages: _m, tree: _t, ...rest }: AparteConversation): AparteConversationMeta => rest;
    return {
        async loadAll() {
            await wait(600);
            return [...rows.values()];
        },
        async loadMeta() {
            await wait(600);
            return [...rows.values()].map(meta);
        },
        async loadFull(id) {
            await wait(between(300, 800));
            return rows.get(id) ?? null;
        },
        async save(conv) { rows.set(conv.id, conv); },
        async delete(id) { rows.delete(id); },
    };
}
