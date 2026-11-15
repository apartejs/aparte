/**
 * The generator writes, for each element of a plugin, an `AparteElementSpec`: the description a
 * framework wrapper turns into a React component, a Vue `GlobalComponents` entry or a Svelte
 * `SvelteHTMLElements` entry. A wrapper depends on no plugin, so this is the one door every
 * plugin's element goes through — ours and a third party's alike.
 *
 * What it has to get right is WHERE each type comes from: a plugin names its own types (from its
 * barrel), core's (from `@aparte/core`) and its attribute interfaces (from the registry generated
 * beside it). One `from` for all of them, which the other renderers used, would write a file no
 * consumer could compile.
 */
import { describe, it, expect } from 'vitest';
import { elementSpecs, readNativeEventNames, renderElementSpecs, specName, typeImports } from '../gen-element-bindings.mjs';

const NATIVE = readNativeEventNames();

const field = (name: string, text: string, description = '') => ({ kind: 'field', name, type: { text }, description });
const event = (name: string, text: string, description = '') => ({ name, type: { text }, description });

const MODE = {
    customElement: true,
    tagName: 'aparte-approval-mode',
    name: 'AparteApprovalMode',
    description: 'A select over the four approval modes.',
    attributes: [{ name: 'compact', type: { text: 'boolean' } }],
    members: [field('labels', 'Partial<Record<ApprovalMode, string>>', 'The label of each mode.')],
    events: [event('aparte-approval-mode-change', 'CustomEvent<AparteApprovalModeChangeEventDetail>', 'After a switch.'), event('aparte-approval-mode-close', 'CustomEvent')],
};

const SOURCES = [
    { from: '../index.js', exported: new Set(['ApprovalMode']) },
    { from: '@aparte/core', exported: new Set(['AparteApprovalModeChangeEventDetail']) },
    { from: './element-attributes.js', exported: new Set(['AparteApprovalModeAttributes']) },
];

describe('the element specs', () => {
    it('are named after the tag, without its prefix', () => {
        expect(specName('aparte-approval-mode')).toBe('approvalModeElement');
        expect(specName('aparte-diff')).toBe('diffElement');
    });

    it('import each type from the first source that exports it, and say which none does', () => {
        const { lines, missing } = typeImports(['AparteApprovalModeChangeEventDetail', 'ApprovalMode', 'Nowhere'], SOURCES);
        expect(lines).toEqual([
            "import type {\n    ApprovalMode,\n} from '../index.js';\n",
            "import type {\n    AparteApprovalModeChangeEventDetail,\n} from '@aparte/core';\n",
        ]);
        expect(missing).toEqual(['Nowhere']);
    });

    it('describe the element: its attributes, its properties, its events and the name each binds under', () => {
        const [spec] = elementSpecs([MODE], {}, { native: NATIVE, sources: SOURCES });
        expect(spec).toMatchObject({
            tag: 'aparte-approval-mode',
            name: 'approvalModeElement',
            attributes: ['compact'],
            initial: [],
            properties: [{ name: 'labels', type: 'Partial<Record<ApprovalMode, string>>' }],
            events: [
                { type: 'aparte-approval-mode-change', name: 'approvalModeChange', detail: 'AparteApprovalModeChangeEventDetail' },
                { type: 'aparte-approval-mode-close', name: 'approvalModeClose', detail: null },
            ],
        });
        const file = renderElementSpecs([spec], { sources: SOURCES, registry: './element-attributes.js' });
        expect(file).toContain("import type { AparteElementAttributes } from './element-attributes.js';");
        expect(file).toContain("} from '../index.js';");
        expect(file).toContain("} from '@aparte/core';");
        expect(file).toContain('export const approvalModeElement: AparteElementSpec<');
        expect(file).toContain("    AparteElementAttributes['aparte-approval-mode'],");
        expect(file).toContain("'aparte-approval-mode-change': { name: 'approvalModeChange'; detail: AparteApprovalModeChangeEventDetail };");
        expect(file).toContain("'aparte-approval-mode-close': { name: 'approvalModeClose'; detail: null };");
        expect(file).toContain("        ['aparte-approval-mode-change', 'approvalModeChange'],");
    });

    it('refuse a type no source exports, and a binding a DOM event already has', () => {
        const unexported = { ...MODE, members: [field('labels', 'Secret')] };
        expect(() => elementSpecs([unexported], {}, { native: NATIVE, sources: SOURCES })).toThrow(/`Secret`/);
        const native = { ...MODE, events: [event('aparte-click', 'CustomEvent')] };
        expect(() => elementSpecs([native], { bindingRenames: { 'aparte-approval-mode': { 'aparte-click': 'click' } } }, { native: NATIVE, sources: SOURCES })).toThrow(/click/);
    });
});
