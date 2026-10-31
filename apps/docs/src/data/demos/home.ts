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
        id: 'home-rich',
        title: 'A reply with a card, a formula and a chart',
        plugins: ['markdown', 'math', 'charts', 'cards'],
        html: `<aparte-chat-viewport style="height: 36rem"></aparte-chat-viewport>

<script>
  // In an app: import { setupStockCard } from '@aparte/plugin-cards/stock';
  const { setupStockCard } = window.apartePlugins.cards.stock;

  // A made-up price walk: the same curve every time a range is asked for, ending at the price,
  // spread over a span that grows with the range. The day's figures are read off the 1D curve.
  const POINTS = { '1D': 78, '5D': 60, '1M': 44, '1Y': 52 };
  const SPAN = { '1D': 3.6, '5D': 8, '1M': 16, '1Y': 42 };
  const PRICE = 184.6;
  const seriesFor = (range) => {
    const seed = range.charCodeAt(0) + range.length * 3;
    let v = 0;
    const walk = Array.from({ length: POINTS[range] }, (_, i) => (v += Math.sin(i * 0.7 + seed) * 1.6 + Math.cos(i * 0.23 + seed * 2) + 0.12));
    const last = walk[walk.length - 1];
    const scale = SPAN[range] / (Math.max(...walk) - Math.min(...walk));
    return walk.map((x) => Math.round((PRICE - (last - x) * scale) * 100) / 100);
  };
  const day = seriesFor('1D');
  const quote = (range) => ({
    symbol: 'ACME', name: 'Acme Corp.', exchange: 'NASDAQ', currency: 'USD',
    price: PRICE, change: 2.35, changePercent: 1.29, previousClose: 182.25,
    open: day[0], high: Math.max(...day), low: Math.min(...day), volume: 48200000, marketState: 'open',
    range, ranges: ['1D', '5D', '1M', '1Y'], series: seriesFor(range),
  });

  // The range buttons are drawn because something answers them: a press redraws the card in place.
  setupStockCard({
    tool: 'get_quote',
    onChange: ({ name, value }) => (name === 'range' ? quote(value) : undefined),
  });

  const viewport = document.querySelector('aparte-chat-viewport');
  viewport.appendMessage({ id: 'u1', role: 'user', content: 'How is ACME doing, and what does a year of it mean per month?', timestamp: Date.now() });
  viewport.appendMessage({ id: 'a1', role: 'assistant', timestamp: Date.now(), status: 'streaming', segments: [
    { id: 's1', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'get_quote', input: { symbol: 'ACME' } } },
  ] });

  const text = 'Up **1.3%** today. Over the year it gained 22.5%, which compounds to $(1.225)^{1/12} - 1 = 0.017$ a month. Its revenue, by quarter:';
  const chart = JSON.stringify({
    title: { text: 'Revenue by quarter ($bn)' }, tooltip: { trigger: 'axis' }, legend: {},
    xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] }, yAxis: { type: 'value' },
    series: [{ name: '2025', type: 'bar', data: [12.1, 13.4, 12.8, 15.2] }, { name: '2026', type: 'bar', data: [14.0, 15.9, 15.1, 17.6] }],
  }, null, 2);
  const stream = (id, source, step, done) => {
    let i = 0;
    const tick = setInterval(() => {
      i += step;
      viewport.updateSegment('a1', id, { content: source.slice(0, i) });
      if (i >= source.length) {
        clearInterval(tick);
        viewport.updateSegment('a1', id, { isStreaming: false });
        done();
      }
    }, 40);
  };

  // The call runs, its card fills in place, then the words and the chart stream under it.
  setTimeout(() => {
    viewport.updateSegment('a1', 's1', { status: 'resolved', structuredResult: quote('1D') });
    viewport.addSegment('a1', { id: 's2', type: 'text', content: '', isStreaming: true });
    stream('s2', text, 3, () => {
      viewport.addSegment('a1', { id: 's3', type: 'code', language: 'echarts', content: '', isStreaming: true });
      stream('s3', chart, 14, () => viewport.updateMessage('a1', { status: 'completed' }));
    });
  }, 1200);
</script>`,
    },
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
