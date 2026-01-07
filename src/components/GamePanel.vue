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
      <div class="label">{{ $t('ui.s_b2f4069085') }}</div>
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


