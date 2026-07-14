/**
 * artifact-xml-state-machine.ts — streaming `<artifact>` XML parser (pure).
 *
 * The framework-free extraction of the XML-artifact branch inside
 * `AparteClient._streamLoop` (aparte-client.ts :1268-1392 + finalize :1658-1669).
 * Small models emit artifacts as `…chat text… <artifact mimeType="…" title="…">
 * BODY</artifact> …more text…`, streamed in arbitrary chunks that can split the
 * opening tag, the body, or the closing tag across delta boundaries.
 *
 * This module owns only the PARSING (state + buffering); it emits DOM-free
 * micro-events. The `@aparte/core` adapter turns them into segment/lifecycle calls
 * (addSegment / updateSegment / _dispatchArtifactLifecycle) exactly as
 * `_streamLoop` does — so no DOM, no `@aparte/core` import here.
 *
 * Ported faithfully, including quirks: a `<artifact` split as `<arti`+`fact`
 * (so `indexOf('<artifact')` misses it) is treated as chat text, matching the
 * source. Providers emit the tag atomically in practice.
 */

/** Where the streaming parser is between artifacts. */
export type XmlArtifactState = 'normal' | 'scanning' | 'in-artifact';

/** Fallback mime/kind for an artifact whose open tag omits the attribute. */
export interface XmlArtifactHint {
    mimeType: string;
    kind: string;
}

/** DOM-free micro-events the machine emits; the adapter renders them. */
export type XmlArtifactEvent =
    // `reduced: true` marks chat text that precedes an `<artifact>` open tag in
    // the same delta. `_streamLoop` renders that text through a REDUCED path
    // (aparte-client.ts :1300-1313: only completed segments are added; the trailing
    // active segment is NOT rendered until a later, tag-free delta). The adapter
    // must honor it or the pre-artifact text streams one update too eagerly.
    | { type: 'chat-text'; text: string; reduced?: boolean }
    | { type: 'artifact-open'; id: string; mimeType: string; kind: string; title: string }
    | { type: 'artifact-chunk'; id: string; content: string }
    | { type: 'artifact-close'; id: string; content: string; inline: boolean };

const CLOSE_TAG = '</artifact>';
const OPEN_TAG = '<artifact';
/** Artifacts under this many lines render inline (mirrors `lineCount < 15`). */
const INLINE_MAX_LINES = 15;

/**
 * Map an artifact mimeType to a renderer kind. Byte-identical copy of core's
 * canonical `deriveArtifactKind` (parsers/aparte-stream-parser.ts) — the
 * duplicate stays because `@aparte/core` is an OPTIONAL peer of the engine, so
 * no runtime import is possible (plan Lot 3 §E2). Kept in sync mechanically by
 * `__tests__/derive-artifact-kind-parity.test.ts`.
 */
export function deriveArtifactKind(mimeType: string, fallback = 'unknown'): string {
    const m = (mimeType || '').toLowerCase().trim();
    const ant = m.match(/^application\/vnd\.ant\.([a-z0-9-]+)/);
    if (ant) return ant[1]!;
    if (m === 'text/html' || m === 'application/xhtml+xml') return 'html';
    if (m === 'application/javascript' || m === 'text/javascript') return 'js';
    if (m === 'text/css') return 'css';
    if (m === 'image/svg+xml') return 'svg';
    if (m === 'application/json') return 'json';
    if (m === 'text/markdown') return 'markdown';
    if (m === 'text/csv') return 'csv';
    if (m === 'text/plain') return 'text';
    if (m.includes('react')) return 'react';
    if (m.includes('html')) return 'html';
    if (m.includes('javascript')) return 'js';
    if (m.includes('css')) return 'css';
    if (m.includes('svg')) return 'svg';
    if (m.includes('json')) return 'json';
    if (m.includes('csv')) return 'csv';
    if (m.includes('markdown')) return 'markdown';
    return fallback;
}

/**
 * A stateful streaming parser for one turn's `<artifact>` blocks. Feed it each
 * text delta; drain the returned events. Call {@link finalize} when the stream
 * ends to flush a truncated (unclosed) artifact.
 */
