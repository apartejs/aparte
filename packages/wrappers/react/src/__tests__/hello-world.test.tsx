/**
 * The hello world the React page starts with: a bare `<AparteChat />`, the client started, a
 * provider registered — no `messages`, no callback, no state of yours. A send streams a reply.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { aparteGlobalConfig, registerAllComponents } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { AparteChat, useAparteClient } from '../index';

registerAllComponents();
aparteGlobalConfig.registerAIProvider(createScenarioProvider({ turns: ['Hello from the scripted model, streamed.'] }));

function Hello() {
    useAparteClient();
    return <AparteChat />;
}

describe('the React hello world', () => {
    it('a bare AparteChat streams with only the client started', async () => {
        const { container } = render(<Hello />);
        container.querySelector('aparte-composer')!.dispatchEvent(
            new CustomEvent('aparte-send', { detail: { content: 'Hi', timestamp: 1 }, bubbles: true, composed: true }),
        );
        await waitFor(() => {
            const reply = container.querySelector('aparte-chat-bubble[data-role="assistant"]');
            expect(reply?.textContent).toContain('Hello from the scripted model, streamed.');
        }, { timeout: 5000 });
    });
});
