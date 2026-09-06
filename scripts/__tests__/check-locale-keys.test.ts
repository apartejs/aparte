/**
 * The locale guard tells core's strings from a plugin's, and says so.
 *
 * `AparteLocale` is the closed list of what CORE renders, and `t()` is typed against it.
 * Nine of its keys are rendered by no core file at all — the artifact card's and the
 * compaction summary's — and they are legitimate: a locale package translates one bag,
 * not one per plugin. Legitimate, and invisible: nothing stopped a tenth from being added
 * by reflex, and every one of them is a name the frozen surface then holds for two
 * releases. So the exception is written down (`PLUGIN_OWNED`) and the guard reads it.
 *
 * The three behaviours, and why each is the one that matters:
 *
 *   • a declared key that only a plugin renders, absent from the list, FAILS — that is
 *     the tenth key, caught while it is still free to move;
 *   • the same key PASSES once it is on the list — the exception is an exception, not a
 *     hole;
 *   • a listed key that core has started rendering FAILS the other way, asking for the
 *     line to be removed — a list that outlives its reason is how a guard goes decorative.
 *
 * The real script runs over a DOCTORED CORPUS (`--sources`) and, for the last two, over a
 * DOCTORED LOCALE as well (`--locale`): the declared list is then a fixture's, which is
 * the only way to prove the guard reads the file it is handed rather than the tree it
 * sits in. Nothing here re-implements the matcher, and the exit code is the one the gate
 * would get. Every fixture run also asserts HOW MUCH was read — a guard walking an empty
 * corpus prints the same `OK` as one walking the whole tree.
 *
 * The repo itself must be green for any of it to mean anything, which is the first test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-locale-keys.mjs');
const REPO = resolve(dirname(SCRIPT), '..');

let dir: string;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aparte-locale-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * A `packages/`-shaped tree: one core file and one plugin file, each rendering the keys
 * it is given. The real locale is never touched.
 */
function sources(name: string, core: string[], plugin: string[]): string {
    const root = join(dir, name);
    mkdirSync(join(root, 'core', 'src'), { recursive: true });
    mkdirSync(join(root, 'plugins', 'probe', 'src'), { recursive: true });
    const calls = (keys: string[]) => `${keys.map((k) => `cfg.t('${k}');`).join('\n')}\n`;
    writeFileSync(join(root, 'core', 'src', 'renders.ts'), calls(core), 'utf8');
    writeFileSync(join(root, 'plugins', 'probe', 'src', 'renders.ts'), calls(plugin), 'utf8');
    return root;
}

/**
 * A `locale.ts`-shaped file: the two blocks the script slices, written the way it slices
 * them (one key per line, four spaces in). Every key gets a default, so the missing-default
 * assertion stays quiet and the run measures ownership alone.
 */
function locale(name: string, keys: string[]): string {
    const file = join(dir, `${name}.locale.ts`);
    const declared = keys.map((k) => `    ${k}?: string;`).join('\n');
    const defaults = keys.map((k) => `    ${k}: '${k}',`).join('\n');
    writeFileSync(
        file,
        `export type AparteLocale = {\n${declared}\n};\n\n`
        + 'export type AparteLocaleExtensions = Record<string, string | undefined>;\n\n'
        + `export const APARTE_DEFAULT_LOCALE: AparteLocale = {\n${defaults}\n};\n`,
        'utf8',
    );
    return file;
}

function run(args: string[]): { code: number; out: string } {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('check-locale-keys — core renders it, or a plugin owns it', () => {
    it('is green on the repo as it stands, and prints both counts', () => {
        const r = run([]);
        expect(r.out).toContain('[check-locale-keys] OK');
        const counted = /OK — (\d+) keys, (\d+) t\('…'\) reads/.exec(r.out);
        expect(counted).not.toBeNull();
        // The floors the script itself carries: below them the matcher broke.
        expect(Number(counted?.[1])).toBeGreaterThanOrEqual(75);
        expect(Number(counted?.[2])).toBeGreaterThanOrEqual(60);
        expect(r.code).toBe(0);
    });

    it('reads the same tree when the corpus is named explicitly', () => {
        const explicit = run(['--sources', 'packages']);
        expect(explicit.code).toBe(0);
        expect(explicit.out).toBe(run([]).out);
    });

    it('refuses a declared key that only a plugin renders', () => {
        const tree = sources('stray', ['copy'], ['newChat']);
        const r = run(['--sources', tree]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('newChat');
        expect(r.out).toContain('PLUGIN_OWNED');
        expect(r.out).toContain('no core file renders it');
    });

    it('accepts a plugin-only key that PLUGIN_OWNED lists', () => {
        const tree = sources('owned', ['copy'], ['download', 'preview', 'sandboxErrorHint']);
        const r = run(['--sources', tree]);
        expect(r.out).toContain('[check-locale-keys] OK');
        expect(r.out).not.toContain('PLUGIN_OWNED');
        // What it READ, not only what it found: a mistyped fixture path, a fixture that
        // stops being written and a walk that skips a directory all print this same OK.
        expect(r.out).toContain("4 t('…') reads");
        expect(r.code).toBe(0);
    });

    it('asks for the line back when core starts rendering a listed key', () => {
        const tree = sources('reclaimed', ['download'], ['download']);
        const r = run(['--sources', tree]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('download');
        expect(r.out).toContain('remove it from PLUGIN_OWNED');
        // The two failures must not be confused: a reclaimed key is not a stray one.
        expect(r.out).not.toContain('no core file renders it');
    });

    it('judges ownership against the list --locale names, not the one core ships', () => {
        const file = locale('doctored', ['copy', 'pluginOnlyThing', 'sendLabel']);
        const tree = sources('doctored', ['copy'], ['pluginOnlyThing']);
        const r = run(['--locale', file, '--sources', tree]);
        expect(r.code).toBe(1);
        // A name the real AparteLocale does not declare: only the given file can produce this line.
        expect(r.out).toContain('pluginOnlyThing is declared in AparteLocale and no core file renders it');
        // And the French mirror stands down, because it has nothing to mirror: three fixture
        // keys against 91 real translations is 90 findings around the one that matters.
        expect(r.out).not.toContain('locale-fr');
    });

    it('is green over a doctored locale core renders whole, and says what it read', () => {
        const file = locale('agreeing', ['copy', 'pluginOnlyThing', 'sendLabel']);
        const tree = sources('agreeing', ['copy', 'pluginOnlyThing', 'sendLabel'], ['copy']);
        const r = run(['--locale', file, '--sources', tree]);
        expect(r.code).toBe(0);
        expect(r.out).toContain("OK — 3 keys, 4 t('…') reads");
        expect(r.out).not.toContain('locale-fr');
    });
});
