/**
 * The same card, drawn as the body of the document panel.
 *
 * In a reply the card is what it always was. In the panel it is that card with two
 * differences: a Markdown document is shown rendered, for reading (rendering Markdown runs
 * nothing, so it needs no gesture), and there is no Open button, since it is open.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import { artifactCard, artifactRenderer } from '../card.js';
import { artifactSegment } from '../segment.js';

let teardown: (() => void) | null = null;

function mount(segment: ReturnType<typeof artifactSegment>, surface?: 'reply' | 'panel'): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = surface ? artifactCard.render(segment, { surface }) : (artifactRenderer.render(segment) as string);
    const element = host.firstElementChild as HTMLElement;
    document.body.appendChild(host);
    if (surface) artifactCard.setup(element, segment, { surface });
    else artifactRenderer.setup?.(element, segment);
    return element;
}
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const tab = (element: HTMLElement, name: string) => element.querySelector<HTMLButtonElement>(`[data-tab-target="${name}"]`);

describe('the card as the panel body', () => {
    beforeEach(() => {
        teardown = setupArtifacts({ open: true });
        // A stand-in Markdown provider: enough to tell rendered from source.
        aparteGlobalConfig.setMarkdownProvider((raw) => raw.replace(/^# (.*)$/m, '<h1>$1</h1>'));
    });
    afterEach(() => { teardown?.(); teardown = null; aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    const note = () => artifactSegment('a1', { documentId: 'doc_a1b2c3d4', mimeType: 'text/markdown', title: 'Plan', content: '# Plan' });

    it('in a reply, a Markdown document is its source and nothing else: no Preview tab', () => {
        const element = mount(note());
        expect(tab(element, 'preview')).toBeNull();
        expect(element.getAttribute('data-tab')).toBe('code');
    });

    it('in the panel, a Markdown document opens rendered, with its source one tab away', () => {
        const element = mount(note(), 'panel');
        expect(element.getAttribute('data-tab')).toBe('preview');
        expect(tab(element, 'preview')?.getAttribute('aria-selected')).toBe('true');
        expect(tab(element, 'code')?.getAttribute('aria-selected')).toBe('false');
        // One tab stop in the tablist, on the selected tab.
        expect(tab(element, 'preview')?.tabIndex).toBe(0);
        expect(tab(element, 'code')?.tabIndex).toBe(-1);
        expect(element.querySelector('[data-pane="preview"] h1')?.textContent).toBe('Plan');
        // No frame: nothing was executed to show it.
        expect(element.querySelector('iframe')).toBeNull();

        tab(element, 'code')!.click();
        expect(element.getAttribute('data-tab')).toBe('code');
        expect(element.querySelector('[data-pane="code"] code')?.textContent).toBe('# Plan');
    });

    it('the rendered document goes through the sanitizer like any reply', () => {
        aparteGlobalConfig.setMarkdownProvider(() => '<p>ok</p><img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 2</script>');
        const element = mount(note(), 'panel');
        const pane = element.querySelector('[data-pane="preview"]')!;
        expect(pane.querySelector('script')).toBeNull();
        expect(pane.innerHTML).not.toContain('onerror');
        expect(pane.querySelector('p')?.textContent).toBe('ok');
    });

    it('in the panel there is no Open button: the document is open', () => {
        expect(mount(note()).querySelector('[data-action="open"]')).not.toBeNull();
        document.body.innerHTML = '';
        expect(mount(note(), 'panel').querySelector('[data-action="open"]')).toBeNull();
    });

    it('a page still waits for a press in the panel: opening a document does not run it', () => {
        const page = artifactSegment('a2', { mimeType: 'text/html', title: 'Page', content: '<p>hi</p>' });
        const element = mount(page, 'panel');
        expect(element.getAttribute('data-tab')).toBe('code');
        expect(element.querySelector('iframe')).toBeNull();
        tab(element, 'preview')!.click();
        expect(element.querySelector('iframe')).not.toBeNull();
    });

    it('the prose follows the document while it is written, and can be read meanwhile', async () => {
        const writing = { ...note(), content: '# Pl', isStreaming: true };
        const element = mount(writing, 'panel');
        expect(tab(element, 'preview')?.disabled).toBe(false);
        expect(element.querySelector('[data-pane="preview"] h1')?.textContent).toBe('Pl');

        artifactCard.update(element, { ...writing, content: '# Plan B' });
        await frame();
        expect(element.querySelector('[data-pane="preview"] h1')?.textContent).toBe('Plan B');
    });

    it('a chart or a diagram inside the document is drawn, as it is in a reply', async () => {
        aparteGlobalConfig.setMarkdownProvider(() => '<p>Sales</p><pre><code class="language-mermaid">flowchart TD</code></pre>');
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render: () => '<img class="aparte-diagram" alt="Diagram">' });
        const element = mount(note(), 'panel');
        await frame();
        expect(element.querySelector('[data-pane="preview"] img.aparte-diagram')).not.toBeNull();

        // And again after the document changed.
        artifactCard.update(element, { ...note(), content: '# Plan, revised' });
        await frame();
        await frame();
        expect(element.querySelector('[data-pane="preview"] img.aparte-diagram')).not.toBeNull();
    });

    it('Open says which document and which appearance of it', () => {
        const element = mount(note());
        let detail: { documentId?: string; segmentId?: string } = {};
        element.addEventListener('aparte-artifact-open', (event) => { detail = event.detail; });
        element.querySelector<HTMLButtonElement>('[data-action="open"]')!.click();
        expect(detail.documentId).toBe('doc_a1b2c3d4');
        expect(detail.segmentId).toBe('a1');
    });

    it('a card saved before documents had ids opens as its own document', () => {
        const old = artifactSegment('seg-old', { mimeType: 'text/markdown', content: 'x' });
        const element = mount(old);
        let documentId = '';
        element.addEventListener('aparte-artifact-open', (event) => { documentId = event.detail.documentId; });
        element.querySelector<HTMLButtonElement>('[data-action="open"]')!.click();
        expect(documentId).toBe('seg-old');
    });
});
