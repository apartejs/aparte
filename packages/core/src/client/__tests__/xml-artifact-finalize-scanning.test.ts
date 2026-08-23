/**
 * A stream that dies on a held partial `<artifact` tag must give the text back.
 *
 * The feeder deliberately holds a suffix that could be the start of `<artifact`
 * rather than emitting it as chat text — without that, a delta ending mid-tag
 * loses the artifact's whole lifecycle. The held text lives in `scanBuf` and
 * nowhere else.
 *
 * If the stream then ends, someone has to give it back. Engine's twin does:
 * `XmlArtifactStateMachine.finalize()` opens with a `scanning` branch that returns
 * `scanBuf` as chat text. Core's finalize only ever handled `in-artifact`, so the
 * held characters were dropped — a live divergence between two files whose entire
 * contract is to behave identically, found only once they were named and put side
 * by side.
 *
 * Reachable with nothing unusual: any truncated reply whose last delta happens to
 * end on `<`, `<a`, … `<artifac`. A model writing prose about tags does it, and so
 * does a maxTokens cut landing on the wrong byte.
 */
import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '../../parsers/aparte-stream-parser.js';
import {
    feedXmlArtifactDelta,
    finalizeXmlArtifact,
    type XmlArtifactStreamState,
    type XmlArtifactFeedTarget,
} from '../xml-artifact-feed.js';
import type { AparteSegment } from '../../types/index.js';

/** A target that records what the feeder writes, and nothing else. */
function recorder(): XmlArtifactFeedTarget & { added: AparteSegment[]; updated: Array<[string, Partial<AparteSegment>]> } {
    const added: AparteSegment[] = [];
    const updated: Array<[string, Partial<AparteSegment>]> = [];
    return {
        added,
        updated,
        dispatchEvent: () => true,
        addSegment: (s) => { added.push(s); },
        updateSegment: (id, u) => { updated.push([id, u]); },
    };
}

const freshState = (): XmlArtifactStreamState => ({
    state: 'normal', scanBuf: '', closeBuf: '', segId: null,
    content: '', mime: '', kind: '', title: '',
});

const hint = { mimeType: 'text/html', kind: 'html' } as never;

describe('finalizeXmlArtifact — a stream that ends on a held partial tag', () => {
    it('gives the held text back as chat text instead of swallowing it', () => {
        const target = recorder();
        const xml = freshState();
        const textParser = new AparteStreamParser();
        const ctx = {
            targetElement: target,
            messageId: 'm1',
            textParser,
            streamingSegmentIds: new Set<string>(),
            artifactProgress: new Map<string, number>(),
            artifactXmlHint: hint,
        };

        // The reply reads "Here it is: <arti" and then the stream dies.
        feedXmlArtifactDelta('Here it is: <arti', xml, ctx);

        // Held, deliberately — this half is the existing, correct behaviour.
        expect(xml.state, 'the feeder must hold a possible tag prefix').toBe('scanning');
        expect(xml.scanBuf).toBe('<arti');

        finalizeXmlArtifact(xml, {
            targetElement: target,
            messageId: 'm1',
            artifactProgress: ctx.artifactProgress,
            artifactXmlHint: hint,
            textParser,
            streamingSegmentIds: ctx.streamingSegmentIds,
        });

        // Two steps, in this order, and that IS the contract: the machine pushes the
        // held text back into the parser, then the caller flushes the parser. Doing
        // it the other way round is how the engine twin lost the text — it flushed
        // first, so what the machine handed back reached a parser that would never
        // be flushed again.
        //
        // Merged into the prose run it belongs to rather than emitted as its own
        // segment: the twin does the same, and splitting it also put the held prefix
        // BEFORE the prose it follows.
        for (const seg of textParser.finalize()) {
            if (!ctx.streamingSegmentIds.has(seg.id)) target.added.push(seg);
            else target.updated.push([seg.id, seg as never]);
        }

        const rendered = [...target.added, ...target.updated.map(([, u]) => u)]
            .map((s) => (s as { content?: string }).content ?? '')
            .join('');
        expect(rendered, 'the held "<arti" must not vanish').toContain('<arti');
        expect(rendered, 'and it stays attached to the prose before it').toContain('Here it is: <arti');
        expect(xml.scanBuf, 'and the buffer must be drained').toBe('');
    });

    it('still flushes a truncated artifact body (the branch that already worked)', () => {
        const target = recorder();
        const xml = freshState();
        const textParser = new AparteStreamParser();
        const ctx = {
            targetElement: target,
            messageId: 'm1',
            textParser,
            streamingSegmentIds: new Set<string>(),
            artifactProgress: new Map<string, number>(),
            artifactXmlHint: hint,
        };

        feedXmlArtifactDelta('<artifact mimeType="text/html" title="T"><h1>hi', xml, ctx);
        expect(xml.state).toBe('in-artifact');

        finalizeXmlArtifact(xml, {
            targetElement: target,
            messageId: 'm1',
            artifactProgress: ctx.artifactProgress,
            artifactXmlHint: hint,
            textParser,
            streamingSegmentIds: ctx.streamingSegmentIds,
        });

        const artifactUpdate = target.updated.find(([, u]) => (u as { content?: string }).content?.includes('<h1>hi'));
        expect(artifactUpdate, 'a truncated body is still rendered').toBeTruthy();
    });
});
