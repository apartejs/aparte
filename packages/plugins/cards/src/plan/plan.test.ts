import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupPlanCard, planCard, readPlan, readStatus, planProgress, durationText, PLAN_STEPS_SHOWN, type PlanData, type PlanStatus } from './index.js';

const T0 = '2026-10-30T14:00:00Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const DEPLOY = {
    title: 'Deploy the docs site',
    goal: 'Ship the new landing page',
    steps: [
        { title: 'Install dependencies', status: 'done', startedAt: at(0), finishedAt: at(12) },
        { title: 'Run the tests', status: 'done', startedAt: at(12), finishedAt: at(92), detail: '412 passed' },
        { title: 'Lint', status: 'skipped' },
        {
            title: 'Build', status: 'in-progress', startedAt: at(92), substeps: [
                { title: 'Bundle core', status: 'done', duration: 4 },
                { title: 'Bundle the docs', status: 'running' },
            ],
        },
        { title: 'Upload', status: 'pending' },
        { title: 'Purge the CDN', status: 'blocked', detail: 'Waiting for an API token' },
    ],
    updatedAt: at(130),
};

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { goal: 'Deploy' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'update_plan', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

const renderer = () => aparteGlobalConfig.getToolRenderer('update_plan')!;

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = renderer().render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
const attrs = (root: Element, selector: string, name: string) => [...root.querySelectorAll(selector)].map((n) => n.getAttribute(name));
const config = aparteGlobalConfig;
const plan = (raw: unknown) => readPlan(raw)!;

/** The shape of the steps — tags and classes, never statuses or text — to prove an update moved no row. */
const shape = (card: Element): string => [...card.querySelector('.aparte-plan__steps')!.querySelectorAll('*')]
    .filter((n) => !(n.parentElement?.classList.contains('aparte-rich-card__glyph')) && !n.closest('svg'))
    .map((n) => `${n.tagName}.${[...n.classList].join('.')}`).join('|');

describe('the plan card on a tool', () => {
    beforeEach(() => {
        stop = setupPlanCard({ tool: 'update_plan' });
    });

    it('draws a checklist: header, count, bar, then a row per step', () => {
        const card = draw(call('resolved', DEPLOY));
        expect(card.dataset.card).toBe('plan');
        expect(card.dataset.variant).toBe('checklist');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Deploy the docs site');
        expect(text(card, '.aparte-plan__title')).toBe('Deploy the docs site');
        expect(text(card, '.aparte-plan__goal')).toBe('Ship the new landing page');
        expect(text(card, '.aparte-plan__count')).toBe('2 of 6 done');
        expect(texts(card, '.aparte-plan__note')).toEqual(['1 skipped']);
        expect(text(card, '.aparte-plan__elapsed')).toBe('2m 10s elapsed');
        const bar = card.querySelector<HTMLElement>('.aparte-plan__bar')!;
        expect(bar.getAttribute('aria-hidden')).toBe('true');
        expect(bar.style.getPropertyValue('--aparte-plan-done-share')).toMatch(/^33\.33/);
        expect(bar.style.getPropertyValue('--aparte-plan-skipped-share')).toMatch(/^16\.66/);
        expect(bar.hasAttribute('data-complete')).toBe(false);
        const list = card.querySelector('ol.aparte-plan__steps')!;
        expect(list.getAttribute('role')).toBe('list');
        expect(list.hasAttribute('data-timed')).toBe(true);
        const rows = [...list.querySelectorAll(':scope > li.aparte-plan__step')];
        expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['done', 'done', 'skipped', 'in-progress', 'pending', 'blocked']);
        expect(rows.map((r) => text(r, ':scope > .aparte-plan__row .aparte-plan__step-title-text'))).toEqual(['Install dependencies', 'Run the tests', 'Lint', 'Build', 'Upload', 'Purge the CDN']);
        expect(card.textContent).not.toMatch(/NaN|undefined/);
    });

    it('draws each row: a glyph per status, the title, its status in words, the detail, the duration once finished', () => {
        const card = draw(call('resolved', DEPLOY));
        const rows = [...card.querySelectorAll('.aparte-plan__steps > li')];
        const [install, tests, lint, build, , purge] = rows;
        const row = install!.querySelector(':scope > .aparte-plan__row')!;
        expect([...row.children].map((c) => c.classList[1] ?? c.classList[0])).toEqual(['aparte-plan__glyph', 'aparte-plan__text', 'aparte-plan__duration']);
        expect(row.querySelector('.aparte-plan__glyph')!.getAttribute('aria-hidden')).toBe('true');
        expect(row.querySelector('.aparte-plan__glyph svg')).not.toBeNull();
        // The title carries its own text for the invisible bold copy that holds its room.
        expect(row.querySelector('.aparte-plan__step-title')!.getAttribute('data-text')).toBe('Install dependencies');
        expect(text(row, '.aparte-sr-only')).toBe(' (Done)');
        expect(text(tests!, '.aparte-plan__detail')).toBe('412 passed');
        const duration = tests!.querySelector('time.aparte-plan__duration')!;
        expect(duration.textContent).toBe('1m 20s');
        expect(duration.getAttribute('datetime')).toBe('PT80S');
        expect(text(install!, '.aparte-plan__duration')).toBe('12s');
        // Not finished, or no time: the slot is there, empty.
        expect(lint!.querySelector('.aparte-plan__duration')!.textContent).toBe('');
        expect(build!.querySelector(':scope > .aparte-plan__row .aparte-plan__duration')!.textContent).toBe('');
        expect(build!.querySelector(':scope > .aparte-plan__row .aparte-plan__duration')!.hasAttribute('datetime')).toBe(false);
        expect(text(purge!, '.aparte-sr-only')).toBe(' (Blocked)');
        expect(text(purge!, '.aparte-plan__detail')).toBe('Waiting for an API token');
        // The glyphs differ by shape, not only by colour.
        const glyphs = rows.map((r) => r.querySelector('.aparte-plan__glyph')!.innerHTML);
        expect(new Set(glyphs).size).toBe(5);
        expect(build!.querySelector('.aparte-plan__spinner')).not.toBeNull();
    });

    it('marks the step under way as the current one, and nests sub-steps under their parent', () => {
        const card = draw(call('resolved', DEPLOY));
        expect(attrs(card, '.aparte-plan__steps > li', 'aria-current')).toEqual([null, null, null, 'step', null, null]);
        const build = card.querySelectorAll('.aparte-plan__steps > li')[3]!;
        const subs = build.querySelector(':scope > ol.aparte-plan__substeps')!;
        expect(subs.getAttribute('role')).toBe('list');
        const items = [...subs.querySelectorAll(':scope > li.aparte-plan__step--sub')];
        expect(items.map((li) => li.getAttribute('data-status'))).toEqual(['done', 'in-progress']);
        expect(texts(subs, '.aparte-plan__step-title-text')).toEqual(['Bundle core', 'Bundle the docs']);
        expect(text(items[0]!, '.aparte-plan__duration')).toBe('4s');
        expect(items.some((li) => li.hasAttribute('aria-current'))).toBe(false);
    });

    it('shows a skeleton of rows, with the goal, while the call runs', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('Deploy — Loading');
        expect(text(card, '.aparte-plan__title')).toBe('Deploy');
        expect(card.querySelector('.aparte-plan__bar')).not.toBeNull();
        const list = card.querySelector('ol.aparte-plan__steps')!;
        expect(list.getAttribute('aria-hidden')).toBe('true');
        expect(list.querySelectorAll('.aparte-plan__sk-glyph')).toHaveLength(4);
        const bare = draw(call('pending', undefined, {}));
        expect(bare.getAttribute('aria-label')).toBe('Plan — Loading');
        expect(bare.querySelector('.aparte-plan__head .aparte-plan__sk-title')).not.toBeNull();
    });

    it('draws the plan from the call’s input while it runs, when the input is the plan', () => {
        const card = draw(call('pending', undefined, { todos: [{ content: 'Read the issue', status: 'completed' }, { content: 'Fix it', activeForm: 'Fixing it', status: 'in_progress' }] }));
        expect(card.dataset.state).toBe('loading');
        expect(texts(card, '.aparte-plan__step-title-text')).toEqual(['Read the issue', 'Fixing it']);
        expect(text(card, '.aparte-plan__count')).toBe('1 of 2 done');
    });

    it('reads its input when the result is only an acknowledgement, as TodoWrite’s is', () => {
        stop();
        stop = setupPlanCard({ tool: 'update_plan', map: (_result, input) => input });
        const card = draw(call('resolved', 'Todos have been modified successfully', { todos: [{ content: 'Ship', status: 'pending' }] }));
        expect(card.dataset.state).toBe('ready');
        expect(texts(card, '.aparte-plan__step-title-text')).toEqual(['Ship']);
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-plan__steps')).toBeNull();
        expect(failed.textContent).toContain('Deploy');
    });

    it('says it is unavailable, and warns once, when the result holds no step', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { title: 'Empty', steps: [{ status: 'done' }] }));
        draw(call('resolved', 'just some prose'));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const card = draw(call('pending'));
        renderer().update!(card, call('resolved', DEPLOY));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.getAttribute('aria-label')).toBe('Deploy the docs site');
        expect(card.querySelectorAll('.aparte-plan__steps > li')).toHaveLength(6);
    });

    it('stays put through three live updates: same element, same rows, only statuses and words move', () => {
        const steps = (a: PlanStatus, b: PlanStatus, c: PlanStatus, times: [number?, number?] = []) => ({
            title: 'Fix the bug',
            steps: [
                { title: 'Reproduce', status: a, startedAt: at(0), ...(a === 'done' ? { finishedAt: at(5) } : {}) },
                { title: 'Patch', status: b, ...(times[0] !== undefined ? { startedAt: at(times[0]) } : {}), ...(b === 'done' ? { finishedAt: at(40) } : {}) },
                { title: 'Test', status: c, ...(times[1] !== undefined ? { startedAt: at(times[1]) } : {}), ...(c === 'done' || c === 'failed' ? { finishedAt: at(70) } : {}) },
            ],
        });
        const card = draw(call('resolved', steps('in-progress', 'pending', 'pending')));
        const first = shape(card);
        const seen: Array<[string | null, (string | null)[], (string | null)[]]> = [];
        const look = () => seen.push([text(card, '.aparte-plan__count'), attrs(card, '.aparte-plan__steps > li', 'data-status'), attrs(card, '.aparte-plan__steps > li', 'aria-current')]);
        look();
        for (const next of [steps('done', 'in-progress', 'pending', [5]), steps('done', 'done', 'in-progress', [5, 40]), steps('done', 'done', 'failed', [5, 40])]) {
            renderer().update!(card, call('resolved', next));
            expect(card.isConnected).toBe(true);
            expect(document.body.children).toHaveLength(1);
            // Nothing added to a row or taken from it: a row that changes status keeps its height.
            // (The header's one line may gain a note — "1 failed" — but it never wraps.)
            expect(shape(card)).toBe(first);
            look();
        }
        expect(seen).toEqual([
            ['0 of 3 done', ['in-progress', 'pending', 'pending'], ['step', null, null]],
            ['1 of 3 done', ['done', 'in-progress', 'pending'], [null, 'step', null]],
            ['2 of 3 done', ['done', 'done', 'in-progress'], [null, null, 'step']],
            ['2 of 3 done', ['done', 'done', 'failed'], [null, null, null]],
        ]);
        expect(texts(card, '.aparte-plan__duration')).toEqual(['5s', '35s', '30s']);
        expect(text(card, '.aparte-plan__note[data-kind="failed"]')).toBe('1 failed');
    });

    it('relabels counts, durations, times and status words in place on a language switch, adding no node', () => {
        const data = { ...DEPLOY, title: undefined, goal: undefined };
        const card = draw(call('resolved', data));
        const count = card.querySelectorAll('*').length;
        expect(card.getAttribute('aria-label')).toBe('Plan');
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer().relabel!(card, call('resolved', data));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(card.getAttribute('aria-label')).toBe('Plan');
        expect(text(card, '.aparte-plan__count')).toBe('2 sur 6 terminées');
        expect(texts(card, '.aparte-plan__note')).toEqual(['Ignorées : 1']);
        expect(text(card, '.aparte-plan__elapsed')).toMatch(/^Durée : 2\s?min,? 10\s?s$/u);
        expect(text(card, '.aparte-sr-only')).toBe(' (Terminé)');
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsPlanProgress: '{done}/{total} OK' });
        expect(text(draw(call('resolved', DEPLOY)), '.aparte-plan__count')).toBe('2/6 OK');
    });

    it('never parses a value from the tool as markup', () => {
        const card = draw(call('resolved', {
            title: '<img src=x onerror="window.__pwned=1">',
            goal: '<b>goal</b>',
            steps: [
                { title: '<script>alert(1)</script>', status: 'failed', error: '<i>boom</i>', id: '"><svg onload=alert(1)>' },
                { title: '<u>u</u>', substeps: ['<a href="javascript:alert(1)">x</a>'] },
            ],
        }));
        expect(card.querySelector('img, b, i, u, script, a')).toBeNull();
        expect(text(card, '.aparte-plan__title')).toContain('<img');
        expect(text(card, '.aparte-plan__step-title-text')).toBe('<script>alert(1)</script>');
        expect(card.querySelector('.aparte-plan__step-title')!.getAttribute('data-text')).toBe('<script>alert(1)</script>');
        expect(text(card, '.aparte-plan__detail')).toBe('<i>boom</i>');
        expect(card.querySelector('[data-step-id]')!.getAttribute('data-step-id')).toBe('"><svg onload=alert(1)>');
        expect(card.querySelectorAll('svg[onload]')).toHaveLength(0);
        expect(card.querySelector('button')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('draws no button for an action with an unsafe link', () => {
        stop();
        stop = setupPlanCard({ tool: 'update_plan', actions: () => [{ label: 'Open', url: 'javascript:alert(1)' }, { label: 'Logs', url: 'https://example.com/run/1' }] });
        const card = draw(call('resolved', DEPLOY));
        expect(texts(card, '.aparte-rich-card__action')).toEqual(['Logs']);
    });
});

describe('the checklist', () => {
    beforeEach(() => {
        stop = setupPlanCard({ tool: 'update_plan' });
    });

    it('draws no title when the plan has none, no notes when nothing was skipped or failed, no time slot when untimed', () => {
        const card = draw(call('resolved', ['Read', 'Write']));
        expect(card.querySelector('.aparte-plan__heading')).toBeNull();
        expect(card.querySelector('.aparte-plan__note, .aparte-plan__elapsed')).toBeNull();
        expect(card.querySelector('.aparte-plan__duration')).toBeNull();
        expect(card.querySelector('.aparte-plan__steps')!.hasAttribute('data-timed')).toBe(false);
        expect(text(card, '.aparte-plan__count')).toBe('0 of 2 done');
        expect(attrs(card, '.aparte-plan__steps > li', 'aria-current')).toEqual(['step', null]);
    });

    it('shows the goal as the heading when there is no title, and turns the bar green once all is finished', () => {
        const card = draw(call('resolved', { goal: 'Tidy up', steps: [{ title: 'A', done: true }, { title: 'B', status: 'cancelled' }] }));
        expect(text(card, '.aparte-plan__title')).toBe('Tidy up');
        expect(card.querySelector('.aparte-plan__goal')).toBeNull();
        expect(card.querySelector('.aparte-plan__bar')!.hasAttribute('data-complete')).toBe(true);
        expect(card.querySelector('[aria-current]')).toBeNull();
        expect(card.getAttribute('aria-label')).toBe('Tidy up');
    });

    it('keeps fifty steps at most, sub-steps counted', () => {
        const many = Array.from({ length: 60 }, (_, i) => `Step ${i + 1}`);
        expect(draw(call('resolved', many)).querySelectorAll('.aparte-plan__step')).toHaveLength(PLAN_STEPS_SHOWN);
        const nested = Array.from({ length: 10 }, (_, i) => ({ title: `P${i}`, substeps: Array.from({ length: 4 }, (_, j) => `S${i}.${j}`) }));
        const read = plan(nested);
        const counted = read.steps.reduce((t, s) => t + 1 + (s.substeps?.length ?? 0), 0);
        expect(counted).toBe(50);
        expect(read.steps).toHaveLength(10);
        // Eight parents of five fill 48; the ninth takes one place and keeps one sub-step.
        const tight = plan(Array.from({ length: 12 }, (_, i) => ({ title: `P${i}`, substeps: Array.from({ length: 5 }, (_, j) => `S${j}`) })));
        expect(tight.steps.map((s) => s.substeps?.length ?? 0)).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 1]);
        expect(tight.steps.at(-1)!.substeps).toHaveLength(1);
        const edge = plan([...Array.from({ length: 49 }, (_, i) => `x${i}`), { title: 'last', substeps: ['a', 'b'] }]);
        expect(edge.steps.at(-1)!.substeps).toBeUndefined();
    });
});

