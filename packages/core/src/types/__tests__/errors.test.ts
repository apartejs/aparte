/**
 * AparteError.from — reads what an error says about itself before settling on UNKNOWN.
 *
 * Every transport error used to surface as UNKNOWN_ERROR: the transports threw a bare
 * Error and `from` kept its default whatever the status was. The table below is the one
 * the enum's comments had promised all along.
 */
import { describe, it, expect } from 'vitest';
import { AparteError, AparteErrorCode } from '../errors.js';

const withStatus = (message: string, status: number): Error => Object.assign(new Error(message), { status });

describe('AparteError.from', () => {
    it('returns an AparteError untouched', () => {
        const err = new AparteError('mine', AparteErrorCode.PROVIDER_POLICY);
        expect(AparteError.from(err)).toBe(err);
    });

    it('reads the code off the status when the caller settles for UNKNOWN, and keeps everything else', () => {
        const err = withStatus('rate limited', 429);
        const e = AparteError.from(err);
        expect(e.code).toBe(AparteErrorCode.USAGE_RATE_LIMIT);
        expect(e.httpStatus).toBe(429);
        expect(e.message).toBe('rate limited');
        expect(e.originalError).toBe(err);
    });

    it.each([
        [400, AparteErrorCode.USAGE_BAD_REQUEST],
        [401, AparteErrorCode.CONFIG_INVALID_KEY],
        [403, AparteErrorCode.CONFIG_INVALID_KEY],
        [408, AparteErrorCode.NET_TIMEOUT],
        [429, AparteErrorCode.USAGE_RATE_LIMIT],
        [500, AparteErrorCode.PROVIDER_ERROR],
        [502, AparteErrorCode.PROVIDER_ERROR],
        [503, AparteErrorCode.PROVIDER_UNAVAILABLE],
    ])('codeForStatus(%i) is %s', (status, code) => {
        expect(AparteError.codeForStatus(status)).toBe(code);
    });

    it('leaves a status the enum does not name at UNKNOWN, and still carries the status', () => {
        const e = AparteError.from(withStatus('teapot', 418));
        expect(e.code).toBe(AparteErrorCode.UNKNOWN_ERROR);
        expect(e.httpStatus).toBe(418);
        expect(AparteError.codeForStatus(404)).toBeUndefined();
        expect(AparteError.codeForStatus(undefined)).toBeUndefined();
    });

    it('keeps a code the caller named, whatever the status says', () => {
        const e = AparteError.from(withStatus('moderated', 429), AparteErrorCode.PROVIDER_POLICY);
        expect(e.code).toBe(AparteErrorCode.PROVIDER_POLICY);
        expect(e.httpStatus).toBe(429);
    });

    it('uses the default status when the error carries none', () => {
        expect(AparteError.from(new Error('down'), undefined, 503).code).toBe(AparteErrorCode.PROVIDER_UNAVAILABLE);
    });

    it("reads fetch's network failure as NET_ERROR — and no other TypeError", () => {
        expect(AparteError.from(new TypeError('Failed to fetch')).code).toBe(AparteErrorCode.NET_ERROR);
        expect(AparteError.from(new TypeError('NetworkError when attempting to fetch resource.')).code).toBe(AparteErrorCode.NET_ERROR);
        expect(AparteError.from(new TypeError('Load failed')).code).toBe(AparteErrorCode.NET_ERROR);
        expect(AparteError.from(new TypeError("Cannot read properties of undefined (reading 'x')")).code).toBe(AparteErrorCode.UNKNOWN_ERROR);
    });

    it('reads a TimeoutError as NET_TIMEOUT', () => {
        const err = new Error('The operation timed out.');
        err.name = 'TimeoutError';
        expect(AparteError.from(err).code).toBe(AparteErrorCode.NET_TIMEOUT);
    });

    it('wraps a non-Error value with its string form', () => {
        const e = AparteError.from('plain string');
        expect(e.message).toBe('plain string');
        expect(e.code).toBe(AparteErrorCode.UNKNOWN_ERROR);
    });
});
