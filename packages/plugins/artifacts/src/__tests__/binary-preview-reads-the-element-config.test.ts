/**
 * The binary card's preview pane answers to the chat it is IN.
 *
 * `binary-file.ts` resolves per-element everywhere — `settle()` and `showError()`
 * both call `contextConfig(element)` — except at the one sink that puts app-supplied
 * HTML on the page: `previewMarkup` read the AMBIENT config, which by then is the
 * global one, because it runs from a promise callback long after the render.
 *
 * So a chat with its own `AparteConfig` that registered DOMPurify through
 * `setHtmlSanitizer` had that policy silently skipped at this sink, and its locale
 * skipped at the sentence next to it. It failed safe (the global default is core's
 * own allowlist), which is exactly why nothing showed it.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig, attachConfig, getSegmentRenderer, runWithConfig } from '@aparte/core';
import { setupArtifacts } from '../index.js';
import { resetBinaryArtifacts } from '../binary-file.js';

let teardown: (() => void) | null = null;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const PREVIEW_HTML = '<table><tr><td>cell</td></tr></table>';

/** A chat of its own: an instance config on a boundary element, as a wrapper mounts one. */
function mountUnder(config: AparteConfig, id: string): HTMLElement {
    const host = document.createElement('div');
    document.body.appendChild(host);
    attachConfig(host, config);
    const segment = { id, type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf', content: 'code', isStreaming: false };
    const renderer = getSegmentRenderer('artifact')!;
    // The bubble renders with the instance config ambient, then hands over the element.
    host.innerHTML = runWithConfig(config, () => renderer.render(segment as never)) as string;
    const el = host.firstElementChild as HTMLElement;
    runWithConfig(config, () => renderer.setup?.(el, segment as never));
    return el;
}

beforeEach(() => {
    resetBinaryArtifacts();
    aparteGlobalConfig.setHtmlSanitizer((html) => html.replace('<table>', '<table data-sanitiser="global">'));
});

afterEach(() => {
    teardown?.(); teardown = null;
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the binary artifact’s preview pane', () => {
    it('is sanitised by the config of the chat it is mounted in', async () => {
        teardown = setupArtifacts({
            onBinary: async () => ({ buffer: '%PDF', mime: 'application/pdf', filename: 'r.pdf', previewHtml: PREVIEW_HTML }),
        });
        const cfg = new AparteConfig();
        cfg.setHtmlSanitizer((html) => html.replace('<table>', '<table data-sanitiser="instance">'));

        const el = mountUnder(cfg, 'p1');
        await flush();

        const pane = el.querySelector('[data-role="preview-pane"]')!;
        expect(pane.innerHTML).toContain('data-sanitiser="instance"');
        expect(pane.innerHTML).not.toContain('data-sanitiser="global"');
    });

    it('says "no preview yet" in that chat’s language too', async () => {
        teardown = setupArtifacts({
            onBinary: async () => ({ buffer: '%PDF', mime: 'application/pdf', filename: 'r.pdf' }),
        });
        const cfg = new AparteConfig();
        cfg.setLocale({ previewPending: 'Aperçu indisponible' } as never);

        const el = mountUnder(cfg, 'p2');
        await flush();

        expect(el.querySelector('[data-role="preview-pane"]')!.textContent).toContain('Aperçu indisponible');
    });

    it('applies the same config when a re-mount replays a file already produced', async () => {
        teardown = setupArtifacts({
            onBinary: async () => ({ buffer: '%PDF', mime: 'application/pdf', filename: 'r.pdf', previewHtml: PREVIEW_HTML }),
        });
        const cfg = new AparteConfig();
        cfg.setHtmlSanitizer((html) => html.replace('<table>', '<table data-sanitiser="instance">'));

        mountUnder(cfg, 'p3');
        await flush();
        // A branch switch back: the card renders from the remembered bytes, in one pass.
        const again = mountUnder(cfg, 'p3');

        expect(again.querySelector('[data-role="preview-pane"]')!.innerHTML).toContain('data-sanitiser="instance"');
    });
});
