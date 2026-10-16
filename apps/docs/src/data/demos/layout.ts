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
];
