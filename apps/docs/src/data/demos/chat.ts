/**
 * The Chat group's variants: each one a state of a component, as the markup and script an app
 * writes to reach it. See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

export const CHAT_DEMOS: DemoEntry[] = [
    // ── Composer ──────────────────────────────────────────────────────────────
    {
        id: 'composer',
        title: 'A composer: the field and its send button',
        html: `<!-- The composer renders nothing of its own: this markup IS the component. The shell
     draws the border, the row keeps the button on the text's bottom edge as it grows. -->
<aparte-composer placeholder="Ask anything…">
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
  </div>
</aparte-composer>`,
    },
    {
        id: 'composer-attachments',
        title: 'A composer with files attached',
        html: `<aparte-composer placeholder="Ask about these files…">
  <div class="aparte-composer-shell">
    <!-- The pending files, above the field. Hidden while there are none. -->
    <aparte-composer-attachments></aparte-composer-attachments>
    <div class="aparte-composer-row">
      <!-- Opens the file picker, and makes the whole composer a drop target. -->
      <aparte-composer-add-attachment accept="image/*,.pdf,.md"></aparte-composer-add-attachment>
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
  </div>
</aparte-composer>

<script>
  // Two files already picked, standing in for what a reader would choose.
  const composer = document.querySelector('aparte-composer');
  const notes = new File(['# Launch notes'], 'launch-notes.md', { type: 'text/markdown' });
  const canvas = Object.assign(document.createElement('canvas'), { width: 120, height: 80 });
  const paint = canvas.getContext('2d');
  paint.fillStyle = '#b07d33';
  paint.fillRect(0, 0, 120, 80);
  canvas.toBlob((blob) => composer.addAttachments([notes, new File([blob], 'cover.png', { type: 'image/png' })]));
</script>`,
    },
    {
        id: 'composer-toolbar',
        title: 'A composer with a toolbar',
        plugins: ['scenario', 'model-selector'],
        html: `<aparte-composer placeholder="Ask anything…">
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
    <!-- The bottom row, laid out in DOM order. An action is an icon button that only emits
         aparte-action-click: what it does is yours. -->
    <aparte-composer-toolbar>
      <aparte-composer-action icon="tool" label="Use tools" action-id="tools"></aparte-composer-action>
      <aparte-composer-action icon="image" label="Generate an image" action-id="image"></aparte-composer-action>
      <!-- From @aparte/plugin-model-selector: lists the models your providers declare.
           margin-inline-start: auto pushes it, and whatever follows, to the end of the row. -->
      <aparte-model-selector auto-select persist style="margin-inline-start: auto"></aparte-model-selector>
    </aparte-composer-toolbar>
  </div>
</aparte-composer>`,
    },
    {
        id: 'composer-streaming',
        title: 'A composer while a reply streams',
        html: `<aparte-composer placeholder="Ask anything…">
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
  </div>
</aparte-composer>

<script>
  // AparteClient sets this while a reply streams; set by hand here to show the state.
  // The send button becomes the stop button, and a click on it cancels the turn.
  document.querySelector('aparte-composer').streaming = true;
</script>`,
    },

    // ── Tool ──────────────────────────────────────────────────────────────────
    {
        id: 'tool',
        title: 'A tool call in a reply',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  // A reply is a list of segments: here a finished tool call, then the answer it led to.
  // Open the row to see what the model sent and what the tool returned.
  document.querySelector('aparte-chat-bubble').setSegments([
    {
      id: 's1',
      type: 'tool_call',
      status: 'resolved',
      toolCall: { id: 't1', name: 'get_weather', input: { city: 'Lille' } },
      result: 'Cloudy, 14 °C, wind from the west at 20 km/h.',
    },
    { id: 's2', type: 'text', content: 'It is **14 °C and cloudy** in Lille, with a westerly wind. Bring a jacket.' },
  ]);
</script>`,
    },
    {
        id: 'tool-statuses',
        title: 'Every status a tool call can be in',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  const call = (id, name, input) => ({ id, name, input });
  document.querySelector('aparte-chat-bubble').setSegments([
    // Running: the model asked, the handler has not answered yet.
    { id: 's1', type: 'tool_call', status: 'pending', toolCall: call('t1', 'search_docs', { query: 'release checklist' }) },
    // Paused for a person (a tool marked needsApproval): the decision is asked at the composer.
    { id: 's2', type: 'tool_call', status: 'awaiting-approval', toolCall: call('t2', 'run_command', { cmd: 'pnpm publish' }) },
    { id: 's3', type: 'tool_call', status: 'resolved', toolCall: call('t3', 'read_file', { path: 'CHANGELOG.md' }), result: '## 0.19.2' },
    { id: 's4', type: 'tool_call', status: 'rejected', toolCall: call('t4', 'delete_file', { path: 'src/legacy.ts' }), result: 'The user rejected this tool call.' },
    { id: 's5', type: 'tool_call', status: 'aborted', toolCall: call('t5', 'fetch_page', { url: 'https://example.com' }) },
    { id: 's6', type: 'tool_call', status: 'failed', toolCall: call('t6', 'write_file', { path: '/etc/hosts' }), result: 'EACCES: permission denied' },
  ]);
</script>`,
    },
    {
        id: 'tool-summary',
        title: 'A tool row that says what it ran on',
        html: `<!-- In your app: import { aparteGlobalConfig } from '@aparte/core'. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  const { aparteGlobalConfig } = window.aparte;
  // One line after the tool's name: what it targeted. Plain text, never HTML; the row,
  // its states and its disclosure stay the library's.
  aparteGlobalConfig.registerToolSummary('read_file', (segment) => String(segment.toolCall.input.path ?? ''));
  aparteGlobalConfig.registerToolSummary('search_docs', (segment) => \`“\${segment.toolCall.input.query}”\`);

  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'tool_call', status: 'resolved', toolCall: { id: 't1', name: 'search_docs', input: { query: 'release checklist' } }, result: '3 pages' },
    { id: 's2', type: 'tool_call', status: 'resolved', toolCall: { id: 't2', name: 'read_file', input: { path: 'docs/release.md' } }, result: '## Release' },
  ]);
</script>`,
    },
    {
        id: 'tool-renderer',
        title: 'A tool drawn by a renderer of your own',
        html: `<!-- In your app: import { aparteGlobalConfig } from '@aparte/core'. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  const { aparteGlobalConfig } = window.aparte;
  // Every get_weather call is drawn by this instead of the default row. Returning an
  // element (not a string) means the model's data never goes through innerHTML.
  aparteGlobalConfig.registerToolRenderer('get_weather', {
    render(segment) {
      const card = document.createElement('div');
      card.className = 'aparte-card';
      const body = document.createElement('div');
      body.className = 'aparte-card__body';
      body.textContent = segment.status === 'resolved'
        ? \`\${segment.toolCall.input.city}: \${segment.result}\`
        : \`Checking the weather in \${segment.toolCall.input.city}…\`;
      card.append(body);
      return card;
    },
  });

  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'tool_call', status: 'resolved', toolCall: { id: 't1', name: 'get_weather', input: { city: 'Lille' } }, result: 'cloudy, 14 °C' },
  ]);
</script>`,
    },

    // ── Reasoning ─────────────────────────────────────────────────────────────
    {
        id: 'thinking',
        title: 'A reply with its reasoning folded above it',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    {
      id: 's1',
      type: 'thinking',
      // Settled: the block folds, and the reader opens it if they want the reasoning.
      isStreaming: false,
      label: 'Thought for 4 seconds',
      content: 'The user asks which transport to use. A prototype keeps the key in the browser; production should not. So: direct for the demo, backend for the release.',
    },
    { id: 's2', type: 'text', content: 'Use **AparteDirectTransport** while you prototype, and switch to **AparteBackendTransport** before you ship, so the key stays on your server.' },
  ]);
</script>`,
    },
    {
        id: 'thinking-streaming',
        title: 'Reasoning while it streams',
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" streaming></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    // Still arriving: the client appends tokens to it as the model reasons.
    { id: 's1', type: 'thinking', isStreaming: true, content: 'Comparing the two transports. The direct one sends the key from the browser, which' },
  ]);
</script>`,
    },
    {
        id: 'thinking-open',
        title: 'Reasoning opened on purpose',
        plugins: ['markdown'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    {
      id: 's1',
      type: 'thinking',
      isStreaming: false,
      // Absent means folded. false opens it, for a reply whose reasoning is the point.
      collapsed: false,
      content: 'Three facts decide it: the key must not reach the browser in production, the demo has no server, and both transports stream the same events.',
    },
    { id: 's2', type: 'text', content: 'Direct for the demo, backend for production.' },
  ]);
</script>`,
    },
];
