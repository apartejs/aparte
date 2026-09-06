/**
 * The transcript keeps its own anchor: the browser's scroll anchoring is off on both
 * scroll surfaces.
 *
 * The viewport pins the reader to the bottom itself and reads every `scrollTop`
 * decrease it did not write as the reader walking away. CSS scroll anchoring writes
 * such decreases: when a reply settles, its streamed DOM is replaced by the rendered
 * one, and an engine that anchors on a node above the fold moves `scrollTop` to keep
 * that node still. Measured on WebKit, one frame at the end of a streamed turn:
 * scrollHeight +30 and scrollTop −82 together, the follow disarmed as "the reader went
 * up", and the transcript left 82px short of the bottom for good — while Chromium's
 * own pin landed first and the same test was green. A chat appends below the reader,
 * so the browser's anchor protects nothing here and fights the one that does.
 *
 * jsdom applies no stylesheet, so this asserts the source-shape half: the declaration
 * exists on both rules. The rendered half is `streaming-progressive.spec.ts` on the
 * WebKit projects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const shell = readFileSync(resolve(coreRoot(), 'src/styles/components/shell.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

const rule = (selector: string): string => {
    for (const m of shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the transcript owns its anchor', () => {
    it('read the corpus', () => {
        expect(shell.length).toBeGreaterThan(2000);
    });

    it('turns browser scroll anchoring off on the light-DOM scroll surface', () => {
        const body = rule('.aparte-viewport-container');
        expect(body, 'the container rule is gone').toBeTruthy();
        expect(body).toMatch(/overflow-anchor:\s*none/);
    });

    it('and on the framework-managed host, which is the scroll surface there', () => {
        const body = rule('aparte-chat-viewport.aparte-viewport--framework');
        expect(body, 'the framework rule is gone').toBeTruthy();
        expect(body).toMatch(/overflow-anchor:\s*none/);
    });
});