describe('the timeline', () => {
    beforeEach(() => {
        stop = setupPlanCard({ tool: 'update_plan', variant: 'timeline' });
    });

    it('draws a node per step on a rail, the start time and duration under each title', () => {
        const card = draw(call('resolved', DEPLOY));
        expect(card.dataset.variant).toBe('timeline');
        expect(card.querySelector('.aparte-plan__bar')).toBeNull();
        expect(text(card, '.aparte-plan__count')).toBe('2 of 6 done');
        const list = card.querySelector('ol.aparte-plan__timeline')!;
        expect(list.getAttribute('role')).toBe('list');
        const events = [...list.querySelectorAll(':scope > li.aparte-plan__event')];
        expect(events.map((e) => e.getAttribute('data-status'))).toEqual(['done', 'done', 'skipped', 'in-progress', 'pending', 'blocked']);
        expect(events.map((e) => e.getAttribute('aria-current'))).toEqual([null, null, null, 'step', null, null]);
        const [install, , lint, build, upload] = events;
        expect(install!.querySelector(':scope > .aparte-plan__node .aparte-plan__node-glyph svg')).not.toBeNull();
        const start = install!.querySelector('time.aparte-plan__start')!;
        expect(start.getAttribute('datetime')).toBe('2026-10-30T14:00:00.000Z');
        // The whole run fits in an hour: its seconds tell the steps apart.
        expect(start.textContent).toMatch(/^\d{1,2}:00:00\s?[AP]M$/u);
        expect(text(install!, '.aparte-plan__meta .aparte-plan__duration')).toBe('12s');
        // A step not started keeps its time line, empty.
        expect(lint!.querySelector('.aparte-plan__meta')!.textContent).toBe('');
        expect(upload!.querySelector('.aparte-plan__start')!.hasAttribute('datetime')).toBe(false);
        // The step under way: its own node, no duration yet, its sub-steps under it.
        expect(build!.querySelector('.aparte-plan__node')!.innerHTML).not.toBe(upload!.querySelector('.aparte-plan__node')!.innerHTML);
        expect(text(build!, ':scope > .aparte-plan__event-body > .aparte-plan__meta .aparte-plan__duration')).toBe('');
        expect(texts(build!, '.aparte-plan__substeps .aparte-plan__step-title-text')).toEqual(['Bundle core', 'Bundle the docs']);
        expect(text(build!, '.aparte-sr-only')).toBe(' (In progress)');
    });

    it('drops the seconds when the run spans more than an hour, and the time line when nothing is timed', () => {
        const long = draw(call('resolved', [{ title: 'A', startedAt: at(0), finishedAt: at(4000) }, 'B']));
        expect(text(long, '.aparte-plan__start')).toMatch(/^\d{1,2}:00\s?[AP]M$/u);
        expect(text(long, '.aparte-plan__duration')).toBe('1h 6m');
        const plain = draw(call('resolved', ['A', 'B']));
        expect(plain.querySelector('.aparte-plan__meta')).toBeNull();
    });

    it('has a skeleton of nodes', () => {
        const card = draw(call('pending', undefined, { task: 'Migrate' }));
        expect(text(card, '.aparte-plan__title')).toBe('Migrate');
        expect(card.querySelector('.aparte-plan__bar')).toBeNull();
        expect(card.querySelectorAll('.aparte-plan__timeline .aparte-plan__node .aparte-plan__sk-node')).toHaveLength(4);
    });
});

