/**
 * `@aparte/plugin-storage-idb` — conversations kept in the browser, in IndexedDB.
 *
 * An `AparteStorageAdapter` for `AparteConversationManager`, with split storage: the list
 * is read from small rows (`loadMeta`), a conversation's messages only when it is opened
 * (`loadFull`), and an attachment's file is kept in its own store, so a picture a person
 * sent is still there after a reload. No server, no dependency.
 *
 * ```ts
 * import { AparteConversationManager } from '@aparte/core';
 * import { createIdbStorage } from '@aparte/plugin-storage-idb';
 *
 * const manager = new AparteConversationManager(createIdbStorage());
 * await manager.init();
 * ```
 *
 * Three object stores in one database (`aparte` by default):
 *
 * - `conversations` — the meta row (`id`, `title`, dates, `pinnedAt`, `archivedAt`): what
 *   the list needs, so listing never reads a message.
 * - `payloads` — `messages` and the branching `tree`, by conversation id, with every
 *   attachment's `blob` taken out and its session-scoped `blob:` URL dropped.
 * - `attachments` — one row per file, keyed by conversation and attachment, indexed by
 *   message; the file is kept as its bytes, and `loadFull` gives each attachment its `Blob`
 *   back with a fresh object URL.
 */
import type {
    AparteAttachmentRow,
    AparteConversation,
    AparteConversationMeta,
    AparteStorageAdapter,
} from '@aparte/core';

/** Options for {@link createIdbStorage}. */
export interface IdbStorageOptions {
    /**
     * The database name. Two chats on one origin that must not share their
     * conversations take two names.
     * @default 'aparte'
     */
    name?: string;
    /**
     * The `IDBFactory` to open the database with — the page's `indexedDB` by default. A
     * test passes `fake-indexeddb`'s.
     */
    indexedDB?: IDBFactory;
    /**
     * Turns a stored file back into a URL the chat can show, when a conversation is
     * loaded. `URL.createObjectURL` by default; where it does not exist, an attachment comes
     * back with its `blob` and an empty `url` (a `blob:` URL is not kept: it dies with its
     * page). A `blob:` `thumbnailUrl` is not kept either, nor rebuilt.
     */
    objectUrl?: (blob: Blob) => string;
}

/** The adapter {@link createIdbStorage} returns: the storage contract, and `close()`. */
export interface IdbStorage extends Required<Pick<AparteStorageAdapter,
    'loadAll' | 'save' | 'delete' | 'archive' | 'unarchive' | 'loadMeta' | 'loadFull' | 'pin' | 'unpin' | 'rename' | 'loadAttachments'>> {
    /** Close the database connection. The adapter opens it again on its next call. */
    close(): void;
}

const VERSION = 1;
const CONVERSATIONS = 'conversations';
const PAYLOADS = 'payloads';
const ATTACHMENTS = 'attachments';
const BY_MESSAGE = 'byMessage';
const BY_CONVERSATION = 'byConversation';
const SCHEMA_VERSION = 2;

interface PayloadRow {
    id: string;
    messages: AparteConversation['messages'];
    tree?: AparteConversation['tree'];
}

/**
 * An attachment as stored: its bytes, not its `Blob`. Safari's private browsing — and
 * Playwright's WebKit, whose contexts are private — refuses a `Blob` in IndexedDB
 * (`UnknownError`) and takes an `ArrayBuffer`; the `Blob` is built again on the way out.
 */
interface FileRow extends Omit<AparteAttachmentRow, 'blob'> {
    bytes: ArrayBuffer;
}

const rowOf = ({ bytes, ...row }: FileRow): AparteAttachmentRow => ({ ...row, blob: new Blob([bytes], { type: row.mimeType }) });

/** A request's result, as a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * A transaction's end: resolves when it commits, rejects when it aborts or fails. Taken
 * right after the transaction is opened, so the first failure is the one reported.
 */
function committed(tx: IDBTransaction): Promise<void> {
    // Listeners, not `on…` properties: a second waiter on the same transaction must not
    // replace the first.
    const end = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => resolve());
        // A request's error reaches the transaction before `tx.error` is set (at the abort).
        tx.addEventListener('error', (event) => reject((event.target as IDBRequest | null)?.error ?? tx.error));
        tx.addEventListener('abort', () => reject(tx.error ?? new Error('IndexedDB transaction aborted')));
    });
    // Awaited at the end of the work; a rejection before then is not "unhandled".
    end.catch(() => {});
    return end;
}

