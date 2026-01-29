<script setup lang="ts">
type Props = {
  minHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 640,
})

function toCssPx(v: number | string) {
  return typeof v === 'number' ? `${v}px` : v
}
</script>

<template>
  <div class="game-page">
    <div class="game-shell panel" :class="{ 'no-panel': !$slots.panel }" :style="{ minHeight: toCssPx(props.minHeight) }">
      <aside v-if="$slots.panel" class="game-left">
        <slot name="panel" />
      </aside>
      <section class="game-main">
        <slot />
      </section>
    </div>

    <div v-if="$slots.below" class="game-below panel">
      <slot name="below" />
    </div>
  </div>
</template>
