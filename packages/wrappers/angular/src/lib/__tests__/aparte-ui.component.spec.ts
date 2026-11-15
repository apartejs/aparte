import { describe, it, expect, beforeEach } from 'vitest';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { AparteUiComponent } from '../aparte-ui.component';
import { registerAllComponents } from '@aparte/core';

// Real aparté elements — the whole point is that they are attribute-driven.
registerAllComponents();

/** Records what it is told: each attribute change it hears, and each assignment of `items`. */
class FxProbe extends HTMLElement {
    static get observedAttributes(): string[] { return ['mode']; }
    heard: string[] = [];
    sets = 0;
    private _items: unknown = null;
    get items(): unknown { return this._items; }
    set items(value: unknown) { this._items = value; this.sets++; }
    attributeChangedCallback(name: string): void { this.heard.push(name); }
}
if (!customElements.get('fx-probe')) customElements.define('fx-probe', FxProbe);

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

    // A prop bag handed again — a new object with the same values. The element hears an attribute
    // only when its value changes, and gets the object again every time (it may have been
    // mutated in place), so its setter can keep its state.
    it('handed an equal prop bag, writes no attribute again and hands the object again', async () => {
        const items = ['a'];
        const fixture = TestBed.createComponent(AparteUiComponent);
        (fixture.componentRef as any).setInput('name', 'fx-probe');
        (fixture.componentRef as any).setInput('props', { mode: 'ask', items });
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement.querySelector('fx-probe') as FxProbe;
        expect(el.heard).toEqual(['mode']);
        const sets = el.sets;
        (fixture.componentRef as any).setInput('props', { mode: 'ask', items });
        fixture.detectChanges();
        expect(el.heard).toEqual(['mode']);
        expect(el.sets).toBe(sets + 1);
        (fixture.componentRef as any).setInput('props', { mode: 'auto', items });
        fixture.detectChanges();
        expect(el.heard).toEqual(['mode', 'mode']);
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
