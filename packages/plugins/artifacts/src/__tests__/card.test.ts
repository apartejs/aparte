/**
 * The artifact card: its tabs, the code view, the gesture the preview requires, and
 * the binary path on the app's `onBinary`.
 *
 * Moved from core with the feature (D7). Every registration goes through
 * `setupArtifacts()`, so what these exercise is what a consumer gets.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getSegmentRenderer, aparteGlobalConfig } from '@aparte/core';
import { setupArtifacts, type ArtifactsSetupOptions } from '../index.js';
import { resetBinaryArtifacts } from '../binary-file.js';

let teardown: (() => void) | null = null;
function install(options: ArtifactsSetupOptions = {}): void {
    teardown?.();
    teardown = setupArtifacts(options);
}

/** Render + setup a card into a live parent, the way the bubble does. */
function mountCard(segment: Record<string, unknown>): HTMLElement {
    const renderer = getSegmentRenderer('artifact')!;
    const host = document.createElement('div');
    host.innerHTML = renderer.render(segment as never) as string;
    const el = host.firstElementChild as HTMLElement;
    document.body.appendChild(host);
    renderer.setup?.(el, segment as never);
    return el;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('the artifact card', () => {
    beforeEach(() => { install(); resetBinaryArtifacts(); });
    afterEach(() => { teardown?.(); teardown = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    it('is registered by setupArtifacts(), and unregistered by what it returns', () => {
        const hasTool = () => aparteGlobalConfig.getTools().some((t) => t.name === 'create_artifact');
        expect(getSegmentRenderer('artifact')).toBeDefined();
        expect(hasTool()).toBe(true);
        expect(aparteGlobalConfig.getToolRenderer('create_artifact')).toBeDefined();
        expect(aparteGlobalConfig.getStreamBlocks().map((b) => b.tag)).toEqual(['artifact']);
        teardown!(); teardown = null;
        expect(getSegmentRenderer('artifact')).toBeUndefined();
        expect(hasTool()).toBe(false);
        expect(aparteGlobalConfig.getStreamBlocks()).toEqual([]);
    });

    it('pressing Download saves the artifact under a slug of its title', () => {
        // jsdom has no object URLs, and an anchor's click cannot be observed after the
        // handler removes it, so both are intercepted rather than mocked away.
        const urls: string[] = [];
        (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:probe';
        (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = (u: string) => { urls.push(u); };
        const saved: { name: string; href: string }[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            function (this: HTMLAnchorElement) { saved.push({ name: this.download, href: this.href }); },
        );

        const el = mountCard({
            id: 'dl1', type: 'artifact', mimeType: 'image/svg+xml', artifactType: 'svg',
            title: '  My Chart: v2!  ', content: '```svg\n<svg/>\n```', isStreaming: false,
        });
        (el.querySelector('[data-action="download"]') as HTMLElement).click();

        expect(saved).toHaveLength(1);
        // Slug: lowercased, runs of punctuation collapsed to one dash, no trailing
        // dash — and the extension comes from the KIND, not from the title.
        expect(saved[0]!.name).toBe('my-chart-v2.svg');
        expect(saved[0]!.href).toBe('blob:probe');
        click.mockRestore();
    });

    it('an artifact with nothing usable to name it still downloads sanely', () => {
        (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:probe2';
        (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => { /* noop */ };
        const saved: string[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            function (this: HTMLAnchorElement) { saved.push(this.download); },
        );

        const el = mountCard({
            id: 'dl2', type: 'artifact', artifactType: 'weird', title: '***',
            content: 'x', isStreaming: false,
        });
        (el.querySelector('[data-action="download"]') as HTMLElement).click();

        expect(saved).toEqual(['artifact.txt']);
        click.mockRestore();
    });

    it('renders the code pane with escaped content and a title derived from kind when none given', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a1', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<script>alert(1)</script>', isStreaming: false,
        } as any);
        expect(html).toContain('aparte-art-card__title">HTML document<');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('uses a provided (escaped) title verbatim instead of the kind label', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a2', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: 'x', title: '<b>My Doc</b>', isStreaming: false,
        } as any);
        expect(html).toContain('&lt;b&gt;My Doc&lt;/b&gt;');
    });

    it('forces the code tab while streaming even for a previewable kind', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a3', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<div>hi</div>', isStreaming: true,
        } as any);
        expect(html).toContain('data-tab="code"');
        expect(html).toContain('data-streaming="true"');
        expect(html).toContain('Press Preview to run this artifact.');
    });

    it('offers the preview tab once settled, but mounts no frame until asked', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a4', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>done</p>', isStreaming: false,
        } as any);
        expect(html).toContain('data-tab="code"');
        expect(html).toContain('data-previewable="true"');
        expect(html).toContain('data-tab-target="preview"');
        expect(html).not.toContain('<iframe');
    });

    it('offers no preview tab at all with preview: false', () => {
        install({ preview: false });
        const el = mountCard({
            id: 'np', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>done</p>', isStreaming: false,
        });
        expect(el.getAttribute('data-previewable')).toBe('false');
        expect(el.querySelector('[data-tab-target="preview"]')).toBeNull();
    });

    it('stops pulsing when the stream stops', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const streaming = {
            id: 'a9', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>half', isStreaming: true,
        };
        const el = mountCard(streaming);
        expect(el.querySelector('.aparte-art-card__pulse')).not.toBeNull();
        expect(el.getAttribute('data-streaming')).toBe('true');
        renderer.update!(el, { ...streaming, content: '<p>whole</p>', isStreaming: false } as never);
        expect(el.getAttribute('data-streaming')).toBe('false');
        expect(el.querySelector('.aparte-art-card__pulse')).toBeNull();
    });

    it('stays on the code tab for a non-previewable kind (e.g. python) even when settled', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a5', type: 'artifact', mimeType: 'text/x-python', artifactType: 'python',
            content: 'print(1)', isStreaming: false,
        } as any);
        expect(html).toContain('data-tab="code"');
        expect(html).toContain('data-previewable="false"');
        expect(html).not.toContain('data-pane="preview"');
    });

    it('uses the app\'s preview builder when the user opens the preview', () => {
        install({ preview: (kind, body, title) => `<!--CUSTOM ${kind} ${title}-->${body}` });
        const card = mountCard({
            id: 'a6', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>x</p>', title: 'Doc', isStreaming: false,
        });
        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();
        expect(card.querySelector('iframe')!.getAttribute('srcdoc')).toContain('CUSTOM html Doc');
    });

    it('keeps the download button for a text artifact with nothing declared', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a-dl-text', type: 'artifact', mimeType: 'text/x-python', artifactType: 'python',
            content: 'print(1)', isStreaming: false,
        } as any);
        expect(html).toContain('data-action="download"');
    });

    it('strips a wrapping markdown code fence from the content before rendering', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a7', type: 'artifact', mimeType: 'text/css', artifactType: 'css',
            content: '```css\nbody { color: red; }\n```', isStreaming: false,
        } as any);
        expect(html).toContain('body { color: red; }');
        expect(html).not.toContain('```');
    });

    it('setup() wires the tab-switch buttons to flip data-tab and aria-selected', () => {
        const el = mountCard({
            id: 'a8', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>hi</p>', isStreaming: false,
        });
        const codeTabBtn = el.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!;
        codeTabBtn.click();
        expect(el.getAttribute('data-tab')).toBe('code');
        expect(codeTabBtn.getAttribute('aria-selected')).toBe('true');
    });
});

