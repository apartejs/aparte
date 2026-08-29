import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { APARTE_DEFAULT_LOCALE, type AparteLocale } from '../locale';

describe('APARTE_DEFAULT_LOCALE', () => {
    it('should have all required keys', () => {
        expect(APARTE_DEFAULT_LOCALE.inputPlaceholder).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.sendButton).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.copy).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.copied).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.retry).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.thinking).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.typing).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.error).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.running).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.run).toBeDefined();
        expect(APARTE_DEFAULT_LOCALE.file).toBeDefined();
    });

    it('should have ltr direction', () => {
        expect(APARTE_DEFAULT_LOCALE.direction).toBe('ltr');
    });

    it('should have English values', () => {
        expect(APARTE_DEFAULT_LOCALE.sendButton).toBe('Send');
        expect(APARTE_DEFAULT_LOCALE.thinking).toBe('Thinking...');
        expect(APARTE_DEFAULT_LOCALE.inputPlaceholder).toBe('Type a message...');
    });

    it('should be a valid AparteLocale', () => {
        const locale: AparteLocale = APARTE_DEFAULT_LOCALE;
        expect(locale).toBeDefined();
    });
});

/**
 * Every key core declares is read by something.
 *
 * `tokensPerSecondLabel` was the one key of the eighty-odd with no reader anywhere:
 * declared in the interface, given a default, mirrored into `@aparte/locale-fr`, and
 * rendered by nothing — its JSDoc named a "tokens-per-second perf chip" that does not
 * exist in this library. A locale key is a public contract a translator pays for, so
 * one that renders nowhere is work asked of every locale author for no screen.
 *
 * The search is TEXTUAL and repo-wide rather than a `t('…')` scan, because a key is
 * reached in more ways than one call shape: `t('copy')`, `getLocale().approvalAsk`,
 * a computed `word(key)` inside a status table, a docs page naming it as a knob. Any
 * of those counts as a reader; only a name that appears in no file at all does not.
 * Its two declaration sites are excluded, since a key declares itself in both.
 *
 * The FLOOR is the point. A corpus located by a walk silently shrinks when a directory
 * is renamed, and a shrunken corpus makes every assertion above vacuous — it would
 * report "no unread keys" over four files. Same failure the stylesheet helper and the
 * docs generators each hit once.
 */
describe('APARTE_DEFAULT_LOCALE — every key has a reader', () => {
    const SKIP = new Set(['direction', 'tag']);
    const CORPUS_FLOOR = 600;
    /*
     * The two declaration sites — a key declares itself in both — and this file,
     * which names dead keys in prose by design: the paragraph above cites the one
     * this check was written for, and a scan that counted its own explanation as a
     * reader would go green on exactly the key it exists to find. Measured: it did.
     */
    const EXCLUDED = [
        'packages/core/src/config/locale.ts',
        'packages/locales/fr/src/index.ts',
        'packages/core/src/config/__tests__/locale.test.ts',
    ];
    const EXTENSIONS = /\.(ts|tsx|mts|mjs|js|svelte|vue|astro|md|mdx|html|css)$/;

    function repoRoot(): string {
        let dir = process.cwd();
        for (let i = 0; i < 6; i++) {
            if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
            dir = dirname(dir);
        }
        throw new Error(`locale reader scan: no pnpm-workspace.yaml above ${process.cwd()}`);
    }

    function walk(dir: string, out: string[] = []): string[] {
        for (const name of readdirSync(dir)) {
            if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name === '.astro') continue;
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path, out);
            else if (EXTENSIONS.test(name) && name !== 'CHANGELOG.md') out.push(path);
        }
        return out;
    }

    const root = repoRoot();
    const files = [join(root, 'packages'), join(root, 'apps', 'docs', 'src')]
        .filter((d) => existsSync(d))
        .flatMap((d) => walk(d))
        .filter((f) => !EXCLUDED.some((e) => f.endsWith(e.split('/').join(sep))));
    const corpus = files.map((f) => readFileSync(f, 'utf8'));

    it(`read enough of the repo to mean something (>= ${CORPUS_FLOOR} files)`, () => {
        expect(files.length).toBeGreaterThanOrEqual(CORPUS_FLOOR);
    });

    it('names no key that nothing anywhere reads', () => {
        const unread = Object.keys(APARTE_DEFAULT_LOCALE)
            .filter((key) => !SKIP.has(key))
            .filter((key) => {
                const word = new RegExp(String.raw`\b${key}\b`);
                return !corpus.some((text) => word.test(text));
            });
        expect(unread, 'declared, translated by every locale, and rendered by nothing').toEqual([]);
    });
});
