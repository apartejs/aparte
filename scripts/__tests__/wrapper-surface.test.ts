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
import { CALLBACK_PROOFS, SOURCES, readWrapperCallbacks } from '../wrapper-surface.mjs';

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
