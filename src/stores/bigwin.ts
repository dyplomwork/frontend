import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useBigWinOverlay } from '../composables/useBigWinOverlay'
import { formatNumber } from '../utils/format'
import { isSfxOn, sfx } from '../utils/sfx'

/**
 * Global BIG/MEGA/SUPER win overlay.
 *
 * Trigger rule (consistent across games): show when totalWin >= totalBet * 20.
 * Tier is resolved from the round multiplier (totalWin / totalBet):
 *  - 20x..49.99x  -> BIG WIN
 *  - 50x..99.99x  -> MEGA WIN
 *  - 100x+        -> SUPER WIN
 */
export const useBigWinStore = defineStore('bigwin', () => {
  const soundOn = computed(() => isSfxOn())
  const volume = computed(() => 0.35)

  // IMPORTANT: in this project currency is displayed in "K-units" by default.
  // 1000 K = 1 M, 1_000_000 K = 1 B, 1_000_000_000 K = 1 T
  const shortMoney = (v: number) => {
    const n = Number(v) || 0
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `${formatNumber(n / 1_000_000_000, 2)} T`
    if (abs >= 1_000_000) return `${formatNumber(n / 1_000_000, 2)} B`
    if (abs >= 1_000) return `${formatNumber(n / 1_000, 2)} M`
    return `${formatNumber(n, 2)} K`
  }

  const { bigWin, showBigWin, dispose } = useBigWinOverlay({
    formatNumber: (v, digits = 2) => {
      // keep 2 decimals visually stable; project formatter already trims trailing zeros
      return formatNumber(v, digits)
    },
    sfx,
    soundOn: () => soundOn.value,
    volume: () => volume.value,
    shortMoney,
    getTier: (mult) => {
      if (mult >= 100) return { tier: 3 as const, title: 'SUPER WIN' }
      if (mult >= 50) return { tier: 2 as const, title: 'MEGA WIN' }
      return { tier: 1 as const, title: 'BIG WIN' }
    },
  })

  function maybeShow(totalWin: number, totalBet: number) {
    const win = Number(totalWin) || 0
    const bet = Math.max(0, Number(totalBet) || 0)
    if (bet <= 0) return
    const mult = win / bet
    if (win >= bet * 20) {
      void showBigWin(mult, win)
    }
  }

  // Backward-compatible alias (some views used bigwinStore.show(mult, amount))
  const show = (mult: number, amount: number) => showBigWin(mult, amount)

  return { bigWin, showBigWin, show, maybeShow, dispose }
})
