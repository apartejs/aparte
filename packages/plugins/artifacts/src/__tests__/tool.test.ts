/**
 * The two ways an artifact arrives — the tool and the tag — and the one card both
 * end in.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { AparteConfig, AparteStreamParser, aparteGlobalConfig, getSegmentRenderer, installDefaultRenderersOnce } from '@aparte/core';
import type { AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { setupArtifacts, createArtifactTool, artifactHandler, artifactBlock, artifactFromToolCall, ARTIFACT_SYSTEM_PROMPT, deriveArtifactKind } from '../index.js';
import type { ArtifactSegment } from '../index.js';

describe('the create_artifact tool', () => {
    it('is a real tool: a name, a schema the model sees, and a system prompt', () => {
        const tool = createArtifactTool();
        expect(tool.name).toBe('create_artifact');
        expect((tool.inputSchema as { required: string[] }).required).toEqual(['mimeType', 'content']);
        expect(tool.systemPrompt).toBe(ARTIFACT_SYSTEM_PROMPT);
        expect(createArtifactTool({ name: 'make_document', systemPrompt: 'Make docs.' }).name).toBe('make_document');
        expect(createArtifactTool({ systemPrompt: 'Make docs.' }).systemPrompt).toBe('Make docs.');
        expect(createArtifactTool({ systemPrompt: false }).systemPrompt).toBeUndefined();
    });

    it('the handler returns the document as the structured result, with prose the model can read', async () => {
        const result = await artifactHandler({ id: 'c1', name: 'create_artifact', input: { mimeType: 'text/html', title: ' Page ', content: '<p>hi</p>' } });
        expect(result.toolCallId).toBe('c1');
        expect(result.structuredContent).toEqual({ mimeType: 'text/html', title: 'Page', content: '<p>hi</p>' });
        expect(result.content).toContain('Page');
        expect(result.content).toContain('do not repeat');
    });

    it('the handler tolerates a model that forgot the type', async () => {
        const result = await artifactHandler({ id: 'c2', name: 'create_artifact', input: { content: 'plain' } });
        expect(result.structuredContent).toEqual({ mimeType: 'text/plain', content: 'plain' });
    });
});

describe('the tool renderer draws the card from the call', () => {
    let off: (() => void) | null = null;
    // Core's own renderers (the generic `tool_call` row among them) install lazily on
    // the first bubble render; a test that resolves them by hand installs them by hand.
    beforeEach(() => { installDefaultRenderersOnce(); off = setupArtifacts(); });
    afterEach(() => { off?.(); off = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    const call = (extra: Partial<AparteToolCallSegment>): AparteToolCallSegment => ({
        id: 'seg-1', type: 'tool_call', status: 'resolved',
        toolCall: { id: 'c1', name: 'create_artifact', input: { mimeType: 'image/svg+xml', title: 'Mark', content: '<svg/>' } },
        ...extra,
    } as AparteToolCallSegment);

    it('reads the structured result first, and the input while the call is pending', () => {
        const fromResult = artifactFromToolCall(call({ structuredResult: { mimeType: 'text/html', title: 'Page', content: '<p>x</p>' } }));
        expect(fromResult.artifactType).toBe('html');
        expect(fromResult.title).toBe('Page');
        expect(fromResult.id).toBe('seg-1');
        const fromInput = artifactFromToolCall(call({ status: 'pending' }));
        expect(fromInput.artifactType).toBe('svg');
        expect(fromInput.content).toBe('<svg/>');
        expect(fromInput.isStreaming).toBe(false);
    });

    it('renders the artifact card in place of the tool row, and patches it in place', () => {
        const toolRenderer = aparteGlobalConfig.getToolRenderer('create_artifact')!;
        const pending = call({ status: 'pending' });
        const html = toolRenderer.render(pending) as string;
        expect(html).toContain('aparte-segment-artifact-card');
        expect(html).toContain('Mark');
        expect(html).toContain('data-artifact-type="svg"');
        // Through the generic tool_call renderer, exactly as the bubble resolves it.
        const generic = getSegmentRenderer('tool_call')!;
        const host = document.createElement('div');
        host.innerHTML = generic.render(pending) as string;
        const el = host.firstElementChild as HTMLElement;
        document.body.appendChild(host);
        generic.setup?.(el, pending);
        el.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();
        const frame = el.querySelector('iframe');
        expect(frame, 'the reader opened the preview').not.toBeNull();
        generic.update?.(el, call({ status: 'resolved', result: 'Artifact created', structuredResult: { mimeType: 'image/svg+xml', title: 'Mark', content: '<svg/>' } }));
        expect(host.firstElementChild, 'patched, not rebuilt').toBe(el);
        expect(el.querySelector('iframe'), 'the mounted preview survived the result').toBe(frame);
        expect(toolRenderer.getStyles!()).toContain('.aparte-art-card__tabs');
    });
});

describe('the <artifact> tag in the prose', () => {
    it('is a grammar core\'s parser streams into an artifact segment', () => {
        const parser = new AparteStreamParser({ blocks: [artifactBlock()] });
        const out: AparteSegment[] = [];
        for (const chunk of ['Here: <artifact type="text/markdown" title="Note">## hi', '\nbody</arti', 'fact> done']) out.push(...parser.parse(chunk).segments);
        out.push(...parser.finalize());
        expect(out.map((s) => s.type)).toEqual(['text', 'artifact', 'text']);
        const art = out[1] as unknown as ArtifactSegment;
        expect(art.mimeType).toBe('text/markdown');
        expect(art.artifactType).toBe('markdown');
        expect(art.title).toBe('Note');
        expect(art.content).toBe('## hi\nbody');
        expect(art.isStreaming).toBe(false);
    });

    it('reads mimeType= as well as type=, and mimeType wins', () => {
        const parser = new AparteStreamParser({ blocks: [artifactBlock()] });
        const [seg] = parser.parse('<artifact type="text/plain" mimeType="text/html">x</artifact>').segments;
        expect((seg as unknown as ArtifactSegment).mimeType).toBe('text/html');
    });

    it('is registered on the config by setupArtifacts, under the tag the app chose', () => {
        const cfg = new AparteConfig();
        const off = setupArtifacts({ tag: 'doc' }, cfg);
        expect(cfg.getStreamBlocks().map((b) => b.tag)).toEqual(['doc']);
        off();
        expect(cfg.getStreamBlocks()).toEqual([]);
        const none = setupArtifacts({ tag: false }, cfg);
        expect(cfg.getStreamBlocks()).toEqual([]);
        none();
    });
});

describe('deriveArtifactKind', () => {
    it('names the kinds the card switches on', () => {
        expect(deriveArtifactKind('application/vnd.ant.react')).toBe('react');
        expect(deriveArtifactKind('text/html; charset=utf-8')).toBe('html');
        expect(deriveArtifactKind('application/pdf')).toBe('pdf');
        expect(deriveArtifactKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx');
        expect(deriveArtifactKind('font/woff2', 'text')).toBe('text');
    });
});
