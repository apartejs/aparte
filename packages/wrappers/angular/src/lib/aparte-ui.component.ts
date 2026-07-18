import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    OnChanges,
    OnDestroy,
    AfterViewInit,
    SimpleChanges,
    ChangeDetectionStrategy,
    Input,
    output,
    Renderer2,
    inject
} from '@angular/core';
import { applyElementProps, DEFAULT_UI_EVENTS } from '@aparte/core';

/**
 * The imperative surface of the `AparteUi` proxy — the same
 * `getElement`/`callMethod` contract on all four wrappers.
 */
export interface AparteUiHandle {
    getElement<T extends HTMLElement = HTMLElement>(): T | null;
    callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined;
}

/**
 * AparteUiComponent - Universal UI Proxy
 *
 * A pass-through proxy component that dynamically injects any aparté
 * Web Component, so you don't need a dedicated Angular wrapper per element.
 *
 * @example
 * ```html
 * <aparte-ui
 *   name="aparte-model-selector"
 *   [props]="{
 *     placeholder: 'Ask anything...',
 *     '--glow-opacity': '1',
 *     '--glow-speed': '4s'
 *   }"
 *   (elementEvent)="onEvent($event)"
 * />
 * ```
 *
 * @description
 * - Keys starting with `--` are applied as CSS Variables
 * - Other keys are set as DOM properties on the element
 * - The events in `events` (default: {@link DEFAULT_UI_EVENTS}) bubble up via `elementEvent`
 */
@Component({
    selector: 'aparte-ui',
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<ng-container></ng-container>`,
    styles: [`
    :host {
      display: contents;
    }
  `]
})
export class AparteUiComponent implements AfterViewInit, OnChanges, OnDestroy, AparteUiHandle {
    private readonly renderer = inject(Renderer2);
    private readonly hostEl = inject(ElementRef);

    // ─────────────────────────────────────────────────────────────
    // Inputs
    // ─────────────────────────────────────────────────────────────

    /** The custom element tag name (e.g., 'aparte-model-selector') */
    @Input({ required: true }) name!: string;

    /** Properties to pass to the element. Keys starting with '--' are CSS vars */
    @Input() props: Record<string, unknown> = {};

    /**
     * Which custom events to forward through `elementEvent`. Defaults to the
     * interactive aparté surface ({@link DEFAULT_UI_EVENTS}); pass your own list to
     * listen to other events (e.g. `['aparte-composer-change']` for attachments).
     */
    @Input() events?: string[];

    // ─────────────────────────────────────────────────────────────
    // Outputs
    // ─────────────────────────────────────────────────────────────

    /** Emits a forwarded custom event from the underlying Web Component */
    readonly elementEvent = output<CustomEvent>();

    // ─────────────────────────────────────────────────────────────
    // Internal State
    // ─────────────────────────────────────────────────────────────

    /** The dynamically created Web Component element */
    private element: HTMLElement | null = null;

    /** Cleanup functions for event listeners */
    private eventCleanups: (() => void)[] = [];

    /** Joined key of the bound event set, so a fresh inline `[events]` array
     *  doesn't thrash the element — only a real change rebinds. */
    private lastEventsKey = '';

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    ngAfterViewInit(): void {
        this.createElement();
    }

    ngOnChanges(changes: SimpleChanges): void {
        // Recreate the element when `name` (or the forwarded event set) changes.
        const nameChanged = !!changes['name'] && !changes['name'].firstChange;
        const eventsChanged =
            !!changes['events'] &&
            !changes['events'].firstChange &&
            this.eventsKey() !== this.lastEventsKey;

        if (nameChanged || eventsChanged) {
            this.destroyElement();
            this.createElement();
        }

        // If props changed, update them
        if (changes['props'] && this.element) {
            this.applyProps();
        }
    }

    ngOnDestroy(): void {
        this.destroyElement();
    }

    // ─────────────────────────────────────────────────────────────
    // Element Management
    // ─────────────────────────────────────────────────────────────

    private eventsKey(): string {
        return (this.events ?? DEFAULT_UI_EVENTS).join('|');
    }

    private createElement(): void {
        if (!this.name) return;

        // Create the custom element
        this.element = this.renderer.createElement(this.name);

        // Apply initial props
        this.applyProps();

        // Setup event listeners
        this.setupEventListeners();

        // Append to host (not container, to avoid extra wrapper)
        this.renderer.appendChild(this.hostEl.nativeElement, this.element);
    }

    private destroyElement(): void {
        // Cleanup event listeners
        this.eventCleanups.forEach(cleanup => cleanup());
        this.eventCleanups = [];

        // Remove element
        if (this.element && this.element.parentNode) {
            this.renderer.removeChild(this.hostEl.nativeElement, this.element);
        }
        this.element = null;
    }

    /**
     * aparté elements are **attribute-driven** (`observedAttributes`): assigning a
     * property is either a silent no-op (nothing observes it) or throws outright on
     * a getter-only accessor — `<aparte-composer>`'s `placeholder`/`disabled` are
     * exactly that. So primitives go through `setAttribute`; only values an
     * attribute cannot carry (objects, functions) are handed over as properties.
     */
    private applyProps(): void {
        if (this.element) applyElementProps(this.element, this.props);
    }

    private setupEventListeners(): void {
        if (!this.element) return;

        this.lastEventsKey = this.eventsKey();
        (this.events ?? DEFAULT_UI_EVENTS).forEach(eventName => {
            const listener = (event: Event) => {
                this.elementEvent.emit(event as CustomEvent);
            };

            this.element!.addEventListener(eventName, listener);
            this.eventCleanups.push(() => {
                this.element?.removeEventListener(eventName, listener);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────

    /** Get the underlying Web Component element */
    getElement<T extends HTMLElement = HTMLElement>(): T | null {
        return this.element as T | null;
    }

    /** Call a method on the underlying element */
    callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined {
        if (!this.element) return undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const method = (this.element as any)[methodName];
        if (typeof method === 'function') {
            return method.apply(this.element, args) as T;
        }
        return undefined;
    }
}
