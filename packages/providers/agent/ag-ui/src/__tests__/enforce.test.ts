/**
 * The runner's table of what AG-UI 1.0 describes, held to the protocol's own schemas.
 *
 * `enforce` strips what the table does not name, so a field the protocol adds and the
 * table lacks would be stripped from every stream, with a warning, and never read. The
 * schemas ship with zod and stay out of the bundle; this test is where they are read.
 */
import { describe, it, expect } from 'vitest';
import * as schemas from '@ag-ui/core/schemas';
import { EVENT_KEYS, enforce } from '../enforce.js';

type Shaped = { shape?: Record<string, { _zod?: { def?: { values?: unknown[] } } }> };

/** Every event schema the protocol publishes, by its `type` literal, with its keys. */
function officialEvents(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [name, value] of Object.entries(schemas)) {
        if (!name.endsWith('EventSchema') || name === 'BaseEventSchema') continue;
        const shape = (value as Shaped).shape;
        const type = shape?.['type']?._zod?.def?.values?.[0];
        if (typeof type === 'string' && shape) out.set(type, Object.keys(shape).sort());
    }
    return out;
}

describe('EVENT_KEYS', () => {
    it('names every event type the protocol publishes, and no other', () => {
        expect(Object.keys(EVENT_KEYS).sort()).toEqual([...officialEvents().keys()].sort());
    });

    it('names exactly the properties each event schema describes', () => {
        for (const [type, keys] of officialEvents()) {
            const ours = ['type', 'timestamp', 'rawEvent', 'metadata', ...EVENT_KEYS[type]!].sort();
            expect(ours, type).toEqual(keys);
        }
    });
});

describe('enforce', () => {
    it('leaves a described event as it came, and quietly', () => {
        const warnings: string[] = [];
        const event = { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'hi', timestamp: 1, metadata: { a: 1 } };
        expect(enforce(event, (w) => warnings.push(w))).toEqual(event);
        expect(warnings).toEqual([]);
    });

    it('leaves a value of the wrong shape for the verifier: an outcome that is an array is malformed, not unknown', () => {
        const warnings: string[] = [];
        const outcome = [{ type: 'interrupt' }];
        expect(enforce({ type: 'RUN_FINISHED', outcome }, (w) => warnings.push(w))).toEqual({ type: 'RUN_FINISHED', outcome });
        expect(warnings).toEqual([]);
    });
});
