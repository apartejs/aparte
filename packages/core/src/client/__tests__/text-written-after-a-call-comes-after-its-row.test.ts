// @vitest-environment jsdom
/**
 * What a model writes after a tool call, in the same model call, comes after the call's row.
 *
 * One model call can stream text, a call, then more text: `@aparte/provider-scenario` does, and
 * so does Gemini through the AI SDK when a function call is followed by text. aparté's runner
 * announces the call where it is read (`tool-start`), but the parser was still holding the text
 * before it open, so the text after the call grew that segment: "Let me check. It is 14 degrees."
 * stood ABOVE the get_weather row, as if the answer had come before the tool ran, and was saved
 * that way. The AG-UI and n8n runners hand the text over before announcing a call; the adapter
 * now does it for every producer, as it already did around an activity.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';
import type { StreamRunEvent } from '@aparte/engine';

/** Run the events, and return the reply's segments in order, as `type` or `type:text`. */
function shapeOf(events: StreamRunEvent[]): string[] {
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
    return order.map((id) => segments.get(id)!).map((s) =>
        s.type === 'text' ? `text:${(s as { content: string }).content.trim()}` : s.type);
}

const start: StreamRunEvent[] = [{ type: 'run-start' }, { type: 'turn-start' }];
const call = (queued = false): StreamRunEvent =>
    ({ type: 'tool-start', toolCallId: 'c1', name: 'get_weather', input: { city: 'Lille' }, ...(queued ? { queued: true } : {}) }) as StreamRunEvent;

describe('text, a call, then text, in one model call', () => {
    it('the text after the call is its own segment, after the row', () => {
        expect(shapeOf([
            ...start,
            { type: 'text-delta', delta: 'Let me check.' },
            call(),
            { type: 'tool-resolved', toolCallId: 'c1', result: 'Lille 14C' },
            { type: 'text-delta', delta: ' It is 14 degrees.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ])).toEqual(['text:Let me check.', 'tool_call', 'text:It is 14 degrees.']);
    });

    it('the same for a call announced queued, as a step announces it', () => {
        expect(shapeOf([
            ...start,
            { type: 'text-delta', delta: 'Two things.' },
            call(true),
            { type: 'text-delta', delta: ' Then the answer.' },
            { type: 'tool-running', toolCallId: 'c1' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ])).toEqual(['text:Two things.', 'tool_call', 'text:Then the answer.']);
    });

    it('a fence open across the call is closed before the row, and nothing is written twice', () => {
        const shape = shapeOf([
            ...start,
            { type: 'text-delta', delta: 'Before `x`' },
            call(),
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'text-delta', delta: ' after.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ]);
        expect(shape).toEqual(['text:Before `x`', 'tool_call', 'text:after.']);
    });
});
