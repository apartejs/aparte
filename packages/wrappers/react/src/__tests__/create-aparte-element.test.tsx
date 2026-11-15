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
