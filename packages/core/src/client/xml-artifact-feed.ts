/**
 * The Claude-style `<artifact>` XML streamer: scans one text delta for
 * `<artifact …>` / `</artifact>`, routes chat text through the text parser and
 * artifact content into a dedicated artifact segment, and holds back a tag split
 * across deltas.
 *
 * TWIN: `packages/engine/src/agent/parsers/artifact-xml-state-machine.ts`. Core
 * cannot import engine's copy — engine peer-depends on core — so the two are
 * maintained by hand, and the parity suite asserts the same cases on both sides.
 * A fix applied to one twin and not the other is this repo's most repeated bug,
 * which is the reason this is a file: the two used to cite each other by line
 * number into a 2324-line module, and four of those citations had rotted onto
 * unrelated code — one of them in the published docs.
 *
 * It sits outside `AparteClient` because it never belonged inside it. It touches
 * `this` zero times: the state it mutates is owned by its caller and passed in.
 */
import { AparteStreamParser, deriveArtifactKind } from '../parsers/aparte-stream-parser.js';
import { segmentContentUpdate } from '../utils/segments.js';
import { dispatchArtifactLifecycle, type AparteLifecycleTarget } from './lifecycle-events.js';
import { uuid } from '../utils/uuid.js';
import type { AparteSegment, AparteArtifactSegment } from '../types/index.js';
import type { AparteArtifactHint } from '../types/chat.js';

/**
 * What the feeder needs of a render target: the two segment writers it calls, plus
 * whatever `dispatchArtifactLifecycle` needs.
 *
 * Deliberately an intersection of the members actually used, rather than an import
 * of the client's own `AparteChatTargetElement`: that import would close a cycle,
 * and hand-copying the interface would fork it a second time — `StreamAdapterTarget`
 * is the first fork and it already drifted (it has `setUsage` and no
 * `appendMessage`).
 */
/**
 * An artifact under this many lines renders inline rather than as a card. One
 * product decision, and it used to be three bare `15`s in core against a single
 * named constant in the engine twin — the move that put both XML sites in this
 * file is what made naming it unavoidable rather than tidy. The third core site
 * (`artifactRaw finalize`, in `_streamLoop`) is a different pathway and still
 * carries its own literal.
 */
const INLINE_MAX_LINES = 15;

export type XmlArtifactFeedTarget = AparteLifecycleTarget & {
    addSegment?(segment: AparteSegment): void;
    updateSegment?(segmentId: string, updates: Partial<AparteSegment>): void;
};

const XML_OPEN_TAG = '<artifact';
/**
 * Length of the longest suffix of text that is a PROPER prefix of the artifact
 * open tag (0 when there is none). The angle bracket and the tag name are
 * separate tokens in most vocabularies, so a delta ending mid-tag is routine;
 * without this the fragment is emitted as chat text and the artifact loses its
 * whole lifecycle.
 *
 * Mirrors partialOpenTagLength in the engine artifact-xml state machine.
 */
function partialXmlOpenTagLength(text: string): number {
    const max = Math.min(text.length, XML_OPEN_TAG.length - 1);
    for (let k = max; k > 0; k--) {
        if (text.endsWith(XML_OPEN_TAG.slice(0, k))) return k;
    }
    return 0;
}

/** Mutable state for streaming a Claude-style `<artifact>` XML block out of the
 *  text stream — owned by the caller's stream loop, fed one delta at a time. */
export interface XmlArtifactStreamState {
    state: 'normal' | 'scanning' | 'in-artifact';
    scanBuf: string;
    closeBuf: string;
    segId: string | null;
    content: string;
    mime: string;
    kind: string;
    title: string;
}

/**
 * Feed one text delta to the Claude-style `<artifact>` XML streamer. Scans for
 * `<artifact …>` / `</artifact>`, routing chat text through the text parser and
 * artifact content into a dedicated artifact segment (handling tags split across
 * deltas). Mutates `xml` in place.
 */
