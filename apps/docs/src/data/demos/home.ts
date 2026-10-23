/**
 * The home page's demos: the same chat in three skins, side by side, each as far from the others
 * as a skin can take it. Tokens set the palette and the shapes, an icon set and an avatar provider
 * change the glyphs, and since nothing hides in a shadow root, a plain selector reaches the rest.
 * The code a reader opens starts with what makes the skin; the chat under it is the same three
 * times. See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

/** One conversation, worn by every skin, so the skin is the only thing that changes. */
const chat = `<aparte-chat style="height: 28rem">
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Can it match our brand?"></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Yes: colours, shapes, fonts, icons and avatars are all yours to set."></aparte-chat-bubble>
    </aparte-chat-viewport>
    <aparte-composer placeholder="Ask anything">
      <div class="aparte-composer-shell">
        <div class="aparte-composer-row">
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
      </div>
    </aparte-composer>
  </aparte-chat>`;

export const HOME_DEMOS: DemoEntry[] = [
    {
        id: 'home-skin-default',
        title: 'The chat as it ships',
        html: `<!-- Nothing set: the palette, the shapes and the glyphs core ships, light or dark with the page. -->
<style>
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>

<div class="skin">
  ${chat}
</div>`,
    },
    {
        id: 'home-skin-messenger',
        title: 'The same chat as a messenger',
        html: `<!-- A messenger: a bubble on both sides, a blue fill, round shapes and a round send,
     avatars, and a filled paper plane. -->
<style>
  .messenger {
    --aparte-primary: #2563eb;
    --aparte-primary-hover: #1d4ed8;
    --aparte-bg: #eef2f9;
    --aparte-surface-1: #ffffff;
    --aparte-surface-2: #e3e9f4;
    --aparte-text: #101828;
    --aparte-text-muted: #667085;
    --aparte-border: #d9e0ec;
    --aparte-radius-unit: 7px;
    --aparte-font-family: ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif;
  }
  /* A token core derives from the base is set where core declares it: on the chat. */
  .messenger aparte-chat {
    --aparte-radius-send-btn: 999px;
    --aparte-message-content-bg-user: var(--aparte-primary);
    --aparte-message-content-bg-assistant: #ffffff;
    --aparte-message-content-text-user: #ffffff;
    --aparte-message-content-padding-assistant: var(--aparte-message-content-padding);
  }
  /* A plain selector reaches any part: the assistant's bubble hugs its text. */
  .messenger .aparte-message[data-role="assistant"] .aparte-message-content {
    width: fit-content;
  }
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>

<script>
  const { aparteGlobalConfig } = window.aparte;
  // Avatars are a function that fills the avatar's element: initials here.
  aparteGlobalConfig.setAvatarProvider({
    render(role, host) { host.textContent = role === 'user' ? 'MO' : 'AI'; },
  });
  // An icon set is an object of SVG strings, one per glyph it replaces.
  aparteGlobalConfig.setIconProvider({
    send: () => '<svg class="aparte-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z"/></svg>',
  });
</script>

<div class="skin messenger" data-aparte-theme="light">
  ${chat}
</div>`,
    },
    {
        id: 'home-skin-terminal',
        title: 'The same chat as a terminal',
        html: `<!-- A terminal: dark and square, one monospaced face, no bubbles, the person's line a
     prompt, and a return key to send. -->
<style>
  .terminal {
    --aparte-primary: #3fb950;
    --aparte-primary-hover: #56d364;
    --aparte-bg: #0b0f14;
    --aparte-surface-1: #10161e;
    --aparte-surface-2: #18202b;
    --aparte-text: #d7e2ee;
    --aparte-text-muted: #7d8a99;
    --aparte-border: #233041;
    --aparte-radius-unit: 0px;
    --aparte-font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
    --aparte-font-scale: 0.95;
  }
  /* A token core derives from the base is set where core declares it: on the chat. */
  .terminal aparte-chat {
    --aparte-message-content-bg-user: transparent;
    --aparte-message-content-padding: 0;
  }
  /* Plain selectors: the person's line becomes a prompt, the names go quiet. */
  .terminal .aparte-message[data-role="user"] .aparte-message-content {
    display: flex;
    gap: 1ch;
  }
  .terminal .aparte-message[data-role="user"] .aparte-message-content::before {
    content: "$";
    color: var(--aparte-primary);
  }
  .terminal .aparte-name {
    color: var(--aparte-text-muted);
    text-transform: lowercase;
  }
  .terminal .terminal-return {
    font: 600 1.1rem var(--aparte-font-family);
  }
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>

<script>
  const { aparteGlobalConfig } = window.aparte;
  // An icon may be any markup: a return key in place of the plane.
  aparteGlobalConfig.setIconProvider({
    send: () => '<span class="terminal-return" aria-hidden="true">⏎</span>',
  });
</script>

<div class="skin terminal" data-aparte-theme="dark">
  ${chat}
</div>`,
    },
];
