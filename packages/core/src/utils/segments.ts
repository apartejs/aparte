/**
 * What a segment knows about itself — stamped in one place.
 *
 * A segment carried `id`, `type` and `isStreaming` and nothing else, while the
 * message one level up already had a `timestamp`, a `usage` and a `metadata` bag.
 * Three places in this repo paid for the gap: `render(segment)` takes one argument
 * so a custom renderer could not learn its message, `aparte-terminal-run` shipped a
 * `segmentId` nobody could resolve, and the artifact renderer fabricated a message
 * id to slip past a consumer dedupe keyed on a pair it did not have.
 *
 * **Why the stamp lives here and not in `AparteStreamParser`.** The parser looked
 * like the right owner — both agent loops share it, so parity would be free. It is
 * the wrong one. `tool_call` segments are built by the client and the stream
 * adapter (three sites), `pipeline-waiting` by two more, and `prefixSegments` by the
 * app itself: stamping in the parser would have left a TOOL CALL — the single most
 * useful duration in the whole transcript — with no measurement at all. Worse, the
 * parser's own `segmentCounter` would have produced a wrong index: it is recreated
 * on every `turn-start`, while a tool round-trip appends to the SAME message across
 * turns, so one message would hold two segments at index 0, silently.
 *
 * A segment can only reach a transcript one way — through `addSegment` — and there
 * are exactly two owners of the array behind it: `aparte-chat-viewport` (native) and
 * `aparte-chat-host` (framework-managed). Both call these functions; nothing else
 * writes those fields. `pnpm check:segment-stamp` keeps it that way, because two
 * owners is exactly the shape of the forgotten-sibling bug this repo keeps finding.
 *
 * Everything here is pure and DOM-free, so a consumer can test their own wiring in
 * Node — the introspectability half of the reachability rule.
 */
import type { AparteSegmentDefaults, AparteSegmentTiming, AparteSegment } from '../types/index.js';

/**
 * Tool-call statuses that mean "still open".
 *
 * A tool call is the one segment type whose completion is not spelled by
 * `isStreaming`: the client flips its `status`, never the streaming flag. Reading
 * `isStreaming` there would have measured nothing.
 */
const OPEN_TOOL_STATUSES: ReadonlySet<string> = new Set(['pending', 'awaiting-approval']);

/**
 * Update keys that mean "content arrived", as opposed to "how it is displayed".
 *
 * The distinction is the whole rule and it cost a test to find: the stream adapter
 * collapses a reasoning block the moment answer text starts
 * (`updateSegment(thinkingId, { collapsed: true })`). Counting that as activity put
 * a reasoning block's end at the start of the ANSWER rather than at its own last
 * token — 5s instead of 2s in the test that caught it. Collapsing, inlining and
 * writing `meta` are decisions about presentation; they are not the segment doing
 * anything.
 */
const ACTIVITY_KEYS: readonly string[] = ['content', 'output', 'result'];

/** Does this update carry payload, rather than presentation? */
function isActivity(updates: Partial<AparteSegment>): boolean {
    return ACTIVITY_KEYS.some((key) => key in updates);
}

/**
 * Stamp identity and start time on a segment joining `segments` at the tail.
 *
 * Returns a new object; the caller's segment is never mutated — the viewport hands
 * the same segment object to the repository AND to the bubble, so mutating one is
 * action at a distance (a bug this repo has already paid for in `appendToSegment`).
 *
 * A value already present is never overwritten, so a segment rehydrated from a
 * consumer's storage keeps the numbers it was persisted with.
 */
export function stampSegmentOnInsert(
    segments: readonly AparteSegment[],
    segment: AparteSegment,
    messageId: string,
    defaults?: AparteSegmentDefaults,
): AparteSegment {
    const base = applyDefaults(segment, defaults);
    return {
        ...base,
        messageId: segment.messageId ?? messageId,
        index: segment.index ?? segments.length,
        // A start already present is kept — a segment a consumer rebuilt from their own
        // storage keeps the number it was persisted with. `adoptSegment` is the path
        // that never writes one at all.
        ...timingPatch(base, { startedAt: segmentTiming(segment)?.startedAt ?? Date.now() }),
    } as AparteSegment;
}

