// @vitest-environment jsdom
/**
 * A config change reaches the text INSIDE a rendered segment — without rebuilding it.
 *
 * The cheap way to do this would have been to re-render the segments container on
 * every config change. An audit rejected it, and the reasons are the assertions at
 * the bottom of this file: rebuilding destroys state the DOM owns and the segment
 * data does not — a reasoning block the reader expanded by clicking `<summary>`
 * (which never writes back to `collapsed`), scroll position inside a long pane, the
 * focus on an Approve/Reject gate, a mounted sandboxed preview running model-authored
 * code — and it fires container-wide childList mutations, which the viewport reads as
 * "scroll to the bottom".
 *
 * So `relabel(element, segment)` is bound by the same rule as `update()`: attributes
 * and text only, no child node added or removed. These tests assert both halves —
 * that the label changed, and that the element is the same node it was.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';
import type { AparteSegment, AparteToolCallSegment } from '../../types/index.js';

interface BubbleEl extends HTMLElement {
    setSegments(segments: AparteSegment[]): void;
}

function mount(segments: AparteSegment[]): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    el.setSegments(segments);
    return el;
}

/** Only the keys these renderers already read — new ones are a separate change. */
const FR = () => ({
    ...aparteGlobalConfig.getLocale(),
    thinking: 'Réflexion',
    copy: 'Copier',
    run: 'Exécuter',
    running: 'En cours…',
    approveTool: 'Approuver',
    rejectTool: 'Refuser',
    error: 'Erreur',
});