/**
 * Run `work` inside `tx`, all or nothing: a throw (a value structured clone refuses, a
 * quota) aborts the transaction, so no store keeps half of a write, and the throw is what
 * the caller gets.
 */
async function atomically(tx: IDBTransaction, work: () => Promise<void> | void): Promise<void> {
    const end = committed(tx);
    try {
        await work();
    } catch (error) {
        try { tx.abort(); } catch { /* already finished */ }
        await end.catch(() => {});
        throw error;
    }
    await end;
}

/** The meta row of a conversation: everything but its messages and tree. */
function metaOf({ messages: _messages, tree: _tree, ...meta }: AparteConversation): AparteConversationMeta {
    return { ...meta, schemaVersion: SCHEMA_VERSION };
}

type Json = unknown;
/**
 * A plain object — what a message is made of. A `Date`, a `Map`, a typed array or a `Blob`
 * is not walked into nor rebuilt: structured clone keeps them as they are.
 */
const isRecord = (value: Json): value is Record<string, Json> => {
    if (typeof value !== 'object' || value === null) return false;
    const proto = Object.getPrototypeOf(value) as unknown;
    return proto === Object.prototype || proto === null;
};

/**
 * Every attachment (an object with an `id` in an `attachments` array) found anywhere in a
 * message list or a tree, with the message id it hangs from. The tree's shape is core's,
 * and it nests messages, so the walk is generic rather than tied to it. The same attachment
 * is found twice when a conversation has a tree (its active path is in both); the message
 * list is walked first, so it names the message.
 */
function attachmentsIn(root: Json, found: Array<{ attachment: Record<string, Json>; msgId: string }> = [], msgId = ''): typeof found {
    if (Array.isArray(root)) {
        for (const item of root) attachmentsIn(item, found, msgId);
    } else if (isRecord(root)) {
        const here = typeof root.id === 'string' && Array.isArray(root.attachments) ? root.id : msgId;
        for (const [key, value] of Object.entries(root)) {
            if (key === 'attachments' && Array.isArray(value)) {
                for (const a of value) if (isRecord(a) && typeof a.id === 'string') found.push({ attachment: a, msgId: here });
            } else {
                attachmentsIn(value, found, here);
            }
        }
    }
    return found;
}

/**
 * A copy of `value` without the attachments' files: `blob` goes to its own store, and a
 * `blob:` URL dies with the page that made it, so it is not kept either.
 */
function withoutFiles<T>(value: T): T {
    if (Array.isArray(value)) return value.map(withoutFiles) as T;
    if (!isRecord(value)) return value;
    const copy: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === 'attachments' && Array.isArray(item)) {
            copy[key] = item.map((a) => {
                if (!isRecord(a) || !(a.blob instanceof Blob)) return withoutFiles(a);
                const { blob: _blob, ...rest } = a;
                if (typeof rest.url === 'string' && rest.url.startsWith('blob:')) rest.url = '';
                if (typeof rest.thumbnailUrl === 'string' && rest.thumbnailUrl.startsWith('blob:')) delete rest.thumbnailUrl;
                return rest;
            });
        } else {
            copy[key] = withoutFiles(item);
        }
    }
    return copy as T;
}

/**
 * Create an IndexedDB storage adapter for `AparteConversationManager`. The database opens on
 * the first call, not here, so creating the adapter during a server render is harmless.
 */
