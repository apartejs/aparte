/**
 * aparté Vue wrapper
 * Vue 3 integration with Composition API and segment support
 */

import AparteChat from './components/AparteChat.vue';
export { AparteChat };

// Idiomatic ergonomics: a composable that owns the messages ref + component ref.
export { useAparteChat } from './composables/useAparteChat.js';
export type { UseAparteChat } from './composables/useAparteChat.js';
// The imperative surface `<AparteChat>` exposes via `defineExpose`, re-exported
// straight from `@aparte/core` — the single source of truth. It used to be
// aliased here as `AparteChatInstance` and as `AparteChatHandle` in React: one
// contract wearing three names in a suite that ships all four together.
export type { AparteChatImperativeApi } from '@aparte/core';

// Annex: client lifecycle, reactive conversation manager, universal proxy.
export { useAparteClient } from './composables/useAparteClient.js';
export { useConversationManager } from './composables/useConversationManager.js';
import AparteUi from './components/AparteUi.vue';
export { AparteUi };
export type { AparteUiProps, AparteUiHandle } from './types.js';

// Your components in tool calls and segments, through `Teleport`.
import AparteToolUI from './components/AparteToolUI.vue';
import AparteSegmentUI from './components/AparteSegmentUI.vue';
export { AparteToolUI, AparteSegmentUI };
export type { AparteToolCallView } from '@aparte/core';
// For `compilerOptions.isCustomElement`, so templates can use the elements without a warning.
export { isAparteElement } from './is-aparte-element.js';

export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Custom-element types for Vue templates
//
// Types only — nothing here reaches the bundle. `GlobalComponents` is how Vue's
// template checker (vue-tsc) learns a tag, so declaring it makes `<aparte-select
// :searchable="''">` complete and check like any component, and rejects an attribute
// that does not exist.
//
// Derived from `AparteElementAttributes` in core rather than listed, so an element
// added there is typed here the moment it is added, and one removed stops resolving.
// Listing tags by hand is what left React with nine of eighteen, all typed `any`.
//
// Three things the registry alone left out, each measured with vue-tsc before it was fixed:
//
//   • Vue looks a kebab-case attribute up by its CAMELCASE name, and the registry's keys are
//     kebab-case, so `:active-id` was never found and never checked: only a single-word
//     attribute (`:value`) was. The keys are camelized here, as a Vue prop is.
//   • A property-only member — `conversations` on the list — was not a prop. Vue sets a
//     property the element has, so `:conversations="rows"` works; it was just untyped.
//   • The events were not on the tag, so `$event` was `any`. The comment that stood here said
//     `HTMLElementEventMap` types them "through the DOM", which holds for a native element and
//     not for a component: vue-tsc reads a component's events from its `emits`. They are
//     declared as emits now, per tag, from what each element sends.
//
// The last two come from `generated/element-members.ts`, written from the manifest like the
// registry: an event added to an element reaches the template with no edit here.
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentOptionsMixin, DefineComponent } from 'vue';
import type { AparteAttrValue, AparteElementAttributes, AparteElementTagName } from '@aparte/core';
import type { AparteElementEvents, AparteElementProperties } from './generated/element-members.js';

/** `active-id` → `activeId`: the name Vue's template checker looks a kebab-case attribute up under. */
type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Head}${Capitalize<CamelCase<Tail>>}` : S;

/**
 * One attribute as a Vue template writes it: the template spelling every wrapper shares, and `true`
 * on a presence attribute. A bare attribute — `<aparte-select searchable>` — is the way a Vue
 * template writes any, and the checker types it `true` where an HTML tag gets `""`; both end up as
 * the attribute being there, which is all the element reads. `false` stays out: Vue would write
 * `searchable="false"`, which is on.
 */
type VueAttr<T> = T extends boolean ? true | '' | null | undefined : AparteAttrValue<T>;

/** An element's attributes under the names Vue looks them up by, in the spelling a template writes. */
type VueAttrs<A> = { [K in keyof A as K extends string ? CamelCase<K> : K]?: VueAttr<NonNullable<A[K]>> };

/** An event as a component declares it, so a listener receives the DOM event of that name. */
type Emits<E> = { [K in keyof E]: (event: E[K]) => void };

type AparteVueElements = {
    [K in AparteElementTagName]: DefineComponent<
        VueAttrs<AparteElementAttributes[K]> & AparteElementProperties[K],
        // Bindings, data, computed, methods and mixins: an element has none a template could use.
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- DefineComponent's own defaults
        {}, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin,
        Emits<AparteElementEvents[K]>
    >;
};

declare module 'vue' {
    interface GlobalComponents extends AparteVueElements {}
}