const seg = (s: Partial<AparteSegment> & { id: string; type: string }) => s as AparteSegment;

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('relabel reaches a rendered segment', () => {
    it('the reasoning block’s default label', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', isStreaming: false })]);
        const label = el.querySelector('.thinking-label')!;

        aparteGlobalConfig.setLocale(FR());

        expect(label.textContent).toBe('Réflexion');
    });

    it('but never a label the app set itself', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', label: 'Analysis' })]);

        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.thinking-label')!.textContent).toBe('Analysis');
    });

    it('a code block’s copy button — tooltip and glyph', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x', language: 'ts' })]);
        const btn = el.querySelector('.code-copy')!;

        aparteGlobalConfig.setLocale(FR());
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="1"></svg>' });

        expect(btn.getAttribute('title')).toBe('Copier');
        expect(btn.innerHTML).toContain('data-mine');
    });

    it('the human approval gate — the highest-stakes strings in the library', () => {
        const el = mount([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'tc1', name: 'delete_file', input: {} },
        } as AparteToolCallSegment]);
        const approve = el.querySelector('.tool-approve-btn')!;
        const reject = el.querySelector('.tool-reject-btn')!;

        aparteGlobalConfig.setLocale(FR());

        expect(approve.textContent).toBe('Approuver');
        expect(approve.getAttribute('aria-label')).toBe('Approuver');
        expect(reject.textContent).toBe('Refuser');
    });

    it('an artifact card’s copy button — and nothing else on the card', () => {
        const el = mount([{
            id: 's1', type: 'artifact', isStreaming: false,
            artifactType: 'svg', mimeType: 'image/svg+xml', title: 'A chart',
            content: '<svg/>',
        } as unknown as AparteSegment]);
        const copyBtn = el.querySelector('.aparte-art-card__btn[data-action="copy"]')!;
        const card = el.querySelector('.segment-artifact-card')!;

        aparteGlobalConfig.setLocale(FR());
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="1"></svg>' });

        expect(copyBtn.getAttribute('title')).toBe('Copier');
        expect(copyBtn.innerHTML).toContain('data-mine');

        // The half that matters more than the label: the card must not be disturbed.
        // It opens on the Code tab by design — building the preview frame at render
        // time would execute model-authored code with no gesture — and a relabel that
        // touched the tab state, or rebuilt the pane, would be the re-render this hook
        // exists to avoid.
        expect(card.getAttribute('data-tab')).toBe('code');
        expect(el.querySelector('iframe')).toBeNull();
    });

    it('the artifact card’s download button and its two tabs', () => {
        const el = mount([{
            id: 's1', type: 'artifact', isStreaming: false,
            artifactType: 'svg', mimeType: 'image/svg+xml', title: 'A chart',
            content: '<svg/>',
        } as unknown as AparteSegment]);
        const dl = el.querySelector('.aparte-art-card__btn[data-action="download"]')!;

        aparteGlobalConfig.setLocale({ ...FR(), download: 'Télécharger', preview: 'Aperçu', code: 'Code' });

        // Title AND aria-label. They disagreed before: the copy button next door put
        // `t('copy')` in its title and the literal "Copy" in its aria-label, so a
        // screen reader read English while the tooltip read French.
        expect(dl.getAttribute('title')).toBe('Télécharger');
        expect(dl.getAttribute('aria-label')).toBe('Télécharger');
        expect(el.querySelector('.aparte-art-card__btn[data-action="copy"]')!.getAttribute('aria-label')).toBe('Copier');
        expect(el.querySelector('[data-tab-target="preview"]')!.textContent).toBe('Aperçu');
        expect(el.querySelector('[data-tab-target="code"]')!.textContent).toBe('Code');
        // Which pane is open is the reader's state, not the locale's.
        expect(el.querySelector('.segment-artifact-card')!.getAttribute('data-tab')).toBe('code');
        expect(el.querySelector('[data-tab-target="code"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('a binary artifact’s download button is localized at render', () => {
        // This button is a SECOND renderer's, on the pdf/xlsx/docx path, and it only
        // exists when the app declares it can regenerate the bytes — so nothing in
        // the suite rendered it, and the first attempt at localizing it put an
        // interpolation inside a single-quoted string. That would have shipped the
        // literal text `${escapeHtml(...)}` onto the button, and every test would
        // still have passed. Hence this one.
        aparteGlobalConfig.setHostHandlers({ artifactRedownload: true });
        aparteGlobalConfig.setLocale({ ...FR(), download: 'Télécharger', generating: 'Génération…' });
        const el = mount([{
            id: 's1', type: 'artifact', isStreaming: true,
            artifactType: 'pdf', mimeType: 'application/pdf', title: 'report.pdf', content: '',
        } as unknown as AparteSegment]);

        const btn = el.querySelector('.aparte-art-file__btn[data-action="download"]');
        expect(btn, 'no download button rendered — the host handler was declared').not.toBeNull();
        expect(btn!.textContent).toBe('Télécharger');
        expect(el.innerHTML).not.toContain('${');
        expect(el.querySelector('[data-role="file-sub"]')!.textContent).toBe('Génération…');
    });

    it('the waiting indicator’s accessible name — its only content', () => {
        const el = mount([seg({ id: 's1', type: 'pipeline-waiting' })]);
        const dots = el.querySelector('.segment-pipeline-waiting')!;

        expect(dots.getAttribute('aria-label')).toBe('Generating…');

        aparteGlobalConfig.setLocale({ ...FR(), generating: 'Génération…' });

        // Three CSS dots and a name. A sighted user sees nothing change in any
        // language, which is exactly why this string stayed English through every
        // locale the project shipped.
        expect(dots.getAttribute('aria-label')).toBe('Génération…');
    });

    it('an error card’s icon and heading', () => {
        const el = mount([seg({ id: 's1', type: 'error', content: 'boom' })]);

        aparteGlobalConfig.setIconProvider({ error: () => '<svg data-mine="1"></svg>' });
        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.error-icon-wrapper')!.innerHTML).toContain('data-mine');
        // `locale.error` is a REQUIRED key, documented, and already translated — and
        // was read by nothing at all while this heading hardcoded "Error". A
        // translated string with no consumer and a literal with no translation, in
        // the same card. "Erreur" is what `@aparte/locale-fr` ships for this key —
        // `packages/locales/fr` has carried it since it existed.
        expect(el.querySelector('.error-title')!.textContent).toBe('Erreur');
        // Not the message: that is the model's or the transport's text, in whatever
        // language it arrived in. Relabelling it would be inventing content.
        expect(el.querySelector('.error-message')!.textContent).toBe('boom');
    });
});

describe('relabel does not rebuild', () => {
    it('keeps the very same element, so listeners and focus survive', () => {
        const el = mount([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'tc1', name: 'delete_file', input: {} },
        } as AparteToolCallSegment]);
        const before = el.querySelector('.tool-approve-btn')!;

        aparteGlobalConfig.setLocale(FR());

        // Identity, not equality: a rebuilt button would be a different node, and a
        // keyboard user sitting on this one — the human-in-the-loop gate — would have
        // been dropped to <body> by a change that had nothing to do with them.
        expect(el.querySelector('.tool-approve-btn')).toBe(before);
    });

    it('leaves a reasoning block the reader opened by hand open', () => {
        // `collapsed: true` in the data, then the reader clicks <summary>. Nothing
        // writes that back to the segment, so a re-render would close it again.
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', collapsed: true })]);
        const details = el.querySelector('details') as HTMLDetailsElement;
        details.open = true;

        aparteGlobalConfig.setLocale(FR());

        expect(details.open, 'the reader’s own expand was reverted').toBe(true);
        expect(el.querySelector('.thinking-label')!.textContent).toBe('Réflexion');
    });

    it('does not disturb a code block’s "copied" confirmation', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x' })]);
        const btn = el.querySelector('.code-copy') as HTMLElement;
        btn.dataset.copied = '1';
        btn.setAttribute('title', 'Copied!');

        aparteGlobalConfig.setLocale(FR());

        expect(btn.getAttribute('title')).toBe('Copied!');
    });
});

