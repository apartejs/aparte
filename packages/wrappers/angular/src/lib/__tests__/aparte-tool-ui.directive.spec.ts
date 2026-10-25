import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@angular/compiler';
import {
    Component,
    Injectable,
    inject,
    input,
    provideExperimentalZonelessChangeDetection,
    signal,
    type OnDestroy,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { aparteGlobalConfig, registerAllComponents, registerDefaultRenderers, type AparteToolCallSegment } from '@aparte/core';
import { AparteSegmentUIDirective, AparteToolUIDirective } from '../aparte-tool-ui.directive';

registerAllComponents();

type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    updateSegment: (id: string, u: unknown) => void;
};

const call = (id: string, name: string, city = 'Paris'): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name, input: { city } },
} as AparteToolCallSegment);

function bubble(...segments: unknown[]): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    for (const s of segments) b.addSegment(s);
    return b;
}

const counters = { mounts: 0, unmounts: 0 };

/** Something the page provides, which a card in the template must be able to inject. */
@Injectable()
class ThemeService {
    readonly theme = 'brass';
}

@Component({
    selector: 'app-weather-card',
    standalone: true,
    template: `<span class="weather" [attr.data-theme]="themes.theme" [attr.data-instance]="instance">{{ city() }}:{{ status() }}</span>`,
})
class WeatherCardComponent implements OnDestroy {
    readonly themes = inject(ThemeService);
    readonly city = input('');
    readonly status = input('');
    readonly instance = ++counters.mounts;
    ngOnDestroy(): void { counters.unmounts++; }
}

@Component({
    standalone: true,
    imports: [AparteToolUIDirective, WeatherCardComponent],
    providers: [ThemeService],
    template: `
      @if (lower()) {
        <ng-template aparteToolUI="get_weather"><span class="lower"></span></ng-template>
      }
      @if (show()) {
        <ng-template aparteToolUI="get_weather" let-tool>
          <app-weather-card [city]="$any(tool.input).city" [status]="tool.status" />
        </ng-template>
      }
    `,
})
class PageComponent {
    readonly lower = signal(false);
    readonly show = signal(true);
}

@Component({
    standalone: true,
    imports: [AparteSegmentUIDirective],
    template: `<ng-template aparteSegmentUI="chart" let-segment><span class="chart">{{ $any(segment).points.join(',') }}</span></ng-template>`,
})
class ChartPageComponent {}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    // Core's registry redraws in a microtask.
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
}

function create<T>(component: new () => T): ComponentFixture<T> {
    TestBed.configureTestingModule({
        imports: [component],
        providers: [provideExperimentalZonelessChangeDetection()],
    });
    return TestBed.createComponent(component);
}

describe('aparteToolUI (Angular, zoneless)', () => {
    beforeEach(() => {
        registerDefaultRenderers();
        counters.mounts = 0;
        counters.unmounts = 0;
    });
    afterEach(() => {
        TestBed.resetTestingModule();
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('renders the content into each matching tool call', async () => {
        const fixture = create(PageComponent);
        await settle(fixture);
        const b = bubble(call('s1', 'get_weather', 'Paris'), call('s2', 'search'), call('s3', 'get_weather', 'Lille'));
        await settle(fixture);
        expect(Array.from(b.querySelectorAll('.aparte-tool-ui .weather'), (el) => el.textContent)).toEqual(['Paris:pending', 'Lille:pending']);
        expect(b.querySelector('[data-tool-name="search"]')).not.toBeNull();
    });

    it('keeps the context of where it is declared', async () => {
        const fixture = create(PageComponent);
        await settle(fixture);
        const b = bubble(call('s1', 'get_weather'));
        await settle(fixture);
        expect(b.querySelector('.weather')?.getAttribute('data-theme')).toBe('brass');
    });

    it('a result update re-renders the same instance', async () => {
        const fixture = create(PageComponent);
        await settle(fixture);
        const b = bubble(call('s1', 'get_weather'));
        await settle(fixture);
        const first = b.querySelector('.weather');
        b.updateSegment('s1', { status: 'resolved', result: '18°C' });
        await settle(fixture);
        expect(b.querySelector('.weather')).toBe(first);
        expect(first?.textContent).toBe('Paris:resolved');
        expect(counters.mounts).toBe(1);
    });

    it('takes over a card already on screen when it mounts late', async () => {
        const b = bubble(call('s1', 'get_weather'));
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        const fixture = create(PageComponent);
        await settle(fixture);
        expect(b.querySelector('.aparte-tool-ui .weather')?.textContent).toBe('Paris:pending');
    });

    it('unmounting it restores the default row on the card already on screen', async () => {
        const fixture = create(PageComponent);
        await settle(fixture);
        const b = bubble(call('s1', 'get_weather'));
        await settle(fixture);
        expect(b.querySelector('.weather')).not.toBeNull();
        fixture.componentInstance.show.set(false);
        await settle(fixture);
        expect(b.querySelector('.aparte-tool-ui')).toBeNull();
        expect(b.querySelector('[data-tool-name="get_weather"]')).not.toBeNull();
        expect(counters.unmounts).toBe(1);
    });

    it('two declarations for one tool: removing the lower one keeps the upper one', async () => {
        const fixture = create(PageComponent);
        fixture.componentInstance.lower.set(true);
        await settle(fixture);
        const b = bubble(call('s1', 'get_weather'));
        await settle(fixture);
        expect(b.querySelector('.weather')).not.toBeNull();
        fixture.componentInstance.lower.set(false);
        await settle(fixture);
        expect(b.querySelector('.weather')).not.toBeNull();
        expect(b.querySelector('.lower')).toBeNull();
    });
});

describe('aparteSegmentUI (Angular, zoneless)', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
        document.body.replaceChildren();
    });

    it('draws a segment type of your own, and follows its updates', async () => {
        const fixture = create(ChartPageComponent);
        await settle(fixture);
        const b = bubble({ id: 'c1', type: 'chart', points: [1, 2] });
        await settle(fixture);
        expect(b.querySelector('.aparte-segment-ui .chart')?.textContent).toBe('1,2');
        b.updateSegment('c1', { points: [1, 2, 3] });
        await settle(fixture);
        expect(b.querySelector('.chart')?.textContent).toBe('1,2,3');
    });
});
