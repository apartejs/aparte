/**
 * A model that writes `<artifact>` in its prose can name its document too.
 *
 * The grammar gives the segment a document id (the one the tag claims, else a new one)
 * and says how the segment reads back in the history: as the tag, with that id. So a model
 * with no tools, or one behind n8n, sees what it wrote under a name, and writes
 * `<artifact id="…">` again to replace it.
 */
import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '@aparte/core';
import type { AparteMessage, AparteSegment } from '@aparte/core';
import { artifactBlock } from '../segment.js';
import type { ArtifactSegment } from '../segment.js';
import { artifactDocuments } from '../documents.js';

const NEW_ID = /^doc_[a-z0-9]{8}$/;

function parse(text: string, tag?: string): ArtifactSegment {
    const parser = new AparteStreamParser({ blocks: [artifactBlock(tag)] });
    const out: AparteSegment[] = [...parser.parse(text).segments, ...parser.finalize()];
    return out.find((s) => s.type === 'artifact') as unknown as ArtifactSegment;
}
/** What the history sends back for the segment: core puts `wire` around the content. */
const wireOf = (segment: ArtifactSegment): string => `${segment.wire?.before ?? ''}${segment.content}${segment.wire?.after ?? ''}`;
const reply = (id: string, segment: ArtifactSegment): AparteMessage => ({ id, role: 'assistant', content: '', timestamp: 0, segments: [segment] }) as AparteMessage;

describe('the <artifact> tag and the document id', () => {
    it('gives a tagged document an id of its own when the tag names none', () => {
        const segment = parse('<artifact type="text/markdown" title="Plan"># Plan</artifact>');
        expect(segment.documentId).toMatch(NEW_ID);
    });

    it('takes the id the tag names: the block is a new version of that document', () => {
        expect(parse('<artifact id="doc_a1b2c3d4" type="text/markdown">two</artifact>').documentId).toBe('doc_a1b2c3d4');
    });

    it('does not take an id that is not a plain token', () => {
        expect(parse('<artifact id="../secrets" type="text/plain">x</artifact>').documentId).toMatch(NEW_ID);
        expect(parse('<artifact id="two words" type="text/plain">x</artifact>').documentId).toMatch(NEW_ID);
    });

    it('reads back in the history as the tag, with the id, the type and the title', () => {
        const segment = parse('<artifact type="text/markdown" title="Plan"># Plan</artifact>');
        expect(wireOf(segment)).toBe(`<artifact id="${segment.documentId}" type="text/markdown" title="Plan"># Plan</artifact>`);
    });

    it('adds nothing between the tag and the body: the model reads back the line breaks it wrote', () => {
        const segment = parse('<artifact type="text/markdown">\n# Plan\n</artifact>');
        expect(wireOf(segment)).toBe(`<artifact id="${segment.documentId}" type="text/markdown">\n# Plan\n</artifact>`);
        // And the version is the document, without the tag's line breaks around it.
        expect(artifactDocuments([reply('a1', segment)])[0]!.latest.content).toBe('# Plan');
    });

    it('reads back under the tag the app chose', () => {
        const segment = parse('<doc type="text/plain">x</doc>', 'doc');
        expect(wireOf(segment)).toBe(`<doc id="${segment.documentId}" type="text/plain">x</doc>`);
    });

    it('a title cannot break out of its attribute on the way back', () => {
        const segment = parse(`<artifact type="text/plain" title='a "quoted" <b> title'>x</artifact>`);
        const before = segment.wire?.before ?? '';
        // One opening tag, and the title's quotes and brackets are gone from it.
        expect(before.match(/</g)).toHaveLength(1);
        expect(before.match(/>/g)).toHaveLength(1);
        expect(before.match(/"/g)).toHaveLength(6);
        expect(before).toContain('quoted');
    });

    it('round trip: what the model reads back, written again, is a second version of the same document', () => {
        const first = parse('<artifact type="text/markdown" title="Plan">one</artifact>');
        // The model copies the tag it was shown and changes the body.
        const second = parse(wireOf(first).replace('one', 'two'));
        expect(second.documentId).toBe(first.documentId);

        const docs = artifactDocuments([reply('a1', first), reply('a2', second)]);
        expect(docs).toHaveLength(1);
        expect(docs[0]!.id).toBe(first.documentId);
        expect(docs[0]!.versions.map((v) => v.content)).toEqual(['one', 'two']);
    });
});
