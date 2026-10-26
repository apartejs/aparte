/**
 * The demos an anatomy is drawn on: every part of a component present at once, so each can be
 * numbered in the frame and named in the legend under it (components/catalog/Anatomy.astro).
 * See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

export const ANATOMY_DEMOS: DemoEntry[] = [
    {
        id: 'composer-anatomy',
        title: 'The composer, with every part',
        html: `<aparte-composer placeholder="Ask about this file…">
  <div class="aparte-composer-shell">
    <aparte-composer-attachments></aparte-composer-attachments>
    <div class="aparte-composer-row">
      <aparte-composer-add-attachment accept="image/*,.pdf,.md"></aparte-composer-add-attachment>
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
    <aparte-composer-toolbar>
      <aparte-composer-action icon="tool" label="Use tools" action-id="tools"></aparte-composer-action>
    </aparte-composer-toolbar>
  </div>
</aparte-composer>

<script>
  // One file already picked, so the strip of pending files is on screen.
  document.querySelector('aparte-composer')
    .addAttachments([new File(['# Launch notes'], 'launch-notes.md', { type: 'text/markdown' })]);
</script>`,
    },
    {
        id: 'message-anatomy',
        title: 'A message, with every part',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" timestamp="2026-10-16T09:41:00"
  content="The direct one while you prototype, the backend one before you ship."></aparte-chat-bubble>

<script>
  const { aparteGlobalConfig } = window.aparte;
  aparteGlobalConfig.setAvatarProvider({ render(role, host) { host.textContent = role === 'user' ? 'P' : 'A'; } });
  aparteGlobalConfig.setBubbleActions({ copy: true, retry: true, feedback: true });
  // The second of two versions, so the picker is drawn.
  document.querySelector('aparte-chat-bubble').setSiblings(2, 1);
</script>`,
    },
];
