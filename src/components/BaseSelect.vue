<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

type Opt<T = any> = {
  value: T
  label: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: any
  options: ReadonlyArray<Opt>
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: any): void
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref<number>(-1)

const selected = computed(() => props.options.find((o) => Object.is(o.value, props.modelValue)))
const label = computed(() => selected.value?.label ?? props.placeholder ?? 'Select')

function setValue(v: any) {
  emit('update:modelValue', v)
}

function close() {
  open.value = false
  activeIndex.value = -1
}

async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    // set active to selected option or first enabled
    const selIdx = props.options.findIndex((o) => Object.is(o.value, props.modelValue))
    activeIndex.value = selIdx >= 0 ? selIdx : props.options.findIndex((o) => !o.disabled)
    await nextTick()
  }
}

function pick(idx: number) {
  const o = props.options[idx]
  if (!o || o.disabled) return
  setValue(o.value)
  close()
}

function move(delta: number) {
  if (!open.value) return
  const n = props.options.length
  if (!n) return
  let i = activeIndex.value
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n
    if (!props.options[i].disabled) {
      activeIndex.value = i
      break
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!open.value) toggle()
    else pick(activeIndex.value)
    return
  }
  if (e.key === 'Escape') {
    if (open.value) {
      e.preventDefault()
      close()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!open.value) toggle()
    else move(+1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) toggle()
    else move(-1)
    return
  }
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  const el = root.value
  if (!el) return
  if (!el.contains(e.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <div ref="root" class="base-select" :class="{ open, disabled: !!disabled }">
    <button
      class="base-select__trigger input"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel || $t('ui.s_e062622261')"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="base-select__label" :class="{ placeholder: !selected }">{{ label }}</span>
      <span class="base-select__chev" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="base-select__menu" role="listbox">
      <button
        v-for="(o, i) in options"
        :key="String(o.value)"
        class="base-select__opt"
        type="button"
        role="option"
        :aria-selected="Object.is(o.value, modelValue) ? 'true' : 'false'"
        :disabled="o.disabled"
        :class="{ active: i === activeIndex, selected: Object.is(o.value, modelValue) }"
        @mouseenter="activeIndex = i"
        @click="pick(i)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.base-select {
  position: relative;
  width: 100%;
}

.base-select__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}

.base-select.disabled .base-select__trigger {
  cursor: not-allowed;
  opacity: 0.65;
}

.base-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-select__label.placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.base-select__chev {
  opacity: 0.9;
  font-weight: 900;
  transform: translateY(-1px);
}

.base-select.open .base-select__chev {
  transform: rotate(180deg) translateY(1px);
}

.base-select__menu {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  z-index: 50;
  padding: 8px;
  border-radius: 14px;

  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 14, 20, 0.92);
  backdrop-filter: blur(10px);

  box-shadow:
    0 18px 46px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);

  max-height: 260px;
  overflow: auto;
}

.base-select__opt {
  width: 100%;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.86);
  padding: 10px 10px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  font-weight: 700;
}

.base-select__opt:hover:not(:disabled),
.base-select__opt.active:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.base-select__opt.selected:not(:disabled) {
  box-shadow: inset 0 0 0 1px rgba(245, 197, 66, 0.35);
}

.base-select__opt:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
