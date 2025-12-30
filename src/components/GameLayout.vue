<script setup lang="ts">
import { computed, useSlots } from 'vue'
type Props = {
  minHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 640,
})

function toCssPx(v: number | string){
  return typeof v === 'number' ? `${v}px` : v
}

const slots = useSlots()
const hasPanel = computed(() => !!slots.panel)
</script>

<template>
  <div class="game-shell panel" :class="{ 'no-panel': !hasPanel }" :style="{ minHeight: toCssPx(props.minHeight) }">
    <aside v-if="hasPanel" class="game-left">
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
.game-shell.no-panel{
  grid-template-columns: 1fr;
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
