/**
 * The IndexedDB adapter, against fake-indexeddb, alone and behind the real
 * `AparteConversationManager`: what a person did is there after a reload — the list, the
 * messages, the branches, the files they attached, a pin, a title they typed — and nothing
 * the list does not need is read to draw it.
 */
import { describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { AparteConversationManager } from '@aparte/core';
import type { AparteConversation, AparteMessage } from '@aparte/core';
import { createIdbStorage } from '../index.js';

const fresh = () => new IDBFactory();
const msg = (id: string, content: string, extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id, role: 'user', content, timestamp: 1, ...extra }) as AparteMessage;
const conv = (id: string, updatedAt: number, messages: AparteMessage[] = []): AparteConversation =>
    ({ id, title: id, createdAt: updatedAt, updatedAt, messages });

describe('createIdbStorage', () => {
    it('keeps a conversation across a reload, and lists newest first without its messages', async () => {
        const idb = fresh();
        const first = createIdbStorage({ indexedDB: idb });
        await first.save(conv('old', 1, [msg('m1', 'hello')]));
        await first.save(conv('new', 2, [msg('m2', 'again')]));
        first.close();

        const second = createIdbStorage({ indexedDB: idb });
        const metas = await second.loadMeta();
        expect(metas.map((m) => m.id)).toEqual(['new', 'old']);
        expect(metas[0]).not.toHaveProperty('messages');
        expect(metas[0]!.schemaVersion).toBe(2);
        expect((await second.loadFull('old'))!.messages).toEqual([msg('m1', 'hello')]);
        expect((await second.loadAll()).map((c) => c.id)).toEqual(['new', 'old']);
        expect(await second.loadFull('missing')).toBeNull();
    });

    it('keeps a branching tree as it was saved', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        const tree = { headId: 'b', messages: [{ message: msg('a', 'one'), parentId: null }, { message: msg('b', 'two'), parentId: 'a' }] };
        await storage.save({ ...conv('c', 1, [msg('a', 'one'), msg('b', 'two')]), tree } as AparteConversation);
        expect((await storage.loadFull('c'))!.tree).toEqual(tree);
    });

    it('keeps an attached file as a file, and gives it a URL for this page when it is loaded', async () => {
        const idb = fresh();
        const blob = new Blob(['a picture'], { type: 'image/png' });
        const attachment = { id: 'f1', name: 'photo.png', type: 'image/png', url: 'blob:session/1', size: blob.size, blob };
        await createIdbStorage({ indexedDB: idb }).save(conv('c', 1, [msg('m1', 'look', { attachments: [attachment] } as Partial<AparteMessage>)]));

        const objectUrl = vi.fn((b: Blob) => `blob:reloaded/${b.size}`);
        const reloaded = createIdbStorage({ indexedDB: idb, objectUrl });
        const back = (await reloaded.loadFull('c'))!.messages[0]!.attachments![0]!;
        expect(back.url).toBe(`blob:reloaded/${blob.size}`);
        expect(await back.blob!.text()).toBe('a picture');
        expect(back.name).toBe('photo.png');

        const rows = await reloaded.loadAttachments('m1');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'f1', convId: 'c', msgId: 'm1', name: 'photo.png', mimeType: 'image/png', size: blob.size });
    });

    it('does not keep a blob: URL without its file, and keeps any other URL', async () => {
        const storage = createIdbStorage({ indexedDB: fresh(), objectUrl: () => 'blob:new' });
        const remote = { id: 'r', name: 'doc.pdf', type: 'application/pdf', url: 'https://example.com/doc.pdf' };
        await storage.save(conv('c', 1, [msg('m', 'two files', { attachments: [remote] } as Partial<AparteMessage>)]));
        expect((await storage.loadFull('c'))!.messages[0]!.attachments).toEqual([remote]);
    });

    it('drops a file once its attachment left the conversation, and keeps one still named without its file in hand', async () => {
        const storage = createIdbStorage({ indexedDB: fresh(), objectUrl: () => 'blob:x' });
        const a = { id: 'a', name: 'a.txt', type: 'text/plain', url: '', blob: new Blob(['a']) };
        const b = { id: 'b', name: 'b.txt', type: 'text/plain', url: '', blob: new Blob(['b']) };
        await storage.save(conv('c', 1, [msg('m1', 'x', { attachments: [a] } as Partial<AparteMessage>), msg('m2', 'y', { attachments: [b] } as Partial<AparteMessage>)]));

        // Saved again: m1's file is referenced but not in hand, m2 was deleted.
        const { blob: _drop, ...aWithoutFile } = a;
        await storage.save(conv('c', 2, [msg('m1', 'x', { attachments: [aWithoutFile] } as Partial<AparteMessage>)]));
        expect(await storage.loadAttachments('m1')).toHaveLength(1);
        expect(await storage.loadAttachments('m2')).toHaveLength(0);
    });

    it('writes all of a save or nothing: a message structured clone refuses leaves the stored conversation as it was', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        await storage.save({ ...conv('c', 1, [msg('m', 'old')]), title: 'OLD' });
        const bad = msg('m', 'new', { metadata: { notData: () => 1 } } as Partial<AparteMessage>);
        await expect(storage.save({ ...conv('c', 99, [bad]), title: 'NEW' })).rejects.toBeTruthy();
        const after = (await storage.loadFull('c'))!;
        expect(after.title).toBe('OLD');
        expect(after.updatedAt).toBe(1);
        expect(after.messages[0]!.content).toBe('old');
    });

    it('keeps the files of two conversations apart, even under the same attachment id', async () => {
        const storage = createIdbStorage({ indexedDB: fresh(), objectUrl: () => 'blob:x' });
        const file = (text: string) => ({ id: 'same', name: 'f.txt', type: 'text/plain', url: '', blob: new Blob([text]) });
        await storage.save(conv('a', 1, [msg('ma', 'x', { attachments: [file('from a')] } as Partial<AparteMessage>)]));
        await storage.save(conv('b', 2, [msg('mb', 'x', { attachments: [file('from b')] } as Partial<AparteMessage>)]));
        await storage.delete('b');
        const a = (await storage.loadFull('a'))!.messages[0]!.attachments![0]!;
        expect(await a.blob!.text()).toBe('from a');
    });

    it('keeps a Date, a typed array or a Map in a message as they are', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        const metadata = { at: new Date(5), bytes: new Uint8Array([1, 2]), tags: new Map([['k', 'v']]) };
        await storage.save(conv('c', 1, [msg('m', 'x', { metadata } as Partial<AparteMessage>)]));
        const back = (await storage.loadFull('c'))!.messages[0]!.metadata as typeof metadata;
        expect(back.at).toBeInstanceOf(Date);
        expect(back.at.getTime()).toBe(5);
        expect(Array.from(back.bytes)).toEqual([1, 2]);
        expect(back.tags.get('k')).toBe('v');
    });

    it('does not write a stored file again when the conversation is saved again, nor twice for its tree', async () => {
        const idb = fresh();
        const storage = createIdbStorage({ indexedDB: idb, objectUrl: () => 'blob:x' });
        const file = { id: 'f', name: 'f.png', type: 'image/png', url: '', blob: new Blob(['png']) };
        const message = msg('m', 'x', { attachments: [file] } as Partial<AparteMessage>);
        const put = vi.spyOn(IDBObjectStore.prototype, 'put');
        const filePuts = () => put.mock.contexts.filter((store) => (store as IDBObjectStore).name === 'attachments').length;

        await storage.save({ ...conv('c', 1, [message]), tree: { headId: 'm', messages: [{ message, parentId: null }] } } as AparteConversation);
        expect(filePuts()).toBe(1);
        const loaded = (await storage.loadFull('c'))!;
        put.mockClear();
        await storage.save({ ...loaded, messages: [...loaded.messages, msg('m2', 'more')], updatedAt: 2 });
        expect(filePuts()).toBe(0);
        put.mockRestore();
    });

    it('deletes a conversation with its messages and its files', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        const file = { id: 'f', name: 'f', type: 'text/plain', url: '', blob: new Blob(['f']) };
        await storage.save(conv('c', 1, [msg('m', 'x', { attachments: [file] } as Partial<AparteMessage>)]));
        await storage.delete('c');
        expect(await storage.loadMeta()).toEqual([]);
        expect(await storage.loadFull('c')).toBeNull();
        expect(await storage.loadAttachments('m')).toEqual([]);
    });

    it('pins, archives and renames without touching the messages or the date', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        await storage.save({ ...conv('c', 5, [msg('m', 'kept')]), autoTitle: true });
        await storage.pin('c');
        await storage.archive('c');
        await storage.rename('c', 'My title');
        let full = (await storage.loadFull('c'))!;
        expect(full.pinnedAt).toBeTypeOf('number');
        expect(full.archivedAt).toBeTypeOf('number');
        expect(full.title).toBe('My title');
        expect(full.autoTitle).toBe(false);
        expect(full.updatedAt).toBe(5);
        expect(full.messages).toEqual([msg('m', 'kept')]);

        await storage.unpin('c');
        await storage.unarchive('c');
        full = (await storage.loadFull('c'))!;
        expect(full).not.toHaveProperty('pinnedAt');
        expect(full).not.toHaveProperty('archivedAt');
        // A hook on a conversation that is not there changes nothing and does not throw.
        await expect(storage.pin('missing')).resolves.toBeUndefined();
    });

    it('keeps two databases apart by name', async () => {
        const idb = fresh();
        await createIdbStorage({ indexedDB: idb, name: 'support' }).save(conv('s', 1));
        expect(await createIdbStorage({ indexedDB: idb, name: 'shop' }).loadMeta()).toEqual([]);
    });

    it('says so, on the call, where there is no IndexedDB — and creating it costs nothing', async () => {
        const storage = createIdbStorage();
        await expect(storage.loadMeta()).rejects.toThrow(/no IndexedDB/);
    });

    it('lets another tab upgrade the database instead of blocking it', async () => {
        const idb = fresh();
        const storage = createIdbStorage({ indexedDB: idb, name: 'shared' });
        await storage.save(conv('c', 1));
        // Another tab opens a later version: this connection closes rather than block it.
        const upgrade = idb.open('shared', 2);
        const blocked = vi.fn();
        upgrade.onblocked = blocked;
        const other = await new Promise<IDBDatabase>((resolve, reject) => { upgrade.onsuccess = () => resolve(upgrade.result); upgrade.onerror = () => reject(upgrade.error); });
        expect(blocked).not.toHaveBeenCalled();
        other.close();
    });

    it('rejects the call when the database cannot open, and tries again on the next one', async () => {
        const idb = fresh();
        // A database already at a later version than the adapter's: opening it at 1 fails.
        await new Promise<void>((resolve) => { const r = idb.open('ahead', 3); r.onsuccess = () => { r.result.close(); resolve(); }; });
        const storage = createIdbStorage({ indexedDB: idb, name: 'ahead' });
        await expect(storage.loadMeta()).rejects.toBeTruthy();
        await expect(storage.loadMeta()).rejects.toBeTruthy();
    });

    it('opens again after close()', async () => {
        const storage = createIdbStorage({ indexedDB: fresh() });
        await storage.save(conv('c', 1));
        storage.close();
        expect((await storage.loadMeta()).map((m) => m.id)).toEqual(['c']);
    });
});

describe('behind AparteConversationManager', () => {
    it('lists from the meta rows, opens a conversation on demand, and keeps what the person did after a reload', async () => {
        const idb = fresh();
        const manager = new AparteConversationManager(createIdbStorage({ indexedDB: idb }));
        await manager.init();
        const created = await manager.createNew();
        await manager.addMessage(created.id, msg('m1', 'Where is my order?'));
        await manager.pin(created.id);
        await manager.updateTitle(created.id, 'Order question');

        const storage = createIdbStorage({ indexedDB: idb });
        const loadFull = vi.spyOn(storage, 'loadFull');
        const reloaded = new AparteConversationManager(storage);
        await reloaded.init();
        const row = reloaded.conversations.find((c) => c.id === created.id)!;
        expect(row.title).toBe('Order question');
        expect(row.pinnedAt).toBeTypeOf('number');
        // The list was drawn without reading a message.
        expect(loadFull).not.toHaveBeenCalled();

        expect(await reloaded.ensureFull(created.id)).toBe(true);
        expect(reloaded.conversations.find((c) => c.id === created.id)!.messages.map((m) => m.content)).toEqual(['Where is my order?']);
        expect(loadFull).toHaveBeenCalledTimes(1);
    });
});