describe('the compact line', () => {
    beforeEach(() => {
        stop = setupPlanCard({ tool: 'update_plan', variant: 'compact' });
    });

    it('says the step under way, its place, a ring and the percentage', () => {
        const card = draw(call('resolved', DEPLOY));
        expect(card.dataset.variant).toBe('compact');
        const line = card.querySelector('.aparte-plan__compact')!;
        expect(line.getAttribute('data-status')).toBe('in-progress');
        expect(text(line, '.aparte-plan__compact-step')).toBe('Step 4 of 6:');
        expect(text(line, '.aparte-plan__compact-title')).toBe('Build');
        expect(text(line, '.aparte-plan__percent')).toBe('50%');
        const ring = line.querySelector('.aparte-plan__ring')!;
        expect(ring.getAttribute('aria-hidden')).toBe('true');
        const [, done, skipped] = [...ring.querySelectorAll('circle')];
        expect(Number.parseFloat(done!.getAttribute('stroke-dasharray')!)).toBeCloseTo(33.33, 1);
        expect(Number.parseFloat(skipped!.getAttribute('stroke-dasharray')!)).toBeCloseTo(16.67, 1);
        expect(Number.parseFloat(skipped!.getAttribute('stroke-dashoffset')!)).toBeCloseTo(-33.33, 1);
        expect(card.querySelector('.aparte-plan__steps, .aparte-plan__head')).toBeNull();
    });

    it('says the active form of a todo while it runs', () => {
        const card = draw(call('resolved', { todos: [{ content: 'Run the tests', activeForm: 'Running the tests', status: 'in_progress' }] }));
        expect(text(card, '.aparte-plan__compact-title')).toBe('Running the tests');
        expect(text(card, '.aparte-plan__percent')).toBe('0%');
    });

    it('says where it stopped when a step failed, and "All steps done" once finished', () => {
        const stopped = draw(call('resolved', [{ title: 'A', status: 'done' }, { title: 'B', status: 'error' }]));
        expect(stopped.querySelector('.aparte-plan__compact')!.getAttribute('data-status')).toBe('failed');
        expect(text(stopped, '.aparte-plan__compact-step')).toBe('Step 2 of 2:');
        expect(text(stopped, '.aparte-plan__compact-title')).toBe('B');
        const done = draw(call('resolved', { title: 'Release', steps: [{ title: 'A', status: 'complete' }] }));
        expect(done.querySelector('.aparte-plan__compact')!.getAttribute('data-status')).toBe('done');
        expect(texts(done, '.aparte-plan__compact-text > *')).toEqual(['Release', 'All steps done']);
        expect(text(done, '.aparte-plan__percent')).toBe('100%');
        expect(done.querySelector('.aparte-plan__ring')!.hasAttribute('data-complete')).toBe(true);
        const nameless = draw(call('resolved', [{ title: 'A', status: 'done' }]));
        expect(texts(nameless, '.aparte-plan__compact-text > *')).toEqual(['All steps done']);
    });

    it('has a one-line skeleton', () => {
        const card = draw(call('pending'));
        expect(text(card, '.aparte-plan__compact-title')).toBe('Deploy');
        expect(card.querySelector('.aparte-plan__sk-ring')).not.toBeNull();
        const bare = draw(call('pending', undefined, {}));
        expect(bare.querySelector('.aparte-plan__compact-text .aparte-plan__sk-line')).not.toBeNull();
    });
});

