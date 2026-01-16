<script setup lang="ts">
type Props = { title?: string }

defineProps<Props>()
</script>

<template>
  <div class="howto panel">
    <div class="howto-title">{{ title ?? 'Как играть' }}</div>
    <div class="howto-body"><slot /></div>
  </div>
</template>

<style scoped>
.howto{ margin-top: 16px; padding: 16px; }
.howto-title{ font-weight: 900; margin-bottom: 10px; }
</style>
