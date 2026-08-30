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
    /**
     * Packages the preview document must import for this scenario, beyond core — today
     * only `'artifacts'`. Named per demo rather than imported site-wide: an
     * unconditional import would put the plugin's chunk in every element, segment,
     * class and demo frame on the site, for the one frame that uses it.
     */
    plugins?: string[];
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
        id: 'layout-reading-column',
        title: 'The reading column: an unboxed chat, the column from a token',
        html: `<!-- The ChatGPT shape. Do NOT box the chat — let it span whatever sizes it — and let
     \`--aparte-message-max-width\` draw the column: bubbles and the composer centre
     themselves inside the full-width transcript, so the scrollbar lands on the outer
     edge while the text stays readable. Boxing the chat instead moves the scrollbar in
     with it. -->
<aparte-chat style="height: 20rem; --aparte-message-max-width: 32rem">
  <aparte-chat-viewport>
    <aparte-chat-bubble message-id="u1" data-role="user" content="My chat runs the full width of the page. How do I get the centred column?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="You already have it: the column is a max-width on the content, not on the chat. Set --aparte-message-max-width and the bubbles centre themselves inside the full-width transcript."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="u2" data-role="user" content="And the scrollbar?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a2" data-role="assistant" name="Assistant" content="It stays on the transcript's own edge, which is the window's edge as long as nothing boxes the chat. Size the host; leave the chat alone."></aparte-chat-bubble>
  </aparte-chat-viewport>
  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>`,
    },
    {
        id: 'layout-split',
        title: 'The builder split: a chat beside a pane, on a seam you can drag',
        html: `<!-- Press the seam and move it, or tab to it and use the arrow keys — Shift for ten
     percent at a time, Home and End for the extremes, Enter to collapse, double-click to
     reset. \`--aparte-split-min\` is a CSS length, so the chat cannot be dragged narrower
     than 16rem whatever the percentage says: the browser clamps, nothing in JS parses a
     unit.

     The split stores nothing. \`position\` goes in, one \`aparte-split-resize\` comes out
     on release — persist from there.

     \`breakpoint="30rem"\` only because this frame is narrower than the 48rem default: set
     the width to 375 above and the split shows ONE pane, with the two buttons switching
     it through \`data-aparte-split-pane\` and no script at all.

     The buttons are hidden above that same width, which is the rule rather than the
     detail: above the breakpoint there is only one layout, so a control that switches
     panes has nothing to switch and would read as broken. Hide it with the media query
     the split already answers to. -->
<style>
  #split-panes { display: none }
  @media (max-width: 30rem) {
    #split-panes { display: flex; gap: var(--aparte-space-2); margin-block-end: var(--aparte-space-3) }
  }
</style>
<div id="split-panes">
  <button class="aparte-btn aparte-btn--sm aparte-btn--surface" type="button" data-aparte-split-pane="start">Chat</button>
  <button class="aparte-btn aparte-btn--sm aparte-btn--surface" type="button" data-aparte-split-pane="end">Preview</button>
</div>

<aparte-split position="38" breakpoint="30rem" style="height: 22rem; --aparte-split-min: 16rem; --aparte-split-max: 65%">
  <aparte-chat>
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Make the hero headline bigger and pin the header."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Done — the headline is 20px now and the header stays at the top while the page scrolls."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="u2" data-role="user" content="Give me more room for the preview."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a2" data-role="assistant" name="Assistant" content="That one is yours: drag the seam. I cannot reach past 65% either — the max is a CSS bound on the pane, not a rule I follow."></aparte-chat-bubble>
    </aparte-chat-viewport>
    <aparte-composer>
      <div class="aparte-composer-shell">
        <div class="aparte-composer-row">
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
      </div>
    </aparte-composer>
  </aparte-chat>
  <section class="aparte-split__pane">
    <iframe title="Preview" style="inline-size: 100%; block-size: 100%; border: 0"
            srcdoc="&lt;body style='margin:0; padding:28px; font:15px/1.6 system-ui, sans-serif; color:#1b1b1f; background:#fbf9f5'&gt;&lt;h1 style='margin:0 0 10px; font-size:20px'&gt;Your pane&lt;/h1&gt;&lt;p style='margin:0; color:#6b6b76'&gt;A preview frame, an editor, a canvas — whatever the chat is building. It is a real iframe, and the drag keeps tracking across it.&lt;/p&gt;&lt;/body&gt;"></iframe>
  </section>
</aparte-split>`,
    },
    {
        id: 'app-shell',
        title: 'The application shell: sidebar, header, chat',
        html: `<!-- Three pieces: the grid and the header are recipes, the sidebar is an element
     because it has behaviour. The toggle in the header needs no script — the sidebar
     listens for \`data-aparte-sidebar-toggle\` itself, and shows under 48rem.
     breakpoint="30rem" only because this frame is narrower than the shell's own 48rem:
     the column shows here, and at a phone's width it is a drawer behind the toggle. -->
<div class="aparte-app-shell" style="height: 24rem">
  <aparte-sidebar breakpoint="30rem">
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
  <header class="aparte-app-header">
    <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>☰</button>
    <span class="aparte-app-header__title">Deploy checklist</span>
    <div class="aparte-app-header__actions"><span class="aparte-tag">gpt-4.1</span></div>
  </header>
  <main class="aparte-app-shell__main">
    <aparte-chat>
      <aparte-chat-viewport>
        <aparte-chat-bubble message-id="u1" data-role="user" content="Where does the sidebar's state live?"></aparte-chat-bubble>
        <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="On the element: collapsed is an attribute you can set, read and persist."></aparte-chat-bubble>
      </aparte-chat-viewport>
      <aparte-composer>
        <div class="aparte-composer-shell">
          <div class="aparte-composer-row">
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>
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
        id: 'example-chatgpt-like',
        title: 'A ChatGPT-like assistant, assembled',
        plugins: ['scenario'],
        html: `<!-- The whole application, assembled from what ships: the shell grid and the header
     are recipes, the sidebar and the conversation list are elements, the chat is the
     chat. This frame talks to a SCRIPTED model (no key, no network) - type "haiku",
     "table", "code" or "weather" and watch the loop, the transcript and the tool call
     run for real. Everything but the model is what your users would get.
     The sidebar keeps the shell's own 48rem breakpoint: below 768px it is a drawer
     behind the toggle - the frame is a window of its own, so narrow the page (or press
     375) and watch it fold, exactly as it would on a phone. -->
<div class="aparte-app-shell" style="height: 42rem">
  <aparte-sidebar>
    <div class="aparte-sidebar__header">
      <span class="aparte-sidebar__brand">(aparté)</span>
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="New conversation">
        <aparte-icon name="edit"></aparte-icon>
      </button>
    </div>
    <div class="aparte-sidebar__search aparte-field-group">
      <input class="aparte-field aparte-field--sm" type="search" placeholder="Search conversations" aria-label="Search conversations" data-aparte-sidebar-search>
    </div>
    <div class="aparte-sidebar__body">
      <aparte-conversation-list active-id="c1"></aparte-conversation-list>
    </div>
    <div class="aparte-sidebar__footer">
      <span class="aparte-avatar aparte-avatar--sm">P</span> Paul
    </div>
  </aparte-sidebar>
  <header class="aparte-app-header">
    <!-- ☰ as text: \`menu\` is not a built-in glyph (it lives in the extended set behind
         \`@aparte/core/icons\`), and an icon that is not registered renders nothing. -->
    <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>☰</button>
    <span class="aparte-app-header__title">What is aparté?</span>
    <div class="aparte-app-header__actions"><span class="aparte-tag">scripted model</span></div>
  </header>
  <main class="aparte-app-shell__main">
    <!-- overlay-composer: the transcript's scroll surface spans the whole column and the
         composer floats over it, so the scrollbar runs to the bottom edge - the anatomy
         ChatGPT has, one attribute here. -->
    <aparte-chat attachments overlay-composer>
      <aparte-chat-viewport>
        <aparte-chat-bubble message-id="u1" data-role="user" content="What is aparté, in one sentence?"></aparte-chat-bubble>
        <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="A chat UI in Web Components with the agent loop inside - streaming markdown, tool calls a person approves, typed questions and branching, with zero dependencies. This whole screen is it: ask me for a haiku, a table, some code, or the weather."></aparte-chat-bubble>
      </aparte-chat-viewport>
      <aparte-composer>
        <div class="aparte-composer-shell">
          <aparte-composer-attachments></aparte-composer-attachments>
          <div class="aparte-composer-row">
            <aparte-composer-add-attachment></aparte-composer-add-attachment>
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
        </div>
      </aparte-composer>
    </aparte-chat>
  </main>
</div>

<script>
  const day = 864e5;
  const list = document.querySelector('aparte-conversation-list');
  list.conversations = [
    { id: 'c1', title: 'What is aparté?', updatedAt: Date.now() },
    { id: 'c2', title: 'Approve a tool call', updatedAt: Date.now() - day },
    { id: 'c3', title: 'Branch a reply', updatedAt: Date.now() - 3 * day },
    { id: 'c4', title: 'Theme it in three variables', updatedAt: Date.now() - 12 * day },
  ];
  // The header title follows the selected conversation - one listener, no framework.
  list.addEventListener('aparte-conversation-select', (e) => {
    const picked = list.conversations.find((c) => c.id === e.detail.id);
    if (picked) document.querySelector('.aparte-app-header__title').textContent = picked.title;
  });
</script>`,
    },
    {
        id: 'dialog',
        title: 'A settings dialog on the native <dialog>',
        html: `<!-- The browser's <dialog> wearing the kit's recipe. No script: the button's
     \`data-aparte-dialog-open\` names the dialog, \`data-aparte-dialog-close\` closes it,
     the backdrop click closes it too. -->
<button class="aparte-btn aparte-btn--surface" type="button" data-aparte-dialog-open="settings">Open settings</button>
<p class="aparte-field-hint" id="settings-result">Nothing saved yet.</p>

<dialog class="aparte-dialog" id="settings" aria-labelledby="settings-title">
  <div class="aparte-dialog__header">
    <h2 class="aparte-dialog__title" id="settings-title">Settings</h2>
    <button class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-dialog__close" type="button" aria-label="Close" data-aparte-dialog-close>
      <aparte-icon name="close"></aparte-icon>
    </button>
  </div>
  <div class="aparte-dialog__body">
    <div class="aparte-tabs aparte-tabs--underline" role="tablist">
      <button class="aparte-tabs__tab" role="tab" aria-selected="true" type="button">Model</button>
      <button class="aparte-tabs__tab" role="tab" aria-selected="false" type="button">Appearance</button>
    </div>
    <label class="aparte-field-label" for="endpoint">Endpoint</label>
    <input class="aparte-field" id="endpoint" value="http://localhost:11434/v1">
    <p class="aparte-field-hint">Any OpenAI-compatible server.</p>
  </div>
  <div class="aparte-dialog__footer">
    <button class="aparte-btn aparte-btn--ghost" type="button" data-aparte-dialog-close>Cancel</button>
    <button class="aparte-btn aparte-btn--primary aparte-btn--solid" type="button" data-aparte-dialog-close="saved">Save</button>
  </div>
</dialog>

<script>
  // The native close event carries the value of the control that closed it.
  document.getElementById('settings').addEventListener('close', (e) => {
    document.getElementById('settings-result').textContent =
      e.target.returnValue === 'saved' ? 'Saved.' : 'Closed without saving.';
  });
</script>`,
    },
    {
        id: 'layout-overlay',
        title: 'overlay-composer: the scroll surface spans the column, the composer floats over it',
        html: `<!-- One attribute. The transcript's scroll surface takes the WHOLE column - watch the
     scrollbar run past the composer to the bottom edge - and the composer floats over
     it. The viewport measures the floating stack and publishes \`--aparte-bottom-inset\`,
     so the last message, the spacer and the scroll button all clear it, and a composer
     that grows re-anchors a reader pinned at the bottom in the same pass. -->
<aparte-chat overlay-composer style="height: 20rem">
  <aparte-chat-viewport>
    <aparte-chat-bubble message-id="u1" data-role="user" content="Where does the scrollbar end now?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="At the very bottom of the chat - it runs behind the composer, because the scroll surface owns the whole column and the composer floats over it."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="u2" data-role="user" content="And nothing hides under the composer?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a2" data-role="assistant" name="Assistant" content="The viewport measures the floating stack and pads the transcript by exactly that much - grow the draft a few lines and watch this bubble stay clear of it."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="u3" data-role="user" content="Scroll up a little, too."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a3" data-role="assistant" name="Assistant" content="The scroll-to-bottom button floats just above the composer instead of behind it - its offset rides the same measured inset."></aparte-chat-bubble>
  </aparte-chat-viewport>
  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>`,
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
  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>`,
    },
    {
        id: 'layout-side-panel',
        title: 'The side panel: a chat docked in a host window',
        html: `<!-- A docked strip in a host window — an editor, a browser sidebar, a review panel.
     The host gives the width, so there is no room for a reading column inside it: lift
     the token and let the chat fill the band, with one border for the seam.

     Nothing else is needed. Below 520px of CHAT width the transcript switches to its
     narrow spacing on its own — a container query on the chat, not a media query on the
     page — so a 20rem strip and a phone share the same CSS. -->
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 20rem; height: 20rem; background: var(--aparte-surface-2)">
  <pre style="margin: 0; overflow: auto; padding: var(--aparte-space-4); font-size: 0.78rem; line-height: 1.7; color: var(--aparte-text-muted)">export function createOrder(cart, customer) {
  const lines = cart.items.map(toLine);
  const total = lines.reduce((sum, line) =&gt; sum + line.amount, 0);
  return { id: nextId(), customer, lines, total };
}

function toLine(item) {
  return { sku: item.sku, qty: item.qty, amount: item.qty * item.price };
}</pre>
  <aparte-chat style="border-inline-start: var(--aparte-border-width) solid var(--aparte-border); --aparte-message-max-width: none">
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Why is total a float here?"></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="Because price is. Money in a float rounds badly at the third order — keep amounts in minor units and divide only when you print."></aparte-chat-bubble>
      <aparte-chat-bubble message-id="u2" data-role="user" content="Fix toLine then."></aparte-chat-bubble>
    </aparte-chat-viewport>
    <aparte-composer>
      <div class="aparte-composer-shell">
        <div class="aparte-composer-row">
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
      </div>
    </aparte-composer>
  </aparte-chat>
</div>`,
    },
    {
        id: 'layout-empty-state',
        title: 'The welcome state: a centred composer until the first message',
        html: `<!-- \`center-empty\` is a welcome state the element owns: while the transcript is empty
     the composer sits in the middle of the chat and the element carries \`data-empty\`,
     which is the hook for your own welcome copy — the greeting below is that hook and
     nothing else. The first bubble to land slides it to the normal layout — no script
     of yours, no second component, and nothing to undo when the conversation is cleared
     again. -->
<style>
  .welcome { display: none; text-align: center; padding-block-end: var(--aparte-space-4) }
  .welcome strong { font-size: var(--aparte-font-size-lg) }
  aparte-chat[data-empty] .welcome { display: block }
</style>
<aparte-chat center-empty style="height: 20rem">
  <aparte-chat-viewport></aparte-chat-viewport>
  <p class="welcome"><strong>What are we building today?</strong></p>
  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>
<button class="aparte-btn aparte-btn--surface" type="button" id="seed" style="margin-block-start: 1rem">Send one</button>

<script>
  // Any bubble ends the welcome state, whoever put it there — a client, your own loop,
  // or this button. The element watches its own viewport for it.
  const seed = document.getElementById('seed');
  seed.addEventListener('click', () => {
    const viewport = document.querySelector('aparte-chat-viewport');
    viewport.appendMessage({ id: 'u1', role: 'user', content: 'What is a transport?', timestamp: Date.now() });
    viewport.appendMessage({
      id: 'a1',
      role: 'assistant',
      content: 'The seam between the chat and your model: browser-direct with your own key, or your own /api/chat with the key on the server.',
      timestamp: Date.now(),
    });
    seed.disabled = true;
  });
</script>`,
    },
    {
        id: 'layout-artifact',
        title: 'The builder split with an artifact: the card in the chat, the result in the pane',
        html: `<!-- The split earning its keep. The model returns a document, @aparte/plugin-artifacts
     renders it as the Code / Preview card with Copy and Download, and the wide pane is
     where your app mounts the result.

     \`setupArtifacts()\` is the whole wiring — the tool, the card on its result, the
     \`<artifact>\` grammar and the segment renderer — and it is also what puts the card's
     stylesheet on the page. Building the card by hand instead gets you an unstyled one.

     \`--aparte-artifact-body-max\` is the card's own knob (600px by default), turned down
     here so the whole card fits a documentation frame.

     In your app the first line is \`import { setupArtifacts } from '@aparte/plugin-artifacts'\`.
     This frame reads it off \`window.aparteArtifacts\` only because a classic script
     cannot import. -->
<aparte-split position="55" breakpoint="30rem" style="height: 30rem; --aparte-split-min: 18rem; --aparte-split-max: 75%">
  <aparte-chat style="--aparte-artifact-body-max: 11rem">
    <aparte-chat-viewport></aparte-chat-viewport>
    <aparte-composer>
      <div class="aparte-composer-shell">
        <div class="aparte-composer-row">
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
      </div>
    </aparte-composer>
  </aparte-chat>
  <section class="aparte-split__pane">
    <iframe id="mounted" title="The artifact, mounted" style="inline-size: 100%; block-size: 100%; border: 0"></iframe>
  </section>
</aparte-split>

<script>
  const { setupArtifacts, artifactSegment } = window.aparteArtifacts;
  setupArtifacts();

  const DOC = \`<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #1b1b1f; background: #fbf9f5 }
  main { max-width: 30rem; margin: 0 auto; padding: 3rem 1.5rem }
  h1 { font-size: 1.8rem; margin: 0 0 .6rem }
  p { color: #6b6b76; margin: 0 0 1.6rem }
  a { display: inline-block; padding: .6rem 1.1rem; border-radius: .5rem; background: #1b1b1f; color: #fff; text-decoration: none }
</style>
<main>
  <h1>A chat you can put anywhere</h1>
  <p>Web components, no framework, and the agent loop inside.</p>
  <a href="#">Read the guide</a>
</main>\`;

  // The pane is the app's, not the library's: mounting the document is one assignment.
  document.getElementById('mounted').srcdoc = DOC;

  const viewport = document.querySelector('aparte-chat-viewport');
  viewport.appendMessage({ id: 'u1', role: 'user', content: 'Draft the landing page for the beta.', timestamp: Date.now() });
  viewport.appendMessage({
    id: 'a1',
    role: 'assistant',
    timestamp: Date.now(),
    segments: [
      { id: 's1', type: 'text', content: 'Here is a first draft — the pane beside this is the same document, mounted.' },
      artifactSegment('s2', { mimeType: 'text/html', title: 'Landing page', content: DOC }),
    ],
  });
</script>`,
        plugins: ['artifacts'],
    },
];
