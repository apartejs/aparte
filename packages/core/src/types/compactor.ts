import type { AparteCompactDoneEventDetail } from './events.js';

/**
 * Why a compactor was asked.
 *
 * `manual` is a person's click (the gauge's Compact now, a separator's Retry), `auto` the
 * policy's own decision after a turn or before a send, `retry` an attempt made again after
 * a failure, `overflow` the model refusing a request as over its window — the one that
 * has to run, whatever the back-off says.
 */
export type AparteCompactorReason = 'manual' | 'retry' | 'overflow' | 'auto';

/** What a compactor is asked to do — one chat, named by its element and, when it has one, its id. */
export interface AparteCompactorRequest {
    /** The chat's element. Passed, not only its id: a chat inside a shadow root is not found by id. */
    target: Element | null;
    /** The chat's id, when it has one. */
    targetId?: string;
    /** Compact even when the policy would not (below the threshold, after repeated failures). */
    force?: boolean;
    /**
     * Ids of messages that belong to a turn being prepared — the user message and the reply
     * placeholder of a send or retry in progress. They are not summarised and do not count
     * as "a turn in flight".
     */
    exclude?: string[];
    reason?: AparteCompactorReason;
    /**
     * Aborted when the turn the compaction serves is stopped — the client's Stop or a
     * programmatic `abort()` / `stop()`. The compactor cancels its summary then, so a
     * stopped turn neither pays for one nor writes a checkpoint into a chat left behind.
     */
    signal?: AbortSignal;
}

/**
 * How a compaction ended. It never rejects: a refusal and a failure are outcomes, so the
 * caller reads `ok` and does not need a `try`. The same information goes out as
 * `aparte-compact-done` / `aparte-compact-error`.
 */
export type AparteCompactorOutcome =
    | {
        ok: true;
        skipped: true;
        /** Why nothing was done — the same list `aparte-compact-done` carries. */
        reason: NonNullable<AparteCompactDoneEventDetail['reason']>;
        targetId?: string;
    }
    | {
        ok: true;
        skipped: false;
        summary: string;
        /** Messages kept verbatim after the summary. */
        kept: number;
        /** Messages this compaction summarised. */
        dropped: number;
        /** The message that now carries the checkpoint. */
        messageId?: string;
        /** Messages of the path the checkpoint stands for, an earlier summary's included. */
        count?: number;
        targetId?: string;
    }
    | { ok: false; error: string; targetId?: string; messageId?: string };

/**
 * The seam between the parts of core that need the context made smaller (the gauge's
 * Compact now, a separator's Retry, the client before a send and after an overflow) and
 * whatever makes it smaller. `@aparte/plugin-compaction` registers itself as the compactor
 * with `AparteConfig.setCompactor()`; core never compacts by itself.
 *
 * It is a seam and not an event because the caller needs the answer: the client rebuilds a
 * request once the summary is written, and a button shows that it is working.
 */
export interface AparteCompactor {
    /** Compact one chat. Never rejects. */
    compact(request: AparteCompactorRequest): Promise<AparteCompactorOutcome>;
    /** Resolves when no compaction of this chat is running — a send never races a summary. */
    settled(targetId?: string): Promise<void>;
    /**
     * Before a send's request goes out, with the estimate of that request. Resolves `true`
     * when it compacted, so the caller builds the request again.
     */
    beforeSend?(request: {
        target: Element | null;
        targetId?: string;
        /** The turn being prepared: its user message and reply placeholder. */
        exclude: string[];
        /** The estimate, in tokens, of the request about to be sent. */
        requestTokens: number;
        /** Aborted when the turn is stopped; the compactor cancels any summary it started for it. */
        signal?: AbortSignal;
    }): Promise<boolean>;
    /**
     * What compacting now would do: how many messages it would summarise and the tokens that
     * would free, or `null` when there is nothing to do. The gauge offers "Compact now" only
     * when this returns something.
     */
    preview?(request: { target: Element | null; targetId?: string }): { messages: number; tokens: number } | null;
}
