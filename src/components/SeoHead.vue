<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'

const route = useRoute()

const siteName = 'Casino Simulator'
const fallbackTitle = `${siteName} — Plinko, Roulette, Mines, Dice, Cases`
const fallbackDescription =
  'A lightweight casino simulator (demo) with Plinko, Roulette, Mines, Dice and Cases. Try your luck and test strategies.'

const title = computed(() => (route.meta?.title as string) || fallbackTitle)
const description = computed(() => (route.meta?.description as string) || fallbackDescription)

const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')
const canonical = computed(() => (siteUrl ? `${siteUrl}${route.fullPath}` : undefined))

useHead(() => {
  const desc = description.value
  const t = title.value
  const can = canonical.value

  return {
    title: t,
    meta: [
      { name: 'description', content: desc },
      { name: 'robots', content: 'index,follow' },
      { property: 'og:site_name', content: siteName },
      { property: 'og:title', content: t },
      { property: 'og:description', content: desc },
      ...(can ? [{ property: 'og:url', content: can }] : [])
    ],
    link: [...(can ? [{ rel: 'canonical', href: can }] : [])]
  }
})
</script>

<template>
  <!-- Head-only component -->
  <span style="display:none" aria-hidden="true" />
</template>
