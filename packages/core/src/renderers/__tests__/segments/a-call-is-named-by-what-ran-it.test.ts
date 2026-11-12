/**
 * `setToolLineProvider`: a plugin that knows a call from the inside fills its row.
 *
 * A sub-agent's line is the line of the call that opened it, so everything the app says of
 * that tool (`registerToolDisplay`) still applies — and wins, field by field. What the
 * provider adds is what no display can know: what ran the call, what it is doing right now,
 * how far it got. Asked at every draw, update and relabel, never stored, so its words follow
 * the reader's language.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_LOCALE } from '../../../config/index.js';
import { runWithConfig } from '../../../config/config-context.js';
import { toolNameOf, toolTargetOf } from '../../../utils/tool-line.js';
import type { AparteToolCallSegment, AparteToolLine } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending',
    toolCall: { id: 'c1', name: 'delegate', input: { task: 'find the callers' } },
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = renderer().render(segment);
    const tpl = document.createElement('template');
    if (typeof out === 'string') tpl.innerHTML = out.trim();
    const el = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement;
    document.body.appendChild(el);
    renderer().setup?.(el, segment);
    return el;
}

function updated(el: HTMLElement, segment: AparteToolCallSegment): HTMLElement {
    renderer().update!(el, segment);
    return document.body.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
}

const part = (el: Element, name: string): HTMLElement => el.querySelector<HTMLElement>(`.aparte-tool-${name}`)!;
const shown = (el: Element, name: string): string | null => {
    const node = part(el, name);
    return node.hidden ? null : node.textContent;
};

const explorer = (): AparteToolLine => ({ label: 'Explorer', target: 'Find the callers', activity: 'Reading parser.ts', note: '3 tools · 12 s' });

afterEach(() => {
    aparteGlobalConfig.reset();
    registerDefaultRenderers();
    document.body.innerHTML = '';
});

describe('the provider fills the line', () => {
    it('gives the name, the target, what the call is doing and a note', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        const el = draw(call());
        expect(shown(el, 'name')).toBe('Explorer');
        expect(part(el, 'name').classList.contains('aparte-tool-name--label')).toBe(true);
        expect(shown(el, 'target')).toBe('Find the callers');
        expect(shown(el, 'activity')).toBe('Reading parser.ts');
        expect(shown(el, 'note')).toBe('3 tools · 12 s');
    });

    it('writes each change on update, as plain text', () => {
        let activity = 'Reading parser.ts';
        aparteGlobalConfig.setToolLineProvider(() => ({ activity, note: '<b>1</b> tool' }));
        let el = draw(call());
        activity = 'Searching for <callers>';
        el = updated(el, call());
        expect(shown(el, 'activity')).toBe('Searching for <callers>');
        expect(part(el, 'note').querySelector('b')).toBeNull();
        expect(shown(el, 'note')).toBe('<b>1</b> tool');
    });

    it('shows what the call is doing only while it runs or waits; the note stays', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        let el = draw(call({ status: 'awaiting-approval' }));
        expect(shown(el, 'activity')).toBe('Reading parser.ts');
        el = updated(el, call({ status: 'resolved', result: 'found 3' }));
        expect(shown(el, 'activity')).toBeNull();
        expect(shown(el, 'note')).toBe('3 tools · 12 s');
        expect(draw(call({ id: 's2', status: 'failed' })).querySelector('.aparte-tool-activity')!.hasAttribute('hidden')).toBe(true);
    });

    // Beside the target, in the same ink, the two read as one run-on sentence: the activity is
    // the line's last child, which the stylesheet wraps onto a line of its own under the name.
    it.each([
        ['the plain line', call({ toolCall: { id: 'c1', name: 'delegate', input: {} } }), '.aparte-tool-line'],
        ['the <details> row, inside its summary', call(), '.aparte-tool-summary'],
    ])('puts what the call is doing after the note, outside the label: %s', (_, segment, line) => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        const el = draw(segment);
        const activity = part(el, 'activity');
        expect(activity.parentElement!.matches(line)).toBe(true);
        expect(activity.parentElement!.lastElementChild).toBe(activity);
        expect(activity.previousElementSibling!.classList.contains('aparte-tool-note')).toBe(true);
        expect(activity.closest('.aparte-tool-label')).toBeNull();
    });

    it('marks a target the provider gave as words; an app summary stays the code it is', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        let el = draw(call());
        expect(part(el, 'target').classList.contains('aparte-tool-target--words')).toBe(true);
        aparteGlobalConfig.registerToolSummary('delegate', () => 'src/parse.ts');
        renderer().relabel!(el, call());
        expect(shown(el, 'target')).toBe('src/parse.ts');
        expect(part(el, 'target').classList.contains('aparte-tool-target--words')).toBe(false);
        el = draw(call({ id: 's2' }));
        expect(part(el, 'target').classList.contains('aparte-tool-target--words')).toBe(false);
    });

    it('takes nothing away from a row without a provider: both places are there, and hidden', () => {
        const el = draw(call());
        expect(shown(el, 'name')).toBe('delegate');
        expect(shown(el, 'activity')).toBeNull();
        expect(shown(el, 'note')).toBeNull();
    });

    it('puts its note after the reason a call ended, in one place', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        const el = draw(call({ status: 'aborted', abortCause: 'timeout' }));
        expect(shown(el, 'note')).toBe('Timed out · 3 tools · 12 s');
    });

    it('gives what is behind the line when the display says nothing of it', () => {
        const body = document.createElement('ol');
        body.textContent = 'the child conversation';
        aparteGlobalConfig.setToolLineProvider(() => ({ details: () => body }));
        const el = draw(call({ status: 'resolved', result: 'ok' }));
        expect(el.querySelector('.aparte-tool-detail[data-details="app"]')!.firstElementChild).toBe(body);

        aparteGlobalConfig.setToolLineProvider(() => ({ details: false }));
        const bare = draw(call({ id: 's2', status: 'resolved', result: 'ok' }));
        expect(bare.querySelector('.aparte-tool-detail')).toBeNull();
    });
});

describe("the app's display wins, field by field", () => {
    it('a label and a summary of its own are kept; the provider fills only what they leave', () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { label: 'Delegated', summary: () => 'its own target' });
        aparteGlobalConfig.setToolLineProvider(explorer);
        const el = draw(call());
        expect(shown(el, 'name')).toBe('Delegated');
        expect(shown(el, 'target')).toBe('its own target');
        expect(shown(el, 'activity')).toBe('Reading parser.ts');
        expect(shown(el, 'note')).toBe('3 tools · 12 s');
    });

    it("a label that says nothing hands the name to the provider, not to the identifier", () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { label: () => '  ', summary: () => '' });
        aparteGlobalConfig.setToolLineProvider(explorer);
        const el = draw(call());
        expect(shown(el, 'name')).toBe('Explorer');
        expect(shown(el, 'target')).toBe('Find the callers');
    });

    it('a display that says `details` says it, whatever the provider gives', () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { details: false });
        aparteGlobalConfig.setToolLineProvider(() => ({ details: () => 'the transcript' }));
        expect(draw(call({ status: 'resolved', result: 'ok' })).querySelector('.aparte-tool-detail')).toBeNull();
    });

    it('a display with no `details` key leaves it to the provider', () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { label: 'Delegated' });
        aparteGlobalConfig.setToolLineProvider(() => ({ details: false }));
        expect(draw(call({ status: 'resolved', result: 'ok' })).querySelector('.aparte-tool-detail')).toBeNull();
    });

    it('the approval question and the row read the same name', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        expect(toolNameOf(call(), aparteGlobalConfig)).toEqual({ text: 'Explorer', isLabel: true });
        expect(toolTargetOf(call(), aparteGlobalConfig)).toBe('Find the callers');
    });
});

describe('the provider is asked again on a language switch', () => {
    it('writes its words in the new language into the nodes already there', () => {
        aparteGlobalConfig.setToolLineProvider(() => aparteGlobalConfig.getLocale().tag === 'fr'
            ? { label: 'Explorateur', activity: 'Lit parser.ts', note: '3 outils · 12 s' }
            : { label: 'Explorer', activity: 'Reading parser.ts', note: '3 tools · 12 s' });
        const el = draw(call());
        const places = ['name', 'activity', 'note'].map((name) => part(el, name));
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, tag: 'fr' });
        renderer().relabel!(el, call());
        expect(shown(el, 'name')).toBe('Explorateur');
        expect(shown(el, 'activity')).toBe('Lit parser.ts');
        expect(shown(el, 'note')).toBe('3 outils · 12 s');
        // Written into the nodes already there: relabel adds and removes none.
        expect(['name', 'activity', 'note'].map((name) => part(el, name))).toEqual(places);
        expect(places.every((node) => el.contains(node))).toBe(true);
    });

    it('can bring an activity in on a relabel, the row having drawn none', () => {
        const said: { line?: AparteToolLine } = {};
        aparteGlobalConfig.setToolLineProvider(() => said.line);
        const el = draw(call());
        expect(shown(el, 'activity')).toBeNull();
        said.line = { activity: 'Lit parser.ts' };
        renderer().relabel!(el, call());
        expect(shown(el, 'activity')).toBe('Lit parser.ts');
    });
});

describe('one provider per config, and the page\'s for a chat that has none', () => {
    it('a chat with a config of its own reads the global provider', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        const own = new AparteConfig();
        const el = runWithConfig(own, () => draw(call()));
        expect(shown(el, 'name')).toBe('Explorer');
        expect(toolNameOf(call(), own).text).toBe('Explorer');
    });

    it("its own provider, when it has one, is the one it reads", () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        const own = new AparteConfig();
        own.setToolLineProvider(() => ({ label: 'Its own' }));
        expect(runWithConfig(own, () => shown(draw(call()), 'name'))).toBe('Its own');
    });

    it('`null` removes it, and so does reset()', () => {
        aparteGlobalConfig.setToolLineProvider(explorer);
        aparteGlobalConfig.setToolLineProvider(null);
        expect(shown(draw(call()), 'name')).toBe('delegate');
        aparteGlobalConfig.setToolLineProvider(explorer);
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        expect(aparteGlobalConfig.getToolLineProvider()).toBeNull();
    });

    it('setting one tells the chats, which draw their rows again', () => {
        const heard = vi.fn();
        const stop = aparteGlobalConfig.subscribe(heard);
        aparteGlobalConfig.setToolLineProvider(explorer);
        stop();
        expect(heard).toHaveBeenCalledTimes(1);
    });
});

describe('a provider that throws', () => {
    it('leaves the default line, and is reported once', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        aparteGlobalConfig.setToolLineProvider(() => { throw new Error('boom'); });
        let el = draw(call());
        el = updated(el, call({ status: 'resolved', result: 'ok' }));
        expect(shown(el, 'name')).toBe('delegate');
        expect(shown(el, 'activity')).toBeNull();
        expect(shown(el, 'note')).toBeNull();
        expect(error).toHaveBeenCalledTimes(1);
        error.mockRestore();
    });

    it('a provider that returns nothing leaves the default line', () => {
        aparteGlobalConfig.setToolLineProvider(() => undefined);
        expect(shown(draw(call()), 'name')).toBe('delegate');
    });
});
