import { describe, it, expect } from 'vitest';
import { deriveArtifactKind } from '../aparte-stream-parser.js';

describe('deriveArtifactKind', () => {
    it('extracts the kind from the Anthropic artifact mime convention', () => {
        expect(deriveArtifactKind('application/vnd.ant.react')).toBe('react');
        expect(deriveArtifactKind('application/vnd.ant.code')).toBe('code');
        expect(deriveArtifactKind('application/vnd.ant.mermaid')).toBe('mermaid');
    });

    it('maps each known mime type to its kind', () => {
        expect(deriveArtifactKind('text/html')).toBe('html');
        expect(deriveArtifactKind('application/xhtml+xml')).toBe('html');
        expect(deriveArtifactKind('application/javascript')).toBe('js');
        expect(deriveArtifactKind('text/javascript')).toBe('js');
        expect(deriveArtifactKind('text/css')).toBe('css');
        expect(deriveArtifactKind('image/svg+xml')).toBe('svg');
        expect(deriveArtifactKind('application/json')).toBe('json');
        expect(deriveArtifactKind('text/markdown')).toBe('markdown');
        expect(deriveArtifactKind('text/csv')).toBe('csv');
        expect(deriveArtifactKind('text/plain')).toBe('text');
    });

    it('is case-insensitive and trims surrounding whitespace', () => {
        expect(deriveArtifactKind('  TEXT/HTML  ')).toBe('html');
        expect(deriveArtifactKind('Application/Vnd.Ant.React')).toBe('react');
    });

    it('falls back to "unknown" for an unrecognised or empty mime', () => {
        expect(deriveArtifactKind('application/octet-stream')).toBe('unknown');
        expect(deriveArtifactKind('')).toBe('unknown');
        // Defensive: the impl guards `mimeType || ''`, so a nullish value never throws.
        expect(deriveArtifactKind(undefined as unknown as string)).toBe('unknown');
    });

    it('rescues parameterised/vendor variants via substring (superset of exact match)', () => {
        expect(deriveArtifactKind('text/html; charset=utf-8')).toBe('html');
        expect(deriveArtifactKind('application/ld+json')).toBe('json');
        expect(deriveArtifactKind('application/x-react-component')).toBe('react');
    });

    it('honours a caller-supplied fallback for unrecognised mimes only', () => {
        expect(deriveArtifactKind('font/woff2', 'text')).toBe('text');
        expect(deriveArtifactKind('', 'code')).toBe('code');
        // Recognised mimes ignore the fallback.
        expect(deriveArtifactKind('text/css', 'text')).toBe('css');
        // The vendor namespace wins over the fallback (used by the XML path).
        expect(deriveArtifactKind('application/vnd.ant.code', 'text')).toBe('code');
    });
});
