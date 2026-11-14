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
import { referenceOrder } from './reference-order.mjs';
import { writeIfChanged, wroteOrNot } from './write-if-changed.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPLEMENTATIONS, callbackRow, readWrapperSlots, readWrapperCallbacks, readChatCallbacks } from '../../../scripts/wrapper-surface.mjs';
import { CHAT_TAG, readChatEvents } from '../../../scripts/chat-surface.mjs';
import { bindingName, readElements, readNativeEventNames, readReactComponents } from '../../../scripts/gen-element-bindings.mjs';
import bindings from '../../../packages/core/element-bindings.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/content/docs/reference/wrappers.md');

const CORE = resolve(here, '../../../packages/core');
const REACT_BARREL = resolve(here, '../../../packages/wrappers/react/src/index.ts');

const slots = readWrapperSlots();
/*
 * The chat's events are generated into each wrapper from `<aparte-chat>`'s `@fires`, so the ones
 * every component also takes as a callback (`messageSent`, `action`) are read from core's
 * manifest, under the name the generator gives them; the host's own callbacks from React's props.
 */
const chatEvents = readChatEvents().map((ev) => ({ ...ev, binding: bindingName(CHAT_TAG, ev.name, bindings) }));
const callbacks = [...readChatCallbacks(chatEvents), ...readWrapperCallbacks()];
const frameworks = Object.values(IMPLEMENTATIONS);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

let md = `---
title: Wrapper surface
description: Every slot and every callback the React, Vue, Svelte and Angular wrappers expose, generated from the wrapper source.
sidebar:
  order: ${referenceOrder("wrappers.md")}
---

<!-- AUTO-GENERATED from packages/wrappers/react/src/components/AparteChat.tsx by apps/docs/scripts/gen-wrapper-ref.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen\` to refresh. -->

The default shell of \`<AparteChat>\` leaves you these places to put your own markup. The
same slots exist on all four wrappers — that is checked mechanically on every \`pnpm gate\`,
not promised in prose — and each framework declares them in its own idiom. Svelte has two
components: the one at \`@aparte/svelte\`, written in Svelte 4 syntax and running on 4 and 5,
and the one at \`@aparte/svelte/runes\`, for Svelte 5, where the slots are snippets.

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

/*
 * The `loading` prop — cited once, in one guide, with no table of its own, which is
 * exactly the defect this whole page exists to fix for slots and callbacks. Hand-listed
 * rather than read from wrapper-surface.mjs: it is the only prop this page covers today,
 * so a shared reader built for one row would teach nothing a literal doesn't already say.
 */
const props = [
    {
        prop: 'loading',
        summary: 'Draw the wait yourself while your store answers; the controller sets it for its own fetches.',
        react: 'loading={…}',
        vue: ':loading',
        svelte: 'loading',
        angular: '[loading]',
        svelteRunes: 'loading',
    },
];

md += `
## Props

| Prop | React | Vue | Svelte | Angular | Svelte runes |
| --- | --- | --- | --- | --- | --- |
`;
for (const p of props) {
    md += `| \`${esc(p.prop)}\` | \`${esc(p.react)}\` | \`${esc(p.vue)}\` | \`${esc(p.svelte)}\` | \`${esc(p.angular)}\` | \`${esc(p.svelteRunes)}\` |\n`;
}
md += `\n${props.map((p) => p.summary).join(' ')}\n`;

/*
 * The callbacks, for the same reason and against the same defect one column over: four of
 * the six were named in prose on the ANGULAR page alone, so three framework pages
 * documented a third of the surface and nothing could notice. Generated from the same
 * interface as the slots, so the spellings cannot drift from the props.
 */
md += `
## Callbacks

The same events on all four wrappers, each in its own idiom. React, Vue and Angular hand you
the payload directly. Svelte has a callback prop, with the payload, and a component event as well —
\`on:messageSent\` and the rest — with it under \`event.detail\`. The runes component has the
callback prop only, under the same name: Svelte 5 has no component events.

\`messageSent\` and \`action\` are events of the chat, and so is every other event \`<aparte-chat>\`
declares: each reaches the component the same way, under the event's name without \`aparte-\`, in
camelCase — \`onLinkClick\`, \`@link-click\`, \`on:linkClick\`, \`(linkClick)\`, \`onlinkClick\` — save
\`aparte-send\`, which is \`messageSent\`, and \`aparte-cancel\`, which is \`stop\`. A callback for an
event of the chat receives the payload, then the DOM event, so \`event.preventDefault()\` is in
reach; in Angular the output carries the payload, and \`(aparte-link-click)\` on \`<aparte-chat>\`
binds the DOM event itself.

`;

