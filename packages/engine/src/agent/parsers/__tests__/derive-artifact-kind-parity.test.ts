import { describe, it, expect } from 'vitest';
import { deriveArtifactKind as engineDerive } from '../artifact-xml-state-machine';
import { deriveArtifactKind as coreDerive } from '@aparte/core';

/**
 * The engine keeps a byte-identical COPY of core's `deriveArtifactKind`
 * (`@aparte/core` is an optional peer — no runtime import allowed). This suite is
 * the mechanical "keep the two in sync" guard: any drift between the copies
 * fails here before it can ship.
 */

const MIMES = [
    // Anthropic vendor namespace
    'application/vnd.ant.react',
    'application/vnd.ant.code',
    'application/vnd.ant.mermaid',
    // Exact standard MIMEs
    'text/html',
    'application/xhtml+xml',
    'application/javascript',
    'text/javascript',
    'text/css',
    'image/svg+xml',
    'application/json',
    'text/markdown',
    'text/csv',
    'text/plain',
    // Parameterised / vendor variants (substring rescue)
    'text/html; charset=utf-8',
    'application/ld+json',
    'application/x-react-component',
    // Normalisation
    '  TEXT/HTML  ',
    'Application/Vnd.Ant.React',
    // Unrecognised / degenerate
    'application/octet-stream',
    'font/woff2',
    '',
];

const FALLBACKS: (string | undefined)[] = [undefined, 'unknown', 'text', 'code'];

describe('deriveArtifactKind — engine copy stays in sync with @aparte/core', () => {
    it('returns identical results across the full fixture table', () => {
        for (const mime of MIMES) {
            for (const fb of FALLBACKS) {
                const engine = fb === undefined ? engineDerive(mime) : engineDerive(mime, fb);
                const core = fb === undefined ? coreDerive(mime) : coreDerive(mime, fb);
                expect(engine, `mime="${mime}" fallback=${String(fb)}`).toBe(core);
            }
        }
    });

    it('spot-checks the shared semantics', () => {
        expect(engineDerive('application/vnd.ant.code', 'text')).toBe('code');
        expect(engineDerive('text/html; charset=utf-8')).toBe('html');
        expect(engineDerive('font/woff2', 'text')).toBe('text');
        expect(engineDerive('application/octet-stream')).toBe('unknown');
    });
});
