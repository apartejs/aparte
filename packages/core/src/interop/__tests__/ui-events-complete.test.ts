/**
 * `APARTE_DEFAULT_UI_EVENTS` forwards every event core dispatches on an element.
 *
 * The list is what `<AparteUi>` listens for in all four wrappers when the consumer
 * passes none, so a name missing from it is an event a wrapper consumer cannot hear at
 * all — not "harder to hear", cannot. Its docblock claimed completeness twice: once
 * while carrying 7 of 25, and again while carrying 25 of 35. The five shell and
 * transcript events (`aparte-split-resize`, `aparte-sidebar-toggle`, `aparte-suggestion`,
 * `aparte-scroll-rail-jump`, `aparte-context-threshold`) were the entire up-stack surface
 * of 0.16, and the five lifecycle events were excluded on a stated reason — "they go out
 * through `window.dispatchEvent`" — that `client/lifecycle-events.ts` contradicts: it
 * dispatches them on the HOST element, bubbling and composed.
 *
 * Two assertions. The membership half reads the dispatch sites out of core's own source,
 * so it cannot go stale; `scripts/check-event-map.mjs` carries the same rule for the
 * gate, and this one carries it into the pre-push test run. The second half is the
 * expensive one to fake: a real element, dispatching for real, heard through the exact
 * loop the wrappers run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APARTE_DEFAULT_UI_EVENTS } from '../element-props.js';
import '../../components/suggestions/aparte-suggestions.js';

function coreSrc(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core/src', 'src']) {
            const base = join(dir, root);
            if (existsSync(join(base, 'interop', 'element-props.ts'))) return base;
        }
    }
    throw new Error(`core's src/ not found from ${process.cwd()}`);
}

function tsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'generated') continue;
            tsFiles(p, out);
        } else if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) {
            out.push(p);
        }
    }
    return out;
}

/**
 * Every `aparte-*` event core dispatches on something that is NOT `window`.
 *
 * `dispatchLifecycleEvent(target, …)` counts as an element dispatch: its only two
 * callers hand it the chat host element.
 */
function elementDispatchedEvents(src: string): Set<string> {
    const names = new Set<string>();
    for (const file of tsFiles(src)) {
        const text = readFileSync(file, 'utf8');
        const CALL = /(?:new CustomEvent(?:<[^>(]*>)?|dispatchLifecycleEvent)\s*\(/g;
        for (const m of text.matchAll(CALL)) {
            let depth = 1;
            let i = m.index + m[0].length;
            for (; i < text.length && depth > 0; i++) {
                const c = text[i];
                if (c === '(') depth++;
                else if (c === ')') depth--;
            }
            const name = /['"](aparte-[a-z0-9-]+)['"]/.exec(text.slice(m.index + m[0].length, i - 1));
            if (!name) continue;
            const isLifecycle = m[0].startsWith('dispatchLifecycleEvent');
            const before = text.slice(Math.max(0, m.index - 160), m.index);
            const onWindow = /window\s*\.dispatchEvent\s*\(\s*$/.test(before);
            if (!isLifecycle && onWindow) continue;
            names.add(name[1]);
        }
    }
    return names;
}

const dispatched = elementDispatchedEvents(coreSrc());
const declared = new Set<string>(APARTE_DEFAULT_UI_EVENTS);

/** 37 element-dispatched names the day this was written; a collapsed scan is the failure. */
const FLOOR = 30;

describe('APARTE_DEFAULT_UI_EVENTS', () => {
    it(`reads at least ${FLOOR} element dispatch sites out of core`, () => {
        expect(dispatched.size).toBeGreaterThanOrEqual(FLOOR);
    });

    it('names every event core dispatches on an element', () => {
        expect([...dispatched].filter((n) => !declared.has(n)).sort()).toEqual([]);
    });

    it('names no event core only dispatches on window', () => {
        // The three page-wide broadcasts the docblock lists as deliberately absent.
        for (const windowOnly of ['aparte-abort', 'aparte-compact', 'aparte-config-change']) {
            expect(declared.has(windowOnly)).toBe(false);
        }
    });
});

describe('the wrappers\' forwarding loop, over a live element', () => {
    let host: HTMLElement;
    let heard: string[];
    // `preventDefault` because a wrapper consumer who handles the chip themselves is the
    // documented case, and it keeps the element from looking for a composer that this
    // fixture deliberately does not have.
    const listener = (e: Event) => { heard.push(e.type); e.preventDefault(); };

    beforeEach(() => {
        heard = [];
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        for (const name of APARTE_DEFAULT_UI_EVENTS) host.removeEventListener(name, listener);
        host.remove();
    });

    it('hears aparte-suggestion from a real <aparte-suggestions>', async () => {
        // Exactly what AparteUi does in React, Vue, Svelte and Angular: one listener per
        // name in the default list, on the wrapper's own node, catching what bubbles.
        for (const name of APARTE_DEFAULT_UI_EVENTS) host.addEventListener(name, listener);

        const el = document.createElement('aparte-suggestions');
        host.appendChild(el);
        el.suggestions = [{ label: 'Summarise', prompt: 'Summarise this thread' }];
        await Promise.resolve();

        const chip = el.querySelector<HTMLButtonElement>('button.aparte-suggestion');
        expect(chip, 'the element rendered no chip to click').toBeTruthy();
        chip!.click();

        expect(heard).toContain('aparte-suggestion');
    });
});
