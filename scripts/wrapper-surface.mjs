/*
 * The wrapper prop surface, read from ONE source.
 *
 * Ratified decision #4 says `empty-state`, `above-composer` and `toolbar` exist on all
 * four wrappers. That was prose, and prose drifts: the same line claimed for months that
 * the parity was "Angular-only" — it was false, and nothing noticed. Worse, a wrong slot
 * name in Vue, Svelte or Angular renders NOTHING with no error, so a wrapper could quietly
 * lose a slot and every test would stay green.
 *
 * The source of truth is React's `AparteChatProps`: the only one of the four where the
 * names AND their documentation live in the type system. This file reads EVERY prop off
 * it, mechanically, in three shapes — a slot (`?: React.ReactNode`), a callback
 * (`on…?: (…) => void`), and everything else (the ~17 data props plus the one render hook,
 * `renderBubble`) — so a prop of any of these three kinds added to React shows up here
 * (and in the docs, and in the parity check) with no second edit. The third reader,
 * {@link readWrapperDataProps}, was the last one added: the first two closed the same hole
 * for slots and callbacks, and it grew back one column over — the data props and the
 * render hook were unchecked across the three non-React wrappers, so any of them could be
 * renamed or dropped in Vue, Svelte or Angular with nothing to notice.
 *
 * Consumed by scripts/check-wrapper-slots.mjs (the gate) and
 * apps/docs/scripts/gen-wrapper-ref.mjs (the reference page).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

export const SOURCES = {
    react: resolve(root, 'packages/wrappers/react/src/components/AparteChat.tsx'),
    vue: resolve(root, 'packages/wrappers/vue/src/components/AparteChat.vue'),
    svelte: resolve(root, 'packages/wrappers/svelte/src/lib/AparteChat.svelte'),
    angular: resolve(root, 'packages/wrappers/angular/src/lib/aparte-chat.component.ts'),
};

/** `aboveComposer` → `above-composer`. The whole convention, in one line. */
export const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** First sentence of a JSDoc block, flattened — enough for a reference table. */
function summarise(block) {
    const text = block
        .replace(/^\s*\/\*\*/, '')
        .replace(/\*\/\s*$/, '')
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join(' ')
        .split(/@example|@param|@default/)[0]
        .replace(/\s+/g, ' ')
        .trim();
    // A period followed by whitespace and a CAPITAL (or the end): "e.g. a disclaimer"
    // must not end the sentence, and it did.
    const end = text.search(/\.(?=\s+[A-Z(]|$)/);
    return (end === -1 ? text : text.slice(0, end + 1)).trim();
}

/**
 * Every slot React exposes, in declaration order, with its summary.
 *
 * Throws rather than returning nothing: a parser that silently finds zero slots would
 * turn both consumers into no-ops — a green check that checks nothing is worse than no
 * check at all.
 */
export function readWrapperSlots() {
    const src = readFileSync(SOURCES.react, 'utf8');
    const iface = src.match(/interface AparteChatProps[^{]*\{([\s\S]*?)\n\}/);
    if (!iface) throw new Error(`could not find "interface AparteChatProps" in ${SOURCES.react}`);

    const slots = [];
    // The doc group must not cross its own `*/`, or it happily starts at an earlier
    // comment and hands a prop somebody else's documentation (it did: `composer` came
    // out described as "Messages on the active path").
    const re = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)?\s*(\w+)\?:\s*React\.ReactNode\s*;/g;
    for (const [, doc, name] of iface[1].matchAll(re)) {
        slots.push({ react: name, slot: kebab(name), summary: doc ? summarise(doc) : '' });
    }

    if (!slots.length) {
        throw new Error(
            `no \`?: React.ReactNode\` prop found in AparteChatProps (${SOURCES.react}). ` +
            'Either the slots are gone, or this parser stopped matching the source — ' +
            'both need a human, neither may pass silently.',
        );
    }
    return slots;
}

/**
 * Every CALLBACK React exposes, read the same mechanical way the slots are.
 *
 * The same defect the slot table was built to end had grown back one column over: four
 * of the six callbacks — `onAction`, `onMessageAppended`, `onTypingChange`,
 * `onConversationCreated` — existed in all four wrappers and were named in prose on the
 * ANGULAR page alone. Three of four framework pages therefore documented a third of the
 * surface, and nothing could notice, because prose is not a signal.
 *
 * A prop typed `(…) => void` is a signal. The per-framework spelling is mechanical from
 * the React name: `onMessageSent` → `messageSent` → `@message-sent` in a Vue template,
 * `on:messageSent` in Svelte, `(messageSent)` in Angular. Those spellings are checked
 * against all four sources by `check-wrapper-slots` through {@link CALLBACK_PROOFS}, so a
 * wrapper that renames or drops one fails the gate rather than being documented wrong.
 *
 * That sentence used to be here and be FALSE — the guard imported only the slot half. A
 * cold audit caught it. Parity held at the time, so nothing shipped was wrong; the claim
 * was, which is the more dangerous of the two because it stops anyone looking.
 */
export function readWrapperCallbacks() {
    const src = readFileSync(SOURCES.react, 'utf8');
    const iface = src.match(/interface AparteChatProps[^{]*\{([\s\S]*?)\n\}/);
    if (!iface) throw new Error(`could not find "interface AparteChatProps" in ${SOURCES.react}`);

    const callbacks = [];
    const re = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)?\s*(on[A-Z]\w*)\?:\s*\(([^)]*)\)\s*=>\s*void\s*;/g;
    for (const [, doc, name, params] of iface[1].matchAll(re)) {
        const base = name.slice(2, 3).toLowerCase() + name.slice(3);
        callbacks.push({
            react: name,
            name: base,
            vue: `@${kebab(base)}`,
            svelte: `on:${base}`,
            angular: `(${base})`,
            payload: params.trim() ? params.split(':').slice(1).join(':').trim() : 'nothing',
            summary: doc ? summarise(doc) : '',
        });
    }

    if (!callbacks.length) {
        throw new Error(
            `no \`on…?: (…) => void\` prop found in AparteChatProps (${SOURCES.react}). ` +
            'Either the callbacks are gone, or this parser stopped matching — both need a human.',
        );
    }
    return callbacks;
}

