/**
 * The framework versions each wrapper supports, read from its own package.json at build time —
 * the way `core-version.ts` reads core's version — so the framework pages state the peer ranges
 * the packages declare, not ranges someone once typed.
 */
import react from '../../../../packages/wrappers/react/package.json';
import vue from '../../../../packages/wrappers/vue/package.json';
import svelte from '../../../../packages/wrappers/svelte/package.json';
import angular from '../../../../packages/wrappers/angular/package.json';

const same = (a: string | undefined, b: string | undefined, what: string): string => {
    if (!a || a !== b) throw new Error(`wrapper-peers: ${what} declare different ranges (${a} / ${b}); the pages print one.`);
    return a;
};

/** The Svelte 5 alternative of the svelte peer: the range `@aparte/svelte/runes` can run on. */
const svelte5 = (range: string): string => {
    const alt = range.split('||').map((s) => s.trim()).find((s) => /^\^5\./.test(s));
    if (!alt) throw new Error(`wrapper-peers: the svelte peer (${range}) has no ^5 alternative; the runes entry needs one.`);
    return alt;
};

export const WRAPPER_PEERS = {
    react: same(react.peerDependencies.react, react.peerDependencies['react-dom'], 'react and react-dom'),
    vue: vue.peerDependencies.vue,
    svelte: svelte.peerDependencies.svelte,
    /** What the runes entry needs: the whole range also admits Svelte 4, which only the package root runs on. */
    svelteRunes: svelte5(svelte.peerDependencies.svelte),
    angular: same(angular.peerDependencies['@angular/core'], angular.peerDependencies['@angular/common'], '@angular/core and @angular/common'),
    rxjs: angular.peerDependencies.rxjs,
    core: [vue, svelte, angular].reduce((range, pkg) => same(range, pkg.peerDependencies['@aparte/core'], "the wrappers' @aparte/core peers"), react.peerDependencies['@aparte/core']),
};
