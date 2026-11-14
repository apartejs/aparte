/**
 * A template takes `null` for ANY attribute, not only for a presence one.
 *
 * `useConversationManager().activeId` is a `string | null`, and the issue's own case is
 * `active-id={manager.activeId}`: with `string` as the whole type of a string attribute, that
 * line did not compile in React, Vue or Svelte, and the writer had to turn the `null` into
 * `undefined` by hand. All three remove an attribute whose value is `null` or `undefined`
 * (React and Svelte do not write it, Vue's `patchAttr` removes it), so `null` is as valid on a
 * string as it already was on a boolean — the type just did not say so.
 *
 * Types only: the assertions are checked by `tsc` (`typecheck:tests`), which is where this
 * file fails, not under vitest, where `expectTypeOf` is a no-op.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { AparteAttrValue, AparteTemplateAttrs } from '../element-attributes.js';

describe('AparteAttrValue', () => {
    it('lets a string attribute be removed with `null`', () => {
        expectTypeOf<AparteAttrValue<string>>().toEqualTypeOf<string | null>();
    });

    it('lets a literal union be removed with `null`, and keeps its literals', () => {
        expectTypeOf<AparteAttrValue<'chat' | 'page' | 'off'>>().toEqualTypeOf<'chat' | 'page' | 'off' | null>();
    });

    it('lets a numeric attribute be a number, the string it becomes, or `null`', () => {
        expectTypeOf<AparteAttrValue<number>>().toEqualTypeOf<number | string | null>();
    });

    it('leaves a presence attribute as it was: on with `\'\'`, off with `null` or `undefined`', () => {
        expectTypeOf<AparteAttrValue<boolean>>().toEqualTypeOf<'' | null | undefined>();
    });

    it('applies to every member of an element\'s attributes', () => {
        type Attrs = AparteTemplateAttrs<{ 'active-id'?: string; flat?: boolean; position?: number }>;
        expectTypeOf<Attrs['active-id']>().toEqualTypeOf<string | null | undefined>();
        expectTypeOf<Attrs['flat']>().toEqualTypeOf<'' | null | undefined>();
        expectTypeOf<Attrs['position']>().toEqualTypeOf<number | string | null | undefined>();
    });
});
