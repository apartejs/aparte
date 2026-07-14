/**
 * MessageRepository — Conversation Tree Storage
 *
 * Manages the branching conversation tree while keeping AparteMessage pure
 * (no topology fields on the message itself). Inspired by assistant-ui's
 * MessageRepository but adapted for the Aparte vanilla-TS stack.
 *
 * Internal structure: a doubly-linked tree where each node holds a pointer
 * to its parent (prev) and its active child (next). `children` stores all
 * sibling IDs. `head` is always the active leaf.
 *
 * getMessages() walks head → root via `prev` — O(depth), not O(n).
 */

import type { AparteMessage } from '../types/index.js';

// ─── Internal node (never exposed outside) ──────────────────────────────────

type RepoNode = {
    /** Parent node (null = root) */
    prev: RepoNode | null;
    /** Currently active child */
    next: RepoNode | null;
    /** IDs of all children (branches) */
    children: string[];
    /** The message data */
    current: AparteMessage;
    /** Depth in the tree = index in the flat active-path array */
    level: number;
};

type RepoRoot = {
    next: RepoNode | null;
    children: string[];
};

/** Exported format — compatible with serialisation */
export type ExportedMessageRepository = {
    headId: string | null;
    messages: Array<{ message: AparteMessage; parentId: string | null }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Walk `next` chain to find the deepest active node */
function findHead(node: RepoNode | RepoRoot): RepoNode | null {
    if (node.next) return findHead(node.next);
    if ('current' in node) return node as RepoNode;
    return null;
}

// ─── Repository ──────────────────────────────────────────────────────────────

export class MessageRepository {
    private _nodes = new Map<string, RepoNode>();
    private _head: RepoNode | null = null;
    private _root: RepoRoot = { next: null, children: [] };

    // ─── Public read API ────────────────────────────────────────────────────

    /** ID of the currently active leaf message */
    get headId(): string | null {
        return this._head?.current.id ?? null;
    }

    /**
     * Returns the messages on the currently active path, root → head.
     * O(depth).
     */
    getMessages(): AparteMessage[] {
        const depth = this._head?.level ?? -1;
        if (depth < 0) return [];
        const messages = new Array<AparteMessage>(depth + 1);
        for (let cur: RepoNode | null = this._head; cur; cur = cur.prev) {
            messages[cur.level] = cur.current;
        }
        return messages;
    }

    /**
     * Returns metadata about a specific message, or `undefined` if not found.
     *
     * Read methods (`getMessage`, `getMessageById`, `getBranches`) all return
     * `undefined` / `[]` for unknown ids — never throw — so callers can do a
     * single existence check at the top of a flow rather than wrapping every
     * call in try/catch.
     */
    getMessage(id: string): { parentId: string | null; message: AparteMessage; index: number } | undefined {
        const node = this._nodes.get(id);
        if (!node) return undefined;
        return {
            parentId: node.prev?.current.id ?? null,
            message: node.current,
            index: node.level,
        };
    }

    /**
     * Returns the mutable message reference, or `undefined` if not found.
     * Mutations to the returned object are reflected in `getMessages()`.
     */
    getMessageById(id: string): AparteMessage | undefined {
        return this._nodes.get(id)?.current;
    }

    /**
     * Returns the IDs of all siblings of `messageId`
     * (i.e. all children of its parent, including itself).
     * Use this to build branch-picker UI.
     */
    getBranches(messageId: string): string[] {
        const node = this._nodes.get(messageId);
        if (!node) return [];
        const parent = node.prev ?? this._root;
        return [...parent.children];
    }

    // ─── Public write API ───────────────────────────────────────────────────

    /**
     * Add a new message as a child of `parentId` (null = root).
     * If a message with the same id already exists, updates its data
     * and re-links it under the correct parent.
     */
    addOrUpdateMessage(parentId: string | null, message: AparteMessage): void {
        const existing = this._nodes.get(message.id);
        const parentNode = parentId ? this._nodes.get(parentId) : undefined;

        if (parentId !== null && parentNode === undefined) {
            throw new Error(`MessageRepository: parent "${parentId}" not found.`);
        }

        // After the guard above, parentNode is either a valid RepoNode or undefined (null parentId case)
        const parent: RepoNode | null = parentNode ?? null;

        if (existing) {
            existing.current = message;
            this._relink(parent, existing);
            return;
        }

        const node: RepoNode = {
            prev: parent,
            next: null,
            children: [],
            current: message,
            level: parent ? parent.level + 1 : 0,
        };

        this._nodes.set(message.id, node);
        this._link(parent, node);

        // Auto-advance head to new node if it was the previous active leaf
        if (this._head === parent || (this._head === null && parent === null)) {
            this._head = node;
        }
    }

    /**
     * Switch the active branch to `messageId`.
     * Updates `next` on the parent chain so getMessages() reflects the change.
     * Advances `head` to the deepest active node in the new branch.
     *
     * Silent no-op for unknown ids — mutation methods (`switchToBranch`,
     * `resetHead`, `updateMessage`, `clearChildren`) never throw.
     */
    switchToBranch(messageId: string): void {
        const node = this._nodes.get(messageId);
        if (!node) return;
        const parentOrRoot = node.prev ?? this._root;
        parentOrRoot.next = node;
        this._head = findHead(node);
    }

    /**
     * Remove all descendants of `messageId` (inclusive) and set `head` to
     * the parent of `messageId`. Used by edit/truncate flows.
     *
     * @param messageId  The first message to remove
     * @param newParentId  Optional explicit parent to set head to
     */
    resetHead(messageId: string): void {
        const node = this._nodes.get(messageId);
        if (!node) return;

        // Delete all descendants first
        this._deleteDescendants(node);

        // Cut the node from its parent, clearing next BEFORE any findHead call.
        // Landing head on the parent with no active child is intentional for the
        // truncate/edit purpose (regenerate from the parent). Any OTHER sibling
        // branches of `messageId` are deliberately left in place — use
        // `clearChildren(parentId)` when you want to drop every branch instead.
        const parentOrRoot = node.prev ?? this._root;
        parentOrRoot.children = parentOrRoot.children.filter(id => id !== messageId);
        if (parentOrRoot.next === node) {
            parentOrRoot.next = null;
        }
        this._nodes.delete(messageId);

        // Move head to parent (null if the root was deleted)
        this._head = node.prev;
    }

    /**
     * Update a message's data without changing its position in the tree.
     */
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void {
        const node = this._nodes.get(messageId);
        if (!node) return;
        node.current = { ...node.current, ...updates };
    }

    /**
     * Remove ALL children of `parentId` (and their descendants) and set head
     * to `parentId`. Used by edit to discard every previous response before
     * re-generating — ensures the new response starts with sibling count = 1.
     */
    clearChildren(parentId: string): void {
        const parent = this._nodes.get(parentId);
        if (!parent) return;
        // deleteDescendants only handles children-of-node, so iterate manually
        for (const childId of [...parent.children]) {
            const child = this._nodes.get(childId);
            if (child) {
                this._deleteDescendants(child);
                this._nodes.delete(childId);
            }
        }
        parent.children = [];
        parent.next = null;
        this._head = parent;
    }

    /** Remove all messages and reset to empty state. */
    clear(): void {
        this._nodes.clear();
        this._head = null;
        this._root = { next: null, children: [] };
    }

    /**
     * Import a previously-exported snapshot, rebuilding the full tree and
     * restoring the active head. Replaces any existing content (calls `clear()`
     * first). Messages must be in topological order (parent before child) —
     * this is guaranteed by `export()` since `_nodes` is an insertion-order
     * Map and parents are always inserted before their children.
     */
    import(exported: ExportedMessageRepository): void {
        this.clear();
        for (const { message, parentId } of exported.messages) {
            this.addOrUpdateMessage(parentId, message);
        }
        if (exported.headId) {
            this.switchToBranch(exported.headId);
        }
    }

    /**
     * Export the full tree for serialisation or debugging.
     * Compatible with the assistant-ui ExportedMessageRepository format.
     */
    export(): ExportedMessageRepository {
        const messages: Array<{ message: AparteMessage; parentId: string | null }> = [];
        this._nodes.forEach((node) => {
            messages.push({
                message: node.current,
                parentId: node.prev?.current.id ?? null,
            });
        });
        return { headId: this.headId, messages };
    }

    // ─── Private helpers ────────────────────────────────────────────────────

    private _link(parent: RepoNode | null, child: RepoNode): void {
        const parentOrRoot: RepoNode | RepoRoot = parent ?? this._root;
        parentOrRoot.children = [...parentOrRoot.children, child.current.id];
        // Auto-set active child if parent has none
        if (parentOrRoot.next === null) {
            parentOrRoot.next = child;
        }
        child.prev = parent;
    }

    private _relink(newParent: RepoNode | null, child: RepoNode): void {
        // Cut from old parent
        const oldParentOrRoot: RepoNode | RepoRoot = child.prev ?? this._root;
        if (oldParentOrRoot !== (newParent ?? this._root)) {
            oldParentOrRoot.children = oldParentOrRoot.children.filter(id => id !== child.current.id);
            if (oldParentOrRoot.next === child) {
                // The moved child was the active one — fall back to a remaining
                // sibling (or none). NOT `findHead(oldParentOrRoot)`: `next` still
                // points at `child` here, so findHead would walk into the subtree
                // being moved away and leave a dangling pointer.
                const nextId = oldParentOrRoot.children[0];
                oldParentOrRoot.next = nextId ? this._nodes.get(nextId) ?? null : null;
            }
        }
        // Attach to new parent
        child.prev = newParent;
        const newParentOrRoot: RepoNode | RepoRoot = newParent ?? this._root;
        if (!newParentOrRoot.children.includes(child.current.id)) {
            newParentOrRoot.children = [...newParentOrRoot.children, child.current.id];
        }
        if (newParentOrRoot.next === null) {
            newParentOrRoot.next = child;
        }
        this._updateLevels(child, newParent ? newParent.level + 1 : 0);
    }

    private _updateLevels(node: RepoNode, newLevel: number): void {
        node.level = newLevel;
        for (const childId of node.children) {
            const childNode = this._nodes.get(childId);
            if (childNode) this._updateLevels(childNode, newLevel + 1);
        }
    }

    private _deleteDescendants(node: RepoNode): void {
        for (const childId of node.children) {
            const child = this._nodes.get(childId);
            if (child) {
                this._deleteDescendants(child);
                this._nodes.delete(childId);
            }
        }
        node.children = [];
        node.next = null;
    }
}
