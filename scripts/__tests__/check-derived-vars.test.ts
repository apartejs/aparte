/**
 * The prose rule of `check-derived-vars` catches a variable name the library does not have.
 *
 * The guard grew this rule because two public pages offered tokens 0.16.8 had removed —
 * `--aparte-message-padding` (split into `-block`/`-inline`) and `--aparte-avatar-radius`
 * (now a ratio) — one of them in the landing page's three-line theming snippet. A name
 * that does not exist fails in silence: the declaration is invalid at computed-value
 * time, the property inherits, and the page looks almost right. Which is the exact
 * failure the theming guide itself has a section warning about, so the page taught the
 * mistake it teaches you to avoid.
 *
 * A rule added because prose was not being read is a rule nothing reads either, unless
 * it is exercised. So this drives the real script over a fixture page — the `--prose`
 * flag adds one to the corpus — and asserts the three behaviours the rule stands on:
 * a bad name is reported by name, a real name is not, and the `undeclared-on-purpose`
 * marker (which one sentence of the theming guide needs, because its subject IS a name
 * core does not declare) silences it.
 *
 * The repo itself must be green for the exit code to mean anything here, which is the
 * point: this is the guard as the gate runs it, not a re-implementation of its matcher.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-derived-vars.mjs');
const REPO = resolve(dirname(SCRIPT), '..');

let dir: string;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aparte-prose-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runOn(name: string, body: string): { code: number; out: string } {
    const page = join(dir, name);
    writeFileSync(page, body, 'utf8');
    const r = spawnSync(process.execPath, [SCRIPT, '--prose', page], { cwd: REPO, encoding: 'utf8' });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('check-derived-vars — a token name written in prose exists', () => {
    it('is green on the repo as it stands', () => {
        const r = spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' });
        expect(`${r.stdout}${r.stderr}`).toContain('token names in prose, all real');
        expect(r.status).toBe(0);
    });

    it('reports a page that offers a variable no stylesheet knows', () => {
        const r = runOn('bad.md', 'Set `--aparte-nowhere-near-a-real-token` on the root.\n');
        expect(r.code).toBe(1);
        expect(r.out).toContain('--aparte-nowhere-near-a-real-token');
        expect(r.out).toContain('the library has no such token');
    });

    it('says nothing about a name the library really has', () => {
        const r = runOn('good.md', 'Set `--aparte-primary` on the root and the accent follows.\n');
        expect(r.code).toBe(0);
    });

    it('honours the marker for a sentence whose subject is a name core does not declare', () => {
        const r = runOn(
            'marked.md',
            '<!-- undeclared-on-purpose: the sentence is about the failure. -->\n'
                + 'A `var(--aparte-nowhere-near-a-real-token)` fails in silence.\n',
        );
        expect(r.code).toBe(0);
    });

    it('does not read a family prefix as a token', () => {
        const r = runOn('family.md', 'The `--aparte-code-*` family, and the `--aparte-space-…` steps.\n');
        expect(r.code).toBe(0);
    });
});