/**
 * A segment arriving from STORAGE or a server, rather than starting now.
 *
 * The counterpart of {@link stampSegmentOnInsert}, and the reason it exists: the two
 * are not the same act, and treating them as one made the library invent history.
 * `stampSegmentOnInsert` ran on every arrival path including a reload, so a
 * conversation from three weeks ago came back claiming each of its segments had
 * started this second — while THREE other load paths did not stamp at all, so the same
 * stored conversation produced different numbers depending on the mode and on whether
 * a branch tree had been saved. Not a lie so much as an incoherence.
 *
 * What it writes, and why each:
 *
 *  - `messageId` and `index` are **recomputed**, not preserved. They are derivable
 *    facts about the array this segment is joining, so a stored value can only
 *    contradict it — and no protocol persists either (Anthropic's block `index` exists
 *    only in the streaming envelope, as a position).
 *  - **no time, ever.** A measurement nobody took is absent, not zero and not now.
 *    `segmentDuration` already answers `undefined` for that, so a consumer reading
 *    through the helper degrades correctly.
 *  - `isStreaming: false`, unconditionally. A persisted stream is dead: restoring one
 *    with `isStreaming: true` would render a caret forever, and — through
 *    `openSegmentIds`, which reads exactly this flag — would have the next turn-close
 *    stamp it a brand-new `endedAt`.
 */
export function adoptSegment(
    segments: readonly AparteSegment[],
    segment: AparteSegment,
    messageId: string,
): AparteSegment {
    return {
        ...segment,
        messageId,
        index: segments.length,
        isStreaming: false,
    } as AparteSegment;
}

/**
 * Identity is stamped, never defaulted. A default `id` would hand every segment in a
 * conversation the same one, and `index` / `startedAt` are measurements of THIS
 * insertion — a default for either would be a lie about when and where.
 */
const RESERVED = new Set(['id', 'type', 'messageId', 'index']);

/**
 * Read core's own measurements off a segment.
 *
 * A function rather than a property access because it is read from six places, and
 * `segment.meta?.aparte` spelled six times is six chances to spell it differently —
 * which is exactly how this repo's recurring bug starts.
 */
export function segmentTiming(
    segment: Pick<AparteSegment, 'meta'>,
): AparteSegmentTiming | undefined {
    return segment.meta?.aparte;
}

/**
 * The patch that writes core's measurements WITHOUT losing the producer's own keys.
 *
 * This is the whole risk the move to `meta` creates. `meta` is one bag with two
 * writers: a consumer's `updateSegment(id, { meta: { cost } })` and core's timing. A
 * plain assignment from either side erases the other, so every write goes through
 * here — a spread of the existing bag, and `aparte` merged rather than replaced.
 */
function timingPatch(segment: AparteSegment, timing: AparteSegmentTiming): Pick<AparteSegment, 'meta'> {
    return { meta: { ...segment.meta, aparte: { ...segment.meta?.aparte, ...timing } } };
}

/**
 * Fill in what the producer did not say.
 *
 * `in`, not `??`: a segment that explicitly carries `collapsed: undefined` has said
 * something, and a default must not talk over it. The same reason the three stamped
 * fields above use `??` on a value the caller may legitimately have computed, while
 * this one asks whether the key exists at all.
 *
 * Defaults are read at INSERTION and baked in. Changing them later does not reach
 * segments already in the transcript — deliberately: a reasoning block the reader
 * opened has state the data does not, and a retroactive default would take it away.
 */
