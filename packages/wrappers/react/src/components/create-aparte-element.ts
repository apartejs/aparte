import type { ForwardRefExoticComponent, PropsWithoutRef, RefAttributes } from 'react';
import type { AparteElementSpec, AparteSpecAttributes, AparteSpecEvents, AparteSpecProperties } from '@aparte/core';
import { createAparteElement as createComponent, type AparteElementProps } from '../internal/element-component.js';

/** The detail an event of a spec carries. */
type DetailOf<E> = E extends { readonly detail: infer D } ? D : never;
/** `approvalModeChange` → `onApprovalModeChange`. */
type CallbackOf<E> = E extends { readonly name: infer N extends string } ? `on${Capitalize<N>}` : never;

/**
 * The props of a component made from `S`: the element's attributes by their HTML names, its
 * properties, and an `on…` callback per event, called with the detail, then the event.
 */
export type AparteSpecElementProps<S> =
    AparteElementProps<AparteSpecAttributes<S>>
    & Partial<AparteSpecProperties<S>>
    & {
        [K in keyof AparteSpecEvents<S> as CallbackOf<AparteSpecEvents<S>[K]>]?:
            (detail: DetailOf<AparteSpecEvents<S>[K]>, event: CustomEvent<DetailOf<AparteSpecEvents<S>[K]>>) => void;
    };

const pascal = (tag: string): string => tag.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

/**
 * A React component for an element a plugin — or you — describes with an `AparteElementSpec`:
 * the same kind of component `@aparte/react` generates for each element of core.
 *
 * Its props are the element's attributes by their HTML names, its properties, and a callback per
 * event — `on` and the binding's name, called with the event's detail, then the event itself. It
 * applies them the same way under React 18 and 19: attributes written when they change,
 * properties assigned, events listened for once. The ref is the element.
 *
 * Call it once, at module level, and keep the result: a component made in a render is a new
 * component each time, and React would mount the element again.
 *
 * @example
 * ```tsx
 * import { createAparteElement } from '@aparte/react';
 * import { approvalModeElement } from '@aparte/plugin-approval';
 *
 * const ApprovalMode = createAparteElement(approvalModeElement);
 *
 * <ApprovalMode labels={{ plan: 'Plan first' }} onApprovalModeChange={(detail) => save(detail.mode)} />
 * ```
 */
export function createAparteElement<S extends AparteElementSpec>(
    spec: S,
): ForwardRefExoticComponent<PropsWithoutRef<AparteSpecElementProps<S>> & RefAttributes<HTMLElement>> {
    return createComponent<HTMLElement, AparteSpecElementProps<S>>(spec.tag, pascal(spec.tag), {
        attributes: spec.attributes,
        properties: spec.properties,
        events: spec.events.map(([type, name]) => [type, `on${name.charAt(0).toUpperCase()}${name.slice(1)}`] as const),
        initial: spec.initial,
    });
}
