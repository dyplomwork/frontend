<script setup lang="ts">
export type HowToSection = {
  title: string
  items: string[]
}

type Props = {
  heading?: string
  intro?: string
  sections?: HowToSection[]
}

const props = withDefaults(defineProps<Props>(), {
  // All callers pass a localized heading via $t(...); empty default avoids a
  // hardcoded language leaking into either locale.
  heading: '',
  intro: '',
  sections: () => [],
})
</script>

<template>
  <details class="howto" open>
    <summary class="howto-summary">
      <span class="howto-title">{{ props.heading }}</span>
      <span class="howto-chev" aria-hidden="true">▾</span>
    </summary>
    <div class="howto-body">
      <p v-if="props.intro" class="howto-intro">{{ props.intro }}</p>

      <div v-for="(s, i) in props.sections" :key="i" class="howto-section">
        <div class="howto-h">{{ s.title }}</div>
        <ul class="howto-list">
          <li v-for="(it, j) in s.items" :key="j">{{ it }}</li>
        </ul>
      </div>

      <slot />
    </div>
  </details>
</template>
