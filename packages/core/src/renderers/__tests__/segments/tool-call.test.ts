/**
 * The tool-call renderer, and the consumer-registered renderer that replaces it.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

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
        expect(html).not.toContain('tool-pill-name'); // the default pill is bypassed
    });

    it('falls back to the default pill when the custom render returns empty', () => {
        aparteGlobalConfig.registerToolRenderer('visual_tool', { render: () => '' });
        const seg = {
            id: 'vt2', type: 'tool_call',
            toolCall: { id: 'c2', name: 'visual_tool', input: {} },
            status: 'pending',
        };
        const html = getSegmentRenderer('tool_call')!.render(seg as any);
        expect(html).toContain('tool-pill'); // empty custom output => hide-to-default
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
        expect(html).toContain('tool-pill-spinner');
        expect(html).not.toContain(aparteGlobalConfig.getIcon('check'));
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
        expect(html).not.toContain('tool-pill-spinner');
    });

    it('renders cross for aborted status', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const seg = {
            id: 'tc4', type: 'tool_call',
            toolCall: { id: 'c4', name: 'my_tool', input: {} },
            status: 'aborted'
        };
        const html = renderer.render(seg as any);
        expect(html).toContain(aparteGlobalConfig.getIcon('close'));
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

    it('provides CSS via getStyles()', () => {
        const renderer = getSegmentRenderer('tool_call')!;
        const styles = renderer.getStyles?.();
        expect(styles).toBeDefined();
        expect(styles).toContain('tool-pill');
        expect(styles).toContain('tool-pill-spinner');
    });
});
