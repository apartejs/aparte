/**
 * The artifact segment, and the two ways one is produced.
 *
 * An artifact is not something a model does by nature — it is a convention an app
 * teaches it, and there are exactly two ways the convention arrives in a stream:
 *
 *  1. **A tool call.** The app registers `create_artifact` (`./tool.ts`); the model
 *     calls it with `{ mimeType, title, content }`; the call's structured result is
 *     the artifact, and the tool renderer draws the card from it.
 *  2. **A tag in the prose.** A model with no tools, or one prompted that way, writes
 *     `<artifact type="…" title="…">…</artifact>` inline; the block grammar below turns
 *     it into a segment of this type, streamed delta by delta by core's parser.
 *
 * Both end in the same card, which is what makes them one feature and not two.
 */
import type { AparteSegmentBase, AparteStreamBlock, AparteToolCallSegment } from '@aparte/core';
import { deriveArtifactKind } from './kinds.js';

/** Segment type discriminator. Registered by `setupArtifacts()`, not built into core. */
export const ARTIFACT_SEGMENT_TYPE = 'artifact' as const;

/** The default tag the grammar recognises: `<artifact …>…</artifact>`. */
export const ARTIFACT_TAG = 'artifact';

/**
 * An artifact — a document the model produced, embedded in its reply.
 *
 * `mimeType` follows standard MIME conventions, with Anthropic's vendor namespace for
 * framework-specific kinds (`application/vnd.ant.react`); `artifactType` is the short
 * kind derived from it (`'react'`, `'html'`, `'svg'`, `'pdf'`…), which is what the card
 * switches on. `content` accumulates while a tagged block streams and is complete at
 * once for a tool call.
 */
export interface ArtifactSegment extends AparteSegmentBase {
    type: typeof ARTIFACT_SEGMENT_TYPE;
    /** Standard MIME type, verbatim from the tool input or the tag's `type` / `mimeType` attribute. */
    mimeType: string;
    /** Short kind derived from `mimeType` — see {@link deriveArtifactKind}. */
    artifactType: string;
    /** Optional human title. */
    title?: string;
    /** The document. Accumulates while a tagged block streams. */
    content: string;
}

/**
 * What the model passes to the tool — and what the tool returns as its structured
 * result, so the card reads one shape on both paths.
 */
export interface ArtifactInput {
    mimeType: string;
    title?: string;
    content: string;
}

/** Build the segment for a document, from either path. */
export function artifactSegment(id: string, input: Partial<ArtifactInput>): ArtifactSegment {
    const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim() ? input.mimeType.trim() : 'text/plain';
    return {
        id,
        type: ARTIFACT_SEGMENT_TYPE,
        mimeType,
        artifactType: deriveArtifactKind(mimeType),
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : undefined,
        content: typeof input.content === 'string' ? input.content : '',
    };
}

/**
 * The block grammar for `<artifact …>…</artifact>` in the prose.
 *
 * Both attribute spellings are read — `type=` (Anthropic's) and `mimeType=` — and
 * `mimeType` wins when both are present; `title=` is optional. Everything the parser
 * does with it (chunk boundaries, the partial closing tag, `finalize()`) is core's.
 */
export function artifactBlock(tag: string = ARTIFACT_TAG): AparteStreamBlock {
    return {
        tag,
        toSegment: ({ attrs, id }) => artifactSegment(id, {
            mimeType: attrs['mimeType'] ?? attrs['mimetype'] ?? attrs['type'],
            title: attrs['title'],
            content: '',
        }),
    };
}

/**
 * The artifact a tool-call segment carries: its structured result once the tool ran,
 * else the model's input while the call is pending — so the card can be drawn before
 * the handler returns, which is instantaneous anyway.
 */
export function artifactFromToolCall(segment: AparteToolCallSegment): ArtifactSegment {
    const structured = segment.structuredResult as Partial<ArtifactInput> | undefined;
    const source = structured && typeof structured === 'object' ? structured : (segment.toolCall?.input ?? {}) as Partial<ArtifactInput>;
    const art = artifactSegment(segment.id, source);
    // A call whose input is still arriving would stream; a tool call's input arrives
    // whole, so the card is never in its streaming state here.
    art.isStreaming = false;
    return art;
}
