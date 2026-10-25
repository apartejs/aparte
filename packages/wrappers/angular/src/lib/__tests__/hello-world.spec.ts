/**
 * The hello world the Angular page starts with: a bare `<aparte-chat />` and `provideAparte`
 * with a provider — no `[messages]`, no output, no state of yours, zoneless. A send streams a reply.
 */
import { describe, it, expect, vi } from 'vitest';
import '@angular/compiler';
import { Component, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { registerAllComponents } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { AparteChatComponent } from '../aparte-chat.component';
import { provideAparte } from '../provide-aparte';

registerAllComponents();

@Component({
    standalone: true,
    imports: [AparteChatComponent],
    template: `<aparte-chat />`,
})
class HelloComponent {}

describe('the Angular hello world', () => {
    it('a bare AparteChat streams with only the client started', async () => {
        TestBed.configureTestingModule({
            imports: [HelloComponent],
            providers: [
                provideExperimentalZonelessChangeDetection(),
                provideAparte({ providers: [createScenarioProvider({ turns: ['Hello from the scripted model, streamed.'] })] }),
            ],
        });
        const fixture = TestBed.createComponent(HelloComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        el.querySelector('aparte-composer')!.dispatchEvent(
            new CustomEvent('aparte-send', { detail: { content: 'Hi', timestamp: 1 }, bubbles: true, composed: true }),
        );
        await vi.waitFor(() => {
            fixture.detectChanges();
            const reply = el.querySelector('aparte-chat-bubble[data-role="assistant"]');
            expect(reply?.textContent).toContain('Hello from the scripted model, streamed.');
        }, { timeout: 5000 });
    });
});
