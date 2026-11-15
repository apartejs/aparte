/**
 * @deprecated Since 1.10.0. Every plugin's element is bound the same way now, from the spec its
 * package exports (`modelSelectorElement`): use `AparteVueElement<typeof modelSelectorElement>` from `@aparte/vue`.
 * This entry keeps working until the next major.
 *
 * `<aparte-model-selector>` typed for Vue templates. Import once, anywhere:
 *
 * ```ts
 * import '@aparte/plugin-model-selector/vue';
 * ```
 *
 * A subpath rather than the main entry, and in the plugin rather than in `@aparte/vue`:
 * see `./react.ts` for both arguments, which are the same ones. In short — a `declare
 * module 'vue'` only compiles where Vue's types resolve, and a wrapper types only what
 * it depends on.
 *
 * The attributes come from this package's own generated registry, so nothing here is a
 * fact that can fall behind the element.
 */
import type { DefineComponent } from 'vue';
import type { AparteTemplateAttrs } from '@aparte/core';
import type { AparteElementAttributes, AparteElementTagName } from './generated/element-attributes.js';

type PluginComponents = {
    [K in AparteElementTagName]: DefineComponent<AparteTemplateAttrs<AparteElementAttributes[K]>>;
};

declare module 'vue' {
    interface GlobalComponents extends PluginComponents {}
}

export {};