describe('the strings a language switch used to leave in English', () => {
    it('the attach-file button — a key read for as long as it was never declared', async () => {
        await import('../../components/composer/aparte-composer.js');
        await import('../../components/composer/aparte-composer-add-attachment.js');
        const composer = document.createElement('aparte-composer');
        const btn = document.createElement('aparte-composer-add-attachment');
        composer.appendChild(btn);
        document.body.appendChild(composer);

        const el = btn.querySelector('button')!;
        // `t('actionUpload')` returned '' for every locale, so the `|| 'Attach file'`
        // fallback rendered — and nothing on screen was in the wrong language,
        // because the label is only a title and an aria-label.
        expect(el.getAttribute('aria-label')).toBe('Attach file');

        aparteGlobalConfig.setLocale({ ...FR(), actionUpload: 'Joindre un fichier' });

        expect(el.getAttribute('aria-label')).toBe('Joindre un fichier');
        expect(el.getAttribute('title')).toBe('Joindre un fichier');
    });

    it('the composer placeholder falls back to the locale, and follows it live', async () => {
        await import('../../components/composer/aparte-composer.js');
        await import('../../components/composer/aparte-composer-input.js');
        const composer = document.createElement('aparte-composer');
        const input = document.createElement('aparte-composer-input');
        composer.appendChild(input);
        document.body.appendChild(composer);

        const ed = input.querySelector('[contenteditable]')!;
        expect(ed.getAttribute('data-placeholder') ?? ed.getAttribute('aria-label')).toBe('Type a message...');

        aparteGlobalConfig.setLocale({ ...FR(), inputPlaceholder: 'Écrivez un message...' });

        expect(ed.getAttribute('data-placeholder') ?? ed.getAttribute('aria-label')).toBe('Écrivez un message...');
    });

    it('the artifact preview pane’s one sentence', () => {
        const el = mount([{
            id: 's1', type: 'artifact', isStreaming: false,
            artifactType: 'svg', mimeType: 'image/svg+xml', title: 'A chart', content: '<svg/>',
        } as unknown as AparteSegment]);

        expect(el.querySelector('.aparte-art-card__pending')!.textContent)
            .toBe('Press Preview to run this artifact.');
    });
});

describe('the clock is part of the locale, not of the browser', () => {
    /** 19:32 UTC — a time whose 12- and 24-hour renderings differ. */
    const AFTERNOON = Date.UTC(2026, 7, 24, 19, 32);

    function mountAt(ms: number): HTMLElement {
        const el = document.createElement('aparte-chat-bubble');
        el.setAttribute('message-id', 'm1');
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('timestamp', String(ms));
        document.body.appendChild(el);
        return el;
    }

    it('the rendered time is Intl’s own answer for the declared tag', () => {
        const el = mountAt(AFTERNOON);
        const intl = (tag: string): string =>
            new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(new Date(AFTERNOON));
        const shown = (): string => el.querySelector('.aparte-timestamp')!.textContent ?? '';

        // BOTH directions, each against Intl itself. One tag alone cannot prove
        // anything: the first version of this test asserted "French is 24-hour" and
        // stayed green with the fix reverted, because the runner's own default
        // locale is 24-hour too. Whatever that default is, it cannot match both of
        // these, so one of the two assertions can only pass if the tag reached Intl.
        aparteGlobalConfig.setLocale({ ...FR(), tag: 'en-US' });
        expect(shown()).toBe(intl('en-US'));

        aparteGlobalConfig.setLocale({ ...FR(), tag: 'fr-FR' });
        expect(shown()).toBe(intl('fr-FR'));

        expect(intl('en-US')).not.toBe(intl('fr-FR'));   // the premise, stated
    });

    it('and a locale with no tag still follows the browser — the documented default', () => {
        const el = mountAt(AFTERNOON);
        const before = el.querySelector('.aparte-timestamp')!.textContent;

        // `FR()` spreads the default locale, which declares no tag on purpose: a
        // library must not pin a consumer's formatting just because it shipped.
        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.aparte-timestamp')!.textContent).toBe(before);
    });

    it('switching language re-renders the clock, not just the words', () => {
        const el = mountAt(AFTERNOON);
        aparteGlobalConfig.setLocale({ ...FR(), tag: 'en-US' });
        const us = el.querySelector('.aparte-timestamp')!.textContent ?? '';

        aparteGlobalConfig.setLocale({ ...FR(), tag: 'fr-FR' });

        // Without the re-render in `_onConfigChange` the language would switch
        // around a 12-hour time that stayed put — a bilingual bubble again.
        expect(el.querySelector('.aparte-timestamp')!.textContent).not.toBe(us);
        expect(us).toMatch(/[AP]M/i);
    });
});
