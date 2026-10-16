/**
 * The home page's demos: the same chat in three skins, side by side. Each skin is the eight base
 * tokens of the theming guide set on a wrapper, so a reader sees in the code view everything a
 * rebrand takes. See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

/** One conversation, worn by every skin, so the skin is the only thing that changes. */
const chat = `<aparte-chat style="height: 26rem">
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Can it match our brand?"></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Yes: every colour, radius and font is a CSS variable. Set eight of them on any ancestor and the chat follows."></aparte-chat-bubble>
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
        html: `<!-- No variable set: the palette core ships, light or dark with the page. -->
<div class="skin">
  ${chat}
</div>

<style>
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>`,
    },
    {
        id: 'home-skin-studio',
        title: 'The same chat in a cool, rounded skin',
        html: `<!-- A light-only brand: the island says so, and sets the eight base tokens. -->
<div class="skin studio" data-aparte-theme="light">
  ${chat}
</div>

<style>
  .studio {
    --aparte-primary: #2f5bea;
    --aparte-primary-hover: #2449c4;
    --aparte-bg: #f3f6fc;
    --aparte-surface-1: #ffffff;
    --aparte-surface-2: #e8eef9;
    --aparte-text: #172036;
    --aparte-text-muted: #56607a;
    --aparte-border: #d6deec;
    --aparte-radius-unit: 5px;
  }
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>`,
    },
    {
        id: 'home-skin-terminal',
        title: 'The same chat in a dark, monospaced skin',
        html: `<!-- A dark-only brand, square and monospaced: the same eight tokens, plus the font, the
     scale every size derives from and the unit every corner does. -->
<div class="skin terminal" data-aparte-theme="dark">
  ${chat}
</div>

<style>
  .terminal {
    --aparte-primary: #3fb950;
    --aparte-primary-hover: #56d364;
    --aparte-bg: #0b0f14;
    --aparte-surface-1: #121821;
    --aparte-surface-2: #1a2230;
    --aparte-text: #d7e2ee;
    --aparte-text-muted: #8b98a8;
    --aparte-border: #263241;
    --aparte-radius-unit: 0px;
    --aparte-font-family: ui-monospace, 'Cascadia Code', Menlo, monospace;
    --aparte-font-scale: 0.96;
  }
  .skin { padding: 1rem; background: var(--aparte-bg); }
</style>`,
    },
];
