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
    wrappers: {
        components: Record<string, { slots: string[]; dataProps: string[]; hostCallbacks: string[]; chatEvents: string[] }>;
        imperativeApi: string[];
        angularDirectives: Record<string, { inputs: string[]; outputs: string[] }>;
    };
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

/**
 * What the wrappers promise a consumer is frozen like core's own names: the slots, data props,
 * host callbacks and chat events of the five chat components, the imperative methods, the
 * outputs and inputs of the Angular element directives, and `@aparte/svelte/runes`.
 *
 * Each row removes a name the same way the rows above do — a name ADDED to the snapshot reads
 * as one the tree lost — and then asks for the notice: without a changeset it fails, with one
 * that says "deprecated" it passes.
 */
describe('frozen-surface — the wrappers', () => {
    const COMPONENTS = ['react', 'vue', 'svelte', 'svelteRunes', 'angular'];
    const real = JSON.parse(readFileSync(REAL, 'utf8')) as Snapshot;

    it('freezes the five chat components, the imperative API, the Angular directives and /runes', () => {
        expect(Object.keys(real.wrappers.components).sort()).toEqual([...COMPONENTS].sort());
        for (const key of COMPONENTS) {
            const c = real.wrappers.components[key]!;
            expect(c.slots, `${key} slots`).toContain('toolbar');
            expect(c.chatEvents.length, `${key} chat events`).toBeGreaterThanOrEqual(23);
            expect(c.hostCallbacks.length, `${key} host callbacks`).toBeGreaterThanOrEqual(4);
            expect(c.dataProps.length, `${key} data props`).toBeGreaterThan(10);
        }
        expect(real.wrappers.imperativeApi).toEqual(expect.arrayContaining(['appendMessage', 'getElement', 'getComposer']));
        expect(real.wrappers.angularDirectives['aparte-composer']!.outputs).toContain('stop');
        expect(real.exports['@aparte/svelte/runes']).toEqual(expect.arrayContaining(['AparteChat', 'createConversations']));
    });

    const ROWS: Array<[string, string, (s: Snapshot) => void]> = [
        ['a slot of the Vue chat', 'probe-slot', (s) => s.wrappers.components.vue!.slots.push('probe-slot')],
        ['a data prop of the React chat', 'probeProp', (s) => s.wrappers.components.react!.dataProps.push('probeProp')],
        ['a host callback of the Angular chat', '(probeHost)', (s) => s.wrappers.components.angular!.hostCallbacks.push('(probeHost)')],
        ['a chat event binding of the Svelte 5 chat', 'onprobeGone', (s) => s.wrappers.components.svelteRunes!.chatEvents.push('onprobeGone')],
        ['a chat event binding of the React chat', 'onProbeGone', (s) => s.wrappers.components.react!.chatEvents.push('onProbeGone')],
        ['an imperative API member', 'probeMember', (s) => s.wrappers.imperativeApi.push('probeMember')],
        ['an output of an Angular element directive', 'probeOutput', (s) => s.wrappers.angularDirectives['aparte-composer']!.outputs.push('probeOutput')],
        ['an input of an Angular element directive', 'probeInput', (s) => s.wrappers.angularDirectives['aparte-composer']!.inputs.push('probeInput')],
        ['an export of @aparte/svelte/runes', 'ProbeRune', (s) => s.exports['@aparte/svelte/runes']!.push('ProbeRune')],
    ];

    for (const [what, name, edit] of ROWS) {
        it(`fails on ${what} that is gone, and passes with a deprecation notice`, () => {
            const slug = name.replace(/\W/g, '');
            const file = doctored(`wrap-${slug}.json`, (s) => {
                edit(s);
                for (const c of Object.values(s.wrappers.components)) for (const k of Object.keys(c) as Array<keyof typeof c>) c[k].sort();
                s.wrappers.imperativeApi.sort();
                for (const d of Object.values(s.wrappers.angularDirectives)) { d.inputs.sort(); d.outputs.sort(); }
                for (const list of Object.values(s.exports)) list.sort();
            });
            const bare = run(['--snapshot', file]);
            expect(bare.code).toBe(1);
            expect(bare.out).toContain('removed without notice');
            expect(bare.out).toContain(name);

            const notice = changesets(`wrap-notice-${slug}`, [
                '---',
                "'@aparte/react': minor",
                '---',
                '',
                `\`${name}\` is deprecated; it is removed in the next minor.`,
                '',
            ].join('\n'));
            const noticed = run(['--snapshot', file, '--changesets', notice]);
            expect(noticed.out).toContain('deprecated with notice');
            expect(noticed.code).toBe(0);
        });
    }

    it('asks for `pnpm frozen:update` when a wrapper gained a binding the snapshot lacks', () => {
        const dropped = real.wrappers.components.vue!.chatEvents[0]!;
        const file = doctored('wrap-added.json', (s) => {
            s.wrappers.components.vue!.chatEvents = s.wrappers.components.vue!.chatEvents.filter((n) => n !== dropped);
        });
        const r = run(['--snapshot', file]);
        expect(r.code).toBe(1);
        expect(r.out).toContain('missing from the snapshot');
        expect(r.out).toContain(dropped);
        expect(r.out).not.toContain('removed without notice');
    });
});
