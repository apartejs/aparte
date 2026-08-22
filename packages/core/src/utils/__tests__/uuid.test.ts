import { describe, it, expect, afterEach } from 'vitest';
import { uuid } from '../uuid.js';
import { AparteStreamParser } from '../../parsers/aparte-stream-parser.js';
import { filesToAttachments } from '../files-to-attachments.js';

/**
 * The library must work outside a secure context — `http://192.168.1.x` is the
 * archetypal deployment for a bring-your-own-key / local-model consumer.
 *
 * NOTE ON THE PROBE, because getting it wrong wastes an afternoon: `randomUUID`
 * lives on `Crypto.prototype`, not on the instance. `delete crypto.randomUUID`
 * returns `true` and changes nothing, so a probe written that way reports success
 * on a broken library. The prototype is what has to be emptied.
 */
const proto = () => Object.getPrototypeOf(globalThis.crypto) as Record<string, unknown>;
let saved: unknown;
const withoutRandomUUID = (fn: () => void): void => {
    saved = proto().randomUUID;
    delete proto().randomUUID;
    // Guard the guard: if this is still a function the test proves nothing.
    expect(typeof (globalThis.crypto as unknown as Record<string, unknown>).randomUUID)
        .toBe('undefined');
    try { fn(); } finally { proto().randomUUID = saved; }
};

afterEach(() => { if (saved !== undefined) proto().randomUUID = saved; });

describe('uuid() — no secure context required', () => {
    it('still returns a distinct, non-empty id', () => {
        withoutRandomUUID(() => {
            const a = uuid();
            const b = uuid();
            expect(a).toBeTruthy();
            expect(a).not.toBe(b);
        });
    });

    it('prefers the real crypto UUID when there IS a secure context', () => {
        expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it('the stream parser survives — it used to throw on the first token', () => {
        withoutRandomUUID(() => {
            const p = new AparteStreamParser();
            expect(() => p.parse('hello')).not.toThrow();
            expect(() => p.parse('```js\nx\n```\n')).not.toThrow();
            expect(() => p.finalize()).not.toThrow();
        });
    });

    it('attachments still get ids', () => {
        // jsdom has no object-URL support; that is orthogonal to what this asserts.
        const hadCreate = 'createObjectURL' in URL;
        if (!hadCreate) (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:stub';
        withoutRandomUUID(() => {
            const out = filesToAttachments([new File(['x'], 'a.txt', { type: 'text/plain' })]);
            expect(out[0]?.id).toBeTruthy();
        });
        if (!hadCreate) delete (URL as unknown as Record<string, unknown>).createObjectURL;
    });
});
