/**
 * The hello world the Svelte page starts with: a bare `<AparteChat />` from
 * `@aparte/svelte/runes`, the client started, a provider registered — no `messages`, no callback,
 * no state of yours. A send streams a reply.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { aparteGlobalConfig, registerAllComponents } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import HelloHost from './HelloHost.svelte';

registerAllComponents();
aparteGlobalConfig.registerAIProvider(createScenarioProvider({ turns: ['Hello from the scripted model, streamed.'] }));

describe('the Svelte 5 hello world', () => {
    it('a bare AparteChat streams with only the client started', async () => {
        const { container } = render(HelloHost);
        container.querySelector('aparte-composer')!.dispatchEvent(
            new CustomEvent('aparte-send', { detail: { content: 'Hi', timestamp: 1 }, bubbles: true, composed: true }),
        );
        await vi.waitFor(() => {
            const reply = container.querySelector('aparte-chat-bubble[data-role="assistant"]');
            expect(reply?.textContent).toContain('Hello from the scripted model, streamed.');
        }, { timeout: 5000 });
    });
});
