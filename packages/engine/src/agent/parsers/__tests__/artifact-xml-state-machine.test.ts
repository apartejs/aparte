import { describe, it, expect } from 'vitest';
import { ArtifactXmlStateMachine, deriveArtifactKind, type XmlArtifactEvent } from '../artifact-xml-state-machine';

const HINT = { mimeType: 'text/plain', kind: 'text' };

/** Feed a sequence of deltas, return the flat event list (deterministic ids). */
function run(deltas: string[], hint = HINT): XmlArtifactEvent[] {
    let n = 0;
    const sm = new ArtifactXmlStateMachine(hint, () => `art-${n++}`);
    const out: XmlArtifactEvent[] = [];
    for (const d of deltas) out.push(...sm.feed(d));
    out.push(...sm.finalize());
    return out;
}

describe('deriveArtifactKind', () => {
    it('maps known mime substrings, falls back otherwise', () => {
        expect(deriveArtifactKind('text/html', 'x')).toBe('html');
        expect(deriveArtifactKind('application/vnd.ant.react', 'x')).toBe('react');
        expect(deriveArtifactKind('text/javascript', 'x')).toBe('js');
        expect(deriveArtifactKind('image/svg+xml', 'x')).toBe('svg');
        expect(deriveArtifactKind('application/json', 'x')).toBe('json');
        expect(deriveArtifactKind('text/csv', 'x')).toBe('csv');
        expect(deriveArtifactKind('text/markdown', 'x')).toBe('markdown');
        expect(deriveArtifactKind('text/css', 'x')).toBe('css');
        expect(deriveArtifactKind('application/octet-stream', 'fallback')).toBe('fallback');
    });
});

describe('ArtifactXmlStateMachine', () => {
    // NB: the open tag is only processed on the delta AFTER it completes — the
    // `normal→scanning` transition sets `remaining=''` and exits the loop, so the
    // buffered tag waits for the next feed. Faithful to _streamLoop; real streams
    // are token-by-token so this never delivers a whole artifact atomically.
    it('parses an artifact streamed across deltas', () => {
        expect(run(['<artifact mimeType="text/html" title="Page">', 'body</artifact>'])).toEqual([
            { type: 'artifact-open', id: 'art-0', mimeType: 'text/html', kind: 'html', title: 'Page' },
            { type: 'artifact-close', id: 'art-0', content: 'body', inline: true },
        ]);
    });

    it('emits chat text before and after the artifact', () => {
        expect(run(['Hi <artifact mimeType="text/css" title="S">', 'b</artifact> bye'])).toEqual([
            { type: 'chat-text', text: 'Hi ', reduced: true },
            { type: 'artifact-open', id: 'art-0', mimeType: 'text/css', kind: 'css', title: 'S' },
            { type: 'artifact-close', id: 'art-0', content: 'b', inline: true },
            { type: 'chat-text', text: ' bye' },
        ]);
    });

    it('routes pure chat text (no artifact) straight through', () => {
        expect(run(['just talking', ' more'])).toEqual([
            { type: 'chat-text', text: 'just talking' },
            { type: 'chat-text', text: ' more' },
        ]);
    });

    it('handles an opening tag split across deltas', () => {
        expect(run(['<artifact mime', 'Type="text/html">x</artifact>'])).toEqual([
            { type: 'artifact-open', id: 'art-0', mimeType: 'text/html', kind: 'html', title: 'text' },
            { type: 'artifact-close', id: 'art-0', content: 'x', inline: true },
        ]);
    });

    it('handles a closing tag split across deltas', () => {
        // Body 'x', then the close tag arrives as '</arti' + 'fact>'.
        const events = run(['<artifact mimeType="text/html" title="T">x</arti', 'fact>']);
        const close = events.find(e => e.type === 'artifact-close');
        expect(close).toEqual({ type: 'artifact-close', id: 'art-0', content: 'x', inline: true });
    });

    it('streams body chunks with the accumulated content', () => {
        const events = run(['<artifact mimeType="text/plain" title="T">', 'hello ', 'world</artifact>']);
        const chunks = events.filter(e => e.type === 'artifact-chunk').map(e => (e as { content: string }).content);
        // Each chunk carries the full accumulated body so far (minus the buffered tail).
        expect(chunks.length).toBeGreaterThan(0);
        const close = events.find(e => e.type === 'artifact-close') as { content: string };
        expect(close.content).toBe('hello world');
    });

    it('finalizes a truncated (unclosed) artifact on finalize()', () => {
        const events = run(['<artifact mimeType="text/html" title="T">', 'partial body no close']);
        const close = events.find(e => e.type === 'artifact-close');
        expect(close).toEqual({ type: 'artifact-close', id: 'art-0', content: 'partial body no close', inline: true });
    });

    it('marks a >=15-line artifact as not inline', () => {
        const body = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
        const events = run(['<artifact mimeType="text/plain" title="T">', `${body}</artifact>`]);
        const close = events.find(e => e.type === 'artifact-close') as { inline: boolean };
        expect(close.inline).toBe(false);
    });

    it('falls back to the hint when the open tag omits mimeType/title', () => {
        const events = run(['<artifact>', 'body</artifact>'], { mimeType: 'text/markdown', kind: 'markdown' });
        expect(events[0]).toEqual({ type: 'artifact-open', id: 'art-0', mimeType: 'text/markdown', kind: 'markdown', title: 'markdown' });
    });

    it('parses two artifacts in one turn', () => {
        const events = run(['<artifact mimeType="text/html" title="A">', '1</artifact> and <artifact mimeType="text/css" title="B">', '2</artifact>']);
        const opens = events.filter(e => e.type === 'artifact-open');
        const closes = events.filter(e => e.type === 'artifact-close');
        expect(opens).toHaveLength(2);
        expect(closes).toHaveLength(2);
        expect((opens[1] as { id: string }).id).toBe('art-1');
        expect(events.some(e => e.type === 'chat-text' && (e as { text: string }).text === ' and ')).toBe(true);
    });

    it('finalize() is a no-op outside an artifact', () => {
        let n = 0;
        const sm = new ArtifactXmlStateMachine(HINT, () => `art-${n++}`);
        sm.feed('plain text');
        expect(sm.finalize()).toEqual([]);
    });
});
