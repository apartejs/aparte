/**
 * The framework versions each wrapper supports, read from its own package.json at build time —
 * the way `core-version.ts` reads core's version — so the framework pages state the peer ranges
 * the packages declare, not ranges someone once typed.
 */
import react from '../../../../packages/wrappers/react/package.json';
import vue from '../../../../packages/wrappers/vue/package.json';
import svelte from '../../../../packages/wrappers/svelte/package.json';
import angular from '../../../../packages/wrappers/angular/package.json';

export const WRAPPER_PEERS = {
    react: react.peerDependencies.react,
    vue: vue.peerDependencies.vue,
    svelte: svelte.peerDependencies.svelte,
    angular: angular.peerDependencies['@angular/core'],
    rxjs: angular.peerDependencies.rxjs,
    core: react.peerDependencies['@aparte/core'],
};
