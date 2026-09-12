/*
 * Wrapper prop parity, mechanically — slots, callbacks, data props and the one render hook.
 *
 * Ratified decision #4 promises one surface, one name, on all four wrappers. It promised
 * it in prose, and prose drifts — that same line asserted for months that the parity was
 * "Angular-only", which was false and which nothing caught. The failure mode is silent by
 * nature: a slot name that no wrapper declares renders NOTHING, with no error, in Vue,
 * Svelte and Angular; a data prop that no wrapper declares simply has no effect there. A
 * wrapper can lose either and every unit test stays green.
 *
 * So: React's `AparteChatProps` is the source (see scripts/wrapper-surface.mjs), and every
 * prop it exposes — slot, callback, plain data prop, or the `renderBubble` render hook —
 * must have a working counterpart on the other three. The data-prop/render-hook half is
 * the newest: the first two readers (slots, callbacks) closed this exact hole for their
 * own kind of prop, and it grew back one column over — the other ~17 props were read by
 * neither, so any of them could be renamed or dropped on Vue, Svelte or Angular with
 * nothing to notice. Wired into `pnpm gate`, next to check-published-readmes and
 * check-node-import — the two other cross-package contracts that no single package's test
 * suite can hold.
 */
import { readFileSync } from 'node:fs';
import {
    IMPLEMENTATIONS,
    CALLBACK_PROOFS,
    DATA_PROP_PROOFS,
    SOURCES,
    readWrapperSlots,
    readWrapperCallbacks,
    readWrapperDataProps,
} from './wrapper-surface.mjs';

const slots = readWrapperSlots();
const sources = Object.fromEntries(
    Object.entries(SOURCES).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
);

const missing = [];
for (const slot of slots) {
    for (const [key, impl] of Object.entries(IMPLEMENTATIONS)) {
        if (!impl.proves(sources[key], slot)) {
            missing.push({ slot: slot.slot, wrapper: impl.label, expected: impl.usage(slot) });
        }
    }
}

/*
 * The callbacks, by the same rule and for the same reason.
 *
 * `wrapper-surface.mjs` documented this check as already existing while this file imported
 * only the slot half — so six callback spellings were published on the wrapper reference,
 * derived from the React name, and verified against nothing. Parity happened to hold; the
 * claim did not, which is worse, because a stated check stops anyone looking.
 */
const callbacks = readWrapperCallbacks();
for (const callback of callbacks) {
    for (const [key, proof] of Object.entries(CALLBACK_PROOFS)) {
        if (!proof.proves(sources[key], callback)) {
            missing.push({ slot: callback.name, wrapper: proof.label, expected: proof.usage(callback) });
        }
    }
}

/*
 * The data props and the `renderBubble` render hook, by the same rule.
 *
 * `readWrapperSlots`/`readWrapperCallbacks` only ever read a prop typed `React.ReactNode`
 * or `(…) => void` — so the other ~17 props on `AparteChatProps` (`placeholder`,
 * `disabled`, `conversationId`, `config`, …) and `renderBubble` were never read at all,
 * let alone checked against Vue, Svelte or Angular. `id` is excluded here on purpose: it
 * already has a stronger, dedicated proof below (that the value is actually USED to seed
 * the host id, not merely declared), and Angular's `id` is a native DOM attribute with no
 * `@Input` a generic "declared under this name" check could find.
 */
const dataProps = readWrapperDataProps().filter((p) => p.react !== 'id');
for (const prop of dataProps) {
    for (const [key, proof] of Object.entries(DATA_PROP_PROOFS)) {
        if (!proof.proves(sources[key], prop)) {
            missing.push({ slot: prop.react, wrapper: proof.label, expected: proof.usage(prop) });
        }
    }
}

const names = slots.map((s) => s.slot).join(', ');

if (missing.length) {
    console.error('\n[wrapper-slots] slot parity broken:\n');
    for (const m of missing) {
        console.error(`  ${m.wrapper.padEnd(8)} does not declare \`${m.slot}\`  (expected ${m.expected})`);
    }
    console.error(
        '\nEvery slot on React\'s AparteChatProps must exist on the other three: a missing one\n' +
        'renders nothing, silently, so nobody finds out from a test. Either add it, or remove\n' +
        'the React prop — the four surfaces are one promise.\n',
    );
    process.exit(1);
}

/**
 * The host id, which every wrapper must let a caller supply.
 *
 * `AparteClientOptions.scopeToTargetId` is the documented way to run several
 * independent clients on one page, and it matches `detail.targetId` — which the
 * wrappers set from a host id they GENERATED and neither accepted nor exposed. So
 * the mechanism was unreachable from three of the four components: a consumer had
 * no way to learn the id the client had to match. Angular happened to work, because
 * it only assigns when the host has no id, so an `id` in the template survives.
 *
 * Checked by source shape rather than by four framework mounts, the same way slot
 * parity is: what matters is that all four honour a caller's id, and one missing
 * one fails silently.
 */
const HOST_ID_PROOFS = {
    react: (src) => /\bid\?: string;/.test(src) && /providedId \?\?/.test(src),
    vue: (src) => /\bid\?: string;/.test(src) && /props\.id \?\?/.test(src),
    svelte: (src) => /export let id: string \| undefined/.test(src) && /id \?\?/.test(src),
    // Angular's host IS the component element, so a template `id` lands on it
    // natively; the guard is that the component does not overwrite one.
    angular: (src) => /if \(!host\.id\)/.test(src),
};

const idGaps = Object.entries(HOST_ID_PROOFS)
    .filter(([wrapper, proves]) => !proves(readFileSync(SOURCES[wrapper], 'utf8')))
    .map(([wrapper]) => wrapper);

if (idGaps.length) {
    console.error('\n[wrapper-slots] the host id is not caller-supplied on:\n');
    for (const w of idGaps) console.error(`  ${w}`);
    console.error(
        '\nWithout it, `AparteClientOptions.scopeToTargetId` cannot be used from that\n'
        + 'component: the consumer has no way to learn the id the client must match. The\n'
        + 'four surfaces are one promise.\n',
    );
    process.exit(1);
}

console.log(
    `[wrapper-slots] OK: ${slots.length} slots and ${callbacks.length} callbacks on all 4 wrappers — ${names}; `
    + `${dataProps.length} data props/render hooks parity-checked (plus \`id\`, separately); `
    + 'and all 4 accept a caller-supplied host id.',
);
