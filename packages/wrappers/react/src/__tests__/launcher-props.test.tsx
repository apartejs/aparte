/**
 * `<aparte-launcher>` from React, both ways a page writes it: as an element in JSX, and through
 * `<AparteUi>`, which spreads its props as attributes. `header` is ON by default, so OFF must
 * reach the element as the string `"false"` — removing the attribute is what ON looks like.
 * The JSX types already say so: a presence attribute is `""`, and `header` takes `"false"`,
 * the spelling that also holds before the element is defined and in a server render.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { registerAllComponents } from '@aparte/core';
import { AparteUi } from '../index';

registerAllComponents();

type Launcher = HTMLElement & { covers: boolean; maximized: boolean };

describe('<aparte-launcher> from React', () => {
    it('draws no header with header="false", and its own with a heading', () => {
        const { container, rerender } = render(<aparte-launcher open="" header="false" heading="Help"><div /></aparte-launcher>);
        const el = container.querySelector('aparte-launcher') as Launcher;
        expect(el.getAttribute('header')).toBe('false');
        expect(el.querySelector('.aparte-launcher__header')).toBeNull();
        rerender(<aparte-launcher open="" header="" heading="Help"><div /></aparte-launcher>);
        expect(el.querySelector('.aparte-launcher__title')?.textContent).toBe('Help');
    });

    it('passes maximizable="panel" and maximized through', () => {
        const { container } = render(<aparte-launcher open="" maximizable="panel" maximized=""><div /></aparte-launcher>);
        const el = container.querySelector('aparte-launcher') as Launcher;
        expect(el.maximized).toBe(true);
        expect(el.getAttribute('maximizable')).toBe('panel');
        expect(el.covers).toBe(false);
    });

    it('turns the header OFF through <AparteUi> too, which writes attributes', () => {
        const { container } = render(<AparteUi name="aparte-launcher" props={{ open: true, header: false, heading: 'Help' }} />);
        const el = container.querySelector('aparte-launcher') as Launcher;
        expect(el.getAttribute('header')).toBe('false');
        expect(el.querySelector('.aparte-launcher__header')).toBeNull();
    });
});
