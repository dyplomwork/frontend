<script setup lang="ts">
import GameLayout from './GameLayout.vue'

type Props = {
  minHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 640,
})
</script>

<template>
  <div class="game-page-container">
    <GameLayout :min-height="props.minHeight">
      <template v-if="$slots.panel" #panel>
        <slot name="panel" />
      </template>

      <slot />

      <template v-if="$slots.below" #below>
        <slot name="below" />
      </template>
    </GameLayout>
  </div>
</template>