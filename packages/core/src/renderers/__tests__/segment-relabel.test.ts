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
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
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
    approvalWaiting: 'en attente de vous',
    error: 'Erreur',
    // The four settled-state words. They are the ones `relabel` used to delete.
    toolRunning: 'En cours',
    toolCompleted: 'Terminé',
    toolRejected: 'Refusé',
    toolStopped: 'Arrêté',
});

const seg = (s: Partial<AparteSegment> & { id: string; type: string }) => s as AparteSegment;

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('relabel reaches a rendered segment', () => {
    it('the reasoning block’s default label', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', isStreaming: false })]);
        const label = el.querySelector('.aparte-thinking-label')!;

        aparteGlobalConfig.setLocale(FR());

        expect(label.textContent).toBe('Réflexion');
    });

    it('but never a label the app set itself', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', label: 'Analysis' })]);

        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.aparte-thinking-label')!.textContent).toBe('Analysis');
    });

    it('a code block’s copy button — tooltip and glyph', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x', language: 'ts' })]);
        const btn = el.querySelector('.aparte-code-copy')!;

        aparteGlobalConfig.setLocale(FR());
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="1"></svg>' });

        expect(btn.getAttribute('title')).toBe('Copier');
        expect(btn.innerHTML).toContain('data-mine');
    });

    it('a tool waiting for a person — a label that outlasts a language switch', () => {
        // This used to assert the Approve / Reject labels. Those live on the composer's
        // panel now, which relabels itself; what is left in the transcript is the pill
        // saying WHY nothing is happening. Still worth pinning: the request it describes
        // stays open for as long as somebody takes to decide, which is exactly long
        // enough for a locale switch to land on it.
        const el = mount([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'tc1', name: 'delete_file', input: {} },
        } as AparteToolCallSegment]);
        expect(el.querySelector('.tool-approve-btn'), 'no decision control in the transcript').toBeNull();
        const waiting = el.querySelector('.aparte-tool-state')!;
        expect(waiting.textContent).toBe('Waiting');

        aparteGlobalConfig.setLocale(FR());

        expect(waiting.textContent).toBe('en attente de vous');
    });

    /*
     * The four statuses this suite did NOT cover, which is why the word disappeared.
     *
     * `awaiting-approval` above was the one status `relabel` handled: it rebuilt the badge
     * as the ICON ALONE and then re-wrote that single case via `textContent`. So a settled
     * tool call lost its localized word on any config change — `setLocale`,
     * `setIconProvider`, `registerTool`, `reset()`, anything calling `_notify()` — and a
     * settled call gets no further `update()`, so it never came back. "✓ Done" became "✓",
     * and pending's "Running" became empty.
     *
     * Worst is `rejected`: a bare cross beside a tool's name, which the badge's own
     * docblock says the word exists to prevent because it reads as a button that removes
     * the call.
     */
    it.each([
        ['resolved', 'Done', 'Terminé'],
        ['pending', 'Running', 'En cours'],
        ['rejected', 'Rejected', 'Refusé'],
        ['aborted', 'Stopped', 'Arrêté'],
    ] as const)('a %s tool call keeps its word through a language switch', (status, en, fr) => {
        const el = mount([{
            id: 's1', type: 'tool_call', status,
            toolCall: { id: 'tc1', name: 'read_file', input: {} },
        } as AparteToolCallSegment]);
        const badge = el.querySelector('.aparte-tool-state')!;
        expect(badge.textContent, `the English word for ${status}`).toContain(en);

        aparteGlobalConfig.setLocale(FR());

        expect(badge.textContent, `${status} must be relabelled, not emptied`).toContain(fr);
    });

    it('an error card’s icon and heading', () => {
        const el = mount([seg({ id: 's1', type: 'error', content: 'boom' })]);

        aparteGlobalConfig.setIconProvider({ error: () => '<svg data-mine="1"></svg>' });
        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.aparte-alert__icon')!.innerHTML).toContain('data-mine');
        // `locale.error` is a REQUIRED key, documented, and already translated — and
        // was read by nothing at all while this heading hardcoded "Error". A
        // translated string with no consumer and a literal with no translation, in
        // the same card. "Erreur" is what `@aparte/locale-fr` ships for this key —
        // `packages/locales/fr` has carried it since it existed.
        expect(el.querySelector('.aparte-alert__title')!.textContent).toBe('Erreur');
        // Not the message: that is the model's or the transport's text, in whatever
        // language it arrived in. Relabelling it would be inventing content.
        expect(el.querySelector('.aparte-alert__message')!.textContent).toBe('boom');
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
        expect(el.querySelector('.aparte-thinking-label')!.textContent).toBe('Réflexion');
    });

    it('does not disturb a code block’s "copied" confirmation', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x' })]);
        const btn = el.querySelector('.aparte-code-copy') as HTMLElement;
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

describe('a reasoning block folds itself away when it settles', () => {
    /**
     * The lifecycle every product shows and this library never had a test for: the
     * block arrives OPEN while it is being written, then settles and closes.
     *
     * `render` was covered — `<details open>` when not collapsed — and the UPDATE path
     * was not, which is the half a consumer building "Thought for 8 s" depends on, and
     * the half the landing's segments demo now leans on.
     */
    it('an explicit collapse on an update closes it', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', isStreaming: true, collapsed: false })]);
        const details = el.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(true);

        el.updateSegment('s1', { isStreaming: false, collapsed: true });

        expect(details.open).toBe(false);
        // Closed, not rebuilt: the same node, so a listener or a scroll position on it
        // survives — the rule every update in this file works under.
        expect(el.querySelector('details')).toBe(details);
    });

    it('and an update that says nothing about it leaves the reader alone', () => {
        // The reader CLOSED a block whose data says open. That direction is the one
        // that discriminates: `'collapsed' in updates` false with the guard removed
        // takes the else branch and FORCES the block open, so a reasoning block would
        // spring back open under someone who had just folded it away, on every chunk.
        // My first version of this test opened a block whose data said closed, which
        // the broken code also leaves open — it passed against the sabotage, and a
        // test that cannot fail is not a test.
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', collapsed: false })]);
        const details = el.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(true);
        details.open = false;   // the reader clicked <summary>; nothing writes that back

        el.updateSegment('s1', { content: 'why, at greater length' });

        expect(details.open).toBe(false);
        expect(el.querySelector('.aparte-thinking-content')!.textContent).toContain('at greater length');
    });
});
