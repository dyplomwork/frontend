<script setup lang="ts">
import { computed } from 'vue'

type Cell = { id: string; sym: string }

const props = defineProps<{
  grid: Cell[][]
  spinning: boolean
}>()

const flat = computed(() => props.grid.flat())
</script>

<template>
  <div class="roulette" :class="{ spinning }" aria-label="Roulette 5x5">
    <div v-for="cell in flat" :key="cell.id" class="slot">
      <span class="sym">{{ cell.sym }}</span>
    </div>
  </div>
</template>


