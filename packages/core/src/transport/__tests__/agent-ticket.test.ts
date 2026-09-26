// @vitest-environment node
/**
 * The continuation ticket of a suspended agent run.
 *
 * Between the pause and the resume, a run's pending calls travel through the browser.
 * The server must not take them back on the client's word: a client that could name its
 * own "pending, approved" call would reach a server tool the model never asked for. The
 * server signs the calls it emitted, and runs only those.
 */
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { signTicket, verifyTicket, canonicalJson, sameCalls, type AparteTicketPayload } from '../agent-ticket.js';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const SECRET = 'x'.repeat(32);
const DAY = 86_400_000;
const payload: AparteTicketPayload = { v: 1, iat: 1_000, messageId: 'm1', calls: [{ id: 'c1', name: 'delete_file', input: { b: 2, a: 1 } }] };

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString();

describe('the ticket', () => {
    it('verifies what it signed', async () => {
        const ticket = await signTicket(payload, SECRET, subtle);
        expect(await verifyTicket(ticket, [SECRET], subtle, DAY, 2_000)).toEqual(payload);
    });

    it('refuses a payload changed after signing', async () => {
        const ticket = await signTicket(payload, SECRET, subtle);
        const [body, sig] = ticket.split('.');
        const forged = JSON.parse(unb64(body!));
        forged.calls[0].input = { path: '/etc/passwd' };
        expect(await verifyTicket(`${b64(JSON.stringify(forged))}.${sig}`, [SECRET], subtle, DAY, 2_000)).toBeNull();
    });

    it('refuses another secret, and accepts a rotated one', async () => {
        const ticket = await signTicket(payload, SECRET, subtle);
        const other = 'y'.repeat(32);
        expect(await verifyTicket(ticket, [other], subtle, DAY, 2_000)).toBeNull();
        expect(await verifyTicket(ticket, [other, SECRET], subtle, DAY, 2_000)).toEqual(payload);
    });

    it('refuses an expired ticket, and anything that is not a ticket', async () => {
        const ticket = await signTicket(payload, SECRET, subtle);
        expect(await verifyTicket(ticket, [SECRET], subtle, DAY, 1_000 + DAY + 1)).toBeNull();
        for (const garbage of ['', 'nope', 'a.b', `${ticket}.extra`, '!!!.???']) {
            expect(await verifyTicket(garbage, [SECRET], subtle, DAY)).toBeNull();
        }
    });

    it('compares inputs whatever the key order', () => {
        expect(canonicalJson({ b: [2, { d: 1, c: 0 }], a: 1, u: undefined })).toBe('{"a":1,"b":[2,{"c":0,"d":1}]}');
        expect(sameCalls([{ id: 'c', name: 'n', input: { a: 1, b: 2 } }], [{ id: 'c', name: 'n', input: { b: 2, a: 1 } }])).toBe(true);
        expect(sameCalls([{ id: 'c', name: 'n', input: { a: 1 } }], [{ id: 'c', name: 'n', input: { a: 2 } }])).toBe(false);
        expect(sameCalls([{ id: 'c', name: 'n', input: {} }], [{ id: 'c', name: 'm', input: {} }])).toBe(false);
        expect(sameCalls([{ id: 'c', name: 'n', input: {} }], [])).toBe(false);
    });
});
