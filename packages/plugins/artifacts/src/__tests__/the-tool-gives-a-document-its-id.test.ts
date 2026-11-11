/**
 * The tool gives a new document its id, and tells the model.
 *
 * A model can only change a document it can name. The id is the plugin's, short enough
 * for a small model to copy, written into the structured result (so it is saved with the
 * call) and into the sentence the model reads. Passing it back adds a version.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage, AparteToolCallSegment } from '@aparte/core';
import { artifactHandler, createArtifactTool, ARTIFACT_SYSTEM_PROMPT } from '../tool.js';
import { artifactDocuments } from '../documents.js';

const signal = new AbortController().signal;
const run = (input: Record<string, unknown>, context?: Parameters<typeof artifactHandler>[2]) =>
    artifactHandler({ id: 'c1', name: 'create_artifact', input }, signal, context);
const structuredOf = (result: Awaited<ReturnType<typeof run>>) => result.structuredContent as { documentId: string; content: string };

describe('create_artifact and the document id', () => {
    it('gives a new document a short id of its own, in the result and in what the model reads', async () => {
        const result = await run({ mimeType: 'text/markdown', title: 'Plan', content: '# Plan' });
        const { documentId } = structuredOf(result);
        expect(documentId).toMatch(/^doc_[a-z0-9]{8}$/);
        expect(result.content).toContain(`id: ${documentId}`);
        expect(result.content).toContain('Artifact created');
        // How to change it later is said where the id is given.
        expect(result.content).toContain('create_artifact again with this id');
    });

    it('two new documents get two ids', async () => {
        const a = structuredOf(await run({ mimeType: 'text/plain', content: 'a' }));
        const b = structuredOf(await run({ mimeType: 'text/plain', content: 'b' }));
        expect(a.documentId).not.toBe(b.documentId);
    });

    it('takes the id the model passes back: the call is a new version of that document', async () => {
        const result = await run({ id: 'doc_a1b2c3d4', mimeType: 'text/markdown', content: 'two' });
        expect(structuredOf(result).documentId).toBe('doc_a1b2c3d4');
        expect(result.content).toContain('Artifact updated');
        expect(result.content).toContain('id: doc_a1b2c3d4');
    });

    it('does not take an id that is not a plain token: the document gets a new one', async () => {
        for (const bad of ['../etc', 'two words', '', 7, '<b>']) {
            const { documentId } = structuredOf(await run({ id: bad, mimeType: 'text/plain', content: 'x' }));
            expect(documentId, String(bad)).toMatch(/^doc_[a-z0-9]{8}$/);
        }
    });

    it('says which version this is when the conversation can be read', async () => {
        const earlier: AparteToolCallSegment = {
            id: 's1', type: 'tool_call', status: 'resolved', result: 'ok',
            toolCall: { id: 'c0', name: 'create_artifact', input: {} },
            structuredResult: { documentId: 'doc_a1b2c3d4', mimeType: 'text/markdown', content: 'one' },
        };
        const messages = [{ id: 'a1', role: 'assistant', content: '', timestamp: 0, segments: [earlier] }] as AparteMessage[];
        const target = { getMessages: () => messages } as unknown as HTMLElement;

        const updated = await run({ id: 'doc_a1b2c3d4', mimeType: 'text/markdown', content: 'two' }, { target });
        expect(updated.content).toContain('version 2');
        const fresh = await run({ mimeType: 'text/markdown', content: 'new' }, { target });
        expect(fresh.content).toContain('version 1');
    });

    it('reads the conversation from the viewport inside the chat element', async () => {
        const viewport = { getMessages: () => [] as AparteMessage[] };
        const target = { querySelector: (selector: string) => (selector === 'aparte-chat-viewport' ? viewport : null) } as unknown as HTMLElement;
        expect((await run({ mimeType: 'text/plain', content: 'x' }, { target })).content).toContain('version 1');
    });

    it('says no version number when it cannot read the conversation (a server, a worker)', async () => {
        expect((await run({ mimeType: 'text/plain', content: 'x' })).content).not.toContain('version');
    });

    it('the result is read back as a version by artifactDocuments', async () => {
        const result = await run({ mimeType: 'text/markdown', title: 'Plan', content: '# Plan' });
        const segment: AparteToolCallSegment = {
            id: 's1', type: 'tool_call', status: 'resolved', result: result.content,
            toolCall: { id: 'c1', name: 'create_artifact', input: {} }, structuredResult: result.structuredContent,
        };
        const docs = artifactDocuments([{ id: 'a1', role: 'assistant', content: '', timestamp: 0, segments: [segment] }] as AparteMessage[]);
        expect(docs[0]!.id).toBe(structuredOf(result).documentId);
    });

    it('the tool tells the model about the id: in its schema and in its prompt', () => {
        const tool = createArtifactTool();
        const properties = (tool.inputSchema as { properties: Record<string, { description: string }>; required: string[] });
        expect(properties.properties['id']?.description).toMatch(/replace/i);
        expect(properties.required).not.toContain('id');
        expect(ARTIFACT_SYSTEM_PROMPT).toContain('its id');
    });
});
