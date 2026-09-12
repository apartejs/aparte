/**
 * The frozen-surface guard bites, and it tells the two failures apart.
 *
 * `reference/stability` promises that a frozen name leaves in two releases, never one.
 * That promise is only worth the mechanism behind it, so the mechanism is exercised here
 * rather than described: the real script runs over a DOCTORED COPY of the snapshot (and,
 * for the notice case, a fixture `.changeset/` directory), which is what `--snapshot` and
 * `--changesets` exist for. Nothing here re-implements the matcher — the exit code is the
 * one the gate would get.
 *
 * The three behaviours, and why each is the one that matters:
 *
 *   • a name in the snapshot that the tree no longer has FAILS, naming it — that is a
 *     removal or a rename landing on a consumer with no warning;
 *   • the same name PASSES when a changeset names it and says "deprecated" — the notice
 *     release, which is the whole point of the two-release rule;
 *   • a name in the tree that the snapshot lacks fails with the OTHER sentence
 *     (`pnpm frozen:update`), because an addition is always allowed and the only defect
 *     is a snapshot falling behind.
 *
 * The direction is the thing to keep straight, and it is the opposite of the intuition:
 * ADDING a name to the snapshot simulates the tree losing it, and DELETING one from the
 * snapshot simulates the tree gaining it.
 *
 * The repo itself must be green for any of it to mean anything, which is the first test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'frozen-surface.mjs');
const REPO = resolve(dirname(SCRIPT), '..');
const REAL = join(REPO, 'apps/docs/src/data/frozen-surface.json');

let dir: string;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aparte-frozen-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Snapshot = {
    frozenSince: { version: string; date: string };
    elements: Record<string, { package: string; attributes: string[] }>;
    events: { typed: string[]; names: string[] };
    exports: Record<string, string[]>;
    locale: string[];
    tokens: string[];
};

/** The checked-in snapshot, doctored — the tree is never touched. */
function doctored(name: string, edit: (s: Snapshot) => void): string {
    const snapshot = JSON.parse(readFileSync(REAL, 'utf8')) as Snapshot;
    edit(snapshot);
    const file = join(dir, name);
    writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return file;
}

/** A fixture `.changeset/` holding one entry. */
function changesets(name: string, body: string): string {
    const folder = join(dir, name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'probe.md'), body, 'utf8');
    return folder;
}

function run(args: string[]): { code: number; out: string } {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('frozen-surface — the beta promise, mechanised', () => {
    it('is green on the repo as it stands', () => {
        const r = run([]);
        expect(r.out).toContain('[frozen-surface] OK:');
        expect(r.out).toContain('frozen since');
        expect(r.code).toBe(0);
    });

    it('fails on a frozen name the tree no longer has, and names it', () => {
        const file = doctored('removed.json', (s) => {
            s.events.names.push('aparte-probe-gone');
            s.events.names.sort();
        });
        const r = run(['--snapshot', file]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('removed without notice');
        expect(r.out).toContain('aparte-probe-gone');
    });

    it('passes that same removal when a changeset deprecates the name', () => {
        const file = doctored('deprecated.json', (s) => {
            s.tokens.push('--aparte-probe-legacy');
            s.tokens.sort();
        });
        const notice = changesets('with-notice', [
            '---',
            "'@aparte/core': minor",
            '---',
            '',
            '`--aparte-probe-legacy` is deprecated; use `--aparte-probe` instead. It is removed in 0.18.',
            '',
        ].join('\n'));
        const r = run(['--snapshot', file, '--changesets', notice]);
        expect(r.out).toContain('deprecated with notice');
        expect(r.out).toContain('--aparte-probe-legacy');
        expect(r.code).toBe(0);
    });

    it('does not credit a changeset that names the token without deprecating anything', () => {
        const file = doctored('no-notice.json', (s) => {
            s.tokens.push('--aparte-probe-legacy');
            s.tokens.sort();
        });
        const silent = changesets('without-notice', [
            '---',
            "'@aparte/core': patch",
            '---',
            '',
            '`--aparte-probe-legacy` now resolves against the anchored layer.',
            '',
        ].join('\n'));
        const r = run(['--snapshot', file, '--changesets', silent]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('removed without notice');
    });

    it('asks for `pnpm frozen:update` when the tree has a name the snapshot lacks', () => {
        const [dropped] = JSON.parse(readFileSync(REAL, 'utf8')).events.names as string[];
        const file = doctored('added.json', (s) => {
            s.events.names = s.events.names.filter((n) => n !== dropped);
        });
        const r = run(['--snapshot', file]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('missing from the snapshot');
        expect(r.out).toContain(dropped);
        expect(r.out).toContain('pnpm frozen:update');
        // The two failures must not be confused: an addition is not a removal.
        expect(r.out).not.toContain('removed without notice');
    });
});
