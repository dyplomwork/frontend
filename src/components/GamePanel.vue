<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sfx } from '../utils/sfx'
import GameStatus, { type GameStatusType } from './GameStatus.vue'

type Props = {
  modelValue: number | string
  playText?: string
  disabled?: boolean
  currency?: string
  message?: string
  messageType?: GameStatusType
  showMultButtons?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  playText: '',
  disabled: false,
  currency: 'K',
  message: '',
  messageType: 'info',
  showMultButtons: true,
})

const { t } = useI18n()
const playLabel = computed(() => props.playText || t('ui.s_de3c731be5'))

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'half'): void
  (e: 'double'): void
  (e: 'play'): void
}>()

const amountStr = computed(() => String(props.modelValue ?? ''))

function setAmount(v: string) {
  const n = Number(v)
  emit('update:modelValue', Number.isFinite(n) ? n : 0)
}

function onHalf() {
  sfx('click')
  emit('half')
}
function onDouble() {
  sfx('click')
  emit('double')
}
function onPlay() {
  emit('play')
}
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
      {{ playLabel }}
    </button>

    <slot />

    <GameStatus :type="messageType" :text="message" />
    <slot name="summary" />
  </div>
</template>