/**
 * Comments out, before any `includes()` decides anything.
 *
 * The proofs below are substring matches, and a substring match cannot tell a
 * declaration from a mention. `<!-- name="toolbar" -->` in a Vue template, or a
 * `// select="[slot='toolbar']"` left behind while refactoring an Angular component,
 * satisfied the guard while the slot rendered nothing. That is the same defect
 * `check-engine-consumer` had — two slashes were enough to make it pass — and it is
 * the class of hole worth closing everywhere it exists rather than once.
 *
 * Whitespace-preserving replacement, so a match's position still lines up with the
 * original file if a caller ever reports one.
 */
function stripComments(src) {
    return src
        .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:/])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
}

/**
 * How each wrapper declares one slot, and how to prove it does. Kept next to the parser
 * because these four lines ARE the convention the reference page documents.
 */
/**
 * How each wrapper DECLARES a callback, so parity can be proved rather than asserted.
 *
 * The comment above `readWrapperCallbacks` claimed this was already checked. It was not:
 * `check-wrapper-slots` imported only the slot half, so the callback spellings were spun
 * from the React name and verified against nothing. A cold audit caught the false claim —
 * parity happened to hold, so nothing shipped was wrong, but the sentence was.
 *
 * Making the claim true rather than deleting it: the guard exists, the four sources exist,
 * and a wrapper that renames or drops a callback should fail here rather than be documented
 * wrong on four pages.
 *
 * DECLARED IS NOT DISPATCHED. Two of these proofs used to match only the declaration —
 * the key in Vue's `defineEmits<{…}>`, the `output<…>()` initialiser in Angular — and a
 * declaration nobody fires is precisely the silent failure the guard exists for: a
 * consumer's `@message-sent` or `(messageSent)` handler simply never runs, with no error
 * anywhere. Svelte's proof was already the right shape (it matched the `dispatch` call),
 * which is what made the asymmetry visible. Both halves are now required, so renaming
 * either one fails: sabotaging each callback's dispatch line is a test in
 * `scripts/__tests__/wrapper-surface.test.ts`, and 12 of its 18 rows passed before this.
 */
