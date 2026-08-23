/*
 * Wrapper slot parity, mechanically.
 *
 * Ratified decision #4 promises the same slots on all four wrappers. It promised it in
 * prose, and prose drifts — that same line asserted for months that the parity was
 * "Angular-only", which was false and which nothing caught. The failure mode is silent by
 * nature: a slot name that no wrapper declares renders NOTHING, with no error, in Vue,
 * Svelte and Angular. A wrapper can lose a slot and every unit test stays green.
 *
 * So: React's `AparteChatProps` is the source (see scripts/wrapper-surface.mjs), and every
 * slot it exposes must be declared by the other three. Wired into `pnpm gate`, next to
 * check-published-readmes and check-node-import — the two other cross-package contracts
 * that no single package's test suite can hold.
 */
import { readFileSync } from 'node:fs';
import { IMPLEMENTATIONS, SOURCES, readWrapperSlots } from './wrapper-surface.mjs';

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
    `[wrapper-slots] OK: ${slots.length} slots on all 4 wrappers — ${names}; `
    + 'and all 4 accept a caller-supplied host id.',
);