/*
 * Written as HTML, not as a Markdown table: five columns of code are wider than the content
 * column, and the site's tables scroll sideways — a region a keyboard has to be able to reach,
 * so the table takes a tab stop and a name of its own.
 */
const html = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
md += `\n<table tabindex="0" aria-label="The callbacks in the four frameworks">\n<thead><tr><th>Payload</th>${frameworks.map((f) => `<th>${html(f.label)}</th>`).join('')}</tr></thead>\n<tbody>\n`;
for (const cb of callbacks) {
    const cells = [cb.payload, cb.react, cb.vue, cb.svelte.replace(/^on:/, 'on'), cb.angular, cb.svelteRunes];
    md += `<tr>${cells.map((c) => `<td><code>${html(c)}</code></td>`).join('')}</tr>\n`;
}
md += `</tbody>\n</table>\n`;

md += `\n## What each callback is for\n`;
for (const cb of callbacks) {
    md += `\n### \`${cb.name}\`\n\n${cb.summary || '_(undocumented — add a JSDoc comment to the React prop.)_'}\n`;
}

/*
 * The events of the chat, from the same manifest and the same naming function the wrappers are
 * generated from — so a row here is the spelling the component really has, a rename included.
 * Written as HTML for the reason the callbacks' table is.
 */
const cancelables = chatEvents.filter((ev) => ev.cancelable).map((ev) => ev.name);
md += `
## Events

Every event \`<aparte-chat>\` declares reaches each component, so none of them needs a
\`querySelector\`. The first column is the DOM event, which is what you see in the browser's
tools and in the [events reference](/reference/events/); the rest is how each framework spells it.
Every handler receives the payload, then the DOM event. In Angular the output carries the payload
alone: to cancel an event there, bind the DOM event itself, \`(aparte-link-click)="…"\`, on
\`<aparte-chat>\`.

<table tabindex="0" aria-label="The events of the chat in the five components">
<thead><tr><th>Event</th><th>Payload</th><th>Cancelable</th><th>React</th><th>Vue</th><th>Svelte 4 syntax</th><th>Svelte 5 syntax</th><th>Angular</th></tr></thead>
<tbody>
`;
for (const ev of chatEvents) {
    const row = callbackRow({ name: ev.binding, payload: '', summary: '' });
    const cells = [ev.name, ev.detail ?? 'none', ev.cancelable ? 'yes' : 'no', row.react, row.vue, row.svelte, row.svelteRunes, row.angular];
    md += `<tr>${cells.map((c) => `<td><code>${html(c)}</code></td>`).join('')}</tr>\n`;
}
md += `</tbody>\n</table>\n`;

md += `
A cancelable event can be stopped: \`event.preventDefault()\` keeps the browser from doing what
it was about to do, so your code can do it instead. ${cancelables.length ? `Cancelable today: ${cancelables.map((n) => `\`${n}\``).join(', ')}` : 'None is cancelable today'}.
\`aparte-link-click\` is how an app routes a link a reply contains.

### Events the chat does not name

An event a plugin sends (\`aparte-subagent-open\`, \`aparte-artifact-open\`…), or one of your own,
has no row above and still arrives: the parts of the chat send their events up to its root, so
one listener there hears all of them. Each framework has a short way to put one.

React, with the chat's ref (the handler is typed from the plugin's event, with no cast):

\`\`\`tsx
const chat = useAparteChat();
useAparteEvent(chat.ref, 'aparte-subagent-open', (event) => openPanel(event.detail.runId));
\`\`\`

Vue, the event's DOM name on \`<AparteChat>\`:

\`\`\`vue
<AparteChat @aparte-subagent-open="(event) => openPanel(event.detail.runId)" />
\`\`\`

Svelte 5 syntax, the same name as a prop:

\`\`\`svelte
<AparteChat onaparte-subagent-open={(event) => openPanel(event.detail.runId)} />
\`\`\`

Svelte 4 syntax, the chat's root element, once it is mounted:

\`\`\`svelte
<AparteChat bind:this={chat} />
<script>
  onMount(() => chat.getElement()?.addEventListener('aparte-subagent-open', (event) => openPanel(event.detail.runId)));
</script>
\`\`\`

Angular, the DOM binding on \`<aparte-chat>\`:

\`\`\`html
<aparte-chat (aparte-subagent-open)="openPanel($any($event).detail.runId)"></aparte-chat>
\`\`\`

@@COMPONENTS@@
## Two things this table does not cover

**A custom bubble** is a render hook, not a slot: React takes a \`renderBubble\` function,
Vue and Svelte a \`bubble\` slot that receives the message, the runes component a
\`bubble\` snippet with the message as its argument, and Angular a
\`[bubbleTemplate]\` with the message as \`$implicit\`. It is per-message rather
than per-region, which is why it is shaped differently — see
[Custom bubbles](/guides/customization/bubble/).

**Placement inside a slot** is yours. Nothing here is positional: put your controls in the
order you want them and push one to the end with \`margin-inline-start: auto\` — a logical
property, so it follows the reading direction. The worked example is in
[The composer toolbar](/guides/customization/composer-toolbar/).
`;

