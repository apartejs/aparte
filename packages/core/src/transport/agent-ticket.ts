/**
 * The continuation ticket of a suspended agent run (`createAparteAgentHandler`).
 *
 * Between the pause and the resume, the run's pending calls travel through the browser,
 * so the server must not take them back on the client's word: a client that could name
 * its own "pending, approved" call would reach a server tool the model never asked for.
 * The server signs the calls it emitted and runs only those.
 *
 * What it does not do, and the guide says so: it does not make a tool's input
 * trustworthy — the MODEL chose it, so a tool still checks its own rights — and it is not
 * single-use, because a server that stores nothing cannot tell a replay from a first use
 * (the handler's `onTicket` is the hook for a host that can).
 *
 * Web Crypto only: present in browsers, Node ≥ 19, Deno, Bun and Workers. Node 18 passes
 * its own `SubtleCrypto` to the handler.
 */

/** A call the ticket vouches for, as the model emitted it. */
export interface AparteTicketCall {
    id: string;
    name: string;
    input: unknown;
}

/** What the server signs when a run suspends. */
export interface AparteTicketPayload {
    v: 1;
    /** When it was signed, in ms since the epoch. */
    iat: number;
    /** The assistant message the run was streaming — a ticket answers that message only. */
    messageId: string;
    calls: AparteTicketCall[];
}

const encoder = new TextEncoder();

/**
 * JSON with its object keys sorted, so the same input signs and compares the same
 * whatever order a serializer wrote its keys in. `undefined` members are dropped, as
 * `JSON.stringify` drops them.
 */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url');
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string, subtle: SubtleCrypto): Promise<CryptoKey> {
    return subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** `base64url(payload).base64url(HMAC-SHA256(secret, payload))`, the payload in canonical JSON. */
export async function signTicket(payload: AparteTicketPayload, secret: string, subtle: SubtleCrypto): Promise<string> {
    const body = encoder.encode(canonicalJson(payload));
    const signature = new Uint8Array(await subtle.sign('HMAC', await hmacKey(secret, subtle), body));
    return `${toBase64Url(body)}.${toBase64Url(signature)}`;
}

/**
 * The payload, if the signature matches one of `secrets` (the first signs, all verify, so
 * a secret can be rotated) and it is not older than `maxAgeMs`; `null` otherwise — for a
 * forged, expired or malformed ticket alike, so a caller cannot probe which it was.
 */
export async function verifyTicket(
    ticket: string,
    secrets: readonly string[],
    subtle: SubtleCrypto,
    maxAgeMs: number,
    now: number = Date.now(),
): Promise<AparteTicketPayload | null> {
    const parts = ticket.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    let body: Uint8Array;
    let signature: Uint8Array;
    try {
        body = fromBase64Url(parts[0]);
        signature = fromBase64Url(parts[1]);
    } catch {
        return null;
    }
    let valid = false;
    for (const secret of secrets) {
        // `verify`, not a comparison of two strings: constant time.
        if (await subtle.verify('HMAC', await hmacKey(secret, subtle), signature, body)) {
            valid = true;
            break;
        }
    }
    if (!valid) return null;
    let payload: AparteTicketPayload;
    try {
        payload = JSON.parse(new TextDecoder().decode(body)) as AparteTicketPayload;
    } catch {
        return null;
    }
    if (payload?.v !== 1 || typeof payload.iat !== 'number' || typeof payload.messageId !== 'string' || !Array.isArray(payload.calls)) {
        return null;
    }
    if (now - payload.iat > maxAgeMs) return null;
    return payload;
}

/** Same calls, in the same order: ids, names and inputs (compared canonically). */
export function sameCalls(a: readonly AparteTicketCall[], b: readonly AparteTicketCall[]): boolean {
    return a.length === b.length && a.every((call, i) => {
        const other = b[i]!;
        return call.id === other.id && call.name === other.name && canonicalJson(call.input) === canonicalJson(other.input);
    });
}
