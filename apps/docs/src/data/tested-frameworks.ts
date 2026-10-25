/**
 * The framework versions the wrappers are TESTED with — read from the package.json of the
 * examples the browser suite drives, of the wrappers' own test setups, and of the meta-framework
 * fixtures `pnpm e2e:ssr` builds and serves. What the pages print is what runs; a supported
 * range is `wrapper-peers.ts`, this is what proves part of it.
 *
 * The imports are static: a fixture renamed or removed fails the docs build here, it does not
 * quietly drop a line from a page.
 */
import reactExample from '../../../examples/react/package.json';
import vueExample from '../../../examples/vue/package.json';
import svelte4Example from '../../../examples/svelte4/package.json';
import svelte5Example from '../../../examples/svelte5/package.json';
import angularExample from '../../../examples/angular/package.json';
import angularWrapper from '../../../../packages/wrappers/angular/package.json';
import nextFixture from '../../../../e2e/ssr/next/package.json';
import nuxtFixture from '../../../../e2e/ssr/nuxt/package.json';
import sveltekitFixture from '../../../../e2e/ssr/sveltekit/package.json';
import angularSsrFixture from '../../../../e2e/ssr/angular/package.json';

type Deps = Record<string, string | undefined>;
const depsOf = (pkg: { dependencies?: Deps; devDependencies?: Deps }): Deps => ({ ...pkg.devDependencies, ...pkg.dependencies });

/** `^21.2.25` → `21`; `3.5.39` → `3.5` when `minor` is asked for. Throws on anything else. */
function version(pkg: { name: string; dependencies?: Deps; devDependencies?: Deps }, dep: string, minor = false): string {
    const range = depsOf(pkg)[dep];
    const m = /(\d+)\.(\d+)/.exec(range ?? '');
    if (!m) throw new Error(`tested-frameworks: ${pkg.name} declares no version of ${dep} (${range}).`);
    return minor ? `${m[1]}.${m[2]}` : m[1]!;
}

export const TESTED_FRAMEWORKS = {
    /** Driven in a browser by the example of each wrapper. */
    react: version(reactExample, 'react'),
    vue: version(vueExample, 'vue', true),
    svelte: [version(svelte4Example, 'svelte'), version(svelte5Example, 'svelte')],
    /** The wrapper's unit tests run on its oldest supported major; its example on the newest one tested. */
    angular: [version(angularWrapper, '@angular/core'), version(angularExample, '@angular/core')],
    /** Built for production, served, and hydrated in a browser by `pnpm e2e:ssr`. */
    next: version(nextFixture, 'next'),
    nuxt: version(nuxtFixture, 'nuxt'),
    sveltekit: version(sveltekitFixture, '@sveltejs/kit'),
    angularSsr: version(angularSsrFixture, '@angular/ssr'),
};
