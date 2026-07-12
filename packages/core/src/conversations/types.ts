import type { AparteMessage } from '../types/index.js';
import type { ExportedMessageRepository } from '../runtime/message-repository.js';

/**
 * Current schema version for `AparteConversation`. Bump when the persisted
 * shape evolves so adapters / migrations can branch on it.
 *
 * v1: monolithic — `messages[]` inline on the conversation row, attachment
 *     `url` was a session-scoped blob URL (lost on reload), artifacts inline
 *     in segments only.
 * v2: split — meta-only conversation row; messages, attachments (with real
 *     `Blob`s), artifacts (gallery index), memory facts and settings each
 *     get their own table. Sidebar can list without loading full payloads.
 */
export const APARTE_CONVERSATION_SCHEMA_VERSION = 2 as const;

/**
 * A single conversation (thread) — framework-agnostic.
 */
export interface AparteConversation {
    id: string;
    /** Auto-generated from the first user message (≤50 chars). */
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: AparteMessage[];
    /**
     * Full branching tree snapshot. When present, the conversation has branch
     * history (edits, retries, sibling responses) and is loaded via `importTree`
     * rather than the flat `messages` array.
     *
     * `messages` always mirrors the active path for backward-compatibility
     * (sidebar previews, title generation, adapters that only read flat arrays).
     */
    tree?: ExportedMessageRepository;
    /** When truthy the conversation is archived (hidden from the main list). */
    archivedAt?: number;
    /** When truthy the conversation is pinned at the top of the list. */
    pinnedAt?: number;
    /** Optional folder/tag id for organisation (V2+). */
    folderId?: string;
    /**
     * Schema version of this record. Absent on legacy data (pre-versioning):
     * adapters should treat `undefined` as version 0 and migrate on read.
     */
    schemaVersion?: number;
}

/**
 * Lightweight conversation meta — what's needed to render the sidebar without
 * loading the full message history. Returned by `loadMeta()` and stored as a
 * dedicated row by split-storage adapters.
 */
export interface AparteConversationMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    archivedAt?: number;
    pinnedAt?: number;
    folderId?: string;
    /** Truncated last message body (≤200 chars) — for sidebar previews. */
    lastMessagePreview?: string;
    /** Cached message count for the sidebar badge / archive logic. */
    messageCount?: number;
    /** Sum of input+output tokens across messages, when available. */
    totalTokens?: number;
    /** Persisted schema version of the row. */
    schemaVersion?: number;
}

/**
 * Memory fact — durable user facts stored across all conversations.
 * Surfaces in the memory panel and is consulted by the orchestrator to
 * personalise replies.
 */
export interface AparteMemoryFact {
    id: string;
    /** Coarse category — drives the icon/colour in the panel. */
    type: 'identity' | 'fact' | 'preference' | 'tech' | 'project' | 'style';
    content: string;
    /** Where the fact came from. `auto` = regex-detected, `manual` = user input. */
    source?: 'manual' | 'auto' | 'onboarding';
    addedAt: number;
    /** Last time the fact was selected as relevant for a reply. */
    lastUsedAt?: number;
    /** Conversation that produced an auto-detected fact (for traceability). */
    sourceConvId?: string;
    /** Message inside `sourceConvId` that triggered the auto-detection. */
    sourceMsgId?: string;
}

/**
 * Artifact gallery row — denormalised index of every artifact segment ever
 * produced, so the gallery can list/filter without scanning every message.
 * The source of truth remains the artifact segment inside its message; this
 * row is rebuilt by the storage adapter on every save.
 */
export interface AparteArtifactRow {
    id: string;
    convId: string;
    msgId: string;
    name: string;
    mimeType: string;
    artifactType: string;
    /** Full body — duplicated from the source segment for fast gallery preview. */
    content: string;
    title?: string;
    /** Snapshot of the message timestamp; used for "newest first" gallery sort. */
    updatedAt: number;
}

/**
 * Persisted attachment with the actual Blob — survives page reloads, unlike
 * the session-scoped `URL.createObjectURL()` stored on `AparteMessage`.
 * Adapters that split storage MUST keep the blob here and reconstruct the
 * `url` on demand.
 */
export interface AparteAttachmentRow {
    id: string;
    convId: string;
    msgId: string;
    name: string;
    mimeType: string;
    size: number;
    blob: Blob;
}

/**
 * Implement this interface to provide persistence for conversations.
 * All methods are async so any backend (IndexedDB, SQLite WASM, REST API…)
 * can be used. The ConversationManager never touches storage directly.
 *
 * The first three methods (`loadAll`, `save`, `delete`) form the minimum
 * viable adapter — everything else is optional and lets richer backends
 * expose split-storage features (fast meta listing, memory, settings,
 * artifact gallery, attachment blobs).
 */
export interface AparteStorageAdapter {
    /** Return all stored conversations (full payload), ordered by updatedAt desc. */
    loadAll(): Promise<AparteConversation[]>;
    /** Upsert a conversation (create or update). */
    save(conv: AparteConversation): Promise<void>;
    /** Permanently delete a conversation by id (cascades related rows). */
    delete(id: string): Promise<void>;
    /** Archive a conversation (soft-delete). Optional. */
    archive?(id: string): Promise<void>;
    /** Restore an archived conversation. Optional. */
    unarchive?(id: string): Promise<void>;

    // ── Split-storage extensions ────────────────────────────────────────────

    /**
     * Fast sidebar listing. Returns lightweight meta only (no messages).
     * Order is `updatedAt` desc. Adapters without split storage can omit
     * this — callers should fall back to `loadAll()` mapping to meta.
     */
    loadMeta?(): Promise<AparteConversationMeta[]>;
    /** Lazy-load a single conversation's full payload by id. */
    loadFull?(id: string): Promise<AparteConversation | null>;
    /** Pin/unpin (`pinnedAt`-aware sidebar sort). */
    pin?(id: string): Promise<void>;
    unpin?(id: string): Promise<void>;
    /** Update only the conversation title (avoids rewriting messages). */
    rename?(id: string, title: string): Promise<void>;

    // ── Memory ──────────────────────────────────────────────────────────────

    getMemory?(): Promise<AparteMemoryFact[]>;
    addMemoryFact?(fact: AparteMemoryFact): Promise<void>;
    updateMemoryFact?(id: string, patch: Partial<AparteMemoryFact>): Promise<void>;
    deleteMemoryFact?(id: string): Promise<void>;
    clearMemory?(): Promise<void>;

    // ── Settings (k/v) ──────────────────────────────────────────────────────

    getSetting?<T = unknown>(key: string): Promise<T | undefined>;
    setSetting?<T = unknown>(key: string, value: T): Promise<void>;
    deleteSetting?(key: string): Promise<void>;
    getAllSettings?(): Promise<Record<string, unknown>>;

    // ── Gallery / lazy-loaded blobs ────────────────────────────────────────

    /** List artifacts; optionally scoped to a single conversation. */
    loadArtifacts?(filter?: { convId?: string }): Promise<AparteArtifactRow[]>;
    /** Persisted attachment blobs for a single message. */
    loadAttachments?(msgId: string): Promise<AparteAttachmentRow[]>;
}
