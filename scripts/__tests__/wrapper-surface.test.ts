/**
 * The callback-parity guard must prove a DISPATCH, not a declaration.
 *
 * `CALLBACK_PROOFS` is what makes decision #4's parity claim mechanical instead of
 * prose. But two of its four proofs only looked at the declaration:
 *
 *   vue      `\bmessageSent\s*:`        — the key in `defineEmits<{…}>`
 *   angular  `\bmessageSent\s*=\s*output<` — the field initialiser
 *
 * Declaring an emit and never firing it is exactly the failure this guard exists to
 * catch, and it is the silent one: a Vue `defineEmits` entry nothing emits, or an
 * Angular `output()` nothing calls, renders no error anywhere — the consumer's
 * `@message-sent` handler simply never runs. Svelte's proof (`dispatch('name'`) was
 * already the right shape, which is why the sabotage below separates the three.
 *
 * The sabotage is the test. Remove one callback's dispatch line and ask the proof
 * whether the wrapper still honours it; a proof worth having must say no. Before the
 * fix, 12 of these 18 rows said yes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    CALLBACK_PROOFS,
    DATA_PROP_PROOFS,
    DATA_PROP_ALIASES,
    SOURCES,
    readWrapperCallbacks,
    readWrapperDataProps,
} from '../wrapper-surface.mjs';

const CALLBACKS = readWrapperCallbacks();

/**
 * How each wrapper FIRES a callback — the line the sabotage removes.
 *
 * Written here independently of the proofs under test, so a shared mistake cannot
 * satisfy both sides. React is absent on purpose: its proof is `() => true` because
 * the props interface IS the source the whole module reads, and a prop cannot be
 * missing from where it is parsed.
 */
const DISPATCH_LINE: Record<string, (name: string) => RegExp> = {
    vue: (name) => new RegExp(`emit\\(\\s*'${name}'`),
    svelte: (name) => new RegExp(`dispatch\\(\\s*'${name}'`),
    angular: (name) => new RegExp(`\\bthis\\.${name}\\.emit\\(`),
};

/** The source with every line that fires `name` deleted, and nothing else touched. */
function withoutDispatch(src: string, key: string, name: string): string {
    const re = DISPATCH_LINE[key]!(name);
    return src.split(/\r?\n/).filter((line) => !re.test(line)).join('\n');
}

describe('the wrapper callback proofs', () => {
    it('reads all six callbacks off the React interface', () => {
        // The floor: a parser that found nothing would make every row below vacuous.
        expect(CALLBACKS.map((c) => c.name)).toEqual([
            'messageSent', 'action', 'messagesChange',
            'messageAppended', 'typingChange', 'conversationCreated',
        ]);
    });

    for (const key of Object.keys(DISPATCH_LINE)) {
        describe(CALLBACK_PROOFS[key].label, () => {
            const src = readFileSync(SOURCES[key], 'utf8');

            for (const cb of CALLBACKS) {
                it(`proves \`${cb.name}\` today`, () => {
                    expect(CALLBACK_PROOFS[key].proves(src, cb)).toBe(true);
                });

                it(`refuses \`${cb.name}\` when nothing dispatches it`, () => {
                    const sabotaged = withoutDispatch(src, key, cb.name);
                    // The sabotage has to bite, or the row proves nothing either way.
                    expect(sabotaged, 'the dispatch line was found and removed').not.toBe(src);
                    expect(CALLBACK_PROOFS[key].proves(sabotaged, cb)).toBe(false);
                });
            }
        });
    }
});

/**
 * `readWrapperSlots`/`readWrapperCallbacks` closed this hole for their own kind of prop;
 * it grew back one column over for everything else — the ~17 data props and the
 * `renderBubble` render hook were read by neither, so any of them could be renamed or
 * dropped on Vue, Svelte or Angular with nothing to notice. `DATA_PROP_PROOFS` is what
 * makes that mechanical instead of absent; this file proves each proof actually bites,
 * the same way the callback proofs above are proven, not merely exercised on the
 * happy path.
 */
