import {
    Directive,
    PLATFORM_ID,
    TemplateRef,
    ViewContainerRef,
    effect,
    inject,
    input,
    untracked,
    type EmbeddedViewRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
    aparteGlobalConfig,
    defineMountedSegmentRenderer,
    defineMountedToolRenderer,
    overrideSegmentRenderer,
    type AparteConfig,
    type AparteMountedView,
    type AparteSegmentBase,
    type AparteToolCallView,
    type AparteToolMatcher,
} from '@aparte/core';

/**
 * Create the template's view where it is declared — so its injector, and what your app
 * provides there, is the declaration's — then move its nodes into the element core gave.
 * The same move the CDK's portal outlet makes. `update` hands the view the next state and
 * checks it at once, which is what a zoneless app needs.
 */
function mountTemplate<V>(
    container: ViewContainerRef,
    template: TemplateRef<{ $implicit: V }>,
    host: HTMLElement,
    view: V,
): AparteMountedView<V> {
    const ref: EmbeddedViewRef<{ $implicit: V }> = container.createEmbeddedView(template, { $implicit: view });
    ref.detectChanges();
    for (const node of ref.rootNodes as Node[]) host.appendChild(node);
    return {
        update: (next) => {
            ref.context.$implicit = next;
            ref.detectChanges();
        },
        destroy: () => { ref.destroy(); },
    };
}

/**
 * Draws a tool call with your own template, for as long as the template is in the page.
 *
 * ```html
 * <ng-template aparteToolUI="get_weather" let-tool>
 *   <app-weather-card [tool]="tool" />
 * </ng-template>
 * ```
 *
 * `let-tool` is an `AparteToolCallView`; its `input` is the model's arguments, `unknown` until
 * the card narrows it — give the card the view (`input.required<AparteToolCallView>()`) and type
 * its arguments there.
 *
 * Every `get_weather` call is drawn with the template, the call's view as `$implicit`, and
 * given back to core's row when the template leaves. The view is created where you declare
 * the template, so the components in it inject what your app provides there. Underneath it is
 * core's `overrideToolRenderer` + `defineMountedToolRenderer`; nothing is declared in a server
 * render, and the cards are drawn in the browser.
 */
@Directive({
    selector: 'ng-template[aparteToolUI]',
    standalone: true,
})
export class AparteToolUIDirective {
    /** The tool this draws: a name, a `RegExp`, or `'*'` for every tool. */
    readonly name = input.required<AparteToolMatcher>({ alias: 'aparteToolUI' });
    /** The config to declare it on. Defaults to the global one. */
    readonly config = input<AparteConfig | undefined>(undefined, { alias: 'aparteToolUIConfig' });

    private readonly template = inject<TemplateRef<{ $implicit: AparteToolCallView }>>(TemplateRef);
    private readonly container = inject(ViewContainerRef);

    constructor() {
        const browser = isPlatformBrowser(inject(PLATFORM_ID));
        effect((onCleanup) => {
            const name = this.name();
            const target = this.config() ?? aparteGlobalConfig;
            if (!browser) return;
            const restore = untracked(() => target.overrideToolRenderer(
                name,
                defineMountedToolRenderer((host, view) => mountTemplate(this.container, this.template, host, view)),
            ));
            onCleanup(restore);
        });
    }

    /** Types `let-tool` in a strict template. */
    static ngTemplateContextGuard(_dir: AparteToolUIDirective, _ctx: unknown): _ctx is { $implicit: AparteToolCallView } {
        return true;
    }
}

/**
 * Draws a segment type with your own template — one your stream emits, or a built-in such as
 * `code` — the segment as `$implicit`. Taking the last declaration off a built-in type gives it
 * back to core's renderer.
 *
 * ```html
 * <ng-template aparteSegmentUI="chart" let-segment>
 *   <app-chart [segment]="segment" />
 * </ng-template>
 * ```
 *
 * `let-segment` is the base segment with its own fields: the component it is handed to types it.
 */
@Directive({
    selector: 'ng-template[aparteSegmentUI]',
    standalone: true,
})
export class AparteSegmentUIDirective {
    /** The segment `type` this draws. */
    readonly type = input.required<string>({ alias: 'aparteSegmentUI' });
    /** The config to declare it on. Defaults to the global one. */
    readonly config = input<AparteConfig | undefined>(undefined, { alias: 'aparteSegmentUIConfig' });

    private readonly template = inject<TemplateRef<{ $implicit: AparteSegmentBase }>>(TemplateRef);
    private readonly container = inject(ViewContainerRef);

    constructor() {
        const browser = isPlatformBrowser(inject(PLATFORM_ID));
        effect((onCleanup) => {
            const type = this.type();
            const target = this.config();
            if (!browser) return;
            const restore = untracked(() => {
                const renderer = defineMountedSegmentRenderer(type, (host, segment) => mountTemplate(this.container, this.template, host, segment));
                return target ? overrideSegmentRenderer(renderer, target) : overrideSegmentRenderer(renderer);
            });
            onCleanup(restore);
        });
    }

    // The segment's shape is the app's: `let-segment` is typed as the base, narrow it in a pipe
    // or a component input.
    static ngTemplateContextGuard(_dir: AparteSegmentUIDirective, _ctx: unknown): _ctx is { $implicit: AparteSegmentBase & Record<string, unknown> } {
        return true;
    }
}
