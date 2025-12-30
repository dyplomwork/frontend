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
  </div>
</template>

<style scoped>
.game-shell{
  overflow: hidden;
  display:grid;
  grid-template-columns: var(--left-panel-w) 1fr;
}
.game-left{
  border-right: 1px solid var(--border);
  background: rgba(10,20,28,.55);
  padding: var(--pad-18);
}
.game-main{
  min-width: 0;
  padding: var(--pad-18);
}

@media (max-width: 980px){
  .game-shell{ grid-template-columns: 1fr; }
  .game-left{ border-right: 0; border-bottom: 1px solid var(--border); }
}
</style>
