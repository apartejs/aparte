import { describe, it, expect, beforeEach } from 'vitest';
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { registerAllComponents } from '@aparte/core';
import type { AparteModelChangeEventDetail } from '@aparte/core';
import '../aparte-model-selector.js';
import {
    APARTE_ELEMENT_DIRECTIVES,
    AparteModelSelectorDirective,
} from '../generated/element.directives';

/*
 * What this covers that the wrapper's 109 tests do not.
 *
 * They exercise 17 directives from this same generator, so "does the generator emit
 * Angular that Angular accepts" is settled. What was NOT settled is this package: a
 * different manifest goes into the same emitter, and the result is compiled by a SEPARATE
 * `ngc` invocation into a SEPARATE package that a consumer imports as
 * `@aparte/plugin-model-selector/angular`. Nothing exercised that, which made it the one
 * real debt in the lot that introduced it.
 *
 * The assertions are all about the ATTRIBUTE, never a property, because that is the reason
 * a directive exists at all: Angular's default for `[persist]="true"` on a custom element
 * is to assign a property, which an attribute-driven element does not read.
 *
 * NOT asserted here, deliberately: that the published `dist/angular.js` carries
 * partial-Ivy declarations. `apps/examples/angular` imports this very directive from the
 * subpath and the CLI builds it AOT during `pnpm e2e`, so a plain-tsc overwrite of the
 * `ngc` output already fails there. A test reading `dist` would duplicate that and add a
 * dependency on build order.
 */

registerAllComponents();

@Component({
    standalone: true,
    imports: [...APARTE_ELEMENT_DIRECTIVES],
    template: `
        @if (shown) {
            <aparte-model-selector
                [placeholder]="placeholder"
                [persist]="persist"
                [autoSelect]="autoSelect"
                [searchable]="searchable"
                (modelChange)="last = $event"
            ></aparte-model-selector>
        }
    `,
})
class Host {
    placeholder: string | undefined = 'Pick a model';
    persist = false;
    autoSelect = false;
    searchable = false;
    shown = true;

    last: AparteModelChangeEventDetail | null = null;
}

describe('the plugin\'s generated Angular directive', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
    let host: Host;
    const el = (): HTMLElement | null =>
        fixture.nativeElement.querySelector('aparte-model-selector') as HTMLElement | null;
    const at = (): HTMLElement => el() as HTMLElement;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [Host] });
        fixture = TestBed.createComponent(Host);
        host = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('writes a string input as an ATTRIBUTE', () => {
        expect(at().getAttribute('placeholder')).toBe('Pick a model');
    });

    it('turns a true boolean input into the empty presence attribute', () => {
        host.persist = true;
        host.searchable = true;
        fixture.detectChanges();

        // `persist=""`, never `persist="true"`: the element tests presence, and a literal
        // "false" would read as ON — the trap the whole typed surface exists to close.
        expect(at().getAttribute('persist')).toBe('');
        expect(at().getAttribute('searchable')).toBe('');
    });

    it('REMOVES the attribute when a boolean input goes false', () => {
        host.searchable = true;
        fixture.detectChanges();
        expect(at().hasAttribute('searchable')).toBe(true);

        host.searchable = false;
        fixture.detectChanges();
        expect(at().hasAttribute('searchable')).toBe(false);
    });

    it('maps a camelCase input onto the element\'s real kebab attribute', () => {
        // `[autoSelect]` writes `auto-select`. A consumer never has to know that the
        // element's name is kebab while the binding reads as Angular.
        host.autoSelect = true;
        fixture.detectChanges();
        expect(at().getAttribute('auto-select')).toBe('');
        expect(at().hasAttribute('autoSelect')).toBe(false);
    });

    it('emits the event DETAIL, not the CustomEvent', () => {
        const detail: AparteModelChangeEventDetail = { providerId: 'openai', modelId: 'gpt-4o-mini' };
        at().dispatchEvent(new CustomEvent('aparte-model-change', { detail }));

        // `(modelChange)="use($event.modelId)"` is the idiom; `$event.detail.modelId`
        // would make the directive a worse `addEventListener`.
        expect(host.last).toEqual(detail);
    });

    it('puts the element in the template, so control flow reaches it', () => {
        // The thing `<aparte-ui>` cannot do: it creates its element imperatively in
        // ngAfterViewInit, so no @if, @for or projection ever applies to it. This host
        // wraps the tag in an @if, which is the case that used to be impossible.
        expect(el()).not.toBeNull();

        host.shown = false;
        fixture.detectChanges();
        expect(el()).toBeNull();
    });

    it('claims its tag, which is what spares the consumer CUSTOM_ELEMENTS_SCHEMA', () => {
        // Host declares no `schemas`, and it compiles — that is the assertion. The Angular
        // example carried `schemas: [CUSTOM_ELEMENTS_SCHEMA] // for <aparte-model-selector>`
        // until this directive existed, and that switches checking off for EVERY unknown tag.
        expect(fixture.componentInstance).toBeInstanceOf(Host);
        expect(APARTE_ELEMENT_DIRECTIVES).toContain(AparteModelSelectorDirective);
    });

    it('exports exactly the directives this package\'s manifest declares', () => {
        // One element, one directive. If the plugin ever gains a second, the generator
        // adds it here and this fails until the surface is acknowledged — which is the
        // point: the count is a fact about the manifest, not a preference.
        expect(APARTE_ELEMENT_DIRECTIVES).toHaveLength(1);
    });
});

/*
 * The suite above proves the mechanism. This proves the SURFACE: every attribute the
 * manifest declares reaches the element, and the one event it declares reaches its output.
 * A setter the generator failed to wire, or a listener naming an event the element does not
 * dispatch, is invisible to a sample and caught here.
 */
@Component({
    standalone: true,
    imports: [...APARTE_ELEMENT_DIRECTIVES],
    template: `
        <aparte-model-selector
            placeholder="p"
            [persist]="true"
            [autoSelect]="true"
            [searchable]="true"
            (modelChange)="seen['modelChange'] = true"
        ></aparte-model-selector>
    `,
})
class EverythingHost {
    readonly seen: Record<string, boolean> = {};
}

describe('the plugin\'s Angular surface, in full', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EverythingHost>>;
    const at = (): HTMLElement =>
        fixture.nativeElement.querySelector('aparte-model-selector') as HTMLElement;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [EverythingHost] });
        fixture = TestBed.createComponent(EverythingHost);
        fixture.detectChanges();
    });

    /** attribute, the value it must carry once written — all four the manifest declares. */
    const ATTRS: ReadonlyArray<readonly [string, string]> = [
        ['placeholder', 'p'],
        ['persist', ''],
        ['auto-select', ''],
        ['searchable', ''],
    ];

    it.each(ATTRS)('writes [%s]', (attr, expected) => {
        expect(at().getAttribute(attr)).toBe(expected);
    });

    /** event name, the key the host records it under — the one the manifest declares. */
    const EVENTS: ReadonlyArray<readonly [string, string]> = [
        ['aparte-model-change', 'modelChange'],
    ];

    it.each(EVENTS)('forwards %s', (event, key) => {
        at().dispatchEvent(new CustomEvent(event, {
            detail: { providerId: 'openai', modelId: 'm' },
        }));
        expect(fixture.componentInstance.seen[key]).toBe(true);
    });
});
