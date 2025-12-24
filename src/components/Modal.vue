<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>()
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" style="position:fixed; inset:0; background:rgba(0,0,0,.55); display:grid; place-items:center; padding:16px;" @click.self="$emit('close')">
      <div class="card" style="width:min(720px, 100%);">
        <div class="row-between">
          <b>{{ title || 'Info' }}</b>
          <button class="btn" @click="$emit('close')">Close</button>
        </div>
        <div style="margin-top:12px;">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
