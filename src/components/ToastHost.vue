<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
const { toasts } = storeToRefs(ui)
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-relevant="additions">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" role="status">
      <div class="toast-main">
        <div v-if="t.title" class="toast-title">{{ t.title }}</div>
        <div class="toast-text">{{ t.text }}</div>
      </div>
      <button class="toast-x" @click="ui.dismiss(t.id)" aria-label="Close">×</button>
    </div>
  </div>
</template>
