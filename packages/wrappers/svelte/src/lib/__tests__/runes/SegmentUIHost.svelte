<script lang="ts">
  import AparteSegmentUI from '../../runes/AparteSegmentUI.svelte';
  import type { AparteSegmentBase } from '@aparte/core';

  interface ChartSegment extends AparteSegmentBase {
    type: 'chart';
    points: number[];
  }
</script>

<AparteSegmentUI type="chart">
  {#snippet children(segment: ChartSegment)}<span class="chart">{segment.points.join(',')}</span>{/snippet}
</AparteSegmentUI>