export const CALLBACK_PROOFS = {
    // The React props interface is the source this whole module parses; a prop cannot
    // be missing from where it is read, and the handler IS the prop.
    react: { label: 'React', usage: (c) => c.react, proves: () => true },
    vue: {
        label: 'Vue',
        usage: (c) => c.vue,
        // Declared as a key in `defineEmits<{ messageSent: [...] }>`, AND fired by an
        // `emit('messageSent', …)` somewhere in the setup block.
        proves: (src, c) => {
            const s = stripComments(src);
            return new RegExp(`\\b${c.name}\\s*:`).test(s) && new RegExp(`emit\\(\\s*'${c.name}'`).test(s);
        },
    },
    svelte: {
        label: 'Svelte',
        usage: (c) => c.svelte,
        // `createEventDispatcher` has no declaration to drift from: the call is both.
        proves: (src, c) => stripComments(src).includes(`dispatch('${c.name}'`),
    },
    angular: {
        label: 'Angular',
        usage: (c) => c.angular,
        // Declared as `readonly messageSent = output<…>()`, AND fired by a
        // `this.messageSent.emit(…)`.
        proves: (src, c) => {
            const s = stripComments(src);
            return new RegExp(`\\b${c.name}\\s*=\\s*output<`).test(s) && new RegExp(`\\bthis\\.${c.name}\\.emit\\(`).test(s);
        },
    },
};

/**
 * Every prop that is NEITHER a slot (`?: React.ReactNode`) NOR a callback
 * (`on…?: (…) => void`) — the ~17 data props (`placeholder`, `disabled`,
 * `conversationId`, `config`, …) and the one render hook (`renderBubble`,
 * typed `(message) => React.ReactNode`) that decision #4's parity table never
 * covered. `check-wrapper-slots` imported only the slot and callback halves —
 * so a prop could be renamed or dropped on Vue, Svelte or Angular and nothing
 * would notice, the exact silent-failure shape the other two readers exist
 * to end, just one column over. `id` comes back too, but the gate leaves it
 * out of the loop that consumes this list: {@link HOST_ID_PROOFS} below
 * already proves it more strongly (that the value is actually USED to seed
 * the host id, not merely declared), and Angular's `id` is a native DOM
 * attribute with no `@Input` to find — a generic "declared under this name"
 * check would misreport a real prop as a gap.
 */
export function readWrapperDataProps() {
    const src = readFileSync(SOURCES.react, 'utf8');
    const iface = src.match(/interface AparteChatProps[^{]*\{([\s\S]*?)\n\}/);
    if (!iface) throw new Error(`could not find "interface AparteChatProps" in ${SOURCES.react}`);

    const props = [];
    // Same one-line-per-prop shape the slot/callback readers rely on: a doc
    // block, then `name?: type;` (or `name: type;`) on its own line. The `?`
    // is captured, not just allowed, because the skip conditions below must
    // only fire for a prop `readWrapperSlots`/`readWrapperCallbacks` actually
    // read — and both of THOSE require the `?` in their own regex (`:74`,
    // `:114`). A required `sidebar: React.ReactNode;` or a required
    // `onThing: (x: string) => void;` matches neither reader, so skipping it
    // here on type alone — the first version of this line did — hid it from
    // all three: a real gap the guard exists to catch would pass silently.
    const re = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)?\s*(\w+)(\??):\s*([^\n]+?);/g;
    for (const [, doc, name, optional, rawType] of iface[1].matchAll(re)) {
        const type = rawType.trim();
        if (optional === '?' && type === 'React.ReactNode') continue; // a slot — readWrapperSlots already reads it
        if (optional === '?' && /^on[A-Z]/.test(name) && /=>\s*void$/.test(type)) continue; // a callback — readWrapperCallbacks already reads it
        const kind = /=>\s*React\.ReactNode$/.test(type) ? 'render-hook' : 'data';
        props.push({ react: name, kind, summary: doc ? summarise(doc) : '' });
    }

    if (!props.length) {
        throw new Error(
            `no data prop found in AparteChatProps (${SOURCES.react}). ` +
            'Either they are gone, or this parser stopped matching the source — ' +
            'both need a human, neither may pass silently.',
        );
    }
    return props;
}

