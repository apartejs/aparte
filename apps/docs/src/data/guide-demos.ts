/**
 * The scenarios a GUIDE shows, each as one string.
 *
 * A guide needs something an element's `@example` cannot give it. That example is written
 * for the element's own reference page and shows the element's forms — `<aparte-chat>`'s is
 * two chats, one auto-filled and one hand-composed, which is right there and reads as a
 * duplicated composer anywhere else. A guide needs one STATE, chosen for the sentence it
 * sits under: a reply with siblings, a tool call waiting on a person.
 *
 * Each entry is read exactly twice — `<Demo>` prints it as the code block, and
 * `/preview/demo/[id]` mounts it in the frame. One string, so the picture and the code
 * cannot disagree; the same invariant the generated element pages already hold.
 *
 * The snippets run, which is what makes them worth more than the inert code blocks they
 * sit beside: a scenario that stops working stops rendering, visibly, on the page that
 * teaches it.
 *
 * A `<script>` here is a CLASSIC script — `PreviewDocument` revives it after the library
 * has loaded, so it can call methods on an upgraded element but it cannot `import`. That
 * is why every scenario below is driven through a public method (`setSiblings`,
 * `setSegments`) rather than through a module export.
 */
export interface GuideDemo {
    /** URL segment and `<Demo id>`. */
    id: string;
    /** Announced as the frame's title. */
    title: string;
    /** The scenario: markup, plus an optional classic script that drives it. */
    html: string;
}

export const GUIDE_DEMOS: GuideDemo[] = [
    {
        id: 'branch-picker',
        title: 'A reply with siblings, and the branch picker',
        html: `<!-- Retry does not overwrite: it forks a sibling. The picker is what walks them,
     and it appears on its own as soon as a message has more than one. -->
<aparte-chat-bubble
  message-id="a1"
  data-role="assistant"
  name="Assistant"
  content="You could cache the result — it is the same query every time."
></aparte-chat-bubble>

<script>
  // \`setSiblings\` is a method, not an attribute: the count comes from the tree,
  // so markup alone can never place this control.
  document.querySelector('aparte-chat-bubble').setSiblings(2, 0);
</script>`,
    },
    {
        id: 'tool-approval',
        title: 'A tool call paused for a person',
        html: `<!-- A tool marked \`needsApproval\` stops the turn BEFORE its handler runs. Core draws
     the pause: the row is the anchor, and the decision is asked at the composer. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    {
      id: 's1',
      type: 'tool_call',
      status: 'awaiting-approval',
      toolCall: { id: 't1', name: 'delete_file', input: { path: 'src/legacy/old-client.ts' } },
    },
  ]);
</script>`,
    },
    {
        id: 'layout-split',
        title: 'The builder split: a narrow chat beside a wide pane',
        html: `<!-- Two panes in a row. The chat is a flex item like any other: a width, a height
     on the row, and \`min-width: 0\` so a long code line cannot widen it. The pane on the
     right is yours — a preview iframe, an editor, a canvas. On a narrow screen show one
     at a time instead. -->
<div style="display: grid; grid-template-columns: minmax(16rem, 2fr) 3fr; height: 22rem; gap: 1px; background: var(--aparte-border)">
  <aparte-chat style="min-width: 0; background: var(--aparte-surface)">
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Make the header sticky."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Done — it now stays at the top while the page scrolls."></aparte-chat-bubble>
    </aparte-chat-viewport>
    <aparte-composer></aparte-composer>
  </aparte-chat>
  <div style="display: grid; place-items: center; background: var(--aparte-surface-2); color: var(--aparte-text-muted); font-size: 0.85rem">
    your preview pane
  </div>
</div>`,
    },
    {
        id: 'app-shell',
        title: 'The application shell: sidebar, header, chat',
        html: `<!-- Three pieces: the grid and the header are recipes, the sidebar is an element
     because it has behaviour. The toggle in the header needs no script — the sidebar
     listens for \`data-aparte-sidebar-toggle\` itself, and shows under 48rem. -->
<div class="aparte-app-shell" style="height: 24rem">
  <aparte-sidebar>
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
    </div>
  </aparte-sidebar>
  <header class="aparte-header">
    <button class="aparte-btn aparte-btn--icon aparte-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>☰</button>
    <span class="aparte-header__title">Deploy checklist</span>
    <div class="aparte-header__actions"><span class="aparte-tag">gpt-4.1</span></div>
  </header>
  <main class="aparte-app-shell__main">
    <aparte-chat>
      <aparte-chat-viewport>
        <aparte-chat-bubble message-id="u1" data-role="user" content="Where does the sidebar's state live?"></aparte-chat-bubble>
        <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="On the element: collapsed is an attribute you can set, read and persist."></aparte-chat-bubble>
      </aparte-chat-viewport>
      <aparte-composer></aparte-composer>
    </aparte-chat>
  </main>
</div>

<script>
  const day = 864e5;
  document.querySelector('aparte-conversation-list').conversations = [
    { id: 'c1', title: 'Deploy checklist', updatedAt: Date.now() },
    { id: 'c2', title: 'Rename the segment types', updatedAt: Date.now() - day },
    { id: 'c3', title: 'Tokens, not selectors', updatedAt: Date.now() - 4 * day },
    { id: 'c4', title: 'The first release', updatedAt: Date.now() - 60 * day },
  ];
</script>`,
    },
    {
        id: 'layout-feed',
        title: 'The full-width feed: no reading column',
        html: `<!-- \`--aparte-message-max-width: none\` lifts the centred column: bubbles and the
     composer run edge to edge with the transcript's own padding, the way a team-chat
     feed does. The same token, set on the chat rather than on :root, keeps it to this
     one instance. -->
<aparte-chat style="height: 18rem; --aparte-message-max-width: none">
  <aparte-chat-viewport>
    <aparte-chat-bubble message-id="u1" data-role="user" content="Is this the whole width?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Yes — no column here, just the transcript's padding on each side."></aparte-chat-bubble>
  </aparte-chat-viewport>
  <aparte-composer></aparte-composer>
</aparte-chat>`,
    },
];
