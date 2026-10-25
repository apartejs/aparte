import { Directive, TemplateRef, inject } from '@angular/core';
import type { AparteMessage } from '@aparte/core';

/**
 * Marks the template `<aparte-chat>` draws each message with, in place of
 * `<aparte-chat-bubble>`: write it as content of the chat, the message as `$implicit`.
 *
 * ```html
 * <aparte-chat [messages]="messages">
 *   <ng-template aparteBubble let-message>
 *     <app-bubble [message]="message" />
 *   </ng-template>
 * </aparte-chat>
 * ```
 *
 * The same thing as passing a `TemplateRef` to `[bubbleTemplate]`, written where Angular
 * developers write a per-item template. When both are given, `[bubbleTemplate]` wins.
 * The built-in action bar (retry, edit, the version picker) belongs to the native bubble;
 * a template of yours owns whatever it wires.
 */
@Directive({
    selector: 'ng-template[aparteBubble]',
    standalone: true,
})
export class AparteBubbleDirective {
    readonly template = inject<TemplateRef<{ $implicit: AparteMessage }>>(TemplateRef);
}
