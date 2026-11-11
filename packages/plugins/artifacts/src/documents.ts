/**
 * Documents and their versions, read from the conversation.
 *
 * A **document** is the run of versions that share one id; a **version** is one
 * appearance that came through, in the order of the conversation. Nothing is kept beside
 * the transcript: this is a pure reading of `getMessages()`, so the active branch shows its
 * own versions, a reload shows what was saved, and the card, the panel, the tools and the
 * app agree because they all read the same thing.
 *
 * One rule decides which document a version belongs to: **an id seen for the first time
 * opens a document, an id seen again adds a version to it.** So there is nothing to
 * validate and nothing a model can overwrite: a version is added, the earlier ones stay.
 *
 * DOM-free: the Node entry exports it too.
 */
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { artifactSegment, ARTIFACT_SEGMENT_TYPE, type ArtifactInput, type ArtifactSegment } from './segment.js';

/** The names of the tools whose result is a document, when the app did not rename them. */
export const ARTIFACT_TOOL_NAMES: readonly string[] = ['create_artifact', 'edit_artifact'];

/** One version of a document: what was written, by whom, and where it sits in the conversation. */
export interface ArtifactVersion {
    /** The document this is a version of. */
    documentId: string;
    /** 1, 2, 3… among the document's versions, in the conversation as it is read. */
    index: number;
    /** `model` for a tool call or a tag in a reply, `user` for a version a person sent. */
    author: 'model' | 'user';
    /** The message that carries it. */
    messageId: string;
    /** The segment that carries it (the card in the conversation), when it is a segment. */
    segmentId?: string;
    /** Standard MIME type, `text/plain` when none was given. */
    mimeType: string;
    /** The short kind derived from `mimeType`: `markdown`, `html`, `react`… */
    artifactType: string;
    /** The title this version was given, if any. */
    title?: string;
    /** The whole document, as of this version. */
    content: string;
    /** `true` while a tagged document is still being written. */
    streaming?: boolean;
}

/** A document: its versions, oldest first. */
export interface ArtifactDocument {
    id: string;
    /** The last title a version gave it. */
    title?: string;
    versions: ArtifactVersion[];
    /** The last version: what the document is now. */
    latest: ArtifactVersion;
}

/** What a reader hands back for a segment that carries a document. */
export type ArtifactRead = Partial<ArtifactInput> & { documentId?: string; author?: 'model' | 'user'; streaming?: boolean };

export interface ArtifactDocumentsOptions {
    /** The names of this plugin's tools, when the app renamed them. Default `create_artifact` and `edit_artifact`. */
    tools?: readonly string[];
    /**
     * Read a document out of a segment this plugin does not know: an agent's own tool, a
     * segment of the app's. Called first, for every segment; `null` leaves the segment to
     * the default reading.
     */
    read?: (segment: AparteSegment, message: AparteMessage) => ArtifactRead | null;
}

/** An id is a plain token. Anything else (a model's prose, a path, markup) is not taken as one. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `id` if it is a usable document id, else `undefined`. */
export function documentIdOf(id: unknown): string | undefined {
    return typeof id === 'string' && ID.test(id) ? id : undefined;
}

/** The default reading: this plugin's tools, once they resolved with a document, and the tag's segment. */
function defaultRead(segment: AparteSegment, tools: readonly string[]): ArtifactRead | null {
    if (segment.type === 'tool_call') {
        const call = segment as AparteToolCallSegment;
        if (call.status !== 'resolved' || !tools.includes(call.toolCall.name)) return null;
        const structured = call.structuredResult as ArtifactRead | undefined;
        if (!structured || typeof structured !== 'object' || typeof structured.content !== 'string') return null;
        return structured;
    }
    if (segment.type === ARTIFACT_SEGMENT_TYPE) {
        const tagged = segment as ArtifactSegment;
        return { ...tagged, ...(tagged.isStreaming ? { streaming: true } : {}) };
    }
    return null;
}

/**
 * The documents of a conversation, in the order each first appeared.
 *
 * Pass what `getMessages()` returns: the active branch. A conversation saved before
 * documents had ids reads as one document per artifact, under its segment's id.
 */
export function artifactDocuments(messages: readonly AparteMessage[], options: ArtifactDocumentsOptions = {}): ArtifactDocument[] {
    const tools = options.tools ?? ARTIFACT_TOOL_NAMES;
    const documents = new Map<string, ArtifactDocument>();
    for (const message of messages) {
        for (const segment of message.segments ?? []) {
            const read = options.read?.(segment, message) ?? defaultRead(segment, tools);
            if (!read) continue;
            // The segment's own normalisation: one place decides the MIME default and the kind.
            const shaped = artifactSegment(segment.id, read);
            const id = documentIdOf(read.documentId) ?? segment.id;
            let document = documents.get(id);
            const version: ArtifactVersion = {
                documentId: id,
                index: (document?.versions.length ?? 0) + 1,
                author: read.author ?? 'model',
                messageId: message.id,
                segmentId: segment.id,
                mimeType: shaped.mimeType,
                artifactType: shaped.artifactType,
                ...(shaped.title ? { title: shaped.title } : {}),
                content: shaped.content,
                ...(read.streaming ? { streaming: true as const } : {}),
            };
            if (!document) {
                document = { id, versions: [], latest: version };
                documents.set(id, document);
            }
            document.versions.push(version);
            document.latest = version;
            if (version.title) document.title = version.title;
        }
    }
    return [...documents.values()];
}
