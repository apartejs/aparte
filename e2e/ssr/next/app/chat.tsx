'use client';

import { aparteGlobalConfig } from '@aparte/core';
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
