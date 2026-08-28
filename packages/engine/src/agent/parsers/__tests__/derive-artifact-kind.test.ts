import { describe, it, expect } from 'vitest';
import { deriveArtifactKind } from '../artifact-kind';

/**
 * This used to be a PARITY test: core kept the canonical `deriveArtifactKind` and
 * this package a byte-identical copy, and the suite walked a fixture table through
 * both. Core re-exports this one now (D1), so there is nothing to compare — the
 * table stays as this function's own regression, pinned by snapshot.
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

describe('deriveArtifactKind', () => {
    it('maps the full fixture table the way it always has', () => {
        const table = Object.fromEntries(
            MIMES.map((mime) => [mime, FALLBACKS.map((fb) => (fb === undefined ? deriveArtifactKind(mime) : deriveArtifactKind(mime, fb)))]),
        );
        expect(table).toMatchSnapshot();
    });

    it('spot-checks the semantics', () => {
        expect(deriveArtifactKind('application/vnd.ant.code', 'text')).toBe('code');
        expect(deriveArtifactKind('text/html; charset=utf-8')).toBe('html');
        expect(deriveArtifactKind('font/woff2', 'text')).toBe('text');
        expect(deriveArtifactKind('application/octet-stream')).toBe('unknown');
    });
});
