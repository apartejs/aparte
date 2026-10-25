// The browser half of the page: the scripted model, the tool, and the client that streams.
import { defineNuxtPlugin } from 'nuxt/app';
import { AparteClient, aparteGlobalConfig } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';

export default defineNuxtPlugin(() => {
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
    new AparteClient().start();
});
