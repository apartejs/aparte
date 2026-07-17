import { bootstrapApplication } from '@angular/platform-browser';
import { provideAparte } from '@aparte/angular';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { AppComponent } from './app/app.component';
import { KEY_STORAGE } from './app/aparte';

// provideAparte registers the providers + plugins and wires the AparteClient
// options; AppComponent calls AparteAiService.connect() to start it.
bootstrapApplication(AppComponent, {
    providers: [
        provideAparte({
            providers: [
                createOpenAICompatProvider(presets.OLLAMA),
                createOpenAICompatProvider(presets.LMSTUDIO),
                createOpenAICompatProvider(presets.OPENROUTER),
            ],
            plugins: {
                // 0-arg loaders → provideAparte runs them (registers the plugins).
                markdown: () => import('@aparte/plugin-marked').then((m) => m.setupMarkedProvider()),
                actions: [() => import('@aparte/plugin-model-selector').then(() => undefined)],
            },
            clientOptions: {
                keyResolver: (providerId) =>
                    providerId === 'openrouter' ? (localStorage.getItem(KEY_STORAGE) ?? undefined) : undefined,
            },
        }),
    ],
}).catch((err) => console.error(err));
