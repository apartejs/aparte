/**
 * The tool row tells the PERSON why a call ended, in their language.
 *
 * Its Output used to be `result` — the sentence written for the model ("The user rejected
 * this tool call and said: …"), in English, about the reader in the third person. The
 * segment now says who refused and why a call stopped, and the row says it: a one-line
 * note after the state word, and the policy's own reason under "Reason". A segment saved
 * before that (no `refusal`) keeps the old Output.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

function seg(over: Partial<AparteToolCallSegment>): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', messageId: 'm1', index: 0,
        toolCall: { id: 'c1', name: 'write_file', input: { path: 'a.txt' } },
        status: 'pending',
        ...over,
    } as AparteToolCallSegment;
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    return el;
}

const note = (el: Element) => el.querySelector<HTMLElement>('.aparte-tool-note');
const part = (el: Element, name: string) => el.querySelector<HTMLElement>(`[data-part="${name}"]`);
const MODEL_SENTENCE = 'The user rejected this tool call and said: use the staging bucket';

afterEach(() => {
    aparteGlobalConfig.resetLocale();
    document.body.innerHTML = '';
});

describe('a refused call says who refused', () => {
    it('the person, with their words: quoted to them, and the model\'s sentence kept off the row', () => {
        const el = draw(seg({ status: 'rejected', result: MODEL_SENTENCE, refusal: { by: 'person', instruction: 'use the staging bucket' } }));
        expect(note(el)?.textContent).toBe('You said: “use the staging bucket”');
        expect(note(el)?.hidden).toBe(false);
        expect(part(el, 'output')).toBeNull();
        expect(el.textContent).not.toContain('The user rejected');
    });

    it('the person, without a word: the state says it all', () => {
        const el = draw(seg({ status: 'rejected', result: 'Tool execution was rejected by the user.', refusal: { by: 'person' } }));
        expect(note(el)?.hidden).toBe(true);
        expect(part(el, 'output')).toBeNull();
    });

    it('a policy: "Refused by policy", and its reason under Reason', () => {
        const el = draw(seg({ status: 'rejected', result: 'Plan mode: write_file changes files.', refusal: { by: 'policy' } }));
        expect(note(el)?.textContent).toBe('Refused by policy');
        expect(part(el, 'output')?.querySelector('.aparte-tool-part-label')?.textContent).toBe('Reason');
        expect(part(el, 'output')?.querySelector('code')?.textContent).toBe('Plan mode: write_file changes files.');
    });

    it('the loop, after an earlier refusal', () => {
        const el = draw(seg({ status: 'rejected', result: 'Not run: an earlier call of the same step was refused.', refusal: { by: 'earlier-refusal' } }));
        expect(note(el)?.textContent).toBe('Not run: an earlier call was refused');
        expect(part(el, 'output')).toBeNull();
    });

    it('a call saved before the row knew: Output, as it always read', () => {
        const el = draw(seg({ status: 'rejected', result: 'Tool execution was rejected by the user.' }));
        expect(note(el)?.hidden).toBe(true);
        expect(part(el, 'output')?.querySelector('code')?.textContent).toBe('Tool execution was rejected by the user.');
    });
});

describe('a stopped call says why', () => {
    const cases: Array<[NonNullable<AparteToolCallSegment['abortCause']>, string]> = [
        ['timeout', 'Timed out'],
        ['no-handler', 'Not available here'],
        ['no-resolver', 'No one could approve it'],
        ['turn-limit', 'Turn limit reached'],
    ];
    for (const [cause, text] of cases) {
        it(`${cause} → "${text}"`, () => {
            expect(note(draw(seg({ status: 'aborted', abortCause: cause })))?.textContent).toBe(text);
        });
    }

    it('a Stop needs no note: "Stopped" is the whole story', () => {
        expect(note(draw(seg({ status: 'aborted', abortCause: 'stopped' })))?.hidden).toBe(true);
    });

    it('a crash keeps its Output — the handler\'s own line', () => {
        const el = draw(seg({ status: 'failed', result: 'ENOENT: no such file' }));
        expect(note(el)?.hidden).toBe(true);
        expect(part(el, 'output')?.querySelector('code')?.textContent).toBe('ENOENT: no such file');
    });
});

describe('the note follows the row', () => {
    it('appears when the call is refused in place, without a rebuild', () => {
        const el = draw(seg({ status: 'pending' }));
        renderer().update!(el, seg({ status: 'rejected', result: MODEL_SENTENCE, refusal: { by: 'person', instruction: 'use the staging bucket' } }));
        expect(el.isConnected, 'patched, not replaced').toBe(true);
        expect(note(el)?.textContent).toBe('You said: “use the staging bucket”');
        expect(part(el, 'output')).toBeNull();
    });

    it('and a language switch reaches it, and the part labels', () => {
        const refused = seg({ status: 'rejected', result: 'Plan mode.', refusal: { by: 'policy' } });
        const el = draw(refused);
        aparteGlobalConfig.extendLocale({ toolRefusedByPolicy: 'Refusé par une règle', toolReason: 'Raison', toolInput: 'Entrée' });
        renderer().relabel!(el, refused);
        expect(note(el)?.textContent).toBe('Refusé par une règle');
        expect(part(el, 'output')?.querySelector('.aparte-tool-part-label')?.textContent).toBe('Raison');
        expect(part(el, 'input')?.querySelector('.aparte-tool-part-label')?.textContent).toBe('Entrée');
    });
});
