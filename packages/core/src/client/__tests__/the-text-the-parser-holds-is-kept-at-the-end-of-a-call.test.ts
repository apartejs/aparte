// @vitest-environment jsdom
/**
 * The text the parser still holds is kept when a model call ends, with or without `text-flush`.
 *
 * The parser holds a delta that ends on a backtick (or on the start of a block tag) until more
 * arrives, and only `text-flush` handed it over. aparté's own runner sends one at the end of
 * every call; a server loop of one's own may not (apartejs/aparte#275). Then a reply whose last
 * words were inline code lost them: "La valeur est `42`" showed "La valeur est ", and was saved
 * that way. A `turn-start` (the next call) or the run's end (done, suspended, aborted) means the
 * call's text is complete, so it is handed over there too. Twice is harmless: a parser handed
 * its text holds nothing more.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';
import type { StreamRunEvent } from '@aparte/engine';

/** Run the events, and return the text the reply shows, segment by segment. */
function textOf(events: StreamRunEvent[]): string[] {
    const segments = new Map<string, AparteSegment>();
    const order: string[] = [];
    const target = {
        addSegment: (s: AparteSegment) => { segments.set(s.id, { ...s }); order.push(s.id); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const s = segments.get(id);
            if (s) segments.set(id, { ...s, ...u } as AparteSegment);
        },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
    const emit = createStreamAdapter({ target, config: aparteGlobalConfig, messageId: 'm1' });
    for (const e of events) emit(e);
    return order.map((id) => segments.get(id)!).filter((s) => s.type === 'text').map((s) => (s as { content: string }).content);
}

const start: StreamRunEvent[] = [{ type: 'run-start' }, { type: 'turn-start' }];

describe('a reply whose last words are inline code, with no text-flush', () => {
    it('keeps them when the run is done', () => {
        expect(textOf([...start, { type: 'text-delta', delta: 'La valeur est `42`' }, { type: 'run-done' }]).join(''))
            .toBe('La valeur est `42`');
    });

    it('keeps them when the run pauses for a decision', () => {
        expect(textOf([...start, { type: 'text-delta', delta: 'Je lance `pnpm build`' }, { type: 'run-suspended', pending: [] }]).join(''))
            .toBe('Je lance `pnpm build`');
    });

    it('keeps them when the run is stopped', () => {
        expect(textOf([...start, { type: 'text-delta', delta: 'Le fichier `a.ts`' }, { type: 'run-aborted' } as StreamRunEvent]).join(''))
            .toBe('Le fichier `a.ts`');
    });

    it('keeps the text before a tool call when the next call starts', () => {
        const text = textOf([
            ...start,
            { type: 'text-delta', delta: 'Je lis `a.ts`' },
            { type: 'tool-start', toolCallId: 'c1', name: 'read_file', input: {} },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Il est vide.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ]);
        expect(text).toEqual(['Je lis `a.ts`', 'Il est vide.']);
    });

    it('is unchanged when the server did send text-flush: the text is there once', () => {
        expect(textOf([...start, { type: 'text-delta', delta: 'La valeur est `42`' }, { type: 'text-flush' }, { type: 'turn-start' }, { type: 'run-done' }]))
            .toEqual(['La valeur est `42`']);
    });
});
