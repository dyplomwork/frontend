import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useBigWinOverlay } from '../composables/useBigWinOverlay'
import { formatNumber } from '../utils/format'
import { isSfxOn, sfx } from '../utils/sfx'

export const useBigWinStore = defineStore('bigwin', () => {
  const soundOn = computed(() => isSfxOn())
  const volume = computed(() => 0.35)

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

  const show = (mult: number, amount: number) => showBigWin(mult, amount)

  return { bigWin, showBigWin, show, maybeShow, dispose }
})
