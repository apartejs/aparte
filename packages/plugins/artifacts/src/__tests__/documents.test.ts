/**
 * A document is the run of versions that share one id, read from the conversation.
 *
 * Nothing is stored beside the transcript: `artifactDocuments()` is a pure reading of
 * `getMessages()`, so a branch shows its own versions, a reload shows what was saved, and
 * the card, the panel, the tools and the app all agree because they read the same thing.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { artifactDocuments } from '../documents.js';
import { artifactSegment } from '../segment.js';

let n = 0;
const call = (
    structured: Record<string, unknown> | undefined,
    extra: Partial<AparteToolCallSegment> = {},
    name = 'create_artifact',
): AparteToolCallSegment => {
    const id = `seg-${++n}`;
    return {
        id,
        type: 'tool_call',
        toolCall: { id: `call-${n}`, name, input: structured ?? {} },
        status: 'resolved',
        result: 'Artifact created.',
        ...(structured ? { structuredResult: structured } : {}),
        ...extra,
    };
};
const reply = (id: string, ...segments: AparteSegment[]): AparteMessage =>
    ({ id, role: 'assistant', content: '', timestamp: 0, segments }) as AparteMessage;
const ask = (id: string, content: string): AparteMessage => ({ id, role: 'user', content, timestamp: 0 }) as AparteMessage;

describe('artifactDocuments', () => {
    it('reads a conversation saved before documents had ids: each artifact is a document of one version', () => {
        const first = call({ mimeType: 'text/markdown', title: 'Notes', content: '# a' });
        const second = call({ mimeType: 'text/html', content: '<p>b</p>' });
        const docs = artifactDocuments([ask('u1', 'write'), reply('a1', first), reply('a2', second)]);

        expect(docs.map((d) => d.id)).toEqual([first.id, second.id]);
        expect(docs[0]!.versions).toHaveLength(1);
        expect(docs[0]!.latest).toMatchObject({
            documentId: first.id, index: 1, author: 'model', messageId: 'a1', segmentId: first.id,
            mimeType: 'text/markdown', artifactType: 'markdown', title: 'Notes', content: '# a',
        });
        expect(docs[1]!.title).toBeUndefined();
    });

    it('an id seen again adds a version to the same document, in the order of the conversation', () => {
        const v1 = call({ documentId: 'doc_a1b2c3d4', mimeType: 'text/markdown', title: 'Plan', content: 'one' });
        const other = call({ documentId: 'doc_ffff0000', mimeType: 'text/markdown', title: 'Other', content: 'x' });
        const v2 = call({ documentId: 'doc_a1b2c3d4', mimeType: 'text/markdown', title: 'Plan, revised', content: 'two' });
        const docs = artifactDocuments([reply('a1', v1), reply('a2', other), reply('a3', v2)]);

        expect(docs.map((d) => d.id)).toEqual(['doc_a1b2c3d4', 'doc_ffff0000']);
        const plan = docs[0]!;
        expect(plan.versions.map((v) => [v.index, v.content, v.messageId])).toEqual([[1, 'one', 'a1'], [2, 'two', 'a3']]);
        expect(plan.latest.content).toBe('two');
        // The document is called what its last version is called.
        expect(plan.title).toBe('Plan, revised');
    });

    it('keeps the last known title when a later version gives none', () => {
        const docs = artifactDocuments([
            reply('a1', call({ documentId: 'doc_1', mimeType: 'text/plain', title: 'Named', content: 'a' })),
            reply('a2', call({ documentId: 'doc_1', mimeType: 'text/plain', content: 'b' })),
        ]);
        expect(docs[0]!.title).toBe('Named');
    });

    // Each carries a structured result on purpose: the status alone must keep it out.
    it('a call that did not produce a document is not a version: refused, stopped, failed, waiting', () => {
        const input = { documentId: 'doc_1', mimeType: 'text/plain', content: 'x' };
        const docs = artifactDocuments([reply('a1',
            call(input, { status: 'rejected' }),
            call(input, { status: 'aborted' }),
            call(input, { status: 'failed' }),
            call(input, { status: 'awaiting-approval' }),
            call(input, { status: 'pending' }),
        )]);
        expect(docs).toEqual([]);
    });

    it('ignores other tools, and a resolved call whose result carries no document', () => {
        const docs = artifactDocuments([reply('a1',
            call({ mimeType: 'text/plain', content: 'x' }, {}, 'web_search'),
            call({ note: 'no content here' }),
            call(undefined),
        )]);
        expect(docs).toEqual([]);
    });

    it('reads the tag: the segment is a version, under its own id or the one the tag claims', () => {
        const tagged = artifactSegment('seg-tag-1', { mimeType: 'text/markdown', title: 'Draft', content: 'one' });
        const again = { ...artifactSegment('seg-tag-2', { mimeType: 'text/markdown', content: 'two' }), documentId: 'seg-tag-1' };
        const docs = artifactDocuments([reply('a1', tagged), reply('a2', again)]);

        expect(docs).toHaveLength(1);
        expect(docs[0]!.id).toBe('seg-tag-1');
        expect(docs[0]!.versions.map((v) => v.content)).toEqual(['one', 'two']);
    });

    it('a tool and a tag can write the same document', () => {
        const v1 = call({ documentId: 'doc_1', mimeType: 'text/markdown', content: 'tool' });
        const v2 = { ...artifactSegment('seg-tag', { mimeType: 'text/markdown', content: 'tag' }), documentId: 'doc_1' };
        const docs = artifactDocuments([reply('a1', v1), reply('a2', v2)]);
        expect(docs[0]!.versions.map((v) => v.content)).toEqual(['tool', 'tag']);
    });

    it('marks a tagged document that is still being written', () => {
        const writing = { ...artifactSegment('seg-tag', { mimeType: 'text/markdown', content: 'par' }), isStreaming: true };
        expect(artifactDocuments([reply('a1', writing)])[0]!.latest.streaming).toBe(true);
        const done = { ...writing, isStreaming: false };
        expect(artifactDocuments([reply('a1', done)])[0]!.latest.streaming).toBeUndefined();
    });

    it('an id that is not a plain token is not trusted: the segment gets its own document', () => {
        for (const bad of ['', 'a b', '../x', 'x'.repeat(65), '<img>', 42]) {
            const seg = call({ documentId: bad, mimeType: 'text/plain', content: 'x' });
            expect(artifactDocuments([reply('a1', seg)])[0]!.id, String(bad)).toBe(seg.id);
        }
    });

    it('reads our tools under the names the app gave them', () => {
        const renamed = call({ mimeType: 'text/plain', content: 'x' }, {}, 'make_document');
        expect(artifactDocuments([reply('a1', renamed)])).toEqual([]);
        expect(artifactDocuments([reply('a1', renamed)], { tools: ['make_document'] })).toHaveLength(1);
    });

    it("`read` translates a segment the plugin does not know, an agent's own tool for instance", () => {
        const foreign = call(undefined, { result: 'saved', toolCall: { id: 'c1', name: 'write_report', input: { name: 'Q3', body: '# Q3' } } }, 'write_report');
        const docs = artifactDocuments([reply('a1', foreign)], {
            read: (segment) => {
                if (segment.type !== 'tool_call' || segment.toolCall.name !== 'write_report' || segment.status !== 'resolved') return null;
                const input = segment.toolCall.input as { name: string; body: string };
                return { documentId: 'report', mimeType: 'text/markdown', title: input.name, content: input.body };
            },
        });
        expect(docs[0]).toMatchObject({ id: 'report', title: 'Q3' });
        expect(docs[0]!.latest).toMatchObject({ content: '# Q3', artifactType: 'markdown', segmentId: foreign.id });
    });

    it('`read` returning null leaves the segment to the default reading', () => {
        const ours = call({ mimeType: 'text/plain', content: 'x' });
        expect(artifactDocuments([reply('a1', ours)], { read: () => null })).toHaveLength(1);
    });

    it('reads nothing from a conversation with no document, or no messages', () => {
        expect(artifactDocuments([])).toEqual([]);
        expect(artifactDocuments([ask('u1', 'hello'), reply('a1', { id: 't', type: 'text', content: 'hi' } as AparteSegment)])).toEqual([]);
    });
});
