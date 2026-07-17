import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AparteUi } from '../components/AparteUi';
import { registerAllComponents } from '@aparte/core';

// Real aparté elements — the whole point is that they are attribute-driven.
registerAllComponents();

describe('AparteUi', () => {
    beforeEach(() => cleanup());

    it('mounts the named element and applies props as ATTRIBUTES', () => {
        // Regression: applyProps used to assign DOM *properties*. aparté elements are
        // attribute-driven (observedAttributes), so that was a silent no-op — and on
        // <aparte-composer>, whose `placeholder`/`disabled` are getter-only accessors,
        // it threw outright.
        const { container } = render(
            <AparteUi name="aparte-composer" props={{ placeholder: 'Ask…', '--glow-speed': '4s' }} />,
        );
        const el = container.querySelector('aparte-composer') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.getAttribute('placeholder')).toBe('Ask…');
        // The element's own getter reads the attribute back — i.e. it really took effect.
        expect((el as unknown as { placeholder: string }).placeholder).toBe('Ask…');
        // `--` keys stay CSS custom properties.
        expect(el.style.getPropertyValue('--glow-speed')).toBe('4s');
    });

    it('maps true to a bare attribute and false/null to removal', () => {
        const { container, rerender } = render(<AparteUi name="aparte-composer" props={{ disabled: true }} />);
        const el = container.querySelector('aparte-composer') as HTMLElement;
        expect(el.hasAttribute('disabled')).toBe(true);
        expect((el as unknown as { disabled: boolean }).disabled).toBe(true);

        rerender(<AparteUi name="aparte-composer" props={{ disabled: false }} />);
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('hands objects over as properties (an attribute cannot carry them)', () => {
        const payload = { a: 1 };
        const { container } = render(<AparteUi name="aparte-chat-bubble" props={{ someData: payload }} />);
        const el = container.querySelector('aparte-chat-bubble') as HTMLElement;
        expect((el as unknown as { someData: unknown }).someData).toBe(payload);
        expect(el.hasAttribute('someData')).toBe(false);
    });

    it('exposes the element and forwards a DEFAULT_EVENTS event', () => {
        const seen: CustomEvent[] = [];
        const { container } = render(
            <AparteUi name="aparte-composer" onElementEvent={(e) => seen.push(e)} />,
        );
        const el = container.querySelector('aparte-composer') as HTMLElement;
        el.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        expect(seen).toHaveLength(1);
        expect(seen[0].type).toBe('aparte-send');
    });
});