/**
 * The few prop names that legitimately differ per wrapper, with why. Anything
 * NOT listed here is expected under the SAME name on all four — one surface,
 * one name is the whole premise of decision #4, so an alias is the exception
 * and earns a comment, never a silent default.
 */
export const DATA_PROP_ALIASES = {
    className: {
        // Vue merges any attribute the caller passes that is not a declared
        // prop onto a single-root component's own root element automatically
        // (`inheritAttrs` defaults to true) — there is no named prop to
        // declare, so `null` here routes to a structural proof instead of a
        // name lookup (see `vueFallthroughEnabled` below).
        vue: null,
        // `class` is a reserved word in JS, so the export is renamed at the
        // boundary: `let className = ''; export { className as class };`.
        svelte: 'class',
        // Angular's host element IS `<aparte-chat>` itself, so a class written
        // on the tag lands one level ABOVE the inner `.aparte-chat-container`
        // div that core's shell recipe keys on (`[overlay-composer]`,
        // `[data-aparte-empty]`) — it needed its own name, documented on the
        // `@Input` itself in aparte-chat.component.ts.
        angular: 'containerClass',
    },
    style: {
        vue: null, // same fallthrough mechanism as className, above.
        angular: 'containerStyle', // same reasoning as containerClass, above.
        // svelte: same name (`style`) — no alias needed.
    },
    renderBubble: {
        // Neither Vue nor Svelte has a scalar prop for this — it is the
        // `bubble` scoped/default slot in their templates, not a data prop.
        vue: 'bubble',
        svelte: 'bubble',
        // Angular has no per-message render-prop callback story; its
        // idiom is a `TemplateRef` `@Input` projected with `ngTemplateOutlet`.
        angular: 'bubbleTemplate',
    },
};

/** Comments stripped, then: is the prop declared as a field of Vue's `Props` interface? */
function vueHasProp(src, name) {
    const iface = stripComments(src).match(/interface Props\s*\{([\s\S]*?)\n\}/);
    return !!iface && new RegExp(`\\b${name}\\??:`).test(iface[1]);
}

/** `export let name`, or the rename idiom `export { internalName as name }` (className → class). */
function svelteHasProp(src, name) {
    const s = stripComments(src);
    return new RegExp(`export let ${name}\\b`).test(s) || new RegExp(`\\bas ${name}\\b`).test(s);
}

/**
 * `@Input() name`, `@Input('name')`, or `@Input({ alias: 'name', … })` — the
 * three shapes this file's own `@Input`s use (a plain field, or a
 * `set nameInput(…)` behind an aliased name).
 */
function angularHasInput(src, name) {
    const s = stripComments(src);
    return new RegExp(`@Input\\(\\)\\s*${name}\\b`).test(s)
        || new RegExp(`@Input\\('${name}'\\)`).test(s)
        || new RegExp(`@Input\\(\\{[^}]*alias:\\s*'${name}'`).test(s);
}

/** `<slot name="x">` (Vue and Svelte share this exact template syntax). */
function hasNamedSlot(src, name) {
    return stripComments(src).includes(`name="${name}"`);
}

/**
 * Vue's automatic attrs fallthrough (className/style) has exactly one way to
 * silently break: opting the component out of it. A negative check, because
 * there is no positive declaration to find — the mechanism is opt-out, not
 * opt-in.
 */
function vueFallthroughEnabled(src) {
    return !/inheritAttrs\s*:\s*false/.test(stripComments(src));
}

