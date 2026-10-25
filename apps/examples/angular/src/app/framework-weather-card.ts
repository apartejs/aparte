/**
 * `?framework-card`: the `get_weather` call drawn by an Angular component (see
 * `_shared/framework-card.ts`). The declaration provides the site's name as a service, and the
 * card injects it — the template's view is created where the template is declared.
 */
import { Component, Injectable, inject, input, type OnDestroy, type OnInit } from '@angular/core';
import { AparteToolUIDirective, type AparteToolCallView } from '@aparte/angular';
import { SITE_NAME, noteCardMounted, noteCardUnmounted, weatherLine } from '../../../_shared/framework-card';

@Injectable()
export class SiteNameService {
    readonly name = SITE_NAME;
}

@Component({
    selector: 'app-weather-card',
    standalone: true,
    template: `<div class="framework-card" data-testid="framework-weather-card">{{ line() }} <small>· {{ site.name }}</small></div>`,
})
export class WeatherCardComponent implements OnInit, OnDestroy {
    readonly tool = input.required<AparteToolCallView>();
    readonly site = inject(SiteNameService);
    line(): string { return weatherLine(this.tool()); }
    ngOnInit(): void { noteCardMounted(); }
    ngOnDestroy(): void { noteCardUnmounted(); }
}

@Component({
    selector: 'app-framework-weather-card',
    standalone: true,
    imports: [AparteToolUIDirective, WeatherCardComponent],
    providers: [SiteNameService],
    template: `
        <ng-template aparteToolUI="get_weather" let-tool>
            <app-weather-card [tool]="tool" />
        </ng-template>
    `,
})
export class FrameworkWeatherCardComponent {}
