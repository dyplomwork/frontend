<script setup lang="ts">
type Props = {
  minHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 640,
})

function toCssPx(v: number | string){
  return typeof v === 'number' ? `${v}px` : v
}
</script>

<template>
  <div class="game-shell panel" :style="{ minHeight: toCssPx(props.minHeight) }">
    <aside class="game-left">
      <slot name="panel" />
    </aside>
    <section class="game-main">
      <slot />
    </section>
    <section class="game-below">
      <slot name="below" />
    </section>
  </div>
</template>
