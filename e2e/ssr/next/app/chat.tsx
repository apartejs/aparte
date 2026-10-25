'use client';

import { aparteGlobalConfig } from '@aparte/core';
import { setupApproval } from '@aparte/plugin-approval';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { AparteToolUI, useAparteClient, type AparteToolCallView } from '@aparte/react';

aparteGlobalConfig.registerAIProvider(createScenarioProvider({
    scenarios: {
        default: 'Hello from a server-rendered page.',
        weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
        forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
    },
}));
aparteGlobalConfig.registerTool(
    { name: 'get_weather', description: 'Current weather for a city.', inputSchema: { type: 'object', properties: { city: { type: 'string' } } } },
    async (call) => ({ toolCallId: call.id, content: 'Cloudy, 14 °C in Lille.' }),
);
// The toolbar's <aparte-approval-mode>: a plugin element that draws on connect, so it is the
// witness that a server-rendered toolbar hydrates. `auto` lets get_weather run unasked.
setupApproval({ classify: { read: ['get_weather'] }, mode: 'auto' });

function WeatherCard({ tool }: { tool: AparteToolCallView<{ city: string }> }) {
    return (
        <div data-testid="framework-weather-card">
            {tool.input.city}: {tool.status === 'resolved' ? tool.result : tool.status}
        </div>
    );
}

/** The client half of the page: the client that streams, and the card for get_weather. */
export function Chat() {
    useAparteClient();
    return <AparteToolUI<{ city: string }> name="get_weather">{(tool) => <WeatherCard tool={tool} />}</AparteToolUI>;
}
