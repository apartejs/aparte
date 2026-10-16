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
import type { DemoEntry } from './types';

export const GUIDE_DEMOS: DemoEntry[] = [
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
        id: 'branches-retry',
        title: 'Retry keeps every version; edit asks again',
        plugins: ['scenario'],
        html: `<!-- The model here is scripted, and each call takes the next of three replies, so a
     retry really answers differently. Retry the reply, then walk the versions with the
     arrows; edit the question to ask it again. -->
<aparte-chat placeholder="Ask anything" style="height: 24rem"></aparte-chat>

<script>
  const { aparteGlobalConfig } = window.aparte;
  const { createScenarioProvider } = window.apartePlugins.scenario;
  aparteGlobalConfig.registerAIProvider(createScenarioProvider({
    id: 'versions',
    name: 'Versions',
    turns: [
      'Cache it: the query is the same on every load, so keep its result for a minute.',
      'Batch it: the panel sends ten lookups one after the other. Send them as one request.',
      'Index it: the lookup reads the whole table. An index on the date column makes it instant.',
    ],
    models: [{ id: 'versions', name: 'Versions' }],
  }));
  aparteGlobalConfig.setModelConfig({ defaultProvider: 'versions', defaultModel: 'versions' });
  aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
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
<aparte-chat style="height: 26rem; --aparte-message-max-width: 32rem">
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

     Under its breakpoint (30rem here, narrower than the 48rem default so this frame shows
     both panes; restated in the style rule so the buttons agree) the split shows ONE pane: set the width to 375 above and the two buttons switch
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
     listens for \`data-aparte-sidebar-toggle\` itself, and shows under 48rem. This frame is
     narrower than 48rem, so the sidebar is a drawer behind that toggle; open the demo on
     its own page and the window is wide enough for the column. -->
<div class="aparte-app-shell" style="height: 24rem">
  <aparte-sidebar collapsed>
    <div class="aparte-sidebar__header">
      <span class="aparte-sidebar__brand">aparté</span>
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="New chat">
        <aparte-icon name="edit"></aparte-icon>
      </button>
      <!-- The header's toggle shows only while the sidebar is closed (or under 48rem):
           on a wide window, this one is what closes it. -->
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
        <aparte-icon name="menu"></aparte-icon>
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
    <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle><aparte-icon name="menu"></aparte-icon></button>
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
        id: 'layout-empty-state',
        title: 'The welcome state: a centred composer until the first message',
        html: `<!-- \`center-empty\` is a welcome state the element owns: while the transcript is empty
     the composer sits in the middle of the chat and the element carries \`data-empty\`,
     which is the hook for your own welcome copy — the greeting below is that hook and
     nothing else. The first bubble to land slides it to the normal layout — no script
     of yours, no second component, and nothing to undo when the conversation is cleared
     again. -->
<style>
  .welcome { display: none; text-align: center; padding-block-end: var(--aparte-space-4); color: var(--aparte-text-muted) }
  .welcome strong { display: block; font-size: var(--aparte-font-size-xl); color: var(--aparte-text); margin-block-end: var(--aparte-space-1) }
  aparte-chat[data-empty] .welcome { display: block }
</style>
<aparte-chat center-empty style="height: 24rem">
  <aparte-chat-viewport></aparte-chat-viewport>
  <p class="welcome"><strong>What are we building today?</strong>Ask anything, or start from one of these.</p>
  <aparte-composer>
    <!-- Starters: shown while the transcript is empty, gone with the first message. -->
    <aparte-suggestions empty-only
      suggestions='["Explain what a transport is", {"label": "Draft a changeset", "prompt": "Draft a changeset for a patch that renames an attribute."}, "Compare the four wrappers"]'>
    </aparte-suggestions>
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
     This frame reads it off \`window.apartePlugins.artifacts\` only because a classic script
     cannot import. -->
<aparte-split position="55" breakpoint="48rem" style="height: 30rem; --aparte-split-min: 18rem; --aparte-split-max: 75%">
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
  const { setupArtifacts, artifactSegment } = window.apartePlugins.artifacts;
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
    {
        id: 'theme-brand',
        title: 'The chat in a brand of its own',
        html: `<!-- Eight variables move the palette: the send button, the user's bubble, the surfaces,
     the borders, the text. Set on a wrapper that carries data-aparte-theme, they reach every
     part inside it, and the values worked out from them are worked out again there. -->
<style>
  .brand {
    --aparte-primary: #b45309;
    --aparte-primary-hover: #92400e;
    --aparte-bg: #fbf7f0;
    --aparte-surface-1: #ffffff;
    --aparte-surface-2: #f4ece0;
    --aparte-text: #241a12;
    --aparte-text-muted: #7c6f60;
    --aparte-border: #e7dccb;
    padding: 1rem;
    background: var(--aparte-bg);
  }
</style>

<div class="brand" data-aparte-theme="light">
  <aparte-chat style="height: 22rem">
    <aparte-chat-viewport>
      <aparte-chat-bubble message-id="u1" data-role="user" content="Can the chat wear our colours?"></aparte-chat-bubble>
      <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="It does: eight variables, and every part follows them."></aparte-chat-bubble>
    </aparte-chat-viewport>
    <aparte-composer placeholder="Ask anything">
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
        id: 'intro-chat',
        title: 'A scripted reply, with Markdown',
        plugins: ['scenario', 'markdown'],
        html: `<!-- The model here is scripted: no key, no network, the same replies every time.
     Everything else is the real thing - the loop, the transcript, the tool call. -->
<aparte-chat center-empty placeholder="Ask for a haiku, a table, some code or the weather..." style="height: 24rem"></aparte-chat>`,
    },
    {
        id: 'getting-started-scripted',
        title: 'A scripted reply, streaming',
        plugins: ['scenario', 'markdown'],
        html: `<!-- The model here is scripted: no key, no network, the same replies every time.
     Everything else is the real thing - the client, the loop, the transcript. -->
<aparte-chat center-empty placeholder="Ask for a haiku, a table or some code..." style="height: 22rem"></aparte-chat>`,
    },
    {
        id: 'customization-bubble-shell',
        title: 'The same message, in two shells',
        html: `<!-- The same message twice. The first bubble is the one core draws; the second is a
     shell of your own, scoped to that bubble alone by an instance config. A shell is markup:
     the bubble finds the hooks it knows by class and fills them, so the name, the
     content and the action bar keep working. The waiting indicator is the one hook whose
     inside is yours to write: the dots below are markup, not something the bubble adds. -->
<div class="two-up">
  <aparte-chat-bubble
    message-id="a1"
    data-role="assistant"
    name="Assistant"
    content="Retry does not overwrite a reply: it forks a sibling, and the picker walks them."
  ></aparte-chat-bubble>
  <div id="custom"></div>
</div>

<style>
  .two-up { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
  .my-card {
    border-inline-start: 3px solid var(--aparte-primary);
    border-radius: var(--aparte-radius-md);
    background: var(--aparte-surface-1);
    padding: var(--aparte-space-3);
  }
  .my-card__who { margin-block-end: var(--aparte-space-2); font-size: var(--aparte-font-size-sm); color: var(--aparte-text-muted); }
</style>

<script>
  const { AparteConfig, attachConfig } = window.aparte;

  // One config for this column only; the first bubble keeps the global one.
  const mine = new AparteConfig();
  mine.setBubbleShellRenderer((ctx) => \`
    <div class="aparte-message my-card" data-role="\${ctx.role}">
      <header class="my-card__who"><span class="aparte-name"></span></header>
      <div class="aparte-message-content">
        <div class="aparte-segments"></div>
        <div class="aparte-content"></div>
        <!-- The dots are yours to draw: the bubble only shows and hides this region. -->
        <div class="aparte-waiting" hidden>
          <span class="aparte-dots" aria-hidden="true">
            <span class="aparte-dot"></span><span class="aparte-dot"></span><span class="aparte-dot"></span>
          </span>
          <span class="aparte-sr-only"></span>
        </div>
      </div>
      <div class="aparte-footer"><div class="aparte-action-bar"></div></div>
    </div>\`);

  const custom = document.querySelector('#custom');
  attachConfig(custom, mine);

  // Created AFTER the boundary: a bubble renders its shell once, when it connects.
  const bubble = document.createElement('aparte-chat-bubble');
  bubble.setAttribute('message-id', 'a2');
  bubble.setAttribute('content', 'Retry does not overwrite a reply: it forks a sibling, and the picker walks them.');
  custom.appendChild(bubble);
  bubble.setAttribute('name', 'Assistant');   // the bubble writes it into .aparte-name
</script>`,
    },
];