describe('the wrapper data-prop and render-hook proofs', () => {
    const PROPS = readWrapperDataProps();

    it('reads every data prop and the one render hook off the React interface, in order', () => {
        // The floor: a parser that found nothing (or drifted silently) would make
        // every row below vacuous. `id` is included here (the reader has no reason
        // to know it is checked separately) but excluded from the gate's loop.
        expect(PROPS.map((p) => p.react)).toEqual([
            'id', 'messages', 'placeholder', 'disabled', 'isTyping', 'typingText',
            'submitOnEnter', 'layoutTransitionMs', 'centerWhenEmpty', 'loading',
            'overlayComposer', 'attachments', 'elicitation', 'className', 'style',
            'conversationId', 'renderBubble', 'config',
        ]);
        expect(PROPS.find((p) => p.react === 'renderBubble')?.kind).toBe('render-hook');
        expect(PROPS.filter((p) => p.kind === 'data')).toHaveLength(17);
    });

    const sources = {
        vue: readFileSync(SOURCES.vue, 'utf8'),
        svelte: readFileSync(SOURCES.svelte, 'utf8'),
        angular: readFileSync(SOURCES.angular, 'utf8'),
    };

    for (const key of Object.keys(sources) as Array<keyof typeof sources>) {
        describe(DATA_PROP_PROOFS[key].label, () => {
            for (const prop of PROPS) {
                if (prop.react === 'id') continue; // proven separately, and deliberately not by this generic path
                it(`proves \`${prop.react}\` today`, () => {
                    expect(DATA_PROP_PROOFS[key].proves(sources[key], prop)).toBe(true);
                });
            }
        });
    }

    // Sabotage the trickiest rows individually: the two names that route through an
    // alias, and the one that has no declared prop at all (Vue's attrs fallthrough for
    // `className`/`style`). A plain same-named prop (e.g. `placeholder`) is exercised
    // end to end by the manual gate proof in the task, not duplicated here.

    it('Vue: refuses `className`/`style` once `inheritAttrs: false` opts the component out', () => {
        const src = sources.vue;
        const sabotaged = src.replace(
            '<script setup lang="ts">',
            '<script setup lang="ts">\ndefineOptions({ inheritAttrs: false });',
        );
        expect(sabotaged, 'the injection landed').not.toBe(src);
        const classNameProp = PROPS.find((p) => p.react === 'className')!;
        const styleProp = PROPS.find((p) => p.react === 'style')!;
        expect(DATA_PROP_PROOFS.vue.proves(src, classNameProp)).toBe(true);
        expect(DATA_PROP_PROOFS.vue.proves(src, styleProp)).toBe(true);
        expect(DATA_PROP_PROOFS.vue.proves(sabotaged, classNameProp)).toBe(false);
        expect(DATA_PROP_PROOFS.vue.proves(sabotaged, styleProp)).toBe(false);
    });

    it('Svelte: refuses `className` once the `as class` rename is removed', () => {
        const src = sources.svelte;
        const sabotaged = src.replace("export { className as class };", '');
        expect(sabotaged, 'the rename line was found and removed').not.toBe(src);
        const prop = PROPS.find((p) => p.react === 'className')!;
        expect(DATA_PROP_PROOFS.svelte.proves(src, prop)).toBe(true);
        expect(DATA_PROP_PROOFS.svelte.proves(sabotaged, prop)).toBe(false);
    });

    it('Angular: refuses `className`/`style` once the aliased `@Input` is removed', () => {
        const src = sources.angular;
        const sabotaged = src
            .replace(/@Input\('containerClass'\) set containerClassInput\(val: string\) \{ this\.containerClass\.set\(val \?\? ''\); \}\n/, '')
            .replace(/@Input\('containerStyle'\)[^\n]*\n/, '');
        expect(sabotaged, 'both aliased inputs were found and removed').not.toBe(src);
        const classNameProp = PROPS.find((p) => p.react === 'className')!;
        const styleProp = PROPS.find((p) => p.react === 'style')!;
        expect(DATA_PROP_PROOFS.angular.proves(src, classNameProp)).toBe(true);
        expect(DATA_PROP_PROOFS.angular.proves(src, styleProp)).toBe(true);
        expect(DATA_PROP_PROOFS.angular.proves(sabotaged, classNameProp)).toBe(false);
        expect(DATA_PROP_PROOFS.angular.proves(sabotaged, styleProp)).toBe(false);
    });

    it('Vue/Svelte: refuse `renderBubble` once the `bubble` slot is renamed away', () => {
        const prop = PROPS.find((p) => p.react === 'renderBubble')!;
        const vueSabotaged = sources.vue.replace('name="bubble"', 'name="renamed"');
        const svelteSabotaged = sources.svelte.replace('name="bubble"', 'name="renamed"');
        expect(vueSabotaged).not.toBe(sources.vue);
        expect(svelteSabotaged).not.toBe(sources.svelte);
        expect(DATA_PROP_PROOFS.vue.proves(vueSabotaged, prop)).toBe(false);
        expect(DATA_PROP_PROOFS.svelte.proves(svelteSabotaged, prop)).toBe(false);
    });

    it('Angular: refuses `renderBubble` when declared but never projected (DECLARED IS NOT DISPATCHED)', () => {
        const prop = PROPS.find((p) => p.react === 'renderBubble')!;
        const sabotaged = sources.angular.replace('[ngTemplateOutlet]="bubbleTemplate"', '[ngTemplateOutlet]="null"');
        expect(sabotaged).not.toBe(sources.angular);
        // The @Input is still declared — only the projection was removed.
        expect(DATA_PROP_PROOFS.angular.proves(sources.angular, prop)).toBe(true);
        expect(DATA_PROP_PROOFS.angular.proves(sabotaged, prop)).toBe(false);
    });

    it('every alias is commented and points at a name that is not simply the React name', () => {
        for (const [react, byWrapper] of Object.entries(DATA_PROP_ALIASES)) {
            for (const [wrapper, alias] of Object.entries(byWrapper)) {
                expect(alias === null || alias !== react, `${react}.${wrapper} alias should differ from the React name`).toBe(true);
            }
        }
    });
});