describe('the plan card as a segment', () => {
    it('draws a card segment, and its fallback says the progress then a line per step with its marker', () => {
        stop = setupPlanCard();
        const segment = planCard.segment(DEPLOY, { variant: 'timeline' });
        expect(segment.fallback).toBe([
            'Deploy the docs site: 2/6 done — now: Build',
            '- [x] Install dependencies',
            '- [x] Run the tests',
            '- [-] Lint',
            '- [>] Build',
            '  - [x] Bundle core',
            '  - [>] Bundle the docs',
            '- [ ] Upload',
            '- [~] Purge the CDN — Waiting for an API token',
        ].join('\n'));
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('plan');
        expect(out.dataset.variant).toBe('timeline');
        expect(out.querySelectorAll('.aparte-plan__event')).toHaveLength(6);
        expect(planCard.segment(['a']).fallback).toBe('Plan: 0/1 done — now: a\n- [ ] a');
        expect(planCard.segment([{ title: 'x', status: 'failed', detail: 'y'.repeat(200) }]).fallback).toMatch(/^Plan: 0\/1 done\n- \[!\] x — y{119}…$/);
        expect(planCard.segment('nothing').fallback).toBeUndefined();
    });

    it('reads its own fallback back', () => {
        const again = readPlan(planCard.segment(DEPLOY).fallback!)!;
        expect(again.steps.map((s) => s.status)).toEqual(['done', 'done', 'skipped', 'in-progress', 'pending', 'blocked']);
        expect(again.steps[3]!.substeps!.map((s) => s.status)).toEqual(['done', 'in-progress']);
    });
});

