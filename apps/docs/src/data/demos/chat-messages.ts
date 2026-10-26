/**
 * The Chat group's variants for the conversation itself: the chat, the transcript, a message
 * and what a message carries. See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

/** A short conversation, as messages a store would hold. */
const TURNS = `[
    { id: 'u1', role: 'user', content: 'Which transport should I use?', timestamp: Date.parse('2026-10-15T09:41:00') },
    { id: 'a1', role: 'assistant', content: 'Use **AparteDirectTransport** while you prototype: the browser talks to the model. Switch to **AparteBackendTransport** before you ship, so the key stays on your server.', timestamp: Date.parse('2026-10-15T09:41:04') },
    { id: 'u2', role: 'user', content: 'Does the component change between the two?', timestamp: Date.parse('2026-10-15T09:42:10') },
    { id: 'a2', role: 'assistant', content: 'No. The transport is configuration; the chat, its streaming and its tool calls stay the same.', timestamp: Date.parse('2026-10-15T09:42:13') },
  ]`;

export const CHAT_MESSAGE_DEMOS: DemoEntry[] = [
    // ── Chat ──────────────────────────────────────────────────────────────────
    {
        id: 'chat',
        title: 'A complete chat, answered by a scripted model',
        plugins: ['scenario', 'markdown'],
        html: `<!-- Empty, the tag composes itself: a transcript, the question panel and a composer.
     center-empty keeps the composer centred until the first message. This one is answered
     by a scripted model: ask for a haiku, a table, some code or the weather. -->
<aparte-chat center-empty placeholder="Ask for a haiku, a table or some code…" style="height: 26rem"></aparte-chat>`,
    },
    {
        id: 'chat-conversation',
        title: 'A chat with a conversation in it',
        plugins: ['markdown'],
        html: `<aparte-chat style="height: 24rem"></aparte-chat>

<script>
  // A conversation restored from your store: the viewport renders each message.
  const chat = document.querySelector('aparte-chat');
  for (const message of ${TURNS}) chat.viewport.appendMessage(message);
</script>`,
    },
    {
        id: 'chat-overlay',
        title: 'A chat whose composer floats over the transcript',
        plugins: ['markdown'],
        html: `<!-- overlay-composer: the transcript scrolls under the composer, which floats at the
     bottom, so the scrollbar runs the whole height of the column. -->
<aparte-chat overlay-composer style="height: 24rem"></aparte-chat>

<script>
  const chat = document.querySelector('aparte-chat');
  for (const message of ${TURNS}) chat.viewport.appendMessage(message);
</script>`,
    },
    {
        id: 'chat-composed',
        title: 'A chat composed by hand',
        plugins: ['scenario', 'markdown'],
        html: `<!-- With a viewport inside, the tag uses your children as they are, in DOM order: here a
     header row, the transcript, and a composer with a toolbar. -->
<aparte-chat style="height: 26rem">
  <header class="aparte-app-header">
    <span class="aparte-app-header__title">Release assistant</span>
    <span class="aparte-badge aparte-badge--soft aparte-badge--sm">beta</span>
  </header>
  <aparte-chat-viewport></aparte-chat-viewport>
  <aparte-composer placeholder="Ask about the release…">
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>`,
    },

    // ── Conversation (the transcript) ─────────────────────────────────────────
    {
        id: 'conversation',
        title: 'A transcript',
        plugins: ['markdown'],
        html: `<aparte-chat-viewport style="height: 20rem"></aparte-chat-viewport>

<script>
  // The viewport keeps the messages, builds a bubble for each, and stays pinned to the
  // bottom while you are there; scroll up and the button brings you back.
  const viewport = document.querySelector('aparte-chat-viewport');
  for (const message of ${TURNS}) viewport.appendMessage(message);
</script>`,
    },
    {
        id: 'conversation-streaming',
        title: 'A reply streaming into the transcript',
        plugins: ['markdown'],
        html: `<aparte-chat-viewport style="height: 18rem"></aparte-chat-viewport>

<script>
  // What AparteClient does for you during a turn, by hand: open a message, append its
  // tokens as they arrive, then complete it.
  const viewport = document.querySelector('aparte-chat-viewport');
  viewport.appendMessage({ id: 'u1', role: 'user', content: 'Explain the transports in one paragraph.', timestamp: Date.now() });
  viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', isStreaming: true, timestamp: Date.now() });

  const words = 'A transport is the object that talks to the model. The direct one sends the request from the browser, the backend one sends it to your server, which holds the key. Both stream the same events, so the chat cannot tell them apart.'.split(' ');
  let i = 0;
  const tick = setInterval(() => {
    viewport.appendToken('a1', (i ? ' ' : '') + words[i++]);
    if (i === words.length) { clearInterval(tick); viewport.completeMessage('a1'); }
  }, 90);
</script>`,
    },
    {
        id: 'conversation-loading',
        title: 'A transcript while its messages load',
        html: `<!-- loading: a conversation was chosen and its messages are on their way. The viewport
     shows the outline of a conversation instead of an empty column. -->
<aparte-chat-viewport loading style="height: 16rem"></aparte-chat-viewport>`,
    },

    // ── Message ───────────────────────────────────────────────────────────────
    {
        id: 'message',
        title: 'A question and its answer',
        html: `<!-- One bubble per message. The viewport creates them for you; written by hand here. -->
<aparte-chat-bubble message-id="u1" data-role="user" timestamp="2026-10-15T09:41:00"
  content="Which transport should I use?"></aparte-chat-bubble>
<aparte-chat-bubble message-id="a1" data-role="assistant" timestamp="2026-10-15T09:41:04"
  content="The direct one while you prototype, the backend one before you ship."></aparte-chat-bubble>`,
    },
    {
        id: 'message-avatars',
        title: 'Messages with avatars',
        html: `<!-- In your app: import { aparteGlobalConfig } from '@aparte/core'. -->
<aparte-chat-bubble message-id="u1" data-role="user" name="Paul" content="Can you summarise the release?"></aparte-chat-bubble>
<aparte-chat-bubble message-id="a1" data-role="assistant" content="Two fixes: the drawer is no longer dimmed, and a checked menu item shows its check."></aparte-chat-bubble>

<script>
  // The avatar slot is yours to fill: text, an image, a component. It is styled already.
  window.aparte.aparteGlobalConfig.setAvatarProvider({
    render(role, host) {
      host.textContent = role === 'user' ? 'P' : 'A';
    },
  });
</script>`,
    },

    // ── Message actions ───────────────────────────────────────────────────────
    {
        id: 'message-actions',
        title: 'Messages with their actions',
        html: `<!-- In your app: import { aparteGlobalConfig } from '@aparte/core'. -->
<aparte-chat-bubble message-id="u1" data-role="user" content="Write a one-line release note."></aparte-chat-bubble>
<aparte-chat-bubble message-id="a1" data-role="assistant" content="0.19.2 fixes the sidebar drawer and the menu check mark."></aparte-chat-bubble>

<script>
  // Copy works on its own. Retry and edit need something that re-sends and rewrites
  // (AparteClient does both), and feedback needs a listener: declare what your app handles.
  const { aparteGlobalConfig } = window.aparte;
  aparteGlobalConfig.setBubbleActions({ retry: true, edit: true, feedback: true });
  document.addEventListener('aparte-feedback', (e) => console.log('feedback', e.detail));
</script>`,
    },
    {
        id: 'message-actions-order',
        title: 'Actions in an order of your own',
        html: `<aparte-chat-bubble message-id="u1" data-role="user" content="Write a one-line release note."></aparte-chat-bubble>
<aparte-chat-bubble message-id="a1" data-role="assistant" content="0.19.2 fixes the sidebar drawer and the menu check mark."></aparte-chat-bubble>

<script>
  // A list per role replaces the flags for that role: these buttons, in this order.
  window.aparte.aparteGlobalConfig.setBubbleActions({
    user: ['edit', 'copy'],
    assistant: ['thumbUp', 'thumbDown', 'copy', 'retry'],
  });
</script>`,
    },
    {
        id: 'message-actions-info',
        title: 'A reply with its token usage behind the info button',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" content="0.19.2 fixes the sidebar drawer and the menu check mark."></aparte-chat-bubble>

<script>
  const { aparteGlobalConfig } = window.aparte;
  // The info button appears only on a message that carries usage, and only asks:
  // the popover with the numbers is your app's.
  aparteGlobalConfig.setBubbleActions({ info: true });
  document.querySelector('aparte-chat-bubble').setUsage({ inputTokens: 412, outputTokens: 38, durationMs: 1260 });
  document.addEventListener('aparte-message-info', (e) => console.log('show the stats for', e.detail));
</script>`,
    },

    // ── Attachments ───────────────────────────────────────────────────────────
    {
        id: 'attachments',
        title: 'A message sent with files',
        html: `<aparte-chat-bubble message-id="u1" data-role="user" content="Can you check the cover and the brief?"></aparte-chat-bubble>

<script>
  // An image shows its picture, any other file its name and type.
  const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
  const paint = canvas.getContext('2d');
  paint.fillStyle = '#b07d33';
  paint.fillRect(0, 0, 160, 100);
  document.querySelector('aparte-chat-bubble').setAttachments([
    { id: 'f1', name: 'cover.png', type: 'image/png', url: canvas.toDataURL('image/png') },
    { id: 'f2', name: 'brief.pdf', type: 'application/pdf', url: '#', size: 182000 },
  ]);
</script>`,
    },
    {
        id: 'attachments-chat',
        title: 'A chat that accepts files',
        plugins: ['scenario', 'markdown'],
        html: `<!-- attachments adds the file picker and the pending files to the composer the tag
     composes. Opt-in: the files reach you on aparte-send, and reading them is yours. -->
<aparte-chat attachments center-empty placeholder="Attach a file and ask about it" style="height: 22rem"></aparte-chat>`,
    },

    // ── Waiting indicator ─────────────────────────────────────────────────────
    {
        id: 'waiting',
        title: 'A reply that has not started yet',
        html: `<aparte-chat-bubble message-id="u1" data-role="user" content="Summarise the release notes."></aparte-chat-bubble>
<!-- Streaming with nothing in it yet: the dots hold the place of the first token. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" streaming></aparte-chat-bubble>`,
    },

    // ── Response (Markdown) ───────────────────────────────────────────────────
    {
        id: 'response',
        title: 'A reply written in Markdown',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([{
    id: 's1',
    type: 'text',
    content: [
      '### Two transports',
      '',
      'Pick by **where the key lives**:',
      '',
      '| Transport | The key | Use it for |',
      '| --- | --- | --- |',
      '| \`AparteDirectTransport\` | in the browser | prototypes, local models |',
      '| \`AparteBackendTransport\` | on your server | production |',
      '',
      '1. Start with the direct one.',
      '2. Move to the backend before you ship.',
      '',
      '> The chat does not change between the two. See [the transports guide](https://apartejs.dev/guides/backend-transport/).',
    ].join('\\n'),
  }]);
</script>`,
    },
    {
        id: 'response-streaming',
        title: 'Markdown rendered while it streams',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" streaming></aparte-chat-bubble>

<script>
  // The streaming parser appends what each chunk adds instead of re-parsing the whole
  // reply, so a list grows item by item.
  const bubble = document.querySelector('aparte-chat-bubble');
  bubble.setSegments([{ id: 's1', type: 'text', content: '' }]);
  const text = 'Three steps:\\n\\n1. Register a provider.\\n2. Set a transport.\\n3. Start the client.\\n\\nThat is **the whole wiring**.';
  let i = 0;
  const tick = setInterval(() => {
    bubble.appendToSegment('s1', text.slice(i, i + 6));
    i += 6;
    if (i >= text.length) { clearInterval(tick); bubble.removeAttribute('streaming'); }
  }, 60);
</script>`,
    },
    {
        id: 'response-plain',
        title: 'A reply with no Markdown renderer installed',
        html: `<!-- Core has no Markdown dependency: with no renderer installed, a reply shows its
     text as it is, safely escaped. Install @aparte/plugin-marked for the formatting. -->
<aparte-chat-bubble message-id="a1" data-role="assistant"
  content="Pick by **where the key lives**: the browser or your server."></aparte-chat-bubble>`,
    },

    // ── Code block ────────────────────────────────────────────────────────────
    {
        id: 'code-block',
        title: 'A highlighted code block in a reply',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'text', content: 'The minimal wiring:' },
    {
      id: 's2',
      type: 'code',
      language: 'ts',
      filename: 'chat.ts',
      content: [
        "import { AparteClient, aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';",
        '',
        'aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));',
        'new AparteClient().start();',
      ].join('\\n'),
    },
  ]);