function applyDefaults(segment: AparteSegment, defaults?: AparteSegmentDefaults): AparteSegment {
    if (!defaults) return segment;
    const out = { ...segment } as AparteSegment & Record<string, unknown>;
    for (const [key, value] of Object.entries(defaults)) {
        if (RESERVED.has(key) || key in segment) continue;
        if (key === 'meta') {
            // A default may fill the producer's half of the bag and never core's. The
            // fields it would forge stopped being RESERVED when they moved in here, so
            // the reserved thing is the sub-object: without this, a default could hand
            // an app a span it never measured — the same lie the reload path told.
            const { aparte: _forged, ...rest } = (value ?? {}) as Record<string, unknown>;
            out.meta = rest as AparteSegment['meta'];
            continue;
        }
        out[key] = value;
    }
    return out;
}

/**
 * Has this segment settled? The trigger for `endedAt`.
 *
 * Exported on purpose: a consumer rendering its own "thought for 8 s" line needs
 * the same predicate, and a rule buried inside a component method is a rule that
 * gets re-derived slightly differently somewhere else.
 *
 * A segment with no streaming flag at all is NOT settled. That is deliberate: a
 * reply that arrived whole never had a span to measure, and stamping an `endedAt`
 * equal to its `startedAt` would dress a zero up as a measurement.
 */
export function isSegmentSettled(segment: AparteSegment): boolean {
    if (segment.type === 'tool_call') return !OPEN_TOOL_STATUSES.has(segment.status);
    return segment.isStreaming === false;
}

/**
 * Move `endedAt` to now while the segment is open; freeze it once it settles.
 *
 * `endedAt` is **the moment content last arrived**, and that is the only honest
 * signal available. Two simpler rules were tried and are wrong, both measurably:
 *
 *  - *"ends when the turn ends"* — a reasoning block would then span the whole
 *    answer that followed it. 2s of thinking before a 20s reply reads "22s". A
 *    mocked stream hides this (it moves from reasoning to text in milliseconds); a
 *    real model does not.
 *  - *"ends when the next segment starts"* — the same error, smaller: if the next
 *    segment opens ten seconds later, those ten seconds are counted as thinking,
 *    while the person watching the screen knows perfectly well nothing happened.
 *
 * So every update nudges it forward, and the settling update keeps whatever the
 * last delta left rather than stamping its own arrival time. A segment that settles
 * having never received an update gets its end then — nothing else is knowable
 * about it.
 *
 * The consequence, stated because it is a contract: `endedAt` is present WHILE a
 * segment streams, and `endedAt - startedAt` is a live duration that grows. Ask
 * {@link isSegmentSettled} whether it is final. That is also what a UI wants — the
 * counter that ticks while a model reasons is the same number, read earlier.
 */
export function stampSegmentOnUpdate(
    segment: AparteSegment,
    updates: Partial<AparteSegment>,
): Partial<AparteSegment> {
    // Already settled: a later edit — a re-render, a `meta` write, a collapse —
    // must not move an end that is final.
    if (isSegmentSettled(segment)) return updates;
    const merged = { ...segment, ...updates } as AparteSegment;
    if (isSegmentSettled(merged)) {
        // Settling: keep whatever the last delta left, and only stamp now for a
        // segment that never produced anything (a tool call, whose whole span is
        // start-to-status-change).
        const ended = segmentTiming(segment)?.endedAt;
        return { ...updates, ...timingPatch(segment, { endedAt: ended ?? Date.now() }) };
    }
    // Still open: content arriving advances the end, presentation does not.
    return isActivity(updates)
        ? { ...updates, ...timingPatch(segment, { endedAt: Date.now() }) }
        : updates;
}

