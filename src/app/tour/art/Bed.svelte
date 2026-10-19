<script lang="ts">
  /** Graphite bed with a 10/50 grid, the backdrop for most tour scenes. */
  let { x = 0, y = 0, w = 440, h = 300 }: { x?: number; y?: number; w?: number; h?: number } = $props();
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
</script>

<defs>
  <pattern id="{id}-minor" width="10" height="10" patternUnits="userSpaceOnUse">
    <path d="M10 0H0V10" class="grid-minor" fill="none" />
  </pattern>
  <pattern id="{id}-major" width="50" height="50" patternUnits="userSpaceOnUse">
    <rect width="50" height="50" fill="url(#{id}-minor)" />
    <path d="M50 0H0V50" class="grid-major" fill="none" />
  </pattern>
</defs>
<rect {x} {y} width={w} height={h} rx="6" class="bed" />
<rect {x} {y} width={w} height={h} rx="6" fill="url(#{id}-major)" />
