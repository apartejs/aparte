import { bootstrapApplication } from '@angular/platform-browser';
import { provideAparte, AparteConfig } from '@aparte/angular';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import '@aparte/plugin-model-selector'; // registers <aparte-model-selector>
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { AppComponent } from './app/app.component';
import { KEY_STORAGE } from './app/aparte';

// provideAparte registers the providers + plugins, wires the AparteClient
// options and auto-connects the client on app init — no manual
// AparteAiService.connect() anywhere.
// Gate the composer until a model is selected.
setupMarkedProvider();
AparteConfig.setRequireModelSelection(true);

bootstrapApplication(AppComponent, {
    providers: [
        provideAparte({
            providers: [
                createOpenAICompatProvider(presets.OLLAMA),
                createOpenAICompatProvider(presets.LMSTUDIO),
                createOpenAICompatProvider(presets.OPENROUTER),
            ],
            clientOptions: {
                keyResolver: (providerId) =>
                    providerId === 'openrouter' ? (localStorage.getItem(KEY_STORAGE) ?? undefined) : undefined,
            },
        }),
    ],
}).catch((err) => console.error(err));