describe('reading the data', () => {
    it('reads a plan, a list of steps, a list of strings', () => {
        expect(plan(DEPLOY)).toMatchObject({ title: 'Deploy the docs site', goal: 'Ship the new landing page' });
        expect(plan(DEPLOY).updatedAt).toEqual(new Date(at(130)));
        expect(plan(DEPLOY).steps[0]).toMatchObject({ duration: 12 });
        expect(plan(['A', 'B']).steps).toEqual([{ title: 'A', status: 'pending' }, { title: 'B', status: 'pending' }]);
        expect(plan([{ title: 'A' }, 'B', null, 3, { status: 'done' }, '  ']).steps.map((s) => s.title)).toEqual(['A', 'B', '3']);
        expect(readPlan(null)).toBeNull();
        expect(readPlan(42)).toBeNull();
        expect(readPlan([])).toBeNull();
        expect(readPlan({ title: 'No steps' })).toBeNull();
        expect(readPlan({ plan: { title: 'nothing' } })).toBeNull();
    });

    it('reads Claude Code’s and OpenAI’s todo lists, with the active form for the step under way', () => {
        const todos = plan({ todos: [
            { content: 'Run the tests', activeForm: 'Running the tests', status: 'in_progress', id: '1' },
            { content: 'Fix the lint', activeForm: 'Fixing the lint', status: 'pending' },
            { content: 'Read the code', activeForm: 'Reading the code', status: 'completed' },
        ] });
        expect(todos.steps.map((s) => [s.title, s.status, s.id])).toEqual([
            ['Running the tests', 'in-progress', '1'],
            ['Fix the lint', 'pending', undefined],
            ['Read the code', 'done', undefined],
        ]);
        // Codex's `update_plan`: `step` and `status`, with an explanation.
        expect(plan({ explanation: 'Refactor the parser', plan: [{ step: 'Split the lexer', status: 'completed' }, { step: 'Add tests', status: 'in_progress' }] }))
            .toMatchObject({ goal: 'Refactor the parser', steps: [{ title: 'Split the lexer', status: 'done' }, { title: 'Add tests', status: 'in-progress' }] });
    });

    it('reads LangGraph’s plan-and-execute state: the steps done, then the plan ahead', () => {
        const lg = plan({ input: 'What is the hometown of the 2024 champion?', past_steps: [['Find the champion', 'Jannik Sinner'], 'Look up his birthplace'], plan: ['Answer the question'] });
        expect(lg.goal).toBe('What is the hometown of the 2024 champion?');
        expect(lg.steps).toEqual([
            // Its result is not drawn: see "keeps LangGraph's step result out of the row".
            { title: 'Find the champion', status: 'done' },
            { title: 'Look up his birthplace', status: 'done' },
            { title: 'Answer the question', status: 'pending' },
        ]);
        expect(plan({ past_steps: [{ step: 'x', status: 'failed' }] }).steps[0]!.status).toBe('failed');
        expect(plan({ plan: { title: 'Inner', steps: ['a'] }, goal: 'Outer goal' })).toMatchObject({ title: 'Inner', goal: 'Outer goal' });
    });

    it('reads tasks with names, states and flags', () => {
        const tasks = plan({ name: 'Sprint', tasks: [
            { name: 'A', state: 'DOING' },
            { name: 'B', done: true },
            { name: 'C', done: false },
            { name: 'D', checked: true },
            { name: 'E', completed: true },
            { name: 'F', failed: true },
            { name: 'G', error: 'Timed out after 30s' },
            { name: 'H', cancelled: true },
            { name: 'I', blocked: true },
            { name: 'J', running: true },
            { name: 'K', done: false, active: true },
            { name: 'L', status: 'nonsense' },
            { name: 'M', finishedAt: at(10) },
            { name: 'N', startedAt: at(10) },
        ] });
        expect(tasks.title).toBe('Sprint');
        expect(tasks.steps.map((s) => s.status)).toEqual(['in-progress', 'done', 'pending', 'done', 'done', 'failed', 'failed', 'skipped', 'blocked', 'in-progress', 'in-progress', 'pending', 'done', 'in-progress']);
        expect(tasks.steps[6]!.detail).toBe('Timed out after 30s');
    });

    it('knows the usual words for each status', () => {
        const cases: Array<[unknown, PlanStatus | undefined]> = [
            ['todo', 'pending'], ['To Do', 'pending'], ['queued', 'pending'], ['not_started', 'pending'],
            ['in_progress', 'in-progress'], ['In Progress', 'in-progress'], ['doing', 'in-progress'], ['running', 'in-progress'],
            ['complete', 'done'], ['completed', 'done'], ['SUCCESS', 'done'], ['passed', 'done'],
            ['error', 'failed'], ['failure', 'failed'], ['timed_out', 'failed'],
            ['cancelled', 'skipped'], ['canceled', 'skipped'], ["won't do", 'skipped'],
            ['on hold', 'blocked'], ['paused', 'blocked'], ['needs_input', 'blocked'],
            [true, 'done'], [false, 'pending'], ['constructor', undefined], ['', undefined], [3, undefined],
        ];
        for (const [value, status] of cases) expect([value, readStatus(value)]).toEqual([value, status]);
    });

    it('reads details, dates, durations and sub-steps under their usual names', () => {
        const step = plan([{
            name: 'Build', description: 'Compile everything', start_time: at(0), end_time: at(30), subtasks: [{ label: 'a', status: 'done' }, { text: 'b', children: ['too deep'] }],
        }]).steps[0]!;
        expect(step).toMatchObject({ title: 'Build', detail: 'Compile everything', duration: 30, status: 'in-progress' });
        expect(step.substeps!.map((s) => s.title)).toEqual(['a', 'b']);
        expect(step.substeps![1]!.substeps).toBeUndefined();
        // A step named by its description only keeps it as the title, not the detail too.
        expect(plan([{ description: 'Only this' }]).steps[0]).toEqual({ title: 'Only this', status: 'pending' });
        expect(plan([{ title: 'ms', durationMs: 1500 }]).steps[0]!.duration).toBe(1.5);
        expect(plan([{ title: 'neg', duration: -4 }]).steps[0]!.duration).toBeUndefined();
        expect(plan([{ title: 'backwards', startedAt: at(10), finishedAt: at(0) }]).steps[0]!.duration).toBeUndefined();
        expect(plan([{ title: 'bad', startedAt: 'yesterday-ish' }]).steps[0]!.startedAt).toBeUndefined();
        // `step: 3` is an index, not a title.
        expect(plan([{ step: 3, title: 'Real' }]).steps[0]!.title).toBe('Real');
        expect(readPlan([{ step: 3 }])).toBeNull();
    });

    it('works out a parent’s status from its sub-steps when it says none', () => {
        const parent = (...subs: string[]) => plan([{ title: 'P', substeps: subs.map((status, i) => ({ title: `s${i}`, status })) }]).steps[0]!.status;
        expect(parent('done', 'done')).toBe('done');
        expect(parent('skipped', 'skipped')).toBe('skipped');
        expect(parent('done', 'skipped')).toBe('done');
        expect(parent('done', 'running')).toBe('in-progress');
        expect(parent('failed', 'pending')).toBe('failed');
        expect(parent('done', 'pending')).toBe('in-progress');
        expect(parent('blocked', 'pending')).toBe('blocked');
        expect(parent('pending', 'pending')).toBe('pending');
        expect(plan([{ title: 'P', status: 'done', substeps: ['x'] }]).steps[0]!.status).toBe('done');
    });

    it('reads a Markdown checklist, with indented items as sub-steps and a first line as the title', () => {
        const md = plan('Release plan:\n- [x] Bump the version\n- [>] Write the notes\n  - [x] Features\n  - [ ] Fixes\n- [ ] Tag\n- [!] Publish\n- [-] Tweet\n- [~] Announce\n1. Numbered');
        expect(md.title).toBe('Release plan');
        expect(md.steps.map((s) => [s.title, s.status])).toEqual([
            ['Bump the version', 'done'], ['Write the notes', 'in-progress'], ['Tag', 'pending'], ['Publish', 'failed'],
            ['Tweet', 'skipped'], ['Announce', 'blocked'], ['Numbered', 'pending'],
        ]);
        expect(md.steps[1]!.substeps!.map((s) => s.status)).toEqual(['done', 'pending']);
        expect(readPlan('Just a sentence.\nAnd another one.')).toBeNull();
        expect(readPlan('')).toBeNull();
        expect(plan({ steps: '- a\n- b' }).steps).toHaveLength(2);
        expect(plan(['[x] Done already', '- [ ] Not yet']).steps.map((s) => s.status)).toEqual(['done', 'pending']);
        expect(plan(['- [ ]', 'ok']).steps.map((s) => s.title)).toEqual(['ok']);
    });
});

