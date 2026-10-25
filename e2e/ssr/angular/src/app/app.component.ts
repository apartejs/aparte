import { Component, input } from '@angular/core';
import { AparteChatComponent, AparteToolUIDirective, type AparteToolCallView } from '@aparte/angular';

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
            <aparte-chat centerWhenEmpty>
                <p slot="empty-state">Ask me anything…</p>
            </aparte-chat>
            <ng-template aparteToolUI="get_weather" let-tool>
                <app-weather-card [tool]="tool" />
            </ng-template>
        </main>
    `,
})
export class App {}
