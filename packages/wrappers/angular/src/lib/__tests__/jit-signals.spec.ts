import { Component, Directive, TemplateRef, contentChild, inject, input, linkedSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Directive({ selector: 'ng-template[probeTpl]', standalone: true })
class ProbeTemplateDirective {
    readonly template = inject(TemplateRef);
}

@Component({
    selector: 'probe-host',
    standalone: true,
    template: `<span class="label">{{ label() }}</span><span class="local">{{ local() }}</span><span class="found">{{ tpl() ? 'yes' : 'no' }}</span>`,
})
class ProbeComponent {
    readonly label = input('initial', { alias: 'probeLabel' });
    readonly local = linkedSignal(() => this.label().toUpperCase());
    readonly tpl = contentChild(ProbeTemplateDirective);
}

@Component({
    standalone: true,
    imports: [ProbeComponent, ProbeTemplateDirective],
    template: `<probe-host probeLabel="from-parent"><ng-template probeTpl>x</ng-template></probe-host>`,
})
class ParentComponent {}

describe('Vitest compiles signal inputs and content queries', () => {
    it('an aliased input() follows setInput, and linkedSignal follows it', async () => {
        const fixture = TestBed.createComponent(ProbeComponent);
        fixture.componentRef.setInput('probeLabel', 'abc');
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('.label')?.textContent).toBe('abc');
        expect(el.querySelector('.local')?.textContent).toBe('ABC');
    });

    it('a template binding reaches the input, and contentChild finds the projected directive', async () => {
        const fixture = TestBed.createComponent(ParentComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('.label')?.textContent).toBe('from-parent');
        expect(el.querySelector('.found')?.textContent).toBe('yes');
    });
});
