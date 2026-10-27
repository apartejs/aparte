/**
 * Aparte Segments
 * Extensible segment types for rich message content
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base Segment Types
// ─────────────────────────────────────────────────────────────────────────────

/** Base segment interface - all segments extend this */
export interface AparteSegmentBase {
    /** Unique segment identifier */
    id: string;

    /** Segment type discriminator */
    type: string;

    /** Whether segment is currently being streamed */
    isStreaming?: boolean;

    /**
     * One sentence standing in for the segment when no renderer claims its `type` —
     * DRAWN for every type, not only for `custom`.
     *
     * It is the answer to a real moment: a conversation replayed in another app, a
     * client that loads its views lazily, an export. Core draws it as text (no markup)
     * under `.aparte-segment-fallback`. Supplying one also silences the "no renderer"
     * developer warning: an author who wrote a fallback has already said this can happen.
     *
     * In the HISTORY sent back to the model it stands in for the segment only where core
     * does not serialise the type itself — `custom`, and any type core does not know (a
     * registered block grammar's, a plugin's). A `text` or a `code` segment contributes
     * its `content` and nothing else; `thinking` and `tool_call` are left out of the history
     * on purpose (`segmentsToWireText` states why), and so is `error`.
     */
    fallback?: string;

    // ── Identity and measurement ─────────────────────────────────────────────
    // A segment used to know only what it WAS, never where it sat or when it
    // happened — while the message one level up already carried a `timestamp`, a
    // `usage` and a `metadata` bag. The gap was not theoretical: `render(segment)`
    // takes one argument, so a custom renderer could not learn its message;
    // `aparte-terminal-run` shipped a `segmentId` nobody could resolve; and the
    // artifact renderer FABRICATED a message id (`__reload__${Date.now()}`) to get
    // past a consumer dedupe keyed on the pair it did not have.
    //
    // All five are optional, so nothing that exists today changes shape, and all
    // five are stamped in ONE place — `utils/segments.ts`, called by the two owners
    // of a message's segment array (`aparte-chat-viewport`, `aparte-chat-host`).
    // Not by the parser: `tool_call` segments never go
    // through it, which would have left a tool call — the most useful duration of
    // all — unmeasured.

    /** Id of the message this segment belongs to. Stamped on insertion. */
    messageId?: string;

    /**
     * Position in the owning message's `segments[]`, maintained across
     * insertions and removals.
     */
    index?: number;

    /**
     * Extras the producer of the segment knows — token counts, cost, compute
     * device — plus `aparte`, the one sub-object core writes.
     *
     * Everything except `meta.aparte` is yours: fill it with
     * `updateSegment(segmentId, { meta })`, which MERGES rather than replaces.
     * Mirrors `AparteMessage.metadata`.
     */
    meta?: Record<string, unknown> & { aparte?: AparteSegmentTiming };
}

/**
 * What core measured about a segment. Lives in `meta.aparte`, not on the segment.
 *
 * **No protocol carries a timestamp on a content block**: Anthropic's
 * blocks have none (and neither does the message), OpenAI's `output_text` part is
 * `{annotations, logprobs, text, type}` with `created_at` on the item above it, and the
 * AI SDK's `UIMessage.parts` have none either. What the AI SDK does have is a metadata
 * bag whose canonical example is literally `{ createdAt, model, totalTokens }` — at the
 * message level. A per-block `id` has industry precedent; per-block time has none.
 *
 * So this is a **local measurement**, and the shape says so. It stays typed, and it is
 * namespaced under
 * `aparte` because `meta` is the consumer's: a flat `startedAt` there would collide
 * with a key of their own.
 *
 * Core reads it through {@link segmentDuration} and {@link isSegmentSettled}. It draws
 * one number, and only when asked: a reasoning block with `showDuration` reads its
 * duration once settled. Every other display of it is the app's.
 */
