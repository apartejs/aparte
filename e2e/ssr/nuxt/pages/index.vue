<script setup lang="ts">
// Rendered on the server: the chat, its empty state, and the get_weather declaration (which
// declares nothing there — the card is drawn in the browser). The model and the client are the
// client-only plugin's.
import { AparteChat, AparteToolUI } from '@aparte/vue';
</script>

<template>
    <main style="height: 100vh; margin: 0">
        <AparteToolUI name="get_weather" v-slot="{ tool }">
            <div data-testid="framework-weather-card">
                {{ (tool.input as { city: string }).city }}: {{ tool.status === 'resolved' ? tool.result : tool.status }}
            </div>
        </AparteToolUI>
        <AparteChat center-when-empty>
            <template #empty-state><p>Ask me anything…</p></template>
        </AparteChat>
    </main>
</template>
