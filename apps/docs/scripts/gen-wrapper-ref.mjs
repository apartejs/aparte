/*
 * Generates the "Wrapper slots" reference page from React's `AparteChatProps` — the one
 * place where the slot names and their documentation live in the type system
 * (see scripts/wrapper-surface.mjs, shared with the `pnpm gate` parity check).
 *
 * Why this page exists: the four framework pages named the slots in one clause of one
 * enumeration each, and the first external consumer read one of those pages, did not find
 * them, and built a workaround. Custom elements have had a generated reference for months;
 * the wrapper surface had none, so its only description was a hand-written sentence that
 * could drift — and did.
 *
 * Runs before `astro dev` / `astro build` (see package.json).
 *
 * Output (git-ignored, always regenerated):
 *   src/content/docs/reference/wrappers.md
 */
import { mkdirSync } from 'node:fs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPLEMENTATIONS, readWrapperSlots } from '../../../scripts/wrapper-surface.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/content/docs/reference/wrappers.md');

const slots = readWrapperSlots();
const frameworks = Object.values(IMPLEMENTATIONS);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

let md = `---
title: Wrapper slots
description: Every slot the React, Vue, Svelte and Angular wrappers expose, generated from the wrapper source.
---

<!-- AUTO-GENERATED from packages/wrappers/react/src/components/AparteChat.tsx by apps/docs/scripts/gen-wrapper-ref.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen\` to refresh. -->

The default shell of \`<AparteChat>\` leaves you these places to put your own markup. The
same slots exist on all four wrappers — that is checked mechanically on every \`pnpm gate\`,
not promised in prose — and each framework declares them in its own idiom.

| Slot | ${frameworks.map((f) => f.label).join(' | ')} |
| --- | ${frameworks.map(() => '---').join(' | ')} |
`;

for (const slot of slots) {
    md += `| \`${slot.slot}\` | ${frameworks.map((f) => `\`${esc(f.usage(slot))}\``).join(' | ')} |\n`;
}

md += `\n## What each one is for\n`;
/*
 * A table row is not an example.
 *
 * The four slots × four frameworks were a 16-cell grid of one-line syntax with no
 * code block anywhere — and this project's own rule says a capability cited in
 * passing, with no example, is functionally invisible. That rule was LEARNED here:
 * the first external consumer built his own bar under the chat rather than find the
 * toolbar slot, which was cited in exactly this way.
 *
 * So each slot now emits one fence per framework, generated from the same source as
 * the table, which is what stops the two from drifting.
 */
for (const slot of slots) {
    md += `\n### \`${slot.slot}\`\n\n${slot.summary || '_(undocumented — add a JSDoc comment to the React prop.)_'}\n`;
    for (const f of frameworks) {
        md += `\n${f.label}:\n\n\`\`\`${f.lang}\n${f.example(slot)}\n\`\`\`\n`;
    }
}

md += `
## Two things this table does not cover

**A custom bubble** is a render hook, not a slot: React takes a \`renderBubble\` function,
the other three take a \`bubble\` slot that receives the message. It is per-message rather
than per-region, which is why it is shaped differently — see
[Custom bubbles](/guides/customization/#custom-bubbles).

**Placement inside a slot** is yours. Nothing here is positional: put your controls in the
order you want them and push one to the end with \`margin-inline-start: auto\` — a logical
property, so it follows the reading direction. The worked example is in
[The composer toolbar](/guides/customization/#the-composer-toolbar).
`;

mkdirSync(dirname(OUT), { recursive: true });
const wrote = writeIfChanged(OUT, md);
console.log(`[gen-wrapper-ref] ${wroteOrNot(wrote)} ${slots.length} slots → ${OUT}`);
