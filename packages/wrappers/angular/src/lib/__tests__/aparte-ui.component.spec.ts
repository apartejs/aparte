import { describe, it, expect, beforeEach } from 'vitest';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { AparteUiComponent } from '../aparte-ui.component';
import { registerAllComponents } from '@aparte/core';

// Real aparté elements — the whole point is that they are attribute-driven.
registerAllComponents();

describe('AparteUiComponent', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [AparteUiComponent] }).compileComponents();
    });

    it('mounts the named element and applies props as ATTRIBUTES', async () => {
        // Regression: applyProps used to assign DOM *properties*. aparté elements are
        // attribute-driven (observedAttributes), so that was a silent no-op — and on
        // <aparte-composer>, whose `placeholder`/`disabled` are getter-only accessors,
        // it threw outright.
        const fixture = TestBed.createComponent(AparteUiComponent);
        (fixture.componentRef as any).setInput('name', 'aparte-composer');
        (fixture.componentRef as any).setInput('props', { placeholder: 'Ask…', '--glow-speed': '4s' });
        fixture.detectChanges();
        await fixture.whenStable();

        const el = fixture.nativeElement.querySelector('aparte-composer') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.getAttribute('placeholder')).toBe('Ask…');
        // The element's own getter reads the attribute back — i.e. it really took effect.
        expect((el as any).placeholder).toBe('Ask…');
        expect(el.style.getPropertyValue('--glow-speed')).toBe('4s');
    });

    it('maps true to a bare attribute and false to removal', async () => {
        const fixture = TestBed.createComponent(AparteUiComponent);
        (fixture.componentRef as any).setInput('name', 'aparte-composer');
        (fixture.componentRef as any).setInput('props', { disabled: true });
        fixture.detectChanges();
        await fixture.whenStable();

        const el = fixture.nativeElement.querySelector('aparte-composer') as HTMLElement;
        expect(el.hasAttribute('disabled')).toBe(true);
        expect((el as any).disabled).toBe(true);

        (fixture.componentRef as any).setInput('props', { disabled: false });
        fixture.detectChanges();
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('hands objects over as properties (an attribute cannot carry them)', async () => {
        const payload = { a: 1 };
        const fixture = TestBed.createComponent(AparteUiComponent);
        (fixture.componentRef as any).setInput('name', 'aparte-chat-bubble');
        (fixture.componentRef as any).setInput('props', { someData: payload });
        fixture.detectChanges();
        await fixture.whenStable();

        const el = fixture.nativeElement.querySelector('aparte-chat-bubble') as HTMLElement;
        expect((el as any).someData).toBe(payload);
        expect(el.hasAttribute('someData')).toBe(false);
    });

    it('forwards a DEFAULT_EVENTS event through elementEvent', async () => {
        const fixture = TestBed.createComponent(AparteUiComponent);
        (fixture.componentRef as any).setInput('name', 'aparte-composer');
        const seen: CustomEvent[] = [];
        fixture.componentInstance.elementEvent.subscribe((e: CustomEvent) => seen.push(e));
        fixture.detectChanges();
        await fixture.whenStable();

        const el = fixture.nativeElement.querySelector('aparte-composer') as HTMLElement;
        el.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        expect(seen).toHaveLength(1);
        expect(seen[0].type).toBe('aparte-send');
    });
});