// ─ binary file kinds (pdf/xlsx/docx): the app produces the file ─

describe('a binary artifact', () => {
    beforeEach(() => { resetBinaryArtifacts(); });
    afterEach(() => { teardown?.(); teardown = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    const pdf = (id: string, isStreaming: boolean) => ({
        id, type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
        content: 'sandbox code', isStreaming,
    });

    it('without onBinary shows its source, offers no download and asks nobody', () => {
        install();
        const el = mountCard(pdf('b0', false));
        expect(el.getAttribute('data-state')).toBe('source');
        expect(el.querySelector('[data-action="download"]')).toBeNull();
    });

    it('renders a streaming card with a disabled download and "Generating…" when the app can produce it', () => {
        install({ onBinary: async () => ({ buffer: 'x', mime: 'application/pdf', filename: 'x.pdf' }) });
        const html = getSegmentRenderer('artifact')!.render(pdf('b1', true) as never);
        expect(html).toContain('aparte-segment-artifact-file');
        expect(html).toContain('data-state="streaming"');
        expect(html).toContain('Generating…');
        expect(html).toContain('data-action="download" disabled');
    });

    it('asks onBinary once the source settles, then shows the file and enables download', async () => {
        const calls: string[] = [];
        install({
            onBinary: async (a) => { calls.push(a.content); return { buffer: '%PDF-1.4 …', mime: 'application/pdf', filename: 'report.pdf', previewHtml: '<table><tr><td>cell</td></tr></table>' }; },
        });
        const el = mountCard(pdf('b2', false));
        expect(el.getAttribute('data-state')).toBe('compiling');
        await flush();
        expect(calls).toEqual(['sandbox code']);
        expect(el.getAttribute('data-state')).toBe('ready');
        expect(el.querySelector('[data-role="file-name"]')!.textContent).toBe('report.pdf');
        expect(el.querySelector('[data-role="file-sub"]')!.textContent).toContain('PDF');
        expect(el.querySelector<HTMLButtonElement>('[data-action="download"]')!.disabled).toBe(false);
        expect(el.querySelector('[data-role="preview-pane"]')!.innerHTML).toContain('cell');
        // A second mount of the same segment (a branch switch back) asks nobody.
        const again = mountCard(pdf('b2', false));
        await flush();
        expect(calls).toHaveLength(1);
        expect(again.getAttribute('data-state')).toBe('ready');
    });

    it('a settled source under a streaming card is produced on the update that settles it', async () => {
        let asked = 0;
        install({ onBinary: async () => { asked++; return { buffer: 'x', mime: 'application/pdf', filename: 'f.pdf' }; } });
        const renderer = getSegmentRenderer('artifact')!;
        const el = mountCard(pdf('b3', true));
        expect(asked).toBe(0);
        renderer.update!(el, pdf('b3', false) as never);
        await flush();
        expect(asked).toBe(1);
        expect(el.getAttribute('data-state')).toBe('ready');
    });

    it('shows the failure in the card when onBinary rejects', async () => {
        install({ onBinary: async () => { throw new Error('ReferenceError: drawText is not defined\n  at line 3'); } });
        const el = mountCard(pdf('b4', false));
        await flush();
        expect(el.getAttribute('data-state')).toBe('error');
        expect(el.querySelector('.aparte-art-file__error-msg')!.textContent).toBe('ReferenceError: drawText is not defined');
        expect(el.querySelector('.aparte-art-file__error-title')!.textContent).toBe('The sandbox failed during generation.');
    });

    it('escapes a hostile title in a binary-file card', () => {
        install();
        const html = getSegmentRenderer('artifact')!.render({ ...pdf('b5', true), title: '<img src=x onerror=alert(1)>' } as never);
        expect(html).not.toContain('<img src=x onerror=');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
});