export interface AparteSegmentTiming {
    /** Epoch ms when the segment entered a LIVE transcript. Absent for history. */
    startedAt?: number;
    /**
     * Epoch ms when content last arrived on this segment.
     *
     * It ADVANCES while the segment streams and freezes when the segment settles, so
     * `endedAt - startedAt` is a live duration during a turn and a final one after it
     * — ask `isSegmentSettled(segment)` which you are looking at.
     *
     * Why not simply "when it finished": the two obvious rules are both wrong, and
     * measurably. Closing at the end of the turn makes a reasoning block span the
     * whole answer that followed it (2s of thinking before a 20s reply reads "22s").
     * Closing when the next segment opens is the same error, smaller — a gap of ten
     * seconds before the next segment is counted as thinking, while the person
     * watching knows nothing happened. The last delta is the only moment the segment
     * itself can vouch for.
     */
    endedAt?: number;
}

/**
 * Text segment - plain text content
 *
 * @example
 * { id: 's1', type: 'text', content: 'A transport is the object that talks to the model.' }
 */
export interface AparteTextSegment extends AparteSegmentBase {
    type: 'text';
    content: string;
    /**
     * The sources this text draws on — a web search's results, the documents it quotes.
     * The bubble lists them under the reply; a {@link AparteCitation} places a chip in the text.
     */
    sources?: AparteSource[];
    /** Where in `content` each source is cited: a chip at the end of the passage. */
    citations?: AparteCitation[];
}

/** One source a reply draws on. Shown by its domain, its title in the card and the list. */
export interface AparteSource {
    /** Unique within the message; what a {@link AparteCitation} names. */
    id: string;
    /** Only `https:`, `http:` and the like are linked (the sanitizer's URL policy). */
    url?: string;
    title?: string;
    /** A short excerpt, shown in the card. */
    snippet?: string;
}

/**
 * A passage of a text segment that cites sources: offsets into the segment's `content`,
 * in UTF-16 code units (JavaScript string indices), `end` exclusive. The chip goes at the
 * end of the passage — after its punctuation, never inside code, emphasis or a link.
 *
 * @example
 * { end: 42, sources: ['s1', 's3'] }
 */
export interface AparteCitation {
    start?: number;
    end: number;
    /** Ids of the {@link AparteSource}s, in the order the card pages through them. */
    sources: string[];
    /**
     * `[start, end)` is a marker the model wrote for the citation (Perplexity's `[1]`): the
     * chip takes its place on screen. The text itself is left as it was written.
     */
    marker?: boolean;
}

/**
 * Field defaults for one segment TYPE, merged when a segment enters a message.
 *
 * A record and not a `Partial<AparteSegment>` on purpose: the type key is a string,
 * a consumer's own segment type is as valid as a built-in one, and its fields cannot
 * be known here. What CANNOT be defaulted is identity — `id`, `type`, `messageId`,
 * `index`, `startedAt`, `endedAt` are refused, because a default `id` would give
 * every segment in a conversation the same one.
 */
export type AparteSegmentDefaults = Readonly<Record<string, unknown>>;

/**
 * Thinking/reasoning segment - collapsible.
 *
 * A literal `<think>…</think>` in a reply is read as reasoning on every path — while
 * it streams and when the reply is restored from storage — so a message that merely
 * quotes the tag in its prose becomes this segment rather than text; and reasoning is
 * deliberately not sent back to the model, so those words leave the wire history with
 * it. Models whose reasoning is marked differently are handled by the parser's
 * `thinkingDelimiters`.
 *
 * @example
 * // No `collapsed` key, so it renders CLOSED — see the field's own note below.
 * {
 *   id: 's1',
 *   type: 'thinking',
 *   label: 'Reasoning',
 *   content: 'The question is about transports, so name the two and say where the key lives.',
 * }
 */
export interface AparteThinkingSegment extends AparteSegmentBase {
    type: 'thinking';
    content: string;
    /**
     * Open the block. **Absent means CLOSED** — a reasoning block is a disclosure,
     * and the reader opens it. The content is behind a click, streaming or settled.
     *
     * `false` opens one on purpose.
     */
    collapsed?: boolean;
    label?: string; // e.g., "Reasoning", "Analysis"
    /**
     * Once settled, read "Thought for 8s" rather than "Thought". Off by default: the
     * duration is measured in the browser, from the first reasoning delta to the last,
     * which is the model's thinking time only when the provider streams its reasoning — a
     * provider that sends it in one piece would read "1s", and a reload shows it only if
     * the stored segment kept its `meta`. Usually turned on for every block with
     * `setSegmentDefaults('thinking', { showDuration: true })`, which a block restored
     * from storage follows too (it is read when the block is drawn); the block's own
     * field wins.
     */
    showDuration?: boolean;
}