function resolveName(prop, wrapper) {
    return DATA_PROP_ALIASES[prop.react]?.[wrapper] ?? prop.react;
}

/**
 * How each wrapper declares a data prop or the `renderBubble` render hook.
 * Read the same way {@link IMPLEMENTATIONS} and {@link CALLBACK_PROOFS} are:
 * a name this proves `false` for is a prop with no working counterpart on
 * that wrapper, not a hand-kept list that can drift from the source.
 */
export const DATA_PROP_PROOFS = {
    react: {
        label: 'React',
        usage: (p) => `${p.react}={…}`,
        // The source of truth itself: a prop cannot be missing from where it is parsed.
        proves: () => true,
    },
    vue: {
        label: 'Vue',
        usage: (p) => {
            const alias = DATA_PROP_ALIASES[p.react]?.vue;
            if (alias === null) return `(inherited attribute — no named prop)`;
            return p.kind === 'render-hook' ? `<template #${resolveName(p, 'vue')}="{ message }">` : `:${resolveName(p, 'vue')}="…"`;
        },
        proves: (src, p) => {
            const alias = DATA_PROP_ALIASES[p.react]?.vue;
            if (alias === null) return vueFallthroughEnabled(src);
            const name = resolveName(p, 'vue');
            return p.kind === 'render-hook' ? hasNamedSlot(src, name) : vueHasProp(src, name);
        },
    },
    svelte: {
        label: 'Svelte',
        usage: (p) => {
            const name = resolveName(p, 'svelte');
            return p.kind === 'render-hook' ? `<svelte:fragment slot="${name}" let:message>` : `${name}={…}`;
        },
        proves: (src, p) => {
            const name = resolveName(p, 'svelte');
            return p.kind === 'render-hook' ? hasNamedSlot(src, name) : svelteHasProp(src, name);
        },
    },
    angular: {
        label: 'Angular',
        usage: (p) => `[${resolveName(p, 'angular')}]="…"`,
        proves: (src, p) => {
            const name = resolveName(p, 'angular');
            const declared = angularHasInput(src, name);
            // DECLARED IS NOT DISPATCHED (the lesson CALLBACK_PROOFS already
            // learned): a `bubbleTemplate` input nothing projects would sit
            // unused, so also require an `ngTemplateOutlet` bound to THIS
            // input's name specifically — not just the string anywhere in the
            // file, which would still pass with the binding pointed at `null`.
            if (p.kind === 'render-hook') {
                return declared && new RegExp(`\\[ngTemplateOutlet\\]\\s*=\\s*"${name}"`).test(stripComments(src));
            }
            return declared;
        },
    },
};

export const IMPLEMENTATIONS = {
    react: {
        label: 'React',
        usage: (s) => `${s.react}={…}`,
        // The source of truth itself: a prop cannot be missing from where it is read.
        proves: () => true,
        example: (s) => `<AparteChat ${s.react}={<MyThing />} />`,
        lang: 'tsx',
    },
    vue: {
        label: 'Vue',
        usage: (s) => `<template #${s.slot}>`,
        proves: (src, s) => stripComments(src).includes(`name="${s.slot}"`),
        example: (s) => `<AparteChat>\n  <template #${s.slot}><MyThing /></template>\n</AparteChat>`,
        lang: 'vue',
    },
    svelte: {
        label: 'Svelte',
        usage: (s) => `<svelte:fragment slot="${s.slot}">`,
        proves: (src, s) => stripComments(src).includes(`name="${s.slot}"`),
        example: (s) => `<AparteChat>\n  <svelte:fragment slot="${s.slot}"><MyThing /></svelte:fragment>\n</AparteChat>`,
        lang: 'svelte',
    },
    angular: {
        label: 'Angular',
        usage: (s) => `slot="${s.slot}"`,
        proves: (src, s) => stripComments(src).includes(`select="[slot='${s.slot}']"`),
        example: (s) => `<aparte-chat>\n  <div slot="${s.slot}"><app-my-thing /></div>\n</aparte-chat>`,
        lang: 'html',
    },
};