export class ArtifactXmlStateMachine {
    private state: XmlArtifactState = 'normal';
    /** Buffers the opening tag until its `>` arrives (may span deltas). */
    private scanBuf = '';
    /** Buffers the tail that might be the start of a split `</artifact>`. */
    private closeBuf = '';
    private segId: string | null = null;
    private content = '';
    private mime = '';
    private kind = '';
    private title = '';
    private seq = 0;
    private readonly idGen: () => string;

    constructor(private readonly hint: XmlArtifactHint, idGen?: () => string) {
        this.idGen = idGen ?? (() => `artifact-xml-${this.seq++}`);
    }

    /** Feed one text delta; returns the ordered micro-events it produced. */
    feed(delta: string): XmlArtifactEvent[] {
        const out: XmlArtifactEvent[] = [];
        let remaining = delta;

        while (remaining.length > 0) {
            if (this.state === 'normal') {
                const tagStart = remaining.indexOf(OPEN_TAG);
                if (tagStart === -1) {
                    out.push({ type: 'chat-text', text: remaining });
                    remaining = '';
                } else {
                    const before = remaining.slice(0, tagStart);
                    if (before) out.push({ type: 'chat-text', text: before, reduced: true });
                    this.scanBuf = remaining.slice(tagStart);
                    remaining = '';
                    this.state = 'scanning';
                }
            } else if (this.state === 'scanning') {
                // Accumulate until we have the full opening tag (ends with `>`).
                this.scanBuf += remaining;
                remaining = '';
                const gtIdx = this.scanBuf.indexOf('>');
                if (gtIdx !== -1) {
                    const tag = this.scanBuf.slice(0, gtIdx + 1);
                    this.mime = /mimeType=['"]([^'"]+)['"]/.exec(tag)?.[1] ?? this.hint.mimeType;
                    this.title = /title=['"]([^'"]+)['"]/.exec(tag)?.[1] ?? this.hint.kind;
                    this.kind = deriveArtifactKind(this.mime, this.hint.kind);
                    this.segId = this.idGen();
                    this.content = '';
                    out.push({ type: 'artifact-open', id: this.segId, mimeType: this.mime, kind: this.kind, title: this.title });
                    this.state = 'in-artifact';
                    remaining = this.scanBuf.slice(gtIdx + 1);
                    this.scanBuf = '';
                }
            } else {
                // in-artifact — stream body until `</artifact>` (may be split).
                const combined = this.closeBuf + remaining;
                const closeIdx = combined.indexOf(CLOSE_TAG);
                if (closeIdx !== -1) {
                    this.content += combined.slice(0, closeIdx);
                    const inline = this.content.split('\n').length < INLINE_MAX_LINES;
                    out.push({ type: 'artifact-close', id: this.segId!, content: this.content, inline });
                    this.state = 'normal';
                    this.closeBuf = '';
                    remaining = combined.slice(closeIdx + CLOSE_TAG.length);
                } else {
                    // Keep the last (CLOSE_TAG.length - 1) chars buffered in case the
                    // closing tag is split across this and the next delta.
                    const safeLen = Math.max(0, combined.length - CLOSE_TAG.length + 1);
                    this.content += combined.slice(0, safeLen);
                    this.closeBuf = combined.slice(safeLen);
                    remaining = '';
                    if (this.segId) out.push({ type: 'artifact-chunk', id: this.segId, content: this.content });
                }
            }
        }

        return out;
    }

    /**
     * Flush a truncated artifact: if the stream ended mid-body (model cut off
     * before `</artifact>`), emit a close with whatever was buffered. Mirrors
     * `_streamLoop`'s finalize block (:1658-1669).
     */
    finalize(): XmlArtifactEvent[] {
        if (this.state === 'in-artifact' && this.segId) {
            this.content += this.closeBuf;
            const inline = this.content.split('\n').length < INLINE_MAX_LINES;
            const ev: XmlArtifactEvent = { type: 'artifact-close', id: this.segId, content: this.content, inline };
            this.state = 'normal';
            this.closeBuf = '';
            return [ev];
        }
        return [];
    }

    /** Current parser state (for the adapter to decide finalize routing). */
    get currentState(): XmlArtifactState {
        return this.state;
    }
}