/**
 * Code segment - syntax highlighted code block
 *
 * Highlighting is a plugin you opt into; with none installed the block renders plain,
 * which is what core's zero-dependency promise costs here.
 *
 * @example
 * {
 *   id: 's1',
 *   type: 'code',
 *   language: 'ts',
 *   filename: 'transport.ts',
 *   content: "const transport = new AparteBackendTransport({ endpoint: '/api/chat' });",
 * }
 */
export interface AparteCodeSegment extends AparteSegmentBase {
    type: 'code';
    content: string;
    language?: string;
    filename?: string;
    /**
     * @deprecated Read by nothing: no renderer and no stylesheet draws line numbers, so setting it
     * changes nothing. It will be removed in a later minor.
     */
    showLineNumbers?: boolean;
}

/**
 * Error segment
 *
 * A failure card inside the turn that produced it, rather than a toast somewhere else on
 * the page — so the reader can see which question failed.
 *
 * @example
 * {
 *   id: 's1',
 *   type: 'error',
 *   content: 'The model did not answer.',
 *   details: 'HTTP 429 — rate limited. Retrying in 20s.',
 * }
 */
export interface AparteErrorSegment extends AparteSegmentBase {
    type: 'error';
    /**
     * The error's own message, for storage, the console and a custom error renderer. The
     * default alert shows it only for an error that keeps its own words (the turn limit, a
     * setup error, an app's own code); for any other code it shows the sentence the code
     * reads as, in the reader's language.
     */
    content: string;
    /** Text the alert shows under the message, in a block — a stack, a status line an app chooses to show. */
    details?: string;
    /**
     * A machine-readable code for the app to branch on — an `AparteErrorCode` value when
     * core made the error (`AparteErrorCode.MAX_TURNS_EXCEEDED`, `PROVIDER_ERROR`…). Never drawn
     * itself: it picks the sentence the alert shows, the alert carries it as
     * `data-error-code`, and a custom error renderer receives it.
     */
    code?: string;
    /**
     * @deprecated Set by nothing and read by nothing: the error renderer draws a sentence (or
     * `content`) and `details` only. Put a stack in `details` to show it. It will be removed in
     * a later minor.
     */
    stack?: string;
}

/**
 * Tool call segment - rendered while waiting for a tool handler to resolve
 *
 * @example
 * {
 *   id: 's1',
 *   type: 'tool_call',
 *   status: 'resolved',
 *   toolCall: { id: 'call_1', name: 'get_weather', input: { city: 'Lille' } },
 *   result: '11°C, overcast.',
 * }
 */
export interface AparteToolCallSegment extends AparteSegmentBase {
    type: 'tool_call';
    toolCall: import('./tools.js').AparteToolCall;
    /**
     * `awaiting-approval` — paused for a human decision; `rejected` — the human (or a
     * policy) declined to run it; `aborted` — stopped, timed out, or nothing could run
     * it; `failed` — the handler threw, and `result` carries the crash's one line.
     */
    status: 'pending' | 'resolved' | 'aborted' | 'awaiting-approval' | 'rejected' | 'failed';
    result?: string;
    /** The handler's `structuredContent`, when it returned one — the value behind `result`'s prose. */
    structuredResult?: unknown;
    /**
     * Set when a server loop (`createAparteAgentHandler`) suspended its run on this call:
     * why it waits — a person's decision (`approval`), a tool the page runs
     * (`external`), or nothing but its turn (`queued`) — and the server's signed
     * continuation. Saved with the conversation, so a reload can still answer it
     * (`AparteClient.resumeDeferred`).
     */
    deferred?: { reason: 'approval' | 'external' | 'queued'; ticket?: string };
    /**
     * On a `rejected` call, who refused it — a person, a policy, or the loop because an
     * earlier call of the same step was refused — and what the person typed instead.
     * `result` is the sentence the MODEL read; this is what a row tells a person, in their
     * language. Absent on a call refused by a runner that does not say.
     */
    refusal?: { by: import('@aparte/engine').StreamRefusalOrigin; instruction?: string };
    /**
     * On an `aborted` call, why: a Stop, its handler's timeout, no handler here, a gate
     * with nobody to ask, or its own turn limit. Absent when the run ended before it.
     */
    abortCause?: import('@aparte/engine').StreamAbortCause | 'turn-limit';
    /**
     * Whether the row's disclosure starts closed. Absent: closed, unless the tool's display
     * says `open`. `setSegmentDefaults('tool_call', { collapsed: false })` opens every row;
     * like reasoning's, it is read when the row is drawn and never forced on an update.
     */
    collapsed?: boolean;
}

