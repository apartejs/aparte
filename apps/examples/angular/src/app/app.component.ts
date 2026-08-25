import { Component, Directive, ElementRef, EventEmitter, Input, Output, HostListener, booleanAttribute, inject } from '@angular/core';
import { AparteChatComponent } from '@aparte/angular';
import { applyElementProps, type AparteModelChangeEventDetail } from '@aparte/core';
import { sendPrompt } from './aparte';

/**
 * `<aparte-model-selector>` comes from `@aparte/plugin-model-selector`, so
 * `@aparte/angular` does NOT ship a directive for it — a wrapper types what it depends
 * on, and it depends on no plugin. Doing otherwise would give aparté's own plugins a
 * privilege a third party's could never have: its author cannot add a line to core.
 *
 * So the app declares the binding, and this is the whole of it. `applyElementProps` is
 * core's own rule for the one non-obvious part — aparté elements are attribute-driven,
 * so a property write is a silent no-op — and the same six lines work for any custom
 * element, ours or yours.
 */
@Directive({ selector: 'aparte-model-selector', standalone: true })
export class ModelSelector {
    private readonly host = inject(ElementRef<HTMLElement>);
    @Input({ transform: booleanAttribute }) set persist(v: boolean) { this.write('persist', v); }
    @Input({ transform: booleanAttribute }) set autoSelect(v: boolean) { this.write('auto-select', v); }
    @Input({ transform: booleanAttribute }) set searchable(v: boolean) { this.write('searchable', v); }
    @Output() readonly modelChange = new EventEmitter<AparteModelChangeEventDetail>();

    @HostListener('aparte-model-change', ['$event'])
    protected onChange(e: CustomEvent<AparteModelChangeEventDetail>): void { this.modelChange.emit(e.detail); }

    private write(name: string, value: unknown): void {
        applyElementProps(this.host.nativeElement, { [name]: value });
    }
}


const CHIPS = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

@Component({
    selector: 'app-root',
    standalone: true,
    // The local `ModelSelector` above claims the tag, so CUSTOM_ELEMENTS_SCHEMA is gone.
    // That schema was here "for <aparte-model-selector>" — and it switched template
    // checking off for every unknown tag in this file, not just that one.
    imports: [AparteChatComponent, ModelSelector],
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
