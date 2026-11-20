// @vitest-environment jsdom
/**
 * The spacer under the reply, measured again with nothing on the page changed, stays what it was.
 *
 * It is the room the reply has not filled yet: `clientHeight − (what lies under the question)`,
 * where what lies under the question is read as `scrollHeight − spacer − questionTop`. A
 * browser gives `scrollHeight` in whole pixels and the question's top in fractions. Under a
 * wrapper the spacer was read back as the exact value written, a fraction too, so each
 * measurement was off by up to half a pixel, the other way the next time. It went 65.6, 66.1,
 * 65.6… on every streamed delta that grew nothing (a closed reasoning block), `scrollHeight`
 * 597, 598…, and the thread, held at the end of its scroll, moved a pixel up and down for as
 * long as the reply streamed (apartejs/aparte#270).
 *
 * jsdom lays nothing out, so the layout here is a browser's, written by hand: fractional
 * positions, a rounded `scrollHeight` and `offsetHeight`, a `scrollTop` clamped to whole pixels.
 * Many layouts, from a seed, in both modes: a property, not one example.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';

interface Layout {
    /** Everything in the scroll surface but the spacer, in fractional pixels. */
    content: number;
    /** Where the question starts, from the top of the content. */
    questionTop: number;
    /** The surface's height, in whole pixels. */
    client: number;
}

type Viewport = HTMLElement & { _recalculateSpacer(): void };

/** A small deterministic generator, so a failure names the layout that made it. */
function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function mount(framework: boolean, layout: Layout): { vp: Viewport; spacer: () => number } {
    const vp = document.createElement('aparte-chat-viewport') as Viewport;
    if (framework) vp.setAttribute('framework-managed', '');
    document.body.appendChild(vp);
    const surface = (framework ? vp : vp.querySelector('.aparte-viewport-container')) as HTMLElement;
    const spacerEl = vp.querySelector('.aparte-bottom-spacer') as HTMLElement | null;
    // The spacer as laid out: the value written, in layout units.
    const written = (): number => framework
        ? parseFloat(vp.style.getPropertyValue('--aparte-fw-spacer')) || 0
        : parseFloat(spacerEl?.style.height ?? '') || 0;
    if (spacerEl) Object.defineProperty(spacerEl, 'offsetHeight', { configurable: true, get: () => Math.round(written()) });

    const question = document.createElement('aparte-chat-bubble');
    question.setAttribute('data-role', 'user');
    const reply = document.createElement('aparte-chat-bubble');
    reply.setAttribute('data-role', 'assistant');
    (framework ? vp : vp.querySelector('.aparte-messages-wrapper') ?? surface).append(question, reply);

    let top = 0;
    const max = (): number => Math.max(0, Math.round(layout.content + written()) - layout.client);
    Object.defineProperties(surface, {
        scrollHeight: { configurable: true, get: () => Math.round(layout.content + written()) },
        clientHeight: { configurable: true, get: () => layout.client },
        scrollTop: { configurable: true, get: () => top, set: (v: number) => { top = Math.min(max(), Math.max(0, Math.round(v))); } },
    });
    surface.getBoundingClientRect = () => ({ top: 0, left: 0, right: 800, bottom: layout.client, width: 800, height: layout.client, x: 0, y: 0, toJSON: () => ({}) });
    question.getBoundingClientRect = () => {
        const y = layout.questionTop - top;
        return { top: y, left: 0, right: 800, bottom: y + 40, width: 800, height: 40, x: 0, y, toJSON: () => ({}) };
    };
    return { vp, spacer: written };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the spacer, measured again with nothing changed', () => {
    for (const framework of [false, true]) {
        it(`stays what it was (${framework ? 'under a wrapper' : 'raw core'})`, () => {
            const next = random(270);
            const moved: string[] = [];
            for (let i = 0; i < 200; i++) {
                const client = 300 + Math.floor(next() * 400);
                const content = client + 40 + next() * 600;
                // Under the question, less than the surface holds: a spacer is needed.
                const below = 20 + next() * (client - 60);
                const layout: Layout = { content, questionTop: content - below, client };
                const { vp, spacer } = mount(framework, layout);
                const seen: number[] = [];
                for (let n = 0; n < 6; n++) {
                    vp._recalculateSpacer();
                    seen.push(spacer());
                }
                if (new Set(seen.slice(1)).size !== 1 || seen[1] !== seen[0]) {
                    moved.push(`${JSON.stringify(layout)} → ${seen.map((s) => s.toFixed(2)).join(', ')}`);
                }
                vp.remove();
            }
            expect(moved, 'layouts whose spacer changed with nothing changed').toEqual([]);
        });
    }

    it('still leaves the question at the top of the surface', () => {
        const layout: Layout = { content: 931.3, questionTop: 640.45, client: 334 };
        const { vp } = mount(true, layout);
        vp._recalculateSpacer();
        vp._recalculateSpacer();
        const surface = vp;
        surface.scrollTop = surface.scrollHeight;
        // The question's top within half a pixel of the surface's: the spacer is the room the
        // reply has not filled, whole pixels or not.
        expect(Math.abs(layout.questionTop - surface.scrollTop)).toBeLessThanOrEqual(1);
    });
});