describe('progress', () => {
    it('counts the top-level steps, picks the current one, and the elapsed time', () => {
        const p = planProgress(plan(DEPLOY));
        expect(p).toMatchObject({ total: 6, done: 2, skipped: 1, failed: 0, blocked: 1, finished: 3, ratio: 0.5, currentIndex: 3, elapsed: 130 });
        expect(p.current!.title).toBe('Build');
        expect(planProgress(plan([{ title: 'A', status: 'blocked' }, { title: 'B', status: 'done' }]))).toMatchObject({ currentIndex: 0 });
        expect(planProgress(plan(['A', { title: 'B', status: 'running' }]))).toMatchObject({ currentIndex: 1 });
        const stopped = planProgress(plan([{ title: 'A', status: 'done' }, { title: 'B', status: 'failed' }]));
        expect(stopped.current).toBeUndefined();
        expect(stopped.stoppedIndex).toBe(1);
        // No dates: the durations added up, sub-steps standing in for a parent that has none.
        expect(planProgress(plan([{ title: 'A', duration: 10 }, { title: 'B', substeps: [{ title: 'b', duration: 5 }] }])).elapsed).toBe(15);
        expect(planProgress(plan(['A'])).elapsed).toBeUndefined();
        expect(planProgress({ steps: [] } as PlanData).ratio).toBe(0);
    });
});