</script>`,
    },
    {
        id: 'code-block-plain',
        title: 'A code block with no highlighter installed',
        html: `<!-- Highlighting is a plugin (@aparte/plugin-shiki). Without one the block stays
     plain, with its language and its copy button. -->
<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([{
    id: 's1',
    type: 'code',
    language: 'ts',
    content: "const transport = new AparteBackendTransport({ endpoint: '/api/chat' });",
  }]);
</script>`,
    },

    // ── Error ─────────────────────────────────────────────────────────────────
    {
        id: 'error',
        title: 'A turn that failed',
        html: `<aparte-chat-bubble message-id="u1" data-role="user" content="Summarise the release notes."></aparte-chat-bubble>
<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  // The failure sits in the turn that produced it, not in a toast elsewhere on the page.
  // As the client makes it: the code picks the sentence the reader sees; the provider's own
  // message stays on the segment, and went to the console.
  document.querySelectorAll('aparte-chat-bubble')[1].setSegments([{
    id: 's1',
    type: 'error',
    code: 'USAGE_RATE_LIMIT',
    content: 'HTTP 429: {"error":{"type":"rate_limit_error","message":"Number of requests exceeded"}}',
  }]);
</script>`,
    },
    {
        id: 'error-after-text',
        title: 'A reply cut off by an error',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  // What arrived stays; the error follows it.
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'text', content: 'Here is the summary of the first two sections. The release fixes' },
    { id: 's2', type: 'error', code: 'PROVIDER_ERROR', content: 'HTTP 502: upstream connect error' },
  ]);
</script>`,
    },

    // ── Custom view ───────────────────────────────────────────────────────────
    {
        id: 'custom-view',
        title: 'A view of your own in a reply',
        html: `<!-- In your app: import { registerSegmentRenderer } from '@aparte/core'. -->
<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  const { registerSegmentRenderer } = window.aparte;
  // A type of your own, drawn by a renderer of your own: here a small forecast card.
  registerSegmentRenderer({
    type: 'forecast',
    render(segment) {
      const card = document.createElement('div');
      card.className = 'aparte-card';
      const head = Object.assign(document.createElement('div'), { className: 'aparte-card__header', textContent: segment.city });
      const body = Object.assign(document.createElement('div'), { className: 'aparte-card__body' });
      body.textContent = segment.days.map((d) => \`\${d.day} \${d.high}°\`).join('  ·  ');
      card.append(head, body);
      return card;
    },
  });

  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'text', content: 'The next three days in Lille:' },
    { id: 's2', type: 'forecast', city: 'Lille', days: [{ day: 'Thu', high: 14 }, { day: 'Fri', high: 16 }, { day: 'Sat', high: 12 }] },
  ]);
</script>`,
    },
    {
        id: 'custom-view-family',
        title: 'A family of small views behind one renderer',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant"></aparte-chat-bubble>

<script>
  const { registerSegmentRenderer } = window.aparte;
  // type: 'custom' keeps several small views behind ONE renderer: switch on subType,
  // and let the default branch draw something sensible for one you do not know.
  registerSegmentRenderer({
    type: 'custom',
    render(segment) {
      const el = document.createElement('span');
      if (segment.subType === 'status') {
        el.className = \`aparte-badge aparte-badge--soft aparte-badge--\${segment.data.ok ? 'success' : 'danger'}\`;
        el.textContent = segment.data.label;
      } else {
        el.textContent = segment.fallback ?? '';
      }
      return el;
    },
  });

  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'text', content: 'Checks on the release branch:' },
    { id: 's2', type: 'custom', subType: 'status', data: { ok: true, label: 'Build passed' } },
    { id: 's3', type: 'custom', subType: 'status', data: { ok: false, label: '1 e2e test failed' } },
  ]);
</script>`,
    },
];
