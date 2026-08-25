/**
 * `<aparte-model-selector>` as a typed JSX intrinsic. Import once, anywhere:
 *
 * ```ts
 * import '@aparte/plugin-model-selector/react';
 * ```
 *
 * ## Why this lives here and not in `@aparte/react`
 *
 * A wrapper types what it depends on, and `@aparte/react` depends on no plugin. It once
 * did — for a day — and the reason that was wrong is the reason this file exists: a
 * third-party plugin's author cannot add a line to `@aparte/react`, so typing OUR plugin
 * there gave aparté's packages a privilege theirs could never have.
 *
 * Putting it in the plugin makes the property you actually want fall out of the module
 * graph: install this package and the tag is typed, don't and it isn't. TypeScript
 * enforces that; nobody has to remember it.
 *
 * ## Why a subpath rather than the main entry
 *
 * A `declare module 'react'` block only compiles where React's types resolve. In the
 * main entry it would break every Vue and Svelte consumer of this plugin with
 * `TS2664: Invalid module name in augmentation` — which is exactly the error the docs'
 * own snippet checker raised when this was first written into a shared file.
 *
 * The attribute facts come from `./generated/element-attributes.js`, generated from this
 * package's own custom-elements manifest, so this file states no fact of its own and has
 * nothing to keep in step. `AparteTemplateAttrs` from core supplies the template
 * spelling — a presence attribute is `'' | null | undefined`, never `boolean`, because
 * React stringifies what it sets on a custom element and `searchable={false}` would
 * render `searchable="false"`, which an element testing `hasAttribute` reads as ON.
 */
import type * as React from 'react';
import type { AparteTemplateAttrs } from '@aparte/core';
import type { AparteElementAttributes, AparteElementTagName } from './generated/element-attributes.js';

type PluginIntrinsics = {
    [K in AparteElementTagName]:
        React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
        & AparteTemplateAttrs<AparteElementAttributes[K]>;
};

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX augmentation requires a namespace
    namespace JSX {
        interface IntrinsicElements extends PluginIntrinsics {}
    }
}

declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- React 19 resolves React.JSX
    namespace JSX {
        interface IntrinsicElements extends PluginIntrinsics {}
    }
}

export {};