describe('writing a duration', () => {
    it('in its two largest units, narrow, in the chat’s language', () => {
        expect(durationText(config, 0)).toBe('0s');
        expect(durationText(config, 0.35)).toBe('0.4s');
        expect(durationText(config, 45)).toBe('45s');
        expect(durationText(config, 59.6)).toBe('1m');
        expect(durationText(config, 80)).toBe('1m 20s');
        expect(durationText(config, 3600)).toBe('1h');
        expect(durationText(config, 3725)).toBe('1h 2m');
        expect(durationText(config, 93_784)).toBe('1d 2h');
        expect(durationText(config, 86_430)).toBe('1d');
        expect(durationText(config, -5)).toBe('0s');
    });
});

describe('choosing a variant', () => {
    it('picks one per result, and reads an unknown name as the default', () => {
        stop = setupPlanCard({ tool: 'update_plan', variant: (d) => (d.steps.some((s) => s.startedAt) ? 'timeline' : 'compact') });
        expect(draw(call('resolved', DEPLOY)).dataset.variant).toBe('timeline');
        expect(draw(call('resolved', ['a'])).dataset.variant).toBe('compact');
        stop();
        stop = setupPlanCard({ tool: 'update_plan', variant: 'nope' as never });
        expect(draw(call('resolved', DEPLOY)).dataset.variant).toBe('checklist');
    });
});

