/**
 * The sidebar row is a list entry, not a product's conversation table. What it
 * renders is a title, the two timestamps it sorts on, and the two flags that
 * move a row (archived, pinned) — so those are the keys the meta row declares.
 * A folder id, a cached preview, a message count and a token total were fields
 * nothing in the library ever read; an adapter that wants them puts them on its
 * own row type.
 */
import { describe, expect, it } from 'vitest';
import type { AparteConversation, AparteConversationMeta } from '../types.js';

describe('the meta row carries only what the list reads', () => {
    it('takes the keys the sidebar renders', () => {
        const meta: AparteConversationMeta = {
            id: 'c1',
            title: 'Trip to Lisbon',
            createdAt: 1,
            updatedAt: 2,
            archivedAt: 3,
            pinnedAt: 4,
            schemaVersion: 2,
        };

        expect(Object.keys(meta)).toEqual(['id', 'title', 'createdAt', 'updatedAt', 'archivedAt', 'pinnedAt', 'schemaVersion']);
    });

    it('refuses a folder id, a cached preview, a message count and a token total', () => {
        const row = { id: 'c1', title: 'Trip to Lisbon', createdAt: 1, updatedAt: 2 };

        // @ts-expect-error a folder id is the app's own organisation, not a list entry
        const withFolder: AparteConversationMeta = { ...row, folderId: 'f1' };
        // @ts-expect-error the list reads the conversation for its preview
        const withPreview: AparteConversationMeta = { ...row, lastMessagePreview: 'hello' };
        // @ts-expect-error nothing in the library renders a message count
        const withCount: AparteConversationMeta = { ...row, messageCount: 3 };
        // @ts-expect-error usage totals live on a message, not on the row
        const withTokens: AparteConversationMeta = { ...row, totalTokens: 42 };

        expect([withFolder, withPreview, withCount, withTokens].map((m) => m.title)).toEqual(Array(4).fill('Trip to Lisbon'));
    });

    it('refuses a folder id on the conversation itself', () => {
        const conv: AparteConversation = {
            id: 'c1',
            title: 'Trip to Lisbon',
            createdAt: 1,
            updatedAt: 2,
            messages: [],
            // @ts-expect-error a folder id is the app's own organisation, not a stored conversation
            folderId: 'f1',
        };

        expect(conv.messages).toEqual([]);
    });
});
