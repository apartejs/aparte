import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AparteChatComponent } from '@aparte/angular';
import { sendPrompt } from './aparte';


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
                <aparte-model-selector slot="toolbar" style="margin-inline-start:auto" auto-select persist searchable></aparte-model-selector>
            </aparte-chat>
        </div>
    `,
})
export class AppComponent {
    // No AparteAiService.connect() here: provideAparte() (main.ts) auto-connects
    // the client on app init.
    protected readonly chips = CHIPS;

    protected send(prompt: string): void {
        sendPrompt(prompt);
    }
}
