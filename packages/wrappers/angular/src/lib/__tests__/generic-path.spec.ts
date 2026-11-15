import { describe, it, expect, afterEach } from 'vitest';
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { registerAllComponents, type AparteMessage } from '@aparte/core';
import { AparteChatComponent } from '../aparte-chat.component';

/*
 * The Angular generic path: the host of `AparteChatComponent` IS `<aparte-chat>`, so an event
 * core has no output for — a plugin's, or the app's own — is a native `(aparte-some-event)`
 * binding on the tag, and fires once. It sits beside the generated outputs without doubling
 * them: `(linkClick)` and `(aparte-link-click)` each run once for one click.
 */

registerAllComponents();

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
      <aparte-chat [messages]="messages"
        (aparte-test-plugin-event)="plugin.push($event)"
        (linkClick)="links.push($event)"
        (aparte-link-click)="linkEvents.push($event)"></aparte-chat>
    `,
})
class GenericHost {
    messages: AparteMessage[] = [{ id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 }];
    plugin: CustomEvent[] = [];
    links: unknown[] = [];
    linkEvents: Event[] = [];
}

const fixtures: Array<ComponentFixture<GenericHost>> = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.destroy(); });

async function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GenericHost] });
    const fixture = TestBed.createComponent(GenericHost);
    fixtures.push(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    const de = fixture.debugElement.query(By.directive(AparteChatComponent));
    return { host: fixture.componentInstance, chat: de.componentInstance as AparteChatComponent, root: de.nativeElement as HTMLElement };
}

describe('<aparte-chat> and an event core does not know', () => {
    it('hears a plugin-shaped event sent from inside the chat, once, with its detail', async () => {
        const { host, root } = await render();
        root.querySelector('aparte-chat-bubble')!
            .dispatchEvent(new CustomEvent('aparte-test-plugin-event', { bubbles: true, detail: { x: 1 } }));
        expect(host.plugin).toHaveLength(1);
        expect(host.plugin[0].detail).toEqual({ x: 1 });
    });

    it('fires (linkClick) and (aparte-link-click) once each for one click', async () => {
        const { host, root } = await render();
        const detail = { href: 'https://example.com/', text: 'x' };
        root.querySelector('aparte-chat-bubble')!
            .dispatchEvent(new CustomEvent('aparte-link-click', { bubbles: true, cancelable: true, detail }));
        expect(host.links).toEqual([detail]);
        expect(host.linkEvents).toHaveLength(1);
    });

    it('returns the host from getElement() and the composer from getComposer()', async () => {
        const { chat, root } = await render();
        expect(chat.getElement()).toBe(root);
        expect(root.tagName.toLowerCase()).toBe('aparte-chat');
        expect(chat.getComposer()).toBe(root.querySelector('aparte-composer'));
    });
});