/**
 * Merge an update into a segment without one writer erasing the other's `meta`.
 *
 * `{ ...segment, ...updates }` is wrong now that `meta` has two writers. A consumer's
 * `updateSegment(id, { meta: { cost } })` is presentation, not activity, so it passes
 * through {@link stampSegmentOnUpdate} untouched — and a plain spread would then
 * replace the whole bag and take `meta.aparte` with it. The measurement would vanish
 * the first time an app wrote a token count, which is precisely when it matters.
 *
 * So the bag is merged one level, and `aparte` inside it merged again. Every site that
 * folds an update into a segment goes through here — the viewport, the host and the
 * bubble each had their own spread, which is three chances to fix this twice and miss
 * once.
 */
export function mergeSegmentUpdate(
    segment: AparteSegment,
    updates: Partial<AparteSegment>,
): AparteSegment {
    const merged = { ...segment, ...updates } as AparteSegment;
    if (!('meta' in updates)) return merged;
    return {
        ...merged,
        meta: {
            ...segment.meta,
            ...updates.meta,
            // Neither side's timing wins by accident: whichever one carries it, wins,
            // and a consumer writing `meta` without an `aparte` key keeps ours.
            ...(segment.meta?.aparte || updates.meta?.aparte
                ? { aparte: { ...segment.meta?.aparte, ...updates.meta?.aparte } }
                : {}),
        },
    } as AparteSegment;
}

/**
 * How long this segment took, or `undefined` when that is not knowable yet.
 *
 * The five identity/measurement fields are optional because they describe a
 * LIFECYCLE: a segment built by hand or freshly emitted by the parser has not been
 * inserted yet, so it has no start, and an open segment has no end. Making them
 * required would either force every creation site to stamp — six of them, which is
 * the forgotten-sibling shape this seam exists to prevent — or force a hand-written
 * literal to invent values the owner then refuses to overwrite.
 *
 * The cost of that optionality lands on the reader, and this is what removes it. The
 * guard it replaces was written three times in this repo before it earned a function:
 *
 *     if (!isSegmentSettled(seg) || !seg.startedAt || !seg.endedAt) return;
 *
 * — three conditions to get right, and the last two are wrong at epoch 0, where a
 * valid timestamp is falsy. Nobody streams in 1970, but the test suite sets the clock
 * to 0 routinely, so the trap was already in the repo waiting for its first victim.
 *
 * It deliberately does NOT ask whether the segment is finished: during a turn a
 * growing duration is exactly what a "thinking…" counter shows. Pair it with
 * {@link isSegmentSettled} when you need the final number.
 */
export function segmentDuration(segment: AparteSegment): number | undefined {
    const { startedAt, endedAt } = segmentTiming(segment) ?? {};
    if (startedAt == null || endedAt == null) return undefined;
    return endedAt - startedAt;
}

/**
 * The patch that records "content just arrived on this segment".
 *
 * The append paths do not go through {@link stampSegmentOnUpdate} — they rebuild
 * the segment themselves, for reasons that predate this (the viewport must not
 * mutate an object the bubble shares; the host coalesces a frame's chunks into one
 * absolute write). They still have to move `endedAt`, because content arriving IS
 * the activity it measures. So they spread this in, and the rule stays in one file
 * — which is not a style preference: `pnpm check:segment-stamp` refused the two
 * inline `endedAt: Date.now()` this replaced, and it was right to.
 *
 * Empty once the segment has settled, so a late write cannot move a final end.
 */
export function stampSegmentActivity(segment: AparteSegment): Partial<AparteSegment> {
    return isSegmentSettled(segment) ? {} : timingPatch(segment, { endedAt: Date.now() });
}

/**
 * The update that forwards a parser-emitted segment's content — carrying the fact
 * that it CLOSED, when it did.
 *
 * The parser marks the segments it closes (`</think>`, a closing fence,
 * `</artifact>`, the opening of the next block). That mark reached nobody: every
 * forwarding site sent `{ content }` alone, so a finished segment arrived at the
 * owner looking exactly like a streaming one. The end then had to be inferred from
 * the end of the TURN, which is what kept a reasoning block reading "Thinking" for
 * as long as the answer took to stream.
 *
 * Five sites forward this way across the two agent loops, which is four too many to
 * patch by hand — that is how the same rule ends up spelled three different ways.
 */
