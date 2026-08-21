import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { AparteChatComponent } from '@aparte/angular';
import { AparteConfig, DEFAULT_LOCALE } from '@aparte/core';
import { KEY_STORAGE, sendPrompt } from './aparte';

// A real control, not a decoration: switching the locale renames the bubbles live
// AND flips the reading direction, composer included. A showcase button that changed
// nothing would break the library's own rule (#8) in the library's own showcase.
const RTL_LOCALE = {
    ...DEFAULT_LOCALE,
    direction: 'rtl' as const,
    roleNameUser: 'أنت',
    roleNameAssistant: 'المساعد',
};

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

            <aparte-chat centerWhenEmpty attachments placeholder="Ask anything…">
                <div slot="empty-state" class="welcome">
                    <h2>Start a conversation</h2>
                    <div class="suggestions">
                        @for (c of chips; track c.label) {
                            <button class="chip" (click)="send(c.prompt)">{{ c.label }}</button>
                        }
                    </div>
                </div>
                <!-- Two children, and the placement is the DOM order: the second one carries
                     margin-inline-start:auto, which pushes it -- logically, so it follows
                     the reading direction -- to the end of the row. -->
                <button slot="toolbar" class="chip" (click)="toggleLocale()">{{ rtl() ? 'English' : 'العربية' }}</button>
                <aparte-model-selector slot="toolbar" style="margin-inline-start:auto" auto-select persist searchable></aparte-model-selector>
            </aparte-chat>
        </div>
    `,
})
export class AppComponent {
    // No AparteAiService.connect() here: provideAparte() (main.ts) auto-connects
    // the client on app init.
    protected readonly apiKey = signal(localStorage.getItem(KEY_STORAGE) ?? '');
    protected readonly chips = CHIPS;
    protected readonly rtl = signal(false);

    protected toggleLocale(): void {
        this.rtl.set(!this.rtl());
        if (this.rtl()) AparteConfig.setLocale(RTL_LOCALE);
        else AparteConfig.resetLocale();
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
