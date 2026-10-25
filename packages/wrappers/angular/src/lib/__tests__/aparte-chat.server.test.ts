import { Component, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { AparteChatComponent } from '../aparte-chat.component';
import { AparteBubbleDirective } from '../aparte-bubble.directive';
import { AparteSegmentUIDirective, AparteToolUIDirective } from '../aparte-tool-ui.directive';
import { AparteUiComponent } from '../aparte-ui.component';
import { aparteGlobalConfig } from '@aparte/core';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent],
    template: `
      <aparte-chat centerWhenEmpty placeholder="Ask">
        <p slot="empty-state">Ask me anything…</p>
      </aparte-chat>
    `,
})
class ChatPage {}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent, AparteBubbleDirective],
    template: `
      <aparte-chat [messages]="messages">
        <ng-template aparteBubble let-message><div class="my-bubble">{{ message.content }}</div></ng-template>
      </aparte-chat>
    `,
})
class ChatWithMessagesPage {
    messages = [{ id: 'm1', role: 'assistant' as const, content: 'Rendered on the server', timestamp: 0 }];
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent, AparteToolUIDirective, AparteSegmentUIDirective],
    template: `
      <aparte-chat />
      <ng-template aparteToolUI="get_weather" let-tool><span class="weather-card">{{ tool.status }}</span></ng-template>
      <ng-template aparteSegmentUI="chart"><span class="chart-card"></span></ng-template>
    `,
})
class ChatWithToolUIPage {}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent, AparteUiComponent],
    template: `
      <aparte-chat>
        <aparte-ui slot="toolbar" name="my-token-counter" [props]="{ label: 'x' }" />
      </aparte-chat>
    `,
})
class ChatWithUiPage {}

// The context argument is what a server bootstrap needs since Angular 19.2's patch line (NG0401).
const render = (root: typeof ChatPage | typeof ChatWithMessagesPage | typeof ChatWithToolUIPage | typeof ChatWithUiPage) =>
    renderApplication(
        (context: BootstrapContext) => bootstrapApplication(root, {
            providers: [provideServerRendering(), provideExperimentalZonelessChangeDetection()],
        }, context),
        { document: '<!doctype html><html><head></head><body><app-root></app-root></body></html>', url: '/' },
    );

describe('AparteChatComponent on the server', () => {
    it('renders the chat shell with no browser API at hand', async () => {
        const html = await render(ChatPage);
        expect(html).toContain('<aparte-chat');
        expect(html).toContain('aparte-chat-container');
        // The elements wait for hydration — the host among them, which is core's <aparte-chat>.
        expect(html).toMatch(/<aparte-chat[^>]*defer-hydration/);
        expect(html).toContain('<aparte-composer');
        expect(html).toContain('Ask me anything');
    });

    it('renders nothing for aparteToolUI on the server, and declares nothing there', async () => {
        const before = aparteGlobalConfig.getToolRenderer('get_weather');
        const html = await render(ChatWithToolUIPage);
        expect(html).toContain('<aparte-chat');
        expect(html).not.toContain('weather-card');
        expect(html).not.toContain('chart-card');
        // A registration on the server would be shared by every request the process serves.
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(before);
    });

    it("an <aparte-ui> builds no element on the server: hydration would leave it beside the browser's", async () => {
        const html = await render(ChatWithUiPage);
        expect(html).toContain('<aparte-ui');
        expect(html).not.toContain('<my-token-counter');
    });

    it('renders messages through a bubble template on the server', async () => {
        const html = await render(ChatWithMessagesPage);
        expect(html).toContain('Rendered on the server');
        expect(html).not.toContain('<aparte-chat-bubble');
    });
});
