/**
 * The Layout group's variants: the shell around a chat, its header and sidebar, the list of
 * conversations, the split. See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

/** The sidebar's four regions, with a list the script fills. */
const SIDEBAR_BODY = `
    <div class="aparte-sidebar__header">
      <span class="aparte-sidebar__brand">aparté</span>
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="New chat">
        <aparte-icon name="edit"></aparte-icon>
      </button>
    </div>
    <div class="aparte-sidebar__search aparte-field-group">
      <input class="aparte-field aparte-field--sm" type="search" placeholder="Search conversations" data-aparte-sidebar-search>
    </div>
    <div class="aparte-sidebar__body">
      <aparte-conversation-list active-id="c1"></aparte-conversation-list>
    </div>
    <div class="aparte-sidebar__footer">
      <span class="aparte-avatar aparte-avatar--sm">P</span> Paul
    </div>`;

/** Conversations from today back to last month, one pinned. */
const FILL_LIST = `
  const day = 864e5;
  document.querySelector('aparte-conversation-list').conversations = [
    { id: 'c0', title: 'Release checklist', updatedAt: Date.now() - 3 * day, pinnedAt: Date.now() },
    { id: 'c1', title: 'Deploy checklist', updatedAt: Date.now() },
    { id: 'c2', title: 'Rename the segment types', updatedAt: Date.now() - day },
    { id: 'c3', title: 'Tokens, not selectors', updatedAt: Date.now() - 4 * day },
    { id: 'c4', title: 'The first release', updatedAt: Date.now() - 20 * day },
  ];`;

