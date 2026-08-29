/**
 * The tool-call renderer, and the consumer-registered renderer that replaces it.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import { describe, it, expect, afterEach } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { describeToolInput } from '../../../utils/tool-input.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

// ─── consumer-registered custom tool renderer (the VISUAL declaration) ───
// A consumer declares a tool's behaviour with registerTool() and its LOOK with
// registerToolRenderer(name, {render, setup, getStyles}). These prove the custom
// renderer is actually resolved + invoked when that tool renders — not just stored.

describe('custom tool renderer (consumer registerToolRenderer)', () => {
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('visual_tool');
    });

    it('renders the consumer HTML in place of the default pill', () => {
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: () => `<div class="my-visual">searching the web…</div>`,
        });
        const seg = {
            id: 'vt1', type: 'tool_call',
            toolCall: { id: 'c1', name: 'visual_tool', input: {} },
            status: 'pending',
        };
        const html = getSegmentRenderer('tool_call')!.render(seg as any);
        expect(html).toContain('class="my-visual"');
        expect(html).not.toContain('aparte-tool-name'); // the default pill is bypassed
    });

    it('falls back to the default pill when the custom render returns empty', () => {
        aparteGlobalConfig.registerToolRenderer('visual_tool', { render: () => '' });
        const seg = {
            id: 'vt2', type: 'tool_call',
            toolCall: { id: 'c2', name: 'visual_tool', input: {} },
            status: 'pending',
        };
        const html = getSegmentRenderer('tool_call')!.render(seg as any);
        expect(html).toContain('aparte-tool-label'); // empty custom output => hide-to-default
    });

    it('invokes the consumer setup() hook with the mounted element + segment', () => {
        let seenEl: HTMLElement | null = null;
        let seenSeg: unknown = null;
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: () => `<div class="my-visual"></div>`,
            setup: (el, seg) => { seenEl = el; seenSeg = seg; },
        });
        const seg = {
            id: 'vt3', type: 'tool_call',
            toolCall: { id: 'c3', name: 'visual_tool', input: {} },
            status: 'resolved',
        };
        const host = document.createElement('div');
        getSegmentRenderer('tool_call')!.setup!(host, seg as any);
        expect(seenEl).toBe(host);
        expect(seenSeg).toBe(seg);
    });

    // A registered renderer used to be rebuilt from `render()` on every change of the
    // call, so anything with state in its markup — a mounted preview, an opened
    // disclosure — was lost the moment the result landed. `update` lets it patch.
    it('patches through the consumer update() instead of rebuilding, when declared', () => {
        let renders = 0;
        let patched: { el: HTMLElement; status: string | undefined } | null = null;
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: () => { renders++; return `<div class="my-visual"><iframe></iframe></div>`; },
            update: (el, seg) => { patched = { el, status: seg.status }; },
        });
        const seg = {
            id: 'vt5', type: 'tool_call',
            toolCall: { id: 'c5', name: 'visual_tool', input: {} },
            status: 'pending',
        };
        const renderer = getSegmentRenderer('tool_call')!;
        const wrap = document.createElement('div');
        wrap.innerHTML = renderer.render(seg as any) as string;
        const el = wrap.firstElementChild as HTMLElement;
        const frame = el.querySelector('iframe');
        renderer.update!(el, { ...seg, status: 'resolved', result: 'done' } as any);
        expect(patched!.el).toBe(el);
        expect(patched!.status).toBe('resolved');
        expect(renders, 'no second render').toBe(1);
        expect(el.querySelector('iframe'), 'the mounted frame survived').toBe(frame);
    });

    it('still rebuilds a consumer renderer that declares no update()', () => {
        let renders = 0;
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: (s) => { renders++; return `<div class="my-visual" data-s="${s.status}"></div>`; },
        });
        const seg = {
            id: 'vt6', type: 'tool_call',
            toolCall: { id: 'c6', name: 'visual_tool', input: {} },
            status: 'pending',
        };
        const renderer = getSegmentRenderer('tool_call')!;
        const wrap = document.createElement('div');
        wrap.innerHTML = renderer.render(seg as any) as string;
        renderer.update!(wrap.firstElementChild as HTMLElement, { ...seg, status: 'resolved' } as any);
        expect(renders).toBe(2);
        expect(wrap.firstElementChild!.getAttribute('data-s')).toBe('resolved');
    });

    it('forwards relabel() to the consumer renderer, and touches nothing without one', () => {
        let relabelled = 0;
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: () => `<div class="my-visual"><span class="aparte-tool-icon">x</span></div>`,
            relabel: () => { relabelled++; },
        });
        const seg = {
            id: 'vt7', type: 'tool_call',
            toolCall: { id: 'c7', name: 'visual_tool', input: {} },
            status: 'resolved',
        };
        const renderer = getSegmentRenderer('tool_call')!;
        const wrap = document.createElement('div');
        wrap.innerHTML = renderer.render(seg as any) as string;
        const el = wrap.firstElementChild as HTMLElement;
        renderer.relabel!(el, seg as any);
        expect(relabelled).toBe(1);
        // The built-in's own selectors are not applied to a consumer's markup.
        expect(el.querySelector('.aparte-tool-icon')!.textContent).toBe('x');
    });

    it('lets a tool draw its own surface while it awaits approval', () => {
        // The exact OPPOSITE of what this asserted, and the inversion is the fix. The
        // built-in Approve / Reject branch ran BEFORE this lookup, so a registered tool
        // renderer could never draw anything while its tool waited — a seam reported as
        // missing that was only being shadowed. With the decision at the composer there
        // is nothing left to shadow it with.
        aparteGlobalConfig.registerToolRenderer('visual_tool', {
            render: () => `<div class="my-visual">MY OWN REVIEW SURFACE</div>`,
        });
        const seg = {
            id: 'vt4', type: 'tool_call',
            toolCall: { id: 'c4', name: 'visual_tool', input: {} },
            status: 'awaiting-approval',
        };
        const html = getSegmentRenderer('tool_call')!.render(seg as any);
        expect(html).toContain('MY OWN REVIEW SURFACE');
        expect(html, 'and no decision control in the transcript').not.toContain('data-tool-decision');
    });
});

// ─── the built-in tool_call renderer ─────────────────────────────────

describe('default renderer: tool_call', () => {
    it('is registered after registerDefaultRenderers()', () => {
        expect(getSegmentRenderer('tool_call')).toBeDefined();
    });

    it('renders a pill with the tool name', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc1',
            type: 'tool_call',
            toolCall: { id: 'c1', name: 'web_search', input: {} },
            status: 'pending'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain('web_search');
    });

    it('escapes a hostile tool-call id in data-segment-id (XSS)', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        // segment.id is `tool-${toolCallId}`; toolCallId comes verbatim from the
        // endpoint's SSE `delta.tool_calls[].id` — hostile-by-default.
        const seg = {
            id: 'tool-"><img src=x onerror=alert(1)>',
            type: 'tool_call',
            toolCall: { id: '"><img src=x onerror=alert(1)>', name: 'web_search', input: {} },
            status: 'resolved',
        };
        const html = renderer.render(seg as any);
        expect(html).not.toContain('<img src=x onerror=');
        expect(html).not.toContain('"><img');
        expect(html).toContain('&lt;img src=x onerror=');
    });

    it('renders spinner for pending status', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc2', type: 'tool_call',
            toolCall: { id: 'c2', name: 'my_tool', input: {} },
            status: 'pending'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain('aparte-tool-spinner');
        expect(html).not.toContain(aparteGlobalConfig.getIcon('check'));
    });

    /*
     * What went in and what came out. The pill named the tool and showed neither, while
     * the segment carried both — missing presentation, not missing data.
     */
    describe('the disclosure', () => {
        const resolved = () => ({
            id: 'd1', type: 'tool_call', status: 'resolved',
            toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a.ts', force: true } },
            result: 'deleted a.ts',
        });
        const el = (seg: unknown): HTMLElement => {
            const tpl = document.createElement('template');
            tpl.innerHTML = String(getSegmentRenderer('tool_call')!.render(seg as never)).trim();
            return tpl.content.firstElementChild as HTMLElement;
        };

        it('ships no source comment into the bubble', () => {
            /*
             * `check:text-escaping` reads the SOURCE, so it cannot see this: an
             * exemption marker written at a use site lands inside the multi-line
             * template literal and renders as visible text. It happened — the sentence
             * "safe-text: markup built right here" appeared in the assistant's bubble,
             * between the reply and the pill. The guard's own docblock warns about this
             * exact mistake, in the first person, because it had been made once before.
             *
             * An assertion on the OUTPUT is the level that catches it.
             */
            for (const seg of [resolved(), { ...resolved(), status: 'pending', result: undefined }]) {
                const html = String(getSegmentRenderer('tool_call')!.render(seg as never));
                expect(html, 'a marker in the output is a marker served to users').not.toContain('safe-text');
                expect(html).not.toContain('safe-attr');
            }
        });

        it('shows the arguments and the result', () => {
            const node = el(resolved());
            expect(node.querySelector('[data-part="input"]')?.textContent).toContain('"path": "a.ts"');
            expect(node.querySelector('[data-part="output"]')?.textContent).toContain('deleted a.ts');
        });

        it('is closed, including while a person is deciding', () => {
            // The reasoning block stays closed while it is being PRODUCED — the most
            // live moment there is — so a tool call has no stronger claim to unroll
            // itself. One rule, no special cases.
            expect(el(resolved()).hasAttribute('open')).toBe(false);
            const waiting = { ...resolved(), status: 'awaiting-approval', result: undefined };
            expect(el(waiting).hasAttribute('open')).toBe(false);
        });

        it('does not close what the reader opened', () => {
            // Without an `update` the bubble REPLACES the element, and a tool call
            // changes status several times a turn — the disclosure would slam shut
            // under them every time.
            const node = el({ ...resolved(), status: 'pending', result: undefined });
            document.body.appendChild(node);
            node.setAttribute('open', '');

            getSegmentRenderer('tool_call')!.update!(node, resolved() as never);

            expect(node.hasAttribute('open'), 'still open').toBe(true);
            expect(node.getAttribute('data-status')).toBe('resolved');
            expect(node.querySelector('[data-part="output"]')?.textContent).toContain('deleted a.ts');
        });

        it('offers no disclosure when there is nothing behind it', () => {
            // A tool with no arguments and no result yet. A disclosure onto nothing is
            // an affordance that lies.
            const node = el({ id: 'd2', type: 'tool_call', status: 'pending', toolCall: { id: 'c2', name: 'get_time', input: {} } });
            expect(node.tagName).toBe('DIV');
            expect(node.querySelector('.aparte-tool-toggle')).toBeNull();
        });
    });

    it('renders checkmark for resolved status', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc3', type: 'tool_call',
            toolCall: { id: 'c3', name: 'my_tool', input: {} },
            status: 'resolved'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain(aparteGlobalConfig.getIcon('check'));
        // The spinner node is always present now — `update` toggles `hidden` on it
        // rather than adding and removing a node, so what a resolved call must not have
        // is a VISIBLE spinner, and `hidden` is the part a test can actually read.
        expect(html).toContain('aparte-tool-spinner');
        expect(html).toContain('aria-hidden="true" hidden');
    });

    it('renders a stop square for aborted status — not the cross rejected wears', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc4', type: 'tool_call',
            toolCall: { id: 'c4', name: 'my_tool', input: {} },
            status: 'aborted'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain(aparteGlobalConfig.getIcon('stop'));
        expect(html).not.toContain(aparteGlobalConfig.getIcon('close'));
        // Stopped and declined used to share the glyph and the red ink; the glyph tells
        // them apart now, and neither is red — red stays for what went wrong.
        const rejected = renderer.render({ ...seg, id: 'tc5', status: 'rejected' } as any);
        expect(rejected).toContain(aparteGlobalConfig.getIcon('close'));
    });

    it('sets data-status attribute matching the segment status', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc5', type: 'tool_call',
            toolCall: { id: 'c5', name: 'calc', input: {} },
            status: 'resolved'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain('data-status="resolved"');
    });

    it('escapes HTML in tool name to prevent XSS', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc6', type: 'tool_call',
            toolCall: { id: 'c6', name: '<script>alert(1)</script>', input: {} },
            status: 'pending'
        };
        const html = renderer.render(seg as any);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('ships its CSS in the stylesheet, not from getStyles()', () => {
        /*
         * The invariant is unchanged — the rules exist and name these classes — but the
         * file that holds them is not the renderer any more. `getStyles` is the seam for
         * a CONSUMER's renderer, which cannot edit aparte.css and has no other way onto
         * the page; a built-in that used it was hiding its rules from the derived-vars
         * guard and from the generated CSS reference both.
         */
        expect(getSegmentRenderer('tool_call')!.getStyles?.()).toBe('');

        const sheet = readAparteStylesheet();
        expect(sheet).toContain('.aparte-tool-label');
        expect(sheet).toContain('.aparte-tool-spinner');
    });
});

