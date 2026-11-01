import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getSegmentRenderer, AparteConfig, runWithConfig } from '@aparte/core';
import { setupArtifacts } from '../index.js';

/**
 * A preview the person opened survives the card being drawn again.
 *
 * A framework redraws a message's segments when its conversation is saved: the React example
 * replaced the artifact card after a follow-up message, and the new card opened on Code —
 * the preview the person had just asked for was gone. Caught by the browser suite, where the
 * save after the first reply sometimes landed right after the Preview click.
 *
 * What may open again is only what a gesture already ran: the same artifact (id and content),
 * in the same chat, in this page. A reload, another document under the same id, another chat:
 * Code, as the gesture rule wants.
 */
const PAGE = { id: 'a1', type: 'artifact', mimeType: 'text/html', artifactType: 'html', title: 'Page', isStreaming: false, content: '<h1>hi</h1>' };

let cfg: AparteConfig;
beforeEach(() => {
    cfg = new AparteConfig();
    setupArtifacts({}, cfg);
});
afterEach(() => { document.body.innerHTML = ''; });

function draw(segment: unknown, config = cfg): HTMLElement {
    const renderer = getSegmentRenderer('artifact', config)!;
    const host = document.createElement('div');
    host.innerHTML = runWithConfig(config, () => renderer.render(segment as never)) as string;
    document.body.appendChild(host);
    const card = host.firstElementChild as HTMLElement;
    runWithConfig(config, () => renderer.setup?.(card, segment as never));
    return card;
}

const preview = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!;

describe('a preview and a redraw', () => {
    it('opens again on Preview, with its frame, when the same artifact is drawn again', () => {
        preview(draw(PAGE)).click();
        const again = draw({ ...PAGE });
        expect(again.getAttribute('data-tab')).toBe('preview');
        expect(again.querySelector('iframe')).not.toBeNull();
        expect(preview(again).getAttribute('aria-selected')).toBe('true');
    });

    it('opens on Code when the person went back to Code before the redraw', () => {
        const card = draw(PAGE);
        preview(card).click();
        card.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!.click();
        const again = draw({ ...PAGE });
        expect(again.getAttribute('data-tab')).toBe('code');
        expect(again.querySelector('iframe')).toBeNull();
    });

    it('runs nothing nobody previewed: another document under the same id opens on Code', () => {
        preview(draw(PAGE)).click();
        const other = draw({ ...PAGE, content: '<h1>something else</h1><script>parent.__ran = true</script>' });
        expect(other.getAttribute('data-tab')).toBe('code');
        expect(other.querySelector('iframe')).toBeNull();
    });

    it('opens on Code in another chat, and while the artifact still streams', () => {
        preview(draw(PAGE)).click();
        const elsewhere = new AparteConfig();
        setupArtifacts({}, elsewhere);
        expect(draw({ ...PAGE }, elsewhere).getAttribute('data-tab')).toBe('code');
        expect(draw({ ...PAGE, isStreaming: true }).getAttribute('data-tab')).toBe('code');
    });
});