export function createIdbStorage(options: IdbStorageOptions = {}): IdbStorage {
    const name = options.name ?? 'aparte';
    const objectUrl = options.objectUrl
        ?? (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? (blob: Blob) => URL.createObjectURL(blob) : undefined);
    let opening: Promise<IDBDatabase> | undefined;

    const db = (): Promise<IDBDatabase> => {
        if (opening) return opening;
        const factory = options.indexedDB ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
        if (!factory) return Promise.reject(new Error('[aparte] storage-idb: this environment has no IndexedDB.'));
        const request = factory.open(name, VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(CONVERSATIONS)) database.createObjectStore(CONVERSATIONS, { keyPath: 'id' });
            if (!database.objectStoreNames.contains(PAYLOADS)) database.createObjectStore(PAYLOADS, { keyPath: 'id' });
            if (!database.objectStoreNames.contains(ATTACHMENTS)) {
                // Keyed by conversation AND attachment: a conversation copied into another
                // with the same attachment ids keeps its own files.
                const files = database.createObjectStore(ATTACHMENTS, { keyPath: ['convId', 'id'] });
                files.createIndex(BY_MESSAGE, 'msgId');
                files.createIndex(BY_CONVERSATION, 'convId');
            }
        };
        opening = done(request).then((database) => {
            // Another tab upgrading the schema asks this one to let go, so it is not blocked.
            database.onversionchange = () => { database.close(); opening = undefined; };
            database.onclose = () => { opening = undefined; };
            return database;
        }, (error: unknown) => {
            opening = undefined;
            throw error;
        });
        return opening;
    };

    /**
     * For each file, the conversations this adapter knows hold it in the database — as it
     * came back from it or went into it — so saving a conversation again does not rewrite
     * it. By conversation: the same `Blob` in a copy of a conversation is that copy's to
     * store. A row found missing is written again whatever this says (see `save`).
     */
    const inStore = new WeakMap<Blob, Set<string>>();
    const known = (blob: Blob, convId: string) => inStore.get(blob)?.has(convId) ?? false;
    const remember = (blob: Blob, convId: string) => {
        const holders = inStore.get(blob) ?? new Set<string>();
        holders.add(convId);
        inStore.set(blob, holders);
    };

    /** Give each stored attachment of a conversation its file and a URL for this page. */
    const rehydrate = (conv: AparteConversation, rows: AparteAttachmentRow[]): AparteConversation => {
        if (rows.length === 0) return conv;
        const byId = new Map(rows.map((row) => [row.id, row]));
        const urls = new Map<string, string>();
        for (const { attachment } of attachmentsIn([conv.messages, conv.tree])) {
            const row = byId.get(attachment.id as string);
            if (!row) continue;
            remember(row.blob, conv.id);
            attachment.blob = row.blob;
            if (objectUrl) {
                if (!urls.has(row.id)) urls.set(row.id, objectUrl(row.blob));
                attachment.url = urls.get(row.id)!;
            }
        }
        return conv;
    };

    const updateMeta = async (id: string, change: (meta: AparteConversationMeta) => void): Promise<void> => {
        const tx = (await db()).transaction(CONVERSATIONS, 'readwrite');
        await atomically(tx, async () => {
            const store = tx.objectStore(CONVERSATIONS);
            const meta = await done(store.get(id) as IDBRequest<AparteConversationMeta | undefined>);
            if (meta) {
                change(meta);
                store.put(meta);
            }
        });
    };

    const loadMeta = async (): Promise<AparteConversationMeta[]> => {
        const tx = (await db()).transaction(CONVERSATIONS, 'readonly');
        const rows = await done(tx.objectStore(CONVERSATIONS).getAll() as IDBRequest<AparteConversationMeta[]>);
        return rows.sort((a, b) => b.updatedAt - a.updatedAt);
    };

    const loadFull = async (id: string): Promise<AparteConversation | null> => {
        const tx = (await db()).transaction([CONVERSATIONS, PAYLOADS, ATTACHMENTS], 'readonly');
        const [meta, payload, rows] = await Promise.all([
            done(tx.objectStore(CONVERSATIONS).get(id) as IDBRequest<AparteConversationMeta | undefined>),
            done(tx.objectStore(PAYLOADS).get(id) as IDBRequest<PayloadRow | undefined>),
            done(tx.objectStore(ATTACHMENTS).index(BY_CONVERSATION).getAll(id) as IDBRequest<FileRow[]>),
        ]);
        if (!meta) return null;
        const conv: AparteConversation = { ...meta, messages: payload?.messages ?? [] };
        if (payload?.tree) conv.tree = payload.tree;
        return rehydrate(conv, rows.map(rowOf));
    };

    return {
        loadMeta,
        loadFull,

        async loadAll() {
            const metas = await loadMeta();
            const all = await Promise.all(metas.map((meta) => loadFull(meta.id)));
            return all.filter((conv): conv is AparteConversation => conv !== null);
        },

        async save(conv) {
            // Each attachment once (a conversation with a tree has its active path twice),
            // named by the first message it was found in.
            const found = new Map<string, { attachment: Record<string, Json>; msgId: string }>();
            for (const entry of attachmentsIn([conv.messages, conv.tree])) {
                if (!found.has(entry.attachment.id as string)) found.set(entry.attachment.id as string, entry);
            }
            // Which files this conversation has in the database now, then the bytes of every
            // file it lacks or holds in a version this adapter did not store — read BEFORE the
            // write: awaiting anything but an IndexedDB request inside a transaction lets it
            // commit.
            const database = await db();
            const read = database.transaction(ATTACHMENTS, 'readonly');
            const rows = new Set((await done(read.objectStore(ATTACHMENTS).index(BY_CONVERSATION).getAllKeys(conv.id)))
                .map((key) => String((key as [string, string])[1])));
            const bytes = new Map<string, ArrayBuffer>();
            await Promise.all([...found].map(async ([id, { attachment }]) => {
                const blob = attachment.blob;
                if (blob instanceof Blob && !(rows.has(id) && known(blob, conv.id))) bytes.set(id, await blob.arrayBuffer());
            }));
            const tx = database.transaction([CONVERSATIONS, PAYLOADS, ATTACHMENTS], 'readwrite');
            await atomically(tx, async () => {
                tx.objectStore(CONVERSATIONS).put(metaOf(conv));
                const payload: PayloadRow = { id: conv.id, messages: withoutFiles(conv.messages) };
                if (conv.tree) payload.tree = withoutFiles(conv.tree);
                tx.objectStore(PAYLOADS).put(payload);

                const attachments = tx.objectStore(ATTACHMENTS);
                const stored = new Set((await done(attachments.index(BY_CONVERSATION).getAllKeys(conv.id)))
                    .map((key) => String((key as [string, string])[1])));
                const written: Blob[] = [];
                for (const [id, { attachment, msgId }] of found) {
                    const blob = attachment.blob;
                    const data = bytes.get(id);
                    // A file already stored is not written again; one held without its blob
                    // (saved before, loaded back without it) keeps its row.
                    if (!(blob instanceof Blob) || !data) continue;
                    const row: FileRow = {
                        id,
                        convId: conv.id,
                        msgId,
                        name: typeof attachment.name === 'string' ? attachment.name : '',
                        mimeType: typeof attachment.type === 'string' && attachment.type ? attachment.type : blob.type,
                        size: typeof attachment.size === 'number' ? attachment.size : blob.size,
                        bytes: data,
                    };
                    attachments.put(row);
                    written.push(blob);
                }
                // A file whose attachment left the conversation (a message edited or deleted)
                // goes with it.
                for (const id of stored) if (!found.has(id)) attachments.delete([conv.id, id]);
                // Counted as stored once the transaction commits, not before.
                void committed(tx).then(() => { for (const blob of written) remember(blob, conv.id); }, () => {});
            });
        },

        async delete(id) {
            const tx = (await db()).transaction([CONVERSATIONS, PAYLOADS, ATTACHMENTS], 'readwrite');
            await atomically(tx, async () => {
                tx.objectStore(CONVERSATIONS).delete(id);
                tx.objectStore(PAYLOADS).delete(id);
                const attachments = tx.objectStore(ATTACHMENTS);
                for (const key of await done(attachments.index(BY_CONVERSATION).getAllKeys(id))) attachments.delete(key);
            });
        },

        archive: (id) => updateMeta(id, (meta) => { meta.archivedAt = Date.now(); }),
        unarchive: (id) => updateMeta(id, (meta) => { delete meta.archivedAt; }),
        pin: (id) => updateMeta(id, (meta) => { meta.pinnedAt = Date.now(); }),
        unpin: (id) => updateMeta(id, (meta) => { delete meta.pinnedAt; }),
        // A title the person typed: no longer the manager's to change, after a reload too.
        rename: (id, title) => updateMeta(id, (meta) => { meta.title = title; (meta as AparteConversation).autoTitle = false; }),

        // Every file stored under that message id — in a copy of a conversation that kept its
        // message ids, the copy's too.
        async loadAttachments(msgId) {
            const tx = (await db()).transaction(ATTACHMENTS, 'readonly');
            return (await done(tx.objectStore(ATTACHMENTS).index(BY_MESSAGE).getAll(msgId) as IDBRequest<FileRow[]>)).map(rowOf);
        },

        close() {
            void opening?.then((database) => database.close(), () => {});
            opening = undefined;
        },
    };
}
