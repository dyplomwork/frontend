<script setup lang="ts">
export type GameStatusType = 'info' | 'success' | 'error'

type Props = {
  type?: GameStatusType
  text?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  text: '',
})
</script>

<template>
  <div v-if="props.text" class="game-status" :class="props.type">
    {{ props.text }}
  </div>
</template>
