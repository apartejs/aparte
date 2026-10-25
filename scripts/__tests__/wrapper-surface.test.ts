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
    IMPLEMENTATIONS,
    SOURCES,
    readWrapperCallbacks,
    readWrapperDataProps,
    readWrapperSlots,
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
    svelteRunes: (name) => new RegExp(`\\bon${name}\\?\\.\\(`),
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
        svelteRunes: readFileSync(SOURCES.svelteRunes, 'utf8'),
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

    it('Angular: refuses `className`/`style` once the aliased input is removed', () => {
        const src = sources.angular;
        const sabotaged = src
            .replace(/readonly containerClass = input\([^\n]*\n/, '')
            .replace(/readonly containerStyle = input\(null, \{[\s\S]*?\}\);\n/, '');
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
        const sabotaged = sources.angular.replace(
            '[ngTemplateOutlet]="bubbleTemplate() ?? bubbleDirective()?.template ?? null"',
            '[ngTemplateOutlet]="bubbleDirective()?.template ?? null"',
        );
        expect(sabotaged).not.toBe(sources.angular);
        // The input is still declared — only its projection was removed (the content
        // template still projects, which must not vouch for the input).
        expect(DATA_PROP_PROOFS.angular.proves(sources.angular, prop)).toBe(true);
        expect(DATA_PROP_PROOFS.angular.proves(sabotaged, prop)).toBe(false);
    });

    // The runes component declares every prop in one `$props()` destructuring and draws a
    // snippet with `{@render}`. Declared is not drawn: each half must be required.
    it('Svelte runes: refuses a data prop once it leaves `$props()`, and `className` once `class:` does', () => {
        const src = sources.svelteRunes;
        const placeholder = PROPS.find((p) => p.react === 'placeholder')!;
        const className = PROPS.find((p) => p.react === 'className')!;
        const noPlaceholder = src.replace(/\n\s*placeholder = [^\n]*,/, '');
        const noClass = src.replace("class: className = '',", "className = '',");
        expect(noPlaceholder, 'the placeholder line was found and removed').not.toBe(src);
        expect(noClass, 'the class rename was found and removed').not.toBe(src);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(src, placeholder)).toBe(true);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(noPlaceholder, placeholder)).toBe(false);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(src, className)).toBe(true);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(noClass, className)).toBe(false);
    });

    it('Svelte runes: refuses `renderBubble` when the `bubble` snippet is taken but never rendered', () => {
        const prop = PROPS.find((p) => p.react === 'renderBubble')!;
        const sabotaged = sources.svelteRunes.replace('{@render bubble(m)}', '');
        expect(sabotaged).not.toBe(sources.svelteRunes);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(sources.svelteRunes, prop)).toBe(true);
        expect(DATA_PROP_PROOFS.svelteRunes.proves(sabotaged, prop)).toBe(false);
    });

    it('every alias is commented and points at a name that is not simply the React name', () => {
        for (const [react, byWrapper] of Object.entries(DATA_PROP_ALIASES)) {
            for (const [wrapper, alias] of Object.entries(byWrapper)) {
                expect(alias === null || alias !== react, `${react}.${wrapper} alias should differ from the React name`).toBe(true);
            }
        }
    });
});

/**
 * The runes component's slots are snippet props. A snippet taken out of `$props()` and
 * never passed to `{@render}` is the Svelte 5 form of a slot nobody declared: the caller's
 * markup goes nowhere, with no error.
 */
describe('the Svelte runes slot proofs', () => {
    const src = readFileSync(SOURCES.svelteRunes, 'utf8');

    for (const slot of readWrapperSlots()) {
        it(`proves \`${slot.react}\` today, and refuses it once nothing renders it`, () => {
            const sabotaged = src.replace(new RegExp(`\\{@render ${slot.react}(?:\\?\\.)?\\(\\)\\}`, 'g'), '');
            expect(sabotaged, 'the render tag was found and removed').not.toBe(src);
            expect(IMPLEMENTATIONS.svelteRunes.proves(src, slot)).toBe(true);
            expect(IMPLEMENTATIONS.svelteRunes.proves(sabotaged, slot)).toBe(false);
        });
    }
});