/**
 * Custom segment - one escape hatch for the views an app draws itself.
 *
 * Renderers are keyed on `type`, so **`subType` never reaches the registry**: you
 * register ONE renderer for `custom` and switch on `subType` inside it, with `fallback`
 * as the default branch. Independent views take their own `type` instead — register a
 * `chart` renderer for a chart — and `custom` is for a family of small views an app
 * would rather keep behind one key.
 *
 * @example
 * registerSegmentRenderer<AparteCustomSegment>({
 *   type: 'custom',
 *   render(segment) {
 *     const data = (segment.data ?? {}) as Record<string, unknown>;
 *     const el = document.createElement('div');
 *     switch (segment.subType) {
 *       case 'weather':
 *         el.className = 'weather';
 *         el.textContent = `${data['city']} — ${data['celsius']}°C`;
 *         break;
 *       case 'poll':
 *         el.className = 'poll';
 *         el.textContent = String(data['question']);
 *         break;
 *       default:
 *         // A subType this build does not know: the sentence, not nothing.
 *         el.textContent = segment.fallback ?? '';
 *     }
 *     return el;
 *   },
 * });
 *
 * // The segments that renderer draws:
 * { id: 's1', type: 'custom', subType: 'weather', data: { city: 'Lille', celsius: 11 } }
 * { id: 's2', type: 'custom', subType: 'gantt', fallback: 'Three tasks, ending Friday.' }
 */
export interface AparteCustomSegment extends AparteSegmentBase {
    type: 'custom';
    /** Which view inside the `custom` renderer draws this segment (e.g. 'weather', 'poll', 'onboarding'). */
    subType: string;
    /** Arbitrary data payload for the component */
    data?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All built-in segment types. An `artifact` is not one of them any more: it is a
 * convention an app teaches its model, and `@aparte/plugin-artifacts` registers its
 * segment — a `type` of its own, through `registerSegmentRenderer` and
 * `registerStreamBlock` — the way any consumer registers a `chart` or a `citation`.
 */
export type AparteSegment =
    | AparteTextSegment
    | AparteThinkingSegment
    | AparteCodeSegment
    | AparteErrorSegment
    | AparteCustomSegment
    | AparteToolCallSegment
    | AparteSegmentTypes[keyof AparteSegmentTypes];

/**
 * The segment types an app or a plugin adds, one key per `type`, merged into this interface;
 * each one joins {@link AparteSegment}, so `addSegment`, `appendMessage` and
 * `AparteMessage.segments` take it without a cast.
 *
 * @example
 * declare module '@aparte/core' {
 *   interface AparteSegmentTypes {
 *     chart: AparteSegmentBase & { type: 'chart'; data: { label: string; value: number }[] };
 *   }
 * }
 * viewport.addSegment('a1', { id: 'c1', type: 'chart', data: [{ label: 'Q1', value: 4 }] });
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an interface to merge into, empty by design
export interface AparteSegmentTypes {}

/** Segment type discriminator values */
export type AparteSegmentType = AparteSegment['type'];

// ─────────────────────────────────────────────────────────────────────────────
// Segment Renderer Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segment renderer interface for custom segment types
 * Implement this to add new segment renderers
 */
export interface AparteSegmentRenderer<T extends AparteSegmentBase = AparteSegmentBase> {
    /** Segment type this renderer handles */
    type: string;