// ─── the disclosure's input and result wrap ───
// A one-line result (an error message, a long path) ran past the bubble's edge: the
// `<pre>` kept its default `white-space: pre`, and the only rule it had — in prose.css,
// not even in this segment's sheet — was `margin: 0`. Measured before the fix: 1 823px of
// text in a 723px body. The rule now lives here and wraps like the code block does.
describe('tool detail — input and result wrap inside the bubble', () => {
    it('gives the detail <pre> pre-wrap and overflow-wrap: anywhere', () => {
        const sheet = readAparteStylesheet();
        const rule = sheet.match(/\.aparte-tool-part-body pre\s*\{([^}]*)\}/);
        expect(rule, 'the tool detail <pre> must have a rule of its own').toBeTruthy();
        expect(rule![1]).toMatch(/white-space:\s*pre-wrap/);
        expect(rule![1]).toMatch(/overflow-wrap:\s*anywhere/);
        // …and exactly one: a second declaration elsewhere would be the drift that hid this.
        expect(sheet.match(/\.aparte-tool-part-body pre\s*\{/g)).toHaveLength(1);
    });
});

/**
 * The row and the approval panel read the same arguments, from the same function.
 *
 * When the panel started showing the call it asks about, the risk was two renderings
 * of one value: a person approving a call they read differently from the one that
 * runs. `describeToolInput` is the single body, in `utils/`, and the row's own
 * `describeInput` is now a one-line call to it.
 *
 * And the row still does NOT open itself when a decision is pending. The panel is the
 * decision surface now, so "open the disclosure so they can see what they are
 * approving" has lost its last argument — the reasoning block stays closed while it is
 * being produced, and a tool call has no stronger claim.
 */
describe('the arguments the panel shows are the ones the row shows', () => {
    const call = {
        id: 's-args', type: 'tool_call' as const, status: 'awaiting-approval' as const,
        toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a.ts', force: true } },
    };

    it('is the same text on both surfaces', () => {
        const node = document.createElement('div');
        node.innerHTML = getSegmentRenderer('tool_call')!.render(call as never);
        const row = node.querySelector('[data-part="input"]')!.textContent!;
        expect(row).toContain(describeToolInput(call.toolCall.input));
    });

    it('says nothing when there is nothing to say', () => {
        expect(describeToolInput({})).toBe('');
        expect(describeToolInput(undefined)).toBe('');
        // A hand-built segment can carry a cyclic object; a broken bubble is worse
        // than no arguments.
        const cyclic: Record<string, unknown> = { a: 1 };
        cyclic['self'] = cyclic;
        expect(describeToolInput(cyclic)).toBe('');
    });

    it('leaves the row closed while a person is deciding', () => {
        const node = document.createElement('div');
        node.innerHTML = getSegmentRenderer('tool_call')!.render(call as never);
        expect(node.querySelector('details')?.hasAttribute('open')).toBe(false);
    });
});
