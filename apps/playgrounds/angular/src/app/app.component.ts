import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { AparteAiService, AparteChatComponent } from '@aparte/angular';
import { KEY_STORAGE, sendPrompt } from './aparte';

const CHIPS = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA], // for <aparte-model-selector>
    template: `
        <div class="app">
            <header class="topbar">
                <div class="brand">aparté <span>· angular</span></div>
                <input
                    class="key"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="OpenRouter API key — optional, stays in your browser"
                    [value]="apiKey()"
                    (change)="onKey($any($event.target).value)"
                />
            </header>

            <aparte-chat centerWhenEmpty placeholder="Ask anything…">
                <div slot="empty-state" class="welcome">
                    <h2>Start a conversation</h2>
                    <div class="suggestions">
                        @for (c of chips; track c.label) {
                            <button class="chip" (click)="send(c.prompt)">{{ c.label }}</button>
                        }
                    </div>
                </div>
                <aparte-model-selector slot="footer-right" auto-select persist searchable></aparte-model-selector>
            </aparte-chat>
        </div>
    `,
})
export class AppComponent {
    private readonly ai = inject(AparteAiService);
    protected readonly apiKey = signal(localStorage.getItem(KEY_STORAGE) ?? '');
    protected readonly chips = CHIPS;

    constructor() {
        this.ai.connect(); // start the AparteClient listening for aparte-send
    }

    protected onKey(value: string): void {
        this.apiKey.set(value);
        const trimmed = value.trim();
        if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
        else localStorage.removeItem(KEY_STORAGE);
    }

    protected send(prompt: string): void {
        sendPrompt(prompt);
    }
}