/*
 * `provideAparte` — the one thing three of the four wrappers do not have, spelled out
 * with its equivalent rather than left as an absence a reader has to interpret. A
 * capability cited in passing, with no example, is invisible; so is its opposite, and
 * "Angular has a helper the others lack" reads as three wrappers falling behind until
 * the five calls it replaces are on the page.
 */
md += `
## \`provideAparte\` is Angular's, and only Angular's

Angular alone needs an app initializer that runs before the first component, and a
\`DestroyRef\` to release the theme listener it registers. That is what
[\`provideAparte()\`](/frameworks/angular/) is. There is no \`provideAparte\` in the other
three, and that is not a gap: everything it configures is a plain function call — bar
\`theme: 'auto'\`, which is a \`matchMedia\` listener you own — so React, Vue and Svelte make
the same calls at module scope, before the app mounts.

\`\`\`ts
import { aparteGlobalConfig } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { fr } from '@aparte/locales/fr';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
aparteGlobalConfig.setModelConfig({ defaultModel: 'openai/gpt-4o-mini' });
aparteGlobalConfig.setLocale(fr);
document.documentElement.setAttribute('data-aparte-theme', 'dark');
// 'auto' is the one option with no one-liner: match prefers-color-scheme, rewrite the
// attribute on change, and drop the listener when your app tears down.
// The client stays the wrapper's own: useAparteClient() in React and Vue,
// createAparteClient() in Svelte.
\`\`\`

The day a second wrapper needs that theme listener with a disposer of its own,
\`applyThemeMode\` moves into \`@aparte/core\` and all four call it — one implementation, four
idioms. Until then it lives where its one caller is.
`;

/*
 * Every element of core as a React component, from the manifest and the naming function the
 * components are generated from: a row here is the component, the props type and the callback the
 * package really exports, a rename included. Written as HTML for the reason the callbacks' table is.
 */
const components = readReactComponents(CORE, readElements(CORE), bindings, {
    native: readNativeEventNames(),
    configPath: 'packages/core/element-bindings.config.mjs',
    barrelArg: REACT_BARREL,
});
const cell = (items) => (items.length ? items.map((i) => `<code>${html(i)}</code>`).join(', ') : '—');
let table = `
## A React component for every element

\`@aparte/react\` exports one component per element of core, the chat apart: its component is
\`<AparteChat>\`. A component is the element with its props bound for React: the tag's attributes by
the names the tag has, its properties (\`conversations\`) as props, and an \`on…\` callback for each
event, called with the payload and then the DOM event, like the chat's. They are generated from the
manifest, so an element or an event added to core reaches them with no edit. Each element's page,
under [Components](/components/), shows its component beside the other frameworks' tags, and
[Any element, typed](/frameworks/react/#any-element-typed) says how they behave under React 18 and 19.

<table tabindex="0" aria-label="The React component of each element of core">
<thead><tr><th>Component</th><th>Element</th><th>Props type</th><th>Properties</th><th>Callbacks</th></tr></thead>
<tbody>
`;
for (const c of components) {
    table += `<tr><td><code>${c.component}</code></td><td><code>&lt;${c.tag}&gt;</code></td><td><code>${c.props}</code></td>`
        + `<td>${cell(c.properties.map((p) => p.name))}</td><td>${cell(c.events.map((e) => e.prop))}</td></tr>\n`;
}
table += '</tbody>\n</table>\n';
md = md.replace('@@COMPONENTS@@\n', table);

mkdirSync(dirname(OUT), { recursive: true });
const wrote = writeIfChanged(OUT, md);
console.log(`[gen-wrapper-ref] ${wroteOrNot(wrote)} ${slots.length} slots + ${callbacks.length} callbacks → ${OUT}`);