export const LAYOUT_DEMOS: DemoEntry[] = [
    // ── Header ────────────────────────────────────────────────────────────────
    {
        id: 'app-header',
        title: 'The bar above the chat',
        html: `<!-- The toggle opens a sidebar from anywhere on the page; it shows under 48rem, or while the sidebar is closed. -->
<header class="aparte-app-header">
  <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle><aparte-icon name="menu"></aparte-icon></button>
  <span class="aparte-app-header__title">Deploy checklist</span>
  <div class="aparte-app-header__actions">
    <span class="aparte-tag">Large</span>
    <button class="aparte-btn aparte-btn--sm aparte-btn--ghost" type="button">Share</button>
  </div>
</header>`,
    },

    // ── Sidebar ───────────────────────────────────────────────────────────────
    {
        id: 'sidebar',
        title: 'The column beside the chat',
        html: `<!-- breakpoint="none": a column at any width. Type in the search field to filter the list. -->
<aparte-sidebar breakpoint="none" style="height: 24rem">${SIDEBAR_BODY}
</aparte-sidebar>

<script>${FILL_LIST}
</script>`,
    },
    {
        id: 'sidebar-drawer',
        title: 'The sidebar as a drawer',
        html: `<!-- Under its breakpoint the sidebar slides over the page. A breakpoint wider than this
     frame keeps it a drawer here: press the button, then Escape or the scrim to close it. -->
<div style="height: 24rem">
  <button class="aparte-btn aparte-btn--surface" type="button" data-aparte-sidebar-toggle>
    <aparte-icon name="menu"></aparte-icon> Conversations
  </button>
  <aparte-sidebar breakpoint="200rem" collapsed>${SIDEBAR_BODY}
  </aparte-sidebar>
</div>

<script>${FILL_LIST}
</script>`,
    },

    // ── Conversation list ─────────────────────────────────────────────────────
    {
        id: 'conversation-list',
        title: 'Conversations grouped by date',
        html: `<!-- It stores nothing: you assign the conversations, it renders the rows and tells you what was picked. -->
<aparte-conversation-list active-id="c1" style="max-width: 20rem"></aparte-conversation-list>

<script>${FILL_LIST}
</script>`,
    },
    {
        id: 'conversation-list-status',
        title: 'Conversations that answer, or wait for you',
        html: `<!-- With a conversation controller this is set for you, from the turn's own events. -->
<aparte-conversation-list active-id="c1" style="max-width: 20rem"></aparte-conversation-list>

<script>${FILL_LIST}
  const list = document.querySelector('aparte-conversation-list');
  // An AI is answering in the open conversation: its title shimmers.
  list.setConversationStatus('c1', 'running');
  // A run paused on a question for you, in a conversation you left: a mark beside it.
  list.setConversationStatus('c2', 'waiting');
</script>`,
    },
    {
        id: 'conversation-list-loading',
        title: 'The list while the conversations load',
        html: `<!-- loading until your store answers: a list that is not there yet is not an empty list. -->
<aparte-conversation-list loading style="max-width: 20rem"></aparte-conversation-list>`,
    },

    // ── Split ─────────────────────────────────────────────────────────────────
    {
        id: 'split-vertical',
        title: 'A split stacked top to bottom',
        html: `<!-- orientation="vertical": the chat above, the pane below, the seam dragged up and down. -->
<aparte-split orientation="vertical" position="62" breakpoint="none" style="height: 24rem">
  <aparte-chat>
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Run the tests."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Running them now; the output is in the pane below."></aparte-chat-bubble>
    </aparte-chat-viewport>
  </aparte-chat>
  <section class="aparte-split__pane">
    <!-- The pane is yours: here, a plain log. -->
    <pre tabindex="0" aria-label="Test output" style="margin: 0; padding: 1.25rem; font: 13px/1.6 var(--aparte-code-font-family)">✓ build
✓ unit tests
✓ browser tests</pre>
  </section>
</aparte-split>`,
    },

    // ── Launcher ──────────────────────────────────────────────────────────────
    {
        id: 'launcher',
        title: 'A chat in a corner of the page',
        html: `<!-- In a page it floats over the window; here, over this frame. Press the button, then it, Escape or ✕ to close.
     A support card: who answers at the top, a greeting, and three questions to start from. -->
<style>
  .support { display: flex; flex-direction: column }
  .support header { display: grid; padding: var(--aparte-space-3) var(--aparte-space-4); border-block-end: var(--aparte-border-width) solid var(--aparte-border) }
  .support header small { color: var(--aparte-text-muted) }
  .support aparte-chat { flex: 1; min-height: 0 }
</style>
<div style="height: 32rem"></div>
<aparte-launcher label="Help" breakpoint="none" style="--aparte-launcher-height: 26rem">
  <section class="support">
    <header><strong>Kilnhouse support</strong><small>Usually answers in a minute</small></header>
    <aparte-chat id="help">
      <aparte-chat-viewport>
        <aparte-chat-bubble message-id="hello" data-role="assistant" name="Assistant"
          content="Hi! I can track an order, change a delivery address or start a return."></aparte-chat-bubble>
      </aparte-chat-viewport>
      <aparte-composer placeholder="Ask about your order…">
        <aparte-suggestions suggestions='["Where is my order?", "Change my address", "Start a return"]'></aparte-suggestions>
        <div class="aparte-composer-shell">
          <div class="aparte-composer-row">
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>
    </aparte-chat>
  </section>
</aparte-launcher>

<script>
  // A help chat is read, not quoted: no copy button under the answers.
  window.aparte.aparteGlobalConfig.setBubbleActions({ copy: false });

  // The chat inside is an ordinary <aparte-chat>: here a script answers it; in a page, AparteClient.
  const chat = document.getElementById('help');
  let n = 0;
  chat.addEventListener('aparte-send', (event) => {
    // The greeting is already a message, so the starters go with the first question.
    chat.querySelector('aparte-suggestions').hidden = true;
    chat.viewport.appendMessage({ id: 'u' + ++n, role: 'user', content: event.detail.content, timestamp: Date.now() });
    chat.viewport.appendMessage({ id: 'a' + ++n, role: 'assistant', content: 'Your order left the warehouse this morning.', timestamp: Date.now() });
  });
</script>`,
    },
    {
        id: 'launcher-sheet',
        title: 'The launcher as a sheet on a phone',
        html: `<!-- Under its breakpoint the open chat fills the window and its button moves to the top corner.
     A breakpoint wider than this frame keeps it a sheet here. -->
<div style="height: 30rem"></div>
<aparte-launcher open breakpoint="200rem">
  <aparte-chat>
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Can I change my delivery address?"></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Yes, until the parcel ships. Which address should it go to?"></aparte-chat-bubble>
    </aparte-chat-viewport>
  </aparte-chat>
</aparte-launcher>`,
    },
];
