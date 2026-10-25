<script lang="ts">
  /** `?framework-card`: the `get_weather` call drawn by a Svelte component (see `_shared/framework-card.ts`). */
  import { setContext } from 'svelte';
  import { AparteToolUI } from '@aparte/svelte/runes';
  import { SITE_NAME } from '../../_shared/framework-card';
  import WeatherCard from './WeatherCard.svelte';

  // App context the card reads — the snippet is mounted with the contexts of the declaration.
  setContext('siteName', SITE_NAME);
</script>

<AparteToolUI name="get_weather">
  {#snippet children(tool)}<WeatherCard {tool} />{/snippet}
</AparteToolUI>