describe('what the audit found', () => {
    beforeEach(() => {
        stop = setupPlanCard({ tool: 'update_plan' });
    });
    const sheet = () => {
        // Read from disk: under vitest a `?raw` CSS import comes back empty.
        const path = ['src/plan/plan.css', 'packages/plugins/cards/src/plan/plan.css'].find((p) => existsSync(p))!;
        return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    };
    const todos = (status: string) => ({ todos: [
        { content: 'Update', activeForm: 'Updating the generated reference pages', status },
        { content: 'Ship', activeForm: 'Shipping', status: 'pending' },
    ] });

    it('holds the room of both wordings of a todo, so switching to its active form moves no row', () => {
        const before = plan(todos('pending')).steps[0]!;
        expect(before).toMatchObject({ title: 'Update', altTitle: 'Updating the generated reference pages' });
        expect(plan(todos('in_progress')).steps[0]).toMatchObject({ title: 'Updating the generated reference pages', altTitle: 'Update' });
        // A step whose two forms are the same carries no copy.
        expect(plan({ todos: [{ content: 'Ship', activeForm: 'Ship', status: 'pending' }] }).steps[0]!.altTitle).toBeUndefined();
        const card = draw(call('resolved', todos('pending')));
        const title = card.querySelector('.aparte-plan__step-title')!;
        expect([title.getAttribute('data-text'), title.getAttribute('data-alt')]).toEqual(['Update', 'Updating the generated reference pages']);
        const first = shape(card);
        renderer().update!(card, call('resolved', todos('in_progress')));
        expect(shape(card)).toBe(first);
        const now = card.querySelector('.aparte-plan__step-title')!;
        expect([now.getAttribute('data-text'), now.getAttribute('data-alt')]).toEqual(['Updating the generated reference pages', 'Update']);
        // The sheet lays the second, invisible copy in the same cell as the first.
        expect(sheet()).toMatch(/\.aparte-plan__step-title\[data-alt\]::before\s*\{[^}]*content:\s*attr\(data-alt\)/);
    });

    it('keeps the time slots from the first draw when the plan says it will be timed', () => {
        const untimed = { timed: true, steps: [{ title: 'Reproduce', status: 'in_progress' }, { title: 'Patch' }] };
        const timed = { timed: true, steps: [{ title: 'Reproduce', status: 'done', startedAt: at(0), finishedAt: at(5) }, { title: 'Patch', status: 'in_progress', startedAt: at(5) }] };
        expect(plan(untimed).timed).toBe(true);
        const card = draw(call('resolved', untimed));
        expect(card.querySelector('.aparte-plan__steps')!.hasAttribute('data-timed')).toBe(true);
        expect(card.querySelectorAll('.aparte-plan__duration')).toHaveLength(2);
        const first = shape(card);
        renderer().update!(card, call('resolved', timed));
        expect(shape(card)).toBe(first);
        expect(texts(card, '.aparte-plan__duration')).toEqual(['5s', '']);
        // Without the word, a plan is timed from the update that first carries a time.
        expect(draw(call('resolved', { steps: ['A'] })).querySelector('.aparte-plan__steps')!.hasAttribute('data-timed')).toBe(false);
    });

    it('keeps the time line in the timeline, from the first draw, when the plan says it will be timed', () => {
        stop();
        stop = setupPlanCard({ tool: 'update_plan', variant: 'timeline' });
        const card = draw(call('resolved', { timed: true, steps: ['Reproduce', 'Patch'] }));
        expect(card.querySelectorAll('.aparte-plan__event .aparte-plan__meta')).toHaveLength(2);
    });

    it("sizes the duration column for the language's widest duration, not for English", () => {
        aparteGlobalConfig.extendLocale({ tag: 'de-DE' });
        const card = draw(call('resolved', { timed: true, steps: ['A', 'B'] }));
        const reserve = attrs(card, '.aparte-plan__duration', 'data-reserve');
        expect(reserve).toHaveLength(2);
        // "1 Std., 5 Min." fits in what is held.
        expect(reserve[0]!.length).toBeGreaterThanOrEqual(durationText(config, 3_900).length);
        expect(reserve[0]).toMatch(/Std\.|Min\./);
        const rules = sheet();
        expect(rules).toMatch(/\.aparte-plan__duration::after\s*\{[^}]*content:\s*attr\(data-reserve\)/);
        expect(rules).not.toMatch(/3\.5rem/);
    });

    it("keeps LangGraph's step result out of the row: it would add a line the moment the step completes", () => {
        const running = plan({ past_steps: [], plan: ['Find the champion', 'Answer'] });
        const done = plan({ past_steps: [['Find the champion', 'The 2024 champion is Jannik Sinner, who beat Taylor Fritz in the final.']], plan: ['Answer'] });
        expect(done.steps[0]).toEqual({ title: 'Find the champion', status: 'done' });
        const card = draw(call('resolved', running));
        const first = shape(card);
        renderer().update!(card, call('resolved', done));
        expect(shape(card)).toBe(first);
    });

    it('reads a Markdown heading as the title, without its hashes, and a tab-indented item as a sub-step', () => {
        const md = plan('## Deploy plan\n- [x] Build\n\t- [x] Bundle core\n\t- [ ] Bundle the docs\n- [ ] Upload');
        expect(md.title).toBe('Deploy plan');
        expect(md.steps.map((s) => s.title)).toEqual(['Build', 'Upload']);
        expect(md.steps[0]!.substeps!.map((s) => s.title)).toEqual(['Bundle core', 'Bundle the docs']);
        expect(plan('# Plan:\n- a').title).toBe('Plan');
    });

    it("turns its running ring with core's own keyframe, not a copy of it", () => {
        expect(sheet()).not.toMatch(/@keyframes aparte-plan-spin/);
        expect(sheet()).toMatch(/animation:\s*aparte-spin\s/);
    });
});
