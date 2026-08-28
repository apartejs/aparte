/**
 * Stream blocks — a tagged block the stream parser learns from a consumer.
 *
 * Models write conventions into their prose: `<think>…</think>` for reasoning,
 * `<artifact type="…">…</artifact>` for a document, `<file path="…">` for a patch,
 * `<tool_call>` for a model without function calling, `<cite>` for a source. Every one
 * is the same shape — an opening tag with attributes, a body that streams, a closing
 * tag — and until this seam existed each one was a branch hard-wired into the parser,
 * which is how the artifact ended up in core while being an app convention.
 *
 * A block is registered on the config (`registerStreamBlock`) and read by the
 * parser the stream adapter builds; the parser does the streaming work once for all
 * of them — the earliest opening tag wins the race against a code fence and a
 * reasoning delimiter, a tag cut at a chunk boundary is held back, attributes are
 * parsed whether quoted or bare, deltas accumulate into the segment's `content`,
 * and the segment is closed at the closing tag or at `finalize()`.
 *
 * @packageDocumentation
 */

import type { AparteSegmentBase } from './segments.js';

/** What the parser hands to {@link AparteStreamBlock.toSegment} when a block opens. */
export interface AparteStreamBlockMatch {
    /**
     * The opening tag's attributes, as written: `type="text/html"`, `title='Notes'`
     * and `lang=fr` all parse; the values are verbatim, never trimmed or decoded.
     * The model wrote them — treat them as untrusted, like every segment field.
     */
    attrs: Record<string, string>;
    /** The id the parser generated for the segment (its usual prefix + uuid). */
    id: string;
}

/**
 * A block grammar: the tag, and the segment its body becomes.
 *
 * The parser owns everything after {@link toSegment} returns: it appends each delta
 * to `segment.content`, sets `isStreaming` while the block is open and clears it at
 * `</tag>` (or at the end of the stream). So the segment MUST carry a `content`
 * string — the one field core touches — and the rest of its shape is yours:
 * a `type` of your own, registered with `registerSegmentRenderer`, or a built-in
 * one if the block is merely another way of spelling it.
 */
export interface AparteStreamBlock {
    /**
     * The tag name without brackets: `artifact` recognises `<artifact …>` … `</artifact>`.
     * Matched exactly and case-sensitively, and only as a whole name — `<artifacts>`
     * does not open an `artifact` block. Letters, digits, `-` and `_`.
     */
    tag: string;
    /**
     * Build the segment at the opening tag, with an empty `content`. Called once per
     * block; the parser fills the body in afterwards.
     */
    toSegment: (match: AparteStreamBlockMatch) => AparteSegmentBase & { content: string };
}
