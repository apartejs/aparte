/**
 * The Chat group's variants for what an agent adds to a conversation: documents it produces,
 * the questions and approvals it puts to the person, and the controls around the composer.
 * See ./types.ts for how a demo is read.
 */
import type { DemoEntry } from './types';

/** A small page the artifact demos produce. */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #1b1b1f; background: #fbf9f5 }
  main { max-width: 26rem; margin: 0 auto; padding: 2.5rem 1.5rem }
  h1 { font-size: 1.6rem; margin: 0 0 .5rem }
  p { color: #6b6b76; margin: 0 0 1.4rem }
  a { display: inline-block; padding: .55rem 1rem; border-radius: .5rem; background: #1b1b1f; color: #fff; text-decoration: none }
</style>
<main>
  <h1>A chat you can put anywhere</h1>
  <p>Web components, no framework, and the agent loop inside.</p>
  <a href="#">Read the guide</a>
</main>`;

/** Six turns, enough for a transcript to scroll. */
const LONG_THREAD = `
    <aparte-chat-bubble message-id="u1" data-role="user" content="What is a web component?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="A custom element: a tag the browser upgrades to a class you wrote. It carries its own markup and behaviour, and it works in any framework, or none."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="u2" data-role="user" content="And a light-DOM one?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a2" data-role="assistant" name="Assistant" content="One that renders its children into the page rather than into a shadow root, so the page's CSS reaches inside it."></aparte-chat-bubble>
    <aparte-chat-bubble message-id="u3" data-role="user" content="Which one is this chat?"></aparte-chat-bubble>
    <aparte-chat-bubble message-id="a3" data-role="assistant" name="Assistant" content="Light DOM, like everything in aparté: a theme is a stylesheet, not an API."></aparte-chat-bubble>`;

export const CHAT_AGENT_DEMOS: DemoEntry[] = [
    // ── Artifact ──────────────────────────────────────────────────────────────
    {
        id: 'artifact',
        title: 'A document the model produced, as a card',
        plugins: ['artifacts'],
        html: `<!-- In your app: import { setupArtifacts, artifactSegment } from '@aparte/plugin-artifacts'. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  const { setupArtifacts, artifactSegment } = window.apartePlugins.artifacts;
  setupArtifacts();

  const page = \`${PAGE}\`;

  // What the create_artifact tool returns, drawn as a card: Code first, Preview on a click.
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'text', content: 'Here is a first draft of the landing page.' },
    artifactSegment('s2', { mimeType: 'text/html', title: 'Landing page', content: page }),
  ]);
</script>`,
    },
    {
        id: 'artifact-markdown',
        title: 'A Markdown note as an artifact',
        plugins: ['artifacts'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  const { setupArtifacts, artifactSegment } = window.apartePlugins.artifacts;
  setupArtifacts();

  // No Preview tab for a note: the card offers what the kind can do, Copy and Download.
  document.querySelector('aparte-chat-bubble').setSegments([
    artifactSegment('s1', {
      mimeType: 'text/markdown',
      title: 'Release note',
      content: '## 0.19.2\\n\\n- The sidebar drawer is no longer dimmed by its own scrim.\\n- A checked menu item shows its check mark.',
    }),
  ]);
</script>`,
    },

    // ── Approval ──────────────────────────────────────────────────────────────
    {
        id: 'approval',
        title: 'A tool call waiting for a person',
        html: `<!-- In your app, AparteClient asks this for any tool registered with needsApproval: true.
     Here the request is made by hand: import { requestUserInput } from '@aparte/core'. -->
<aparte-chat style="height: 26rem; --aparte-elic-max-height: 20rem"></aparte-chat>

<script>
  const { requestUserInput } = window.aparte;
  const chat = document.querySelector('aparte-chat');
  chat.viewport.appendMessage({ id: 'u1', role: 'user', content: 'Clean up the old client.', timestamp: Date.now() });
  chat.viewport.appendMessage({
    id: 'a1', role: 'assistant', timestamp: Date.now(),
    segments: [{
      id: 's1', type: 'tool_call', status: 'awaiting-approval',
      toolCall: { id: 't1', name: 'delete_file', input: { path: 'src/legacy/old-client.ts' } },
    }],
  });

  // The decision is asked at the composer, with the arguments it is about.
  requestUserInput({
    kind: 'approval',
    message: 'Run delete_file?',
    details: JSON.stringify({ path: 'src/legacy/old-client.ts' }, null, 2),
    options: [
      { value: 'approve', label: 'Approve' },
      { value: 'reject', label: 'Reject', tone: 'deny' },
    ],
  }).catch(() => {});
</script>`,
    },
    {
        id: 'approval-scoped',
        title: 'An approval that can be remembered',
        html: `<!-- The panel takes at most --aparte-elic-max-height (half the window by default). -->
<aparte-chat style="height: 26rem; --aparte-elic-max-height: 22rem"></aparte-chat>

<script>
  const { requestUserInput } = window.aparte;
  // Offer "always" only when your app has somewhere to remember it, and say what it reaches.
  requestUserInput({
    kind: 'approval',
    message: 'Run run_command?',
    details: 'git status',
    options: [
      { value: 'approve', label: 'Allow once' },
      { value: 'approve-always', label: 'Always allow', description: 'git status, in this workspace' },
      { value: 'reject', label: 'Reject', tone: 'deny' },
    ],
  }).catch(() => {});
</script>`,
    },

    // ── Question ──────────────────────────────────────────────────────────────
    {
        id: 'question',
        title: 'A question with choices, asked at the composer',
        html: `<!-- import { requestUserInput } from '@aparte/core' in your app; with
     @aparte/plugin-ask-user the MODEL asks it through its ask_user tool. -->
<aparte-chat style="height: 24rem; --aparte-elic-max-height: 20rem"></aparte-chat>

<script>
  const { requestUserInput } = window.aparte;
  requestUserInput({
    message: 'Which format should the report use?',
    schema: {
      type: 'enum',
      options: [
        { value: 'md', label: 'Markdown', description: 'For the repository', recommended: true },
        { value: 'pdf', label: 'PDF', description: 'To send around' },
        { value: 'html', label: 'Web page', description: 'To publish' },
      ],
    },
  }).catch(() => {});
</script>`,
    },
    {
        id: 'question-form',
        title: 'Several questions in one request',
        html: `<aparte-chat style="height: 26rem; --aparte-elic-max-height: 22rem"></aparte-chat>

<script>
  const { requestUserInput } = window.aparte;
  // Each field's header names its tab; the last one makes the composer's button send.
  requestUserInput({
    message: 'Two things before I start:',
    schema: {
      type: 'object',
      properties: {
        audience: {
          type: 'enum', header: 'Audience', title: 'Who will read it?',
          options: [{ value: 'dev', label: 'Developers' }, { value: 'team', label: 'The whole team' }],
        },
        sections: {
          type: 'enum', header: 'Sections', title: 'What should it cover?', multiple: true,
          options: [{ value: 'fixes', label: 'Fixes' }, { value: 'features', label: 'Features' }, { value: 'upgrade', label: 'How to upgrade' }],
        },
      },
    },
  }).catch(() => {});
</script>`,
    },
    {
        id: 'question-receipt',
        title: 'The receipt a question leaves in the transcript',
        plugins: ['ask-user'],
        html: `<!-- setupAskUser() registers the receipt: once answered, the panel goes and this stays. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([{
    id: 's1',
    type: 'tool_call',
    status: 'resolved',
    toolCall: {
      id: 't1',
      name: 'ask_user',
      input: { questions: [{ question: 'Which format should the report use?', header: 'Format', options: [{ title: 'Markdown' }, { title: 'PDF' }] }] },
    },
    result: 'The user chose: Markdown',
    structuredResult: { action: 'accept', answers: [{ question: 'Which format should the report use?', value: 'Markdown' }] },
  }]);
</script>`,
    },

    // ── Suggestions ───────────────────────────────────────────────────────────
    {
        id: 'suggestions',
        title: 'Prompt starters above the input',
        plugins: ['scenario', 'markdown'],
        html: `<!-- empty-only: the row is there while the conversation is empty, gone after the first send. -->
<aparte-chat style="height: 24rem">
  <aparte-chat-viewport></aparte-chat-viewport>
  <aparte-composer placeholder="Or type your own…">
    <aparte-suggestions empty-only
      suggestions='["Write a haiku", "Show me a table", {"label": "What is the weather?", "prompt": "What is the weather in Lille?"}]'>
    </aparte-suggestions>
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
        id: 'suggestions-fill',
        title: 'Starters that fill the input without sending',
        html: `<aparte-composer placeholder="Ask anything">
  <aparte-suggestions mode="fill"
    suggestions='["Summarise this page", "Translate it into French", "List the open questions"]'>
  </aparte-suggestions>
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
  </div>
</aparte-composer>`,
    },

    // ── Model selector ────────────────────────────────────────────────────────
    {
        id: 'model-selector',
        title: 'A model picker in the composer',
        plugins: ['scenario', 'model-selector'],
        html: `<!-- import '@aparte/plugin-model-selector' registers the element; it lists the providers
     your config knows, one group per provider. -->
<aparte-composer placeholder="Ask anything">
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
    <aparte-composer-toolbar>
      <aparte-model-selector persist searchable></aparte-model-selector>
    </aparte-composer-toolbar>
  </div>
</aparte-composer>

<script>
  const { aparteGlobalConfig } = window.aparte;
  const { createScenarioProvider } = window.apartePlugins.scenario;
  // Stand-ins for real providers (openai-compat, ai-sdk, transformers): only their model lists matter here.
  aparteGlobalConfig.registerAIProvider(
    createScenarioProvider({ id: 'cloud', name: 'Cloud', models: [{ id: 'large', name: 'Large' }, { id: 'fast', name: 'Fast' }] }),
    createScenarioProvider({ id: 'local', name: 'In the browser', models: [{ id: 'small', name: 'Small, offline' }] }),
  );
  aparteGlobalConfig.setModelConfig({ defaultProvider: 'cloud', defaultModel: 'large' });
</script>`,
    },

    // ── Approval mode ─────────────────────────────────────────────────────────
    {
        id: 'approval-mode',
        title: 'The approval mode switch in the composer',
        plugins: ['approval'],
        html: `<!-- In your app: import { setupApproval } from '@aparte/plugin-approval'. -->
<aparte-composer placeholder="Ask the agent">
  <div class="aparte-composer-shell">
    <div class="aparte-composer-row">
      <aparte-composer-input></aparte-composer-input>
      <aparte-composer-send></aparte-composer-send>
    </div>
    <aparte-composer-toolbar>
      <aparte-approval-mode></aparte-approval-mode>
    </aparte-composer-toolbar>
  </div>
</aparte-composer>

<script>
  const { setupApproval } = window.apartePlugins.approval;
  // Your tool names, sorted by what they do. The mode decides which of them ask first.
  setupApproval({
    classify: { read: ['read_file', 'search'], write: ['write_file'], exec: ['run_command'] },
    mode: 'ask',
  });
</script>`,
    },

    // ── Context gauge ─────────────────────────────────────────────────────────
    {
        id: 'context',
        title: 'How much of the context window a conversation uses',
        html: `<!-- The bar takes the room it is given; the ring takes none. -->
<aparte-composer-toolbar>
  <aparte-context window="128000" style="flex: 1"></aparte-context>
  <aparte-context window="128000" variant="ring"></aparte-context>
</aparte-composer-toolbar>

<script>
  // The gauge reads the usage each turn reports, and draws nothing before the first one.
  window.dispatchEvent(new CustomEvent('aparte-message-done', {
    detail: { usage: { inputTokens: 52000, outputTokens: 800 } },
  }));
</script>`,
    },
    {
        id: 'context-levels',
        title: 'The gauge past its warning and danger thresholds',
        html: `<aparte-composer-toolbar>
  <aparte-context window="128000" style="flex: 1"></aparte-context>
</aparte-composer-toolbar>
<aparte-composer-toolbar>
  <aparte-context window="100000" style="flex: 1"></aparte-context>
</aparte-composer-toolbar>

<script>
  // One reading, two windows: 82% of the first is past warn (75%), 105% of the second past danger (90%).
  window.dispatchEvent(new CustomEvent('aparte-message-done', {
    detail: { usage: { inputTokens: 105000, outputTokens: 400 } },
  }));
</script>`,
    },

    // ── Status line ───────────────────────────────────────────────────────────
    {
        id: 'status-line',
        title: 'A status line for what the app is doing',
        html: `<!-- Yours to turn on and off: core never shows it by itself. -->
<aparte-chat-bubble message-id="u1" data-role="user" content="Find where the transport is configured."></aparte-chat-bubble>
<aparte-chat-status visible text="Searching the docs…"></aparte-chat-status>`,
    },
    {
        id: 'status-line-dots',
        title: 'The status line with no text',
        html: `<aparte-chat-status visible></aparte-chat-status>`,
    },

    // ── Scroll rail ───────────────────────────────────────────────────────────
    {
        id: 'scroll-rail',
        title: 'A tick per question beside a long conversation',
        html: `<!-- A direct child of the chat. Scroll the transcript, or press a tick. -->
<aparte-chat style="height: 20rem">
  <aparte-chat-viewport>${LONG_THREAD}
  </aparte-chat-viewport>
  <aparte-scroll-rail></aparte-scroll-rail>
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
        id: 'scroll-rail-every',
        title: 'A tick for every message',
        html: `<aparte-chat style="height: 20rem">
  <aparte-chat-viewport>${LONG_THREAD}
  </aparte-chat-viewport>
  <aparte-scroll-rail every="message"></aparte-scroll-rail>
</aparte-chat>`,
    },

    // ── Compaction notice ─────────────────────────────────────────────────────
    {
        id: 'compaction-notice',
        title: 'The summary that replaced the start of a long conversation',
        plugins: ['markdown'],
        html: `<!-- @aparte/plugin-compaction writes this message when the context fills up; any message
     with compaction: true is drawn the same way. -->
<aparte-chat-viewport style="height: 24rem"></aparte-chat-viewport>

<script>
  // A restored conversation: the summary, then the reply that was kept as it was.
  document.querySelector('aparte-chat-viewport').setMessages([
    {
      id: 'c1', role: 'user', compaction: true, timestamp: Date.now(),
      content: '**Conversation summary**\\n\\nThe user is preparing release 0.19.2: two CSS fixes (the sidebar drawer, the menu check mark) and gzip on the docs server. The changelog is written; the tag is not pushed yet.',
    },
    { id: 'a9', role: 'assistant', content: 'The changelog is in. What is left: wait for CI on the release commit, then push the tag alone.', timestamp: Date.now() },
  ]);
</script>`,
    },
];