export function segmentContentUpdate(segment: AparteSegment): Partial<AparteSegment> {
    const content = (segment as { content?: string }).content;
    return {
        content,
        ...(segment.isStreaming === false ? { isStreaming: false } : {}),
    } as Partial<AparteSegment>;
}

/**
 * Statuses that mean the turn is over, whatever the outcome.
 *
 * `error` and `aborted` count: a stopped stream still produced what it produced,
 * and refusing to close its segments would leave every one of them measuring
 * forever. `undefined` does NOT count — a message with no status yet has not
 * finished, and treating "unknown" as "done" would end a segment on its first
 * render.
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
    return status != null && status !== 'streaming' && status !== 'pending';
}

/**
 * Ids of the segments a finished turn still has to close.
 *
 * Where `endedAt` comes from for everything that is not a tool call. Nothing in the
 * stream says "this thinking block is over": the parser closes its active segment
 * silently, and both agent loops report the end on the MESSAGE
 * (`updateMessage({ status: 'completed' })`). So the message's end is the segments'
 * end, and this says which ones are still waiting for it.
 *
 * It returns ids rather than settling the array itself, and that is the point. The
 * first version did mutate in place — and the browser proved it half-broken: the
 * model gained its `endedAt` while the RENDERER never learned the segment had
 * settled, because a silent mutation notifies nobody. Routing each close through
 * the owner's own `updateSegment` gives one path that stamps the model AND repaints
 * the bubble, which is also the path `update()` and the incremental Markdown flush
 * already depend on.
 *
 * Already-closed segments are skipped, so reporting a turn finished twice — a
 * re-render, a branch switch, a reloaded conversation — cannot move an end.
 */
export function openSegmentIds(segments: readonly AparteSegment[]): string[] {
    return segments.filter((segment) => !isSegmentSettled(segment)).map((segment) => segment.id);
}

/**
 * Adopt every segment of a message arriving from storage or a server.
 *
 * The message-level counterpart of {@link adoptSegment}, and the reason it exists as a
 * function rather than a loop written four times: there are FOUR entry paths for
 * historical data (`setMessages`, `importTree`, `addMessage`, and the framework host's
 * own list setter) and they disagreed. One stamped and invented a start, one wrote
 * straight to the repository, one did nothing, and the host's `appendMessage` — same
 * name as the viewport's, opposite behaviour — did nothing either. The same stored
 * conversation therefore produced different numbers depending on the mode and on
 * whether a branch tree had been saved.
 *
 * Always returns a NEW object, even for a message with no segments. That looks like a
 * missed optimisation and is the invariant of this whole file: the viewport hands the
 * same object to the repository AND to the framework's list, so sharing one makes the
 * immediate paint and the coalesced write land on the same string twice. Returning the
 * caller's message here doubled every streamed reply — caught by the suite that exists
 * for exactly that bug, within minutes of my writing the shortcut.
 */
export function adoptMessageSegments<T extends { id: string; segments?: AparteSegment[] }>(message: T): T {
    if (!message.segments?.length) return { ...message };
    return {
        ...message,
        segments: message.segments.reduce<AparteSegment[]>((acc, segment) => {
            acc.push(adoptSegment(acc, segment, message.id));
            return acc;
        }, []),
    };
}

/**
 * Close the gap a removal left, in place.
 *
 * The single place `index` is maintained after the array changes shape. Entries are
 * REPLACED rather than mutated, for the same shared-object reason as
 * {@link stampSegmentOnInsert}; a segment already at its correct position is left
 * alone, so a renumber after an append-only sequence allocates nothing.
 */
export function renumberSegments(segments: AparteSegment[]): void {
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        if (segment.index === i) continue;
        segments[i] = { ...segment, index: i } as AparteSegment;
    }
}
