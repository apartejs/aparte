import { type ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { aparteGlobalConfig, provideAparte } from '@aparte/angular';
import { createScenarioProvider } from '@aparte/provider-scenario';

aparteGlobalConfig.registerTool(
    { name: 'get_weather', description: 'Current weather for a city.', inputSchema: { type: 'object', properties: { city: { type: 'string' } } } },
    async (call) => ({ toolCallId: call.id, content: 'Cloudy, 14 °C in Lille.' }),
);

export const appConfig: ApplicationConfig = {
    providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Hydration: the browser takes over the server's DOM rather than drawing it again.
        provideClientHydration(),
        provideAparte({
            providers: [createScenarioProvider({
                scenarios: {
                    default: 'Hello from a server-rendered page.',
                    weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
                    forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
                },
            })],
        }),
    ],
};
