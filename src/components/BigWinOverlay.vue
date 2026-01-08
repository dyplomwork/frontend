<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useBigWinStore } from '../stores/bigwin'
import { formatNumber } from '../utils/format'

const store = useBigWinStore()
const { bigWin } = storeToRefs(store)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
</script>

<template>
  <transition name="bigwin-fade">
    <div v-if="bigWin.show" class="bigwin" :class="`tier-${bigWin.tier}`">
      <div class="bigwin-backdrop"></div>

      <div class="bigwin-rays"></div>
      <div class="bigwin-burst"></div>
      <div class="bigwin-shock"></div>
      <div class="bigwin-shock shock2"></div>

      <div class="bigwin-card">
        <div class="bigwin-title">{{ bigWin.title }}</div>

        <div class="bigwin-amount">⭐ {{ bigWin.displayText }} {{ bigWin.title }} ⭐</div>

        <div class="bigwin-sub">x{{ fmt(bigWin.mult, 2) }} • +{{ fmt(bigWin.amount, 2) }}</div>

        <div class="bigwin-sparks">
          <i v-for="i in 26" :key="i" />
        </div>
      </div>
    </div>
  </transition>
</template>
