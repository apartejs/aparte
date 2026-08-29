/**
 * The root changelog reads every publishable package.
 *
 * `gen-root-changelog.mjs` aggregates the per-package `CHANGELOG.md` files into the
 * release notes. Its corpus used to be six hand-written directory globs, each walked one
 * level deep, and `packages/tools` was not among them — so `@aparte/docs-mcp`, published
 * like everything else, contributed nothing, and the changeset announcing it would have
 * been absent from the release with no error, no warning and no gap in the output. A
 * package that says nothing and a package that is not read look identical.
 *
 * Two tests, and the second is the one that was red before the fix:
 *  1. the corpus is every non-private manifest under `packages/`, diffed against a walk
 *     this file does itself — an independent one, so a shared bug cannot pass both;
 *  2. end to end on a temp tree whose only interesting member lives at
 *     `packages/tools/y`, asserting its entry reaches the generated file.
 *
 * Plus the floor: a corpus that collapses must fail loudly rather than write a thinner
 * changelog.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'gen-root-changelog.mjs');
const REPO = resolve(dirname(SCRIPT), '..');

/** The floor the script itself carries. Kept here so a lowered floor is a visible diff. */
const PACKAGE_FLOOR = 20;

function run(script: string, args: string[]): string {
    return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** An independent walk: every non-private package.json under `packages/`. */
function manifestNames(base: string): string[] {
    const names: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'src') continue;
            const child = join(dir, entry.name);
            const manifest = join(child, 'package.json');
            if (existsSync(manifest)) {
                const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                if (!pkg.private) names.push(pkg.name);
            }
            walk(child);
        }
    };
    walk(join(base, 'packages'));
    return names.sort();
}

describe('gen-root-changelog — the corpus', () => {
    it('lists every non-private package under packages/, and nothing else', () => {
        const listed = run(SCRIPT, ['--list-packages']).trim().split('\n').filter(Boolean).sort();
        expect(listed).toEqual(manifestNames(REPO));
    });

    it(`reads at least ${PACKAGE_FLOOR} packages`, () => {
        const listed = run(SCRIPT, ['--list-packages']).trim().split('\n').filter(Boolean);
        expect(listed.length).toBeGreaterThanOrEqual(PACKAGE_FLOOR);
    });

    it('includes the tools family, which the hand-kept globs missed', () => {
        const listed = run(SCRIPT, ['--list-packages']).trim().split('\n');
        expect(listed).toContain('@aparte/docs-mcp');
    });
});

describe('gen-root-changelog — end to end on a temp tree', () => {
    let tree: string;

    /** One package with a manifest and a changelog entry for `version`. */
    function makePackage(dir: string, name: string, version: string, entry: string | null) {
        mkdirSync(join(tree, dir), { recursive: true });
        writeFileSync(join(tree, dir, 'package.json'), JSON.stringify({ name, version }), 'utf8');
        if (entry !== null) {
            writeFileSync(
                join(tree, dir, 'CHANGELOG.md'),
                `# ${name}\n\n## ${version}\n\n### Minor Changes\n\n- abc1234: ${entry}\n`,
                'utf8',
            );
        }
    }

    beforeAll(() => {
        tree = mkdtempSync(join(tmpdir(), 'aparte-changelog-'));
        mkdirSync(join(tree, 'scripts'), { recursive: true });
        copyFileSync(SCRIPT, join(tree, 'scripts', 'gen-root-changelog.mjs'));

        // `core` is read for the version, so it has to be where the script looks.
        makePackage('packages/core', '@aparte/core', '9.9.9', 'The core change.');
        // The member the old globs could not see: a family that is not one of the six.
        makePackage('packages/tools/y', '@aparte/tool-y', '9.9.9', 'The tool change nobody read.');
        // Filler, so the corpus clears the floor the way the real repo does.
        for (let i = 0; i < PACKAGE_FLOOR - 2; i++) {
            makePackage(`packages/plugins/f${i}`, `@aparte/filler-${i}`, '9.9.9', null);
        }
        // Private packages are not published and must not appear.
        mkdirSync(join(tree, 'packages/apps/private-one'), { recursive: true });
        writeFileSync(
            join(tree, 'packages/apps/private-one/package.json'),
            JSON.stringify({ name: '@aparte/private-one', version: '9.9.9', private: true }),
            'utf8',
        );
    });

    afterAll(() => {
        rmSync(tree, { recursive: true, force: true });
    });

    it('writes the entry of a package under packages/tools', () => {
        run(join(tree, 'scripts', 'gen-root-changelog.mjs'), []);
        const out = readFileSync(join(tree, 'CHANGELOG.md'), 'utf8');
        expect(out).toContain('The tool change nobody read.');
        expect(out).toContain('@aparte/tool-y');
        // The control: the family that was already covered still lands.
        expect(out).toContain('The core change.');
    });

    it('leaves private packages out', () => {
        const listed = run(join(tree, 'scripts', 'gen-root-changelog.mjs'), ['--list-packages']);
        expect(listed).not.toContain('@aparte/private-one');
        expect(listed).toContain('@aparte/tool-y');
    });

    it('refuses to write a changelog from a collapsed corpus', () => {
        const small = mkdtempSync(join(tmpdir(), 'aparte-changelog-small-'));
        try {
            mkdirSync(join(small, 'scripts'), { recursive: true });
            copyFileSync(SCRIPT, join(small, 'scripts', 'gen-root-changelog.mjs'));
            mkdirSync(join(small, 'packages/core'), { recursive: true });
            writeFileSync(
                join(small, 'packages/core/package.json'),
                JSON.stringify({ name: '@aparte/core', version: '9.9.9' }),
                'utf8',
            );
            expect(() => run(join(small, 'scripts', 'gen-root-changelog.mjs'), [])).toThrow(/floor is/);
            expect(existsSync(join(small, 'CHANGELOG.md'))).toBe(false);
        } finally {
            rmSync(small, { recursive: true, force: true });
        }
    });
});
