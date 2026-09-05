/**
 * Opening a conversation must not revoke its own attachments' object URLs.
 *
 * `clearAll()` revokes every message's attachment URLs before dropping them — a
 * real leak fix, because nothing else released them. But two of its callers put
 * the messages straight back: `setMessages` and `importTree`. And
 * `ConversationController._load` runs BOTH over one conversation, so the second
 * clear revoked the URLs of the conversation being opened.
 *
 * What makes it certain rather than probable: `MessageRepository.export()` stores
 * live `node.current` references, so `conv.messages` and `conv.tree` are not two
 * copies — they share the very same attachment objects.
 *
 * Result: every image and file chip dead on load, and re-opening revokes twice.
 * Switching away and back was broken too, because a persisted conversation still
 * holds those attachments.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import type { AparteMessage } from '../../../types/index.js';

const BLOB = 'blob:aparte-test-1';

function messageWithAttachment(): AparteMessage {
    return {
        id: 'u1',
        role: 'user',
        content: 'here it is',
        timestamp: Date.now(),
        // `type`, not `mimeType` — the field is named `type` on AparteAttachment, and
        // the test tsconfig caught the fixture being wrong. No cast needed now.
        attachments: [{ id: 'a1', name: 'shot.png', type: 'image/png', size: 10, url: BLOB }],
    };
}

describe('attachment object-URL lifetime', () => {
    let revoked: string[];
    let original: typeof URL.revokeObjectURL;

    beforeEach(() => {
        revoked = [];
        original = URL.revokeObjectURL;
        URL.revokeObjectURL = (url: string) => { revoked.push(url); };
        document.body.innerHTML = '';
    });

    afterEach(() => {
        URL.revokeObjectURL = original;
        document.body.innerHTML = '';
    });

    /** The exact sequence `ConversationController._load` performs. */
    function loadConversation(vp: HTMLElement & { setMessages(m: AparteMessage[]): void; importTree(t: never): void; exportTree(): never }, messages: AparteMessage[]) {
        vp.setMessages([...messages]);
        vp.importTree(vp.exportTree());
    }

    it('a conversation load leaves its own attachment URLs alive', async () => {
        const vp = document.createElement('aparte-chat-viewport') as never as HTMLElement & {
            setMessages(m: AparteMessage[]): void; importTree(t: never): void; exportTree(): never;
            getMessages(): AparteMessage[];
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.setMessages).toBe('function'));

        loadConversation(vp, [messageWithAttachment()]);

        expect(revoked, 'the URL of the conversation being opened must survive').not.toContain(BLOB);
        const url = vp.getMessages()[0]?.attachments?.[0]?.url;
        expect(url, 'and the loaded message still renders it').toBe(BLOB);
    });

    it('re-opening the same conversation does not revoke either', async () => {
        const vp = document.createElement('aparte-chat-viewport') as never as HTMLElement & {
            setMessages(m: AparteMessage[]): void; importTree(t: never): void; exportTree(): never;
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.setMessages).toBe('function'));

        loadConversation(vp, [messageWithAttachment()]);
        loadConversation(vp, [messageWithAttachment()]);

        expect(revoked).not.toContain(BLOB);
    });

    it('an explicit clearAll DOES revoke — there the messages really are gone', async () => {
        const vp = document.createElement('aparte-chat-viewport') as never as HTMLElement & {
            setMessages(m: AparteMessage[]): void; clearAll(): void;
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.setMessages).toBe('function'));

        vp.setMessages([messageWithAttachment()]);
        vp.clearAll();

        // The leak this revoking was added for must stay fixed.
        expect(revoked, 'a reset still releases what it drops').toContain(BLOB);
    });

    it('and revokes the branches too, not just the active path', async () => {
        const vp = document.createElement('aparte-chat-viewport') as never as HTMLElement & {
            setMessages(m: AparteMessage[]): void;
            addSiblingOf(existingId: string, m: AparteMessage): string | null;
            clearAll(): void;
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.setMessages).toBe('function'));

        // A retry forks the transcript: the first reply leaves the active path, taking
        // the file it produced with it. `clearAll` walked head → root, so that object
        // URL became unreachable without ever being released.
        vp.setMessages([
            { id: 'u1', role: 'user', content: 'draw it', timestamp: Date.now() },
            {
                id: 'a1', role: 'assistant', content: 'here', timestamp: Date.now(),
                attachments: [{ id: 'f1', name: 'shot.png', type: 'image/png', size: 10, url: BLOB }],
            },
        ]);
        vp.addSiblingOf('a1', {
            id: 'a2', role: 'assistant', content: 'again', timestamp: Date.now(),
            attachments: [{ id: 'f2', name: 'other.png', type: 'image/png', size: 10, url: 'blob:aparte-test-2' }],
        });
        vp.clearAll();

        expect(revoked, 'the reply the retry replaced').toContain(BLOB);
        expect(revoked, 'and the one that replaced it').toContain('blob:aparte-test-2');
    });
});