export function feedXmlArtifactDelta(
    delta: string,
    xml: XmlArtifactStreamState,
    ctx: {
        targetElement: XmlArtifactFeedTarget;
        messageId: string;
        textParser: AparteStreamParser;
        streamingSegmentIds: Set<string>;
        artifactProgress: Map<string, number>;
        artifactXmlHint: AparteArtifactHint;
    },
): void {
    const { targetElement, messageId, textParser, streamingSegmentIds, artifactProgress, artifactXmlHint } = ctx;
    let remaining = delta;

    // One emitter for chat text, used by all three exits below. There used to
    // be two near-copies of this, and the back-out path added by the
    // partial-tag fix would have made a third.
    //
    // `syncActive` is the one difference between those copies, and it is
    // LOAD-BEARING rather than drift, which the engine parity suite proved:
    // the text-before-an-opening-tag path must NOT flush its still-growing
    // segment, or core emits the text segment before the artifact while
    // `runStreamAgent` still emits the artifact first — a visible divergence in
    // the call sequence the two loops are contracted to share.
    //
    // Flushing early is arguably the better UX (the prose appears as it
    // arrives rather than after the artifact card). That is a deliberate change
    // to a streamed call order, with the engine side to match: a decision of
    // its own, not a side effect of removing a duplicate.
    const emitChatText = (text: string, syncActive = true): void => {
        if (!text) return;
        const r = textParser.parse(text);
        for (const seg of r.segments) {
            if (!streamingSegmentIds.has(seg.id)) {
                targetElement.addSegment?.(seg);
                streamingSegmentIds.add(seg.id);
            } else if ('content' in seg) {
                targetElement.updateSegment?.(seg.id, segmentContentUpdate(seg));
            }
        }
        // The active segment is always CONSULTED (the imperative fallback below
        // must not fire while one is growing) but only EMITTED when the caller
        // says so. Getting that distinction wrong is what produced a spurious
        // `typeName` call and broke parity a second time.
        const active = textParser.getState().activeSegment;
        if (syncActive && active) {
            if (!streamingSegmentIds.has(active.id)) {
                targetElement.addSegment?.(active);
                streamingSegmentIds.add(active.id);
            } else {
                targetElement.updateSegment?.(active.id, segmentContentUpdate(active));
            }
        } else if (!r.segments.length && !active) {
            // Nothing: see the note on the other feeder. The parser is holding
            // an ambiguous prefix, and writing it here duplicated it into
            // `message.content`, which history preferred over the segments.
        }
    };

    while (remaining.length > 0) {
        if (xml.state === 'normal') {
            const tagStart = remaining.indexOf(XML_OPEN_TAG);
            if (tagStart === -1) {
                // No whole tag - but the delta may END on a piece of one.
                const held = partialXmlOpenTagLength(remaining);
                if (held > 0) {
                    // `false` for the same reason as the whole-tag branch below:
                    // flushing here puts the prose BEFORE the artifact card while
                    // the runner still emits it after. Reintroduced right next to
                    // the comment explaining it.
                    emitChatText(remaining.slice(0, remaining.length - held), false);
                    xml.scanBuf = remaining.slice(remaining.length - held);
                    xml.state = 'scanning';
                } else {
                    emitChatText(remaining);
                }
                remaining = '';
            } else {
                // Emit chat text before the opening tag — WITHOUT flushing the
                // active segment (see `syncActive` above; the parity suite pins it).
                emitChatText(remaining.slice(0, tagStart), false);
                // The tail goes through `remaining`, NOT into `scanBuf`.
                //
                // Parking it in `scanBuf` and clearing `remaining` ended the
                // `while` loop immediately, so a complete
                // `<artifact …>…</artifact>` arriving in ONE delta was never
                // processed: no artifact segment, no lifecycle events, and the
                // prose AFTER the closing tag was silently dropped as well. The
                // finalize block only flushes `state === 'in-artifact'`, so
                // `scanning` was a dead end.
                //
                // The `scanning` state already knows how to resume (it accumulates
                // `remaining` and hands the tail back after `>`), so it just had to
                // be allowed to run. Reachable from a non-SSE `AparteBackendTransport`,
                // a buffering provider, or `injectTokenStream`; the parity suite's
                // scenario split the tag across two deltas and stepped right past it.
                xml.scanBuf = '';
                remaining = remaining.slice(tagStart);
                xml.state = 'scanning';
            }
        } else if (xml.state === 'scanning') {
            // Accumulate until we have the full opening tag (ends with >)
            xml.scanBuf += remaining;
            remaining = '';
            // Entered on a partial prefix that turns out to be a different tag
            // (an <article> element, say): give the text back and return to normal.
            const cmp = Math.min(xml.scanBuf.length, XML_OPEN_TAG.length);
            if (xml.scanBuf.slice(0, cmp) !== XML_OPEN_TAG.slice(0, cmp)) {
                emitChatText(xml.scanBuf);
                xml.scanBuf = '';
                xml.state = 'normal';
                continue;
            }
            const gtIdx = xml.scanBuf.indexOf('>');
            if (gtIdx !== -1) {
                const tag = xml.scanBuf.slice(0, gtIdx + 1);
                // Parse mimeType and title attributes (single or double quotes)
                const mimeMatch = /mimeType=['"]([^'"]+)['"]/.exec(tag);
                const titleMatch = /title=['"]([^'"]+)['"]/.exec(tag);
                xml.mime = mimeMatch?.[1] ?? artifactXmlHint.mimeType;
                xml.title = titleMatch?.[1] ?? artifactXmlHint.kind;
                xml.kind = deriveArtifactKind(xml.mime, artifactXmlHint.kind);
                xml.segId = `artifact-xml-${uuid()}`;
                xml.content = '';
                const openSeg: import('../types/segments.js').AparteArtifactSegment = {
                    id: xml.segId, type: 'artifact',
                    mimeType: xml.mime, artifactType: xml.kind,
                    title: xml.title, content: '',
                };
                targetElement.addSegment?.(openSeg);
                streamingSegmentIds.add(xml.segId);
                dispatchArtifactLifecycle(targetElement, messageId, openSeg, artifactProgress, false);
                xml.state = 'in-artifact';
                remaining = xml.scanBuf.slice(gtIdx + 1);
                xml.scanBuf = '';
            }
        } else { // in-artifact
            const CLOSE = '</artifact>';
            const combined = xml.closeBuf + remaining;
            const closeIdx = combined.indexOf(CLOSE);
            if (closeIdx !== -1) {
                // Closing tag found — finalize the artifact
                xml.content += combined.slice(0, closeIdx);
                const lineCount = xml.content.split('\n').length;
                const isInline = lineCount < INLINE_MAX_LINES;
                const finalSeg: import('../types/segments.js').AparteArtifactSegment = {
                    id: xml.segId!, type: 'artifact',
                    mimeType: xml.mime, artifactType: xml.kind,
                    title: xml.title, content: xml.content,
                    inline: isInline,
                };
                targetElement.updateSegment?.(xml.segId!, { content: xml.content, inline: isInline } as Partial<import('../types/segments.js').AparteArtifactSegment>);
                dispatchArtifactLifecycle(targetElement, messageId, finalSeg, artifactProgress, true);
                xml.state = 'normal';
                xml.closeBuf = '';
                remaining = combined.slice(closeIdx + CLOSE.length);
            } else {
                // Buffer a tail chunk to handle closing tag split across deltas
                const safeLen = Math.max(0, combined.length - CLOSE.length + 1);
                const safe = combined.slice(0, safeLen);
                xml.content += safe;
                xml.closeBuf = combined.slice(safeLen);
                remaining = '';
                if (xml.segId) {
                    targetElement.updateSegment?.(xml.segId, { content: xml.content });
                    dispatchArtifactLifecycle(targetElement, messageId, {
                        id: xml.segId, type: 'artifact',
                        mimeType: xml.mime, artifactType: xml.kind,
                        title: xml.title, content: xml.content,
                    } as import('../types/segments.js').AparteArtifactSegment, artifactProgress, false);
                }
            }
        }
    }
}

