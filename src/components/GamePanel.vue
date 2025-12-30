<script setup lang="ts">
import { computed } from 'vue'
import { sfx } from '../utils/sfx'

type Props = {
  modelValue: number | string
  playText?: string
  disabled?: boolean
  currency?: string
  message?: string
  showMultButtons?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  playText: 'Play',
  disabled: false,
  currency: 'K',
  message: '',
  showMultButtons: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'half'): void
  (e: 'double'): void
  (e: 'play'): void
}>()

const amountStr = computed(() => String(props.modelValue ?? ''))

function setAmount(v: string){
  const n = Number(v)
  emit('update:modelValue', Number.isFinite(n) ? n : 0)
}

function onHalf(){ sfx('click'); emit('half') }
function onDouble(){ sfx('click'); emit('double') }
function onPlay(){ emit('play') }
</script>

<template>
  <div class="panel-stack">
    <slot name="header" />

    <div class="field">
      <div class="label">Amount</div>
      <div class="amount-row">
        <input
          class="input"
          inputmode="decimal"
          :value="amountStr"
          :disabled="disabled"
          @input="setAmount(($event.target as HTMLInputElement).value)"
        />
        <div class="coin">{{ currency }}</div>
      </div>
      <div v-if="showMultButtons" class="btn-row">
        <button class="btn btn-ghost" :disabled="disabled" @click="onHalf">½</button>
        <button class="btn btn-ghost" :disabled="disabled" @click="onDouble">2×</button>
      </div>
    </div>

    <button class="btn btn-primary" :disabled="disabled" @click="onPlay">
      {{ playText }}
    </button>

    <slot />

    <div v-if="message" class="hint">{{ message }}</div>
    <slot name="summary" />
  </div>
</template>

<style scoped>
.panel-stack{ display:flex; flex-direction:column; gap: 12px; }
.field{ margin-top: 2px; }
.label{ color: var(--muted); font-size: 12px; margin-bottom: 8px; font-weight: 600; }
.amount-row{ display:grid; grid-template-columns: 1fr auto; gap: 10px; align-items:center; }
.coin{
  width: var(--control-h);
  height: var(--control-h);
  border-radius: 12px;
  background: rgba(250,204,21,.92);
  color: rgba(0,0,0,.85);
  display:grid;
  place-items:center;
  font-weight: 900;
}
.btn-row{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.hint{ color: rgba(255,255,255,.78); font-weight: 600; }
</style>
