<script setup lang="ts">
import { inject, onMounted, onUnmounted } from 'vue';
import type { AparteToolCallView } from '@aparte/vue';
import { noteCardMounted, noteCardUnmounted, weatherLine } from '../../_shared/framework-card';

defineProps<{ tool: AparteToolCallView }>();
// Provided by `FrameworkWeatherCard.vue`, around the declaration.
const site = inject<string>('siteName', '');
onMounted(noteCardMounted);
onUnmounted(noteCardUnmounted);
</script>

<template>
    <div class="framework-card" data-testid="framework-weather-card">
        {{ weatherLine(tool) }} <small>· {{ site }}</small>
    </div>
</template>
