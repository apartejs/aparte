<script lang="ts" module>
  // Once per process, on the server and in the browser: the scripted model and the tool.
  import { aparteGlobalConfig } from '@aparte/core';
  import { createScenarioProvider } from '@aparte/provider-scenario';

  aparteGlobalConfig.registerAIProvider(createScenarioProvider({
    scenarios: {
      default: 'Hello from a server-rendered page.',
      weather: { when: 'weather', turn: [{ text: 'Let me check.' }, { tool: 'get_weather', input: { city: 'Lille' } }] },
      forecast: { after: 'get_weather', turn: 'Cloudy, 14 °C. Bring a jacket.' },
    },
  }));
  aparteGlobalConfig.registerTool(
    { name: 'get_weather', description: 'Current weather for a city.', inputSchema: { type: 'object', properties: { city: { type: 'string' } } } },
    async (call) => ({ toolCallId: call.id, content: 'Cloudy, 14 °C in Lille.' }),
  );
</script>

<script lang="ts">
  // Server-rendered — no `export const ssr = false` anywhere. The client starts in the browser.
  import { AparteChat, AparteToolUI, createAparteClient } from '@aparte/svelte/runes';

  createAparteClient();
</script>

<main style="height: 100vh">
  <AparteToolUI name="get_weather">
    {#snippet children(tool)}
      <div data-testid="framework-weather-card">
        {(tool.input as { city: string }).city}: {tool.status === 'resolved' ? tool.result : tool.status}
      </div>
    {/snippet}
  </AparteToolUI>
  <AparteChat centerWhenEmpty>
    {#snippet emptyState()}<p>Ask me anything…</p>{/snippet}
  </AparteChat>
</main>
