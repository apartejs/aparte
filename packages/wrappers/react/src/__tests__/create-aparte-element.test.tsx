import React from 'react';
import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { AparteElementSpec } from '@aparte/core';
import { createAparteElement } from '../index';

/*
 * `createAparteElement(spec)`: a component for an element that is NOT core's — a plugin's, or the
 * app's own — from the spec its owner exports. The fixture below is nobody's element: a tag, an
 * attribute, a property and an event, and the spec that describes them.
 */

class FixtureWidget extends HTMLElement {
    static get observedAttributes(): string[] { return ['label']; }
    items: string[] = [];
    pick(value: string): void {
        this.dispatchEvent(new CustomEvent('fx-widget-pick', { bubbles: true, detail: { value } }));
    }
}
if (!customElements.get('fx-widget')) customElements.define('fx-widget', FixtureWidget);

const fxWidgetElement: AparteElementSpec<
    { label?: string; compact?: boolean },
    { items?: string[] },
    { 'fx-widget-pick': { name: 'pick'; detail: { value: string } } }
> = {
    tag: 'fx-widget',
    attributes: ['label', 'compact'],
    properties: ['items'],
    events: [['fx-widget-pick', 'pick']],
    initial: [],
};

const FxWidget = createAparteElement(fxWidgetElement);

afterEach(() => cleanup());

describe('createAparteElement(spec)', () => {
    it('writes the attributes, assigns the properties and calls back with the detail', () => {
        const items = ['a', 'b'];
        const onPick = vi.fn();
        const ref = React.createRef<HTMLElement>();
        render(<FxWidget ref={ref} label="Hi" compact items={items} onPick={onPick} />);
        const el = ref.current as FixtureWidget;
        expect(el).toBeInstanceOf(FixtureWidget);
        expect(el.getAttribute('label')).toBe('Hi');
        expect(el.hasAttribute('compact')).toBe(true);
        expect(el.items).toBe(items);
        act(() => el.pick('b'));
        expect(onPick).toHaveBeenCalledWith({ value: 'b' }, expect.any(CustomEvent));
    });

    it('takes its name from the tag, and types its props from the spec', () => {
        expect(FxWidget.displayName).toBe('FxWidget');
        type Props = React.ComponentProps<typeof FxWidget>;
        expectTypeOf<Props['items']>().toEqualTypeOf<string[] | undefined>();
        expectTypeOf<NonNullable<Props['onPick']>>().parameter(0).toEqualTypeOf<{ value: string }>();
        // @ts-expect-error — not an attribute of the spec
        void (<FxWidget labels="x" />);
    });

    it('turns a boolean attribute off with false, and leaves an unchanged value alone', () => {
        const ref = React.createRef<HTMLElement>();
        const { rerender } = render(<FxWidget ref={ref} compact label="Hi" />);
        const el = ref.current!;
        const seen: string[] = [];
        new MutationObserver((list) => list.forEach((r) => seen.push(r.attributeName ?? ''))).observe(el, { attributes: true });
        rerender(<FxWidget ref={ref} compact={false} label="Hi" />);
        expect(el.hasAttribute('compact')).toBe(false);
        return Promise.resolve().then(() => expect(seen).toEqual(['compact']));
    });
});

describe('an element defined after its component mounts', () => {
    // A plugin's spec is data and defines nothing: an app that imports the spec at once and the
    // element lazily mounts the component first. The property was written straight onto the
    // element before its upgrade, as an OWN property, which shadows the setter the definition
    // brings, for good: the element never saw it.
    it('hands the property to its setter once it is defined, and keeps none of its own', async () => {
        const seen: unknown[] = [];
        const spec: AparteElementSpec<Record<string, never>, { data?: unknown }, Record<string, never>> = {
            tag: 'fx-late', attributes: [], properties: ['data'], events: [], initial: [],
        };
        const Late = createAparteElement(spec);
        const rows = [{ id: 1 }];
        const ref = React.createRef<HTMLElement>();
        render(<Late data={rows} ref={ref as never} />);
        expect(customElements.get('fx-late')).toBeUndefined();
        class FxLate extends HTMLElement {
            set data(value: unknown) { seen.push(value); }
            get data(): unknown { return seen.at(-1); }
        }
        customElements.define('fx-late', FxLate);
        await act(async () => { await customElements.whenDefined('fx-late'); await Promise.resolve(); });
        expect(seen).toEqual([rows]);
        expect(Object.prototype.hasOwnProperty.call(ref.current, 'data')).toBe(false);
    });
});