/**
 * Flush a truncated artifact: a stream that ended mid-body (the model cut off
 * before `</artifact>`) still has to render what arrived.
 *
 * The twin of engine's `XmlArtifactStateMachine.finalize()`, and it lives here for
 * the same reason the feeder does — engine's copy is ONE file holding both halves,
 * so splitting them across files in core is precisely the drift the pairing exists
 * to prevent. It also puts the `scanning` note in the feeder next to the state test
 * that makes it true.
 */
export function finalizeXmlArtifact(
    xml: XmlArtifactStreamState,
    ctx: {
        targetElement: XmlArtifactFeedTarget;
        messageId: string;
        artifactProgress: Map<string, number>;
        /** Absent when the turn was not in XML-artifact mode — then there is nothing to flush. */
        artifactXmlHint: AparteArtifactHint | undefined;
        /**
         * The turn's text parser. The `scanning` branch pushes held text into it, so
         * the caller MUST call this before `textParser.finalize()`.
         */
        textParser: AparteStreamParser;
        /** So the held-text render does not re-add a segment already on screen. */
        streamingSegmentIds: Set<string>;
    },
): void {
    const { targetElement, messageId, artifactProgress, artifactXmlHint } = ctx;

    // A stream that ends mid-tag — on a held `<arti`, or on an opening tag that
    // never reached its `>` — must give that text back rather than swallow it.
    // `scanBuf` is the only place it lives.
    //
    // Engine's twin has had this branch all along; core's finalize only ever
    // handled `in-artifact`, so the held characters were dropped. The divergence
    // was invisible while the two halves of core's state machine sat 600 lines
    // apart inside a 2100-line class; naming them made it a one-line diff.
    if (xml.state === 'scanning') {
        const held = xml.scanBuf;
        xml.scanBuf = '';
        xml.state = 'normal';
        if (held) {
            // Back through the text parser, NOT as a segment of its own.
            //
            // The held characters are the tail of a prose run that is already
            // rendering, so the parser has to merge them into it. Emitting them
            // directly split one sentence into two segments and — because the active
            // segment is written last — put the held prefix BEFORE the prose it
            // follows. The parity suite caught both.
            //
            // Rendered the same way every other delta is (completed segments, then
            // the active one), because the engine twin's adapter does exactly that
            // for the `chat-text` its machine hands back. Parsing and leaving the
            // render to `finalize()` alone produced one write against the twin's
            // two — a divergence with no behavioural argument behind it.
            //
            // This requires the caller to flush the XML machine BEFORE
            // `textParser.finalize()`, so what we push here still gets flushed.
            const r = ctx.textParser.parse(held);
            for (const seg of r.segments) {
                if (!ctx.streamingSegmentIds.has(seg.id)) {
                    targetElement.addSegment?.(seg);
                    ctx.streamingSegmentIds.add(seg.id);
                } else if ('content' in seg) {
                    targetElement.updateSegment?.(seg.id, segmentContentUpdate(seg));
                }
            }
            const active = ctx.textParser.getState().activeSegment;
            if (active) {
                if (!ctx.streamingSegmentIds.has(active.id)) {
                    targetElement.addSegment?.(active);
                    ctx.streamingSegmentIds.add(active.id);
                } else {
                    targetElement.updateSegment?.(active.id, segmentContentUpdate(active));
                }
            }
        }
        return;
    }

    // If the stream ended while still inside an <artifact> tag (model truncated —
    // common on small models with low maxTokens), flush whatever was buffered and
    // render the partial artifact.
    if (artifactXmlHint && xml.state === 'in-artifact' && xml.segId) {
        xml.content += xml.closeBuf;
        const lineCount = xml.content.split('\n').length;
        const isInline = lineCount < INLINE_MAX_LINES;
        targetElement.updateSegment?.(xml.segId, { content: xml.content, inline: isInline } as Partial<AparteArtifactSegment>);
        dispatchArtifactLifecycle(targetElement, messageId, {
            id: xml.segId, type: 'artifact',
            mimeType: xml.mime, artifactType: xml.kind,
            title: xml.title, content: xml.content, inline: isInline,
        } as AparteArtifactSegment, artifactProgress, true);
        console.warn('[AparteClient] XML artifact finalized without closing tag — content may be partial.');
    }
}
