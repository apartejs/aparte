/*
 * The wrapper slot surface, read from ONE source.
 *
 * Ratified decision #4 says `empty-state`, `above-composer` and `toolbar` exist on all
 * four wrappers. That was prose, and prose drifts: the same line claimed for months that
 * the parity was "Angular-only" — it was false, and nothing noticed. Worse, a wrong slot
 * name in Vue, Svelte or Angular renders NOTHING with no error, so a wrapper could quietly
 * lose a slot and every test would stay green.
 *
 * The source of truth is React's `AparteChatProps`: the only one of the four where the
 * names AND their documentation live in the type system. A slot there is a prop typed
 * `React.ReactNode` — that is a mechanical signal, not a hand-kept list, so a slot added
 * to React shows up here (and in the docs, and in the parity check) with no second edit.
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
 * `on:messageSent` in Svelte, `(messageSent)` in Angular. Verified against all four
 * sources by check-wrapper-slots, so a wrapper that renames one is caught rather than
 * silently documented wrong.
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
