import { Component, input, signal } from '@angular/core';
import { AparteChatComponent, AparteToolUIDirective, type AparteToolCallView } from '@aparte/angular';
import type { AparteConfig } from '@aparte/core';

@Component({
    selector: 'app-weather-card',
    standalone: true,
    template: `<div data-testid="framework-weather-card">{{ city() }}: {{ tool().status === 'resolved' ? tool().result : tool().status }}</div>`,
})
export class WeatherCardComponent {
    readonly tool = input.required<AparteToolCallView>();
    city(): string { return (this.tool().input as { city: string }).city; }
}

// Rendered on the server and hydrated — no @defer around the chat.
@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent, AparteToolUIDirective, WeatherCardComponent],
    template: `
        <main style="display: block; height: 100vh">
            <aparte-chat centerWhenEmpty [conversationId]="conversationId()" [typingText]="typingText()" [config]="config()">
                <p slot="empty-state">Ask me anything…</p>
            </aparte-chat>
            <ng-template aparteToolUI="get_weather" [aparteToolUIConfig]="config()" let-tool>
                <app-weather-card [tool]="tool" />
            </ng-template>
        </main>
    `,
})
export class App {
    // Bound with the nullable values the inputs accept, so this app — `strict` and
    // `strictTemplates`, built against the PUBLISHED declarations — fails to compile when a
    // build drops `null` / `undefined` from them again (#124). All three are the inputs'
    // own defaults: nothing changes at runtime.
    readonly conversationId = signal<string | null>(null);
    readonly typingText = signal<string | undefined>(undefined);
    readonly config = signal<AparteConfig | undefined>(undefined);
}
