<script setup lang="ts">
/** `?framework-card`: the `get_weather` call drawn by a Vue component (see `_shared/framework-card.ts`). */
import { provide } from 'vue';
import { AparteToolUI } from '@aparte/vue';
import { SITE_NAME } from '../../_shared/framework-card';
import WeatherCard from './WeatherCard.vue';

// App context the card injects — it renders from where `<AparteToolUI>` is declared.
provide('siteName', SITE_NAME);
</script>

<template>
    <AparteToolUI name="get_weather" v-slot="{ tool }">
        <WeatherCard :tool="tool" />
    </AparteToolUI>
</template>