    /**
     * Render a segment to either an HTML string or a ready DOM element.
     *
     * Return a **string** for simple markup (inserted via innerHTML) — the built-in
     * renderers do this. Return an **HTMLElement** to skip innerHTML entirely: you
     * can attach event listeners and framework nodes directly, and there is no
     * innerHTML XSS surface for values you interpolate. Either way, `setup()` (if
     * provided) runs afterwards with the resulting element. For in-place streaming
     * updates to find your element, keep a `data-segment-id="<segment.id>"` on its
     * root (or implement `update()`).
     *
     * @param segment - Segment data to render
     * @returns HTML string or a DOM element
     */
    render(segment: T): string | HTMLElement;

    /**
     * Optional: Get CSS styles for this segment type
     * @returns CSS string to inject
     */
    getStyles?(): string;

    /**
     * Optional: Setup interactivity after render
     * @param element - The rendered DOM element
     * @param segment - Segment data
     */
    setup?(element: HTMLElement, segment: T): void;

    /**
     * Optional: In-place DOM update during streaming.
     * When provided, called instead of re-rendering the full element.
     * Must not add/remove child nodes — only mutate attributes or textContent
     * so the MutationObserver (childList) doesn't fire and scroll stays stable.
     */
    update?(element: HTMLElement, segment: T): void;

    /**
     * Optional: re-read the CONFIG-DERIVED text of an already-rendered segment —
     * an icon from the icon provider, a label from the locale.
     *
     * Called when the config changes (a language switch, a new icon set), on every
     * segment already on screen. Bound by the same rule as `update()`: **must not
     * add or remove child nodes** — only attributes and textContent — so the
     * viewport's childList observer stays quiet and scroll does not move.
     *
     * This exists because the obvious alternative does not work. Re-rendering the
     * segments container to pick up a new locale destroys state the DOM owns and the
     * segment data does not: a mounted sandboxed artifact preview, a reasoning block
     * the reader expanded by clicking `<summary>` (which never writes back to
     * `collapsed`), scroll position inside a long terminal, the focus on an
     * Approve/Reject gate, and the buffered lookahead of the incremental Markdown
     * parser mid-stream. It also fires container-wide childList mutations, which is
     * exactly what the rule above forbids.
     *
     * Implement it only if the rendered output contains text or icons that came from
     * the config. A renderer whose chrome is entirely its own data — `progress`,
     * `text` — correctly does not, exactly as it does not implement `update()`.
     */
    relabel?(element: HTMLElement, segment: T): void;

    /**
     * Optional: the element `render()` returned is gone for good — unmount what you
     * mounted in it.
     *
     * Called once per element, with the element and the segment's latest state, when it
     * leaves the page for good: replaced by a new `render()` (a segment redrawn, a message
     * redrawn in a new frame, this renderer replaced by another registration), its segment
     * removed, or its message removed. Never for `update()` or `relabel()`, and never for
     * a message a framework only MOVED: a bubble taken out and put back before the next
     * microtask keeps its elements. A bubble that comes back after a longer absence (a
     * framework's keep-alive cache, a reused route) draws its segments again, so a
     * renderer sees `render`/`setup` once more after its `cleanup`.
     *
     * A renderer that replaces its own element inside `update()` cleans up what it
     * replaced itself: the bubble then follows the new element and calls this for it.
     *
     * This hook was declared long before anything called it; it is called now.
     * @param element - The DOM element leaving
     * @param segment - The segment it was last drawn or updated with
     */
    cleanup?(element: HTMLElement, segment: T): void;
}

/** Mount your component for one segment in `host`, and say how to update and destroy it. */
export type AparteSegmentMount<T extends AparteSegmentBase = AparteSegmentBase> =
    (host: HTMLElement, segment: T) => import('./tools.js').AparteMountedView<T>;

// ─────────────────────────────────────────────────────────────────────────────
// Segment Event Types
// ─────────────────────────────────────────────────────────────────────────────

/** Event when segment content is updated during streaming */
export interface AparteSegmentUpdateEventDetail {
    messageId: string;
    segmentId: string;
    content: string;
    append?: boolean;
}
