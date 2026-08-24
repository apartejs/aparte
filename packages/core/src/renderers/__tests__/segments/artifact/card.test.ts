/**
 * The artifact card: its tabs, the code view, and the gesture the preview
 * now requires.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../../config/aparte-config.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

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

describe('default renderer: artifact', () => {
    afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    it('is registered', () => {
        expect(getSegmentRenderer('artifact')).toBeDefined();
    });

    it('pressing Download saves the artifact under a slug of its title', () => {
        // The button had just been given a locale key while nothing tested what
        // pressing it DOES — so the download path, the extension table and the
        // filename slug were all unexercised. jsdom has no object URLs, and an
        // anchor's click cannot be observed after the handler removes it, so both
        // are intercepted rather than mocked away.
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
        // The other side of every fallback on that path, and none of them is
        // hypothetical: a model can title an artifact `***`, and an unknown kind is
        // whatever a provider invents next. A slug of "***" is empty, so the name
        // has to come from somewhere; an unlisted kind has no extension; and a
        // segment with no mimeType still needs a Blob type.
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
        // No preview built while still streaming — and none afterwards either,
        // until the user presses Preview.
        expect(html).toContain('Press Preview to run this artifact.');
    });

    // BREAKING (0.8.0): a settled previewable artifact used to open on Preview
    // with the frame already mounted, so every render of a completed artifact
    // ran the model's code — including reloading a persisted conversation. The
    // frame is now created only by a press on the Preview tab; see
    // artifact-preview-gesture.test.ts for the gesture path.
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

    it('stops pulsing when the stream stops', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const streaming = {
            id: 'a9', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>half', isStreaming: true,
        };
        const el = mountCard(streaming);

        // The discriminating direction first: an indicator that never rendered would
        // make the assertion below pass for the wrong reason.
        expect(el.querySelector('.aparte-art-card__pulse')).not.toBeNull();
        expect(el.getAttribute('data-streaming')).toBe('true');

        // Two arguments, not three: the renderer reads the PREVIOUS segment from a
        // WeakMap keyed by the element, which `mountCard`'s `setup` call populated.
        renderer.update!(el, { ...streaming, content: '<p>whole</p>', isStreaming: false } as never);

        // `render()` painted the pulse and nothing ever removed it, so a finished
        // document went on claiming to be in flight — every 1.2s, forever. It went
        // unnoticed because no demo in this repo streamed an artifact.
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

    it('uses the app-registered preview builder when the user opens the preview', () => {
        aparteGlobalConfig.setArtifactPreviewBuilder((kind, body, title) => `<!--CUSTOM ${kind} ${title}-->${body}`);
        const renderer = getSegmentRenderer('artifact')!;
        const segment = {
            id: 'a6', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>x</p>', title: 'Doc', isStreaming: false,
        } as any;
        const host = document.createElement('div');
        host.innerHTML = renderer.render(segment) as string;
        const card = host.firstElementChild as HTMLElement;
        renderer.setup?.(card, segment);

        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();
        expect(card.querySelector('iframe')!.getAttribute('srcdoc')).toContain('CUSTOM html Doc');
    });

    // A binary artifact can only be re-generated by the app (via
    // `aparte-artifact-redownload`); a text one core writes out itself. So the
    // button is unconditional for text and declared-only for binary.
    it('keeps the download button for a text artifact with nothing declared', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'a-dl-text', type: 'artifact', mimeType: 'text/x-python', artifactType: 'python',
            content: 'print(1)', isStreaming: false,
        } as any);
        expect(html).toContain('data-action="download"');
    });

    it('hides the download button on a binary artifact until artifactRedownload is declared', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const segment = {
            id: 'a-dl-bin', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
            content: 'x', isStreaming: false,
        } as any;
        expect(renderer.render(segment)).not.toContain('data-action="download"');

        aparteGlobalConfig.setHostHandlers({ artifactRedownload: true });
        expect(renderer.render(segment)).toContain('data-action="download"');
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

    // ─ binary file kinds (pdf/xlsx/docx) — separate UX track ─

    it('renders a streaming binary-file card (disabled download, "Generating…")', () => {
        // The download button on a binary artifact belongs to the app, so this
        // card only carries one where the app said it can re-generate the file.
        aparteGlobalConfig.setHostHandlers({ artifactRedownload: true });
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'b1', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
            content: 'sandbox code', isStreaming: true,
        } as any);
        expect(html).toContain('segment-artifact-file');
        expect(html).toContain('data-state="streaming"');
        expect(html).toContain('Generating…');
        expect(html).toContain('data-action="download" disabled');
    });

    it('renders a settled (not-yet-cached) binary-file card as "compiling"', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'b2', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
            content: 'sandbox code', isStreaming: false,
        } as any);
        expect(html).toContain('data-state="compiling"');
        expect(html).toContain('Rebuilding preview…');
    });

    it('escapes a hostile title in a binary-file card', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const html = renderer.render({
            id: 'b3', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
            content: 'x', title: '<img src=x onerror=alert(1)>', isStreaming: true,
        } as any);
        expect(html).not.toContain('<img src=x onerror=');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('setup() wires the tab-switch buttons to flip data-tab and aria-selected', () => {
        const renderer = getSegmentRenderer('artifact')!;
        const seg = {
            id: 'a8', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<p>hi</p>', isStreaming: false,
        };
        const host = document.createElement('div');
        host.innerHTML = renderer.render(seg as any) as string;
        const el = host.firstElementChild as HTMLElement;
        renderer.setup!(el, seg as any);

        const codeTabBtn = el.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!;
        codeTabBtn.click();
        expect(el.getAttribute('data-tab')).toBe('code');
        expect(codeTabBtn.getAttribute('aria-selected')).toBe('true');
    });
});
