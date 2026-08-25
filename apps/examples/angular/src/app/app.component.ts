import { Component } from '@angular/core';
import { AparteChatComponent } from '@aparte/angular';
// The plugin ships its own Angular binding, from its own package. `@aparte/angular` does
// not — a wrapper types what it depends on, and it depends on no plugin — so this import
// resolving at all IS the property: you get the directive exactly when you have the
// plugin. This example wrote the six-line directive by hand until the plugin shipped one.
import { AparteModelSelectorDirective } from '@aparte/plugin-model-selector/angular';
import { sendPrompt } from './aparte';

const CHIPS = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

@Component({
    selector: 'app-root',
    standalone: true,
    // The plugin's directive claims the tag, so CUSTOM_ELEMENTS_SCHEMA is gone.
    // That schema was here "for <aparte-model-selector>" — and it switched template
    // checking off for every unknown tag in this file, not just that one.
    imports: [AparteChatComponent, AparteModelSelectorDirective],
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
                @if (showModelPicker) {
                    <aparte-model-selector
                        slot="toolbar"
                        style="margin-inline-start:auto"
                        [autoSelect]="true"
                        [persist]="true"
                        [searchable]="true"
                        (modelChange)="onModelChange($event.modelId)"
                    ></aparte-model-selector>
                }
            </aparte-chat>
        </div>
    `,
})
export class AppComponent {
    // No AparteAiService.connect() here: provideAparte() (main.ts) auto-connects
    // the client on app init.
    protected readonly chips = CHIPS;

    /** The picker sits behind a control-flow block on purpose: `<aparte-ui>` could not. */
    protected readonly showModelPicker = true;

    protected send(prompt: string): void {
        sendPrompt(prompt);
    }

    /** `$event` is the event DETAIL, typed — `modelId` is checked, a typo is not. */
    protected onModelChange(modelId: string): void {
        console.info('[example-angular] model ->', modelId);
    }
}
