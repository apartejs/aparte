/**
 * `@aparte/plugin-storage-idb` — conversations kept in the browser, in IndexedDB.
 *
 * An `AparteStorageAdapter` for `AparteConversationManager`, with split storage: the list
 * is read from small rows (`loadMeta`), a conversation's messages only when it is opened
 * (`loadFull`), and an attachment's file is kept as a `Blob` in its own store, so a
 * picture a person sent is still there after a reload. No server, no dependency.
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
 * - `attachments` — one `AparteAttachmentRow` per file, indexed by message and by
 *   conversation; `loadFull` gives each attachment a fresh object URL from it.
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
     * loaded. `URL.createObjectURL` by default; where it does not exist, attachments come
     * back with their `blob` and the URL they were saved with.
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

/** A request's result, as a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** A transaction's end: resolves when it commits, rejects when it aborts or fails. */
function committed(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

/** The meta row of a conversation: everything but its messages and tree. */
function metaOf({ messages: _messages, tree: _tree, ...meta }: AparteConversation): AparteConversationMeta {
    return { ...meta, schemaVersion: SCHEMA_VERSION };
}

type Json = unknown;
const isRecord = (value: Json): value is Record<string, Json> =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Blob);

/**
 * Every attachment (an object with an `id` in an `attachments` array) found anywhere in a
 * message list or a tree, with the message id it hangs from. The tree's shape is core's,
 * and it nests messages, so the walk is generic rather than tied to it.
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
                const files = database.createObjectStore(ATTACHMENTS, { keyPath: 'id' });
                files.createIndex(BY_MESSAGE, 'msgId');
                files.createIndex(BY_CONVERSATION, 'convId');
            }
        };
        opening = done(request).then((database) => {
            // Another tab upgrading the schema asks this one to let go; the next call reopens.
            database.onversionchange = () => { database.close(); opening = undefined; };
            database.onclose = () => { opening = undefined; };
            return database;
        }, (error: unknown) => {
            opening = undefined;
            throw error;
        });
        return opening;
    };

    /** Give each stored attachment of a conversation its file and a URL for this page. */
    const rehydrate = (conv: AparteConversation, rows: AparteAttachmentRow[]): AparteConversation => {
        if (rows.length === 0) return conv;
        const byId = new Map(rows.map((row) => [row.id, row]));
        const urls = new Map<string, string>();
        for (const { attachment } of attachmentsIn([conv.messages, conv.tree])) {
            const row = byId.get(attachment.id as string);
            if (!row) continue;
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
        const store = tx.objectStore(CONVERSATIONS);
        const meta = await done(store.get(id) as IDBRequest<AparteConversationMeta | undefined>);
        if (meta) {
            change(meta);
            store.put(meta);
        }
        await committed(tx);
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
            done(tx.objectStore(ATTACHMENTS).index(BY_CONVERSATION).getAll(id) as IDBRequest<AparteAttachmentRow[]>),
        ]);
        if (!meta) return null;
        const conv: AparteConversation = { ...meta, messages: payload?.messages ?? [] };
        if (payload?.tree) conv.tree = payload.tree;
        return rehydrate(conv, rows);
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
            const files = attachmentsIn([conv.messages, conv.tree])
                .filter(({ attachment }) => attachment.blob instanceof Blob);
            const tx = (await db()).transaction([CONVERSATIONS, PAYLOADS, ATTACHMENTS], 'readwrite');
            tx.objectStore(CONVERSATIONS).put(metaOf(conv));
            const payload: PayloadRow = { id: conv.id, messages: withoutFiles(conv.messages) };
            if (conv.tree) payload.tree = withoutFiles(conv.tree);
            tx.objectStore(PAYLOADS).put(payload);

            const attachments = tx.objectStore(ATTACHMENTS);
            const kept = new Set<string>();
            for (const { attachment, msgId } of files) {
                const blob = attachment.blob as Blob;
                kept.add(attachment.id as string);
                const row: AparteAttachmentRow = {
                    id: attachment.id as string,
                    convId: conv.id,
                    msgId,
                    name: typeof attachment.name === 'string' ? attachment.name : '',
                    mimeType: typeof attachment.type === 'string' && attachment.type ? attachment.type : blob.type,
                    size: typeof attachment.size === 'number' ? attachment.size : blob.size,
                    blob,
                };
                attachments.put(row);
            }
            // A file whose attachment left the conversation (a message edited or deleted)
            // goes with it. An attachment still referenced without its blob in hand — saved
            // before, loaded back without it — keeps its row.
            const referenced = new Set(attachmentsIn([conv.messages, conv.tree]).map(({ attachment }) => attachment.id as string));
            const stored = await done(attachments.index(BY_CONVERSATION).getAllKeys(conv.id));
            for (const key of stored) if (!kept.has(String(key)) && !referenced.has(String(key))) attachments.delete(key);
            await committed(tx);
        },

        async delete(id) {
            const tx = (await db()).transaction([CONVERSATIONS, PAYLOADS, ATTACHMENTS], 'readwrite');
            tx.objectStore(CONVERSATIONS).delete(id);
            tx.objectStore(PAYLOADS).delete(id);
            const attachments = tx.objectStore(ATTACHMENTS);
            for (const key of await done(attachments.index(BY_CONVERSATION).getAllKeys(id))) attachments.delete(key);
            await committed(tx);
        },

        archive: (id) => updateMeta(id, (meta) => { meta.archivedAt = Date.now(); }),
        unarchive: (id) => updateMeta(id, (meta) => { delete meta.archivedAt; }),
        pin: (id) => updateMeta(id, (meta) => { meta.pinnedAt = Date.now(); }),
        unpin: (id) => updateMeta(id, (meta) => { delete meta.pinnedAt; }),
        // A title the person typed: no longer the manager's to change, after a reload too.
        rename: (id, title) => updateMeta(id, (meta) => { meta.title = title; (meta as AparteConversation).autoTitle = false; }),

        async loadAttachments(msgId) {
            const tx = (await db()).transaction(ATTACHMENTS, 'readonly');
            return done(tx.objectStore(ATTACHMENTS).index(BY_MESSAGE).getAll(msgId) as IDBRequest<AparteAttachmentRow[]>);
        },

        close() {
            void opening?.then((database) => database.close(), () => {});
            opening = undefined;
        },
    };
}
