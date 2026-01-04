import { computed, onBeforeUnmount, ref } from 'vue'

type SoundKey = 'impact' | 'count' | 'climax'

export type BigWinState = {
  show: boolean
  title: string
  mult: number
  amount: number
  displayValue: number
  displayText: string
  tier: 1 | 2 | 3 // 1=big, 2=mega, 3=super
}

export type UseBigWinOverlayOptions = {
  /** Formats a number for display (e.g. 1234.56 -> "1,234.56") */
  formatNumber: (v: number | string, digits?: number) => string
  /** Optional: play a site-wide sfx key (e.g. 'win') */
  sfx?: (key: string) => void
  /** If you have a global sound toggle, pass it here. Defaults to true. */
  soundOn?: () => boolean
  /** Overall overlay volume multiplier. Defaults to 0.35 */
  volume?: () => number
  /** Money shortener, optional. If omitted, a compact "K/M/B/T" formatter is used */
  shortMoney?: (v: number) => string
  /** Tier resolver. If omitted, uses multiplier thresholds (>=100 super, >=50 mega) */
  getTier?: (mult: number) => { tier: 1 | 2 | 3; title: string }
}

function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function useBigWinOverlay(opts: UseBigWinOverlayOptions) {
  const soundOn = computed(() => (opts.soundOn ? !!opts.soundOn() : true))
  const vol = computed(() => (opts.volume ? opts.volume() : 0.35))

  const bigWin = ref<BigWinState>({
    show: false,
    title: 'BIG WIN',
    mult: 0,
    amount: 0,
    displayValue: 0,
    displayText: '0',
    tier: 1,
  })

  let hideTimer: number | null = null
  let raf: number | null = null
  let countLoop: HTMLAudioElement | null = null
  const soundCache = new Map<string, HTMLAudioElement>()

  function getSoundUrl(key: SoundKey, tier: number) {
    // tier: 1=BIG,2=MEGA,3=SUPER
    const imp = 'mp3'
    const ext = 'wav'
    if (key === 'impact') {
      if (tier === 3) return `/sfx/superwin_impact.${imp}`
      if (tier === 2) return `/sfx/megawin_impact.${ext}`
      return `/sfx/bigwin_impact.${imp}`
    }
    if (key === 'climax') {
      if (tier === 3) return `/sfx/superwin_climax.${imp}`
      if (tier === 2) return `/sfx/megawin_climax.${imp}`
      return `/sfx/bigwin_climax.${ext}`
    }
    return `/sfx/bigwin_count.${ext}`
  }

  function playOne(url: string, volume: number) {
    if (!soundOn.value) return
    let a = soundCache.get(url)
    if (!a) {
      a = new Audio(url)
      a.preload = 'auto'
      soundCache.set(url, a)
    }
    try {
      const b = a.cloneNode(true) as HTMLAudioElement
      b.volume = Math.max(0, Math.min(1, volume))
      void b.play()
    } catch {}
  }

  function stopCountLoop() {
    if (!countLoop) return
    try {
      countLoop.pause()
      countLoop.currentTime = 0
    } catch {}
    countLoop = null
  }

  function startCountLoop(url: string, volume: number) {
    if (!soundOn.value) return
    stopCountLoop()
    const a = new Audio(url)
    a.preload = 'auto'
    a.loop = true
    a.volume = Math.max(0, Math.min(1, volume))
    countLoop = a
    try {
      void a.play()
    } catch {}
  }

  function defaultShortMoney(v: number) {
    const n = Number(v) || 0
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `${opts.formatNumber(n / 1_000_000_000, 2)} T`
    if (abs >= 1_000_000) return `${opts.formatNumber(n / 1_000_000, 2)} B`
    if (abs >= 1_000) return `${opts.formatNumber(n / 1_000, 2)} M`
    return `${opts.formatNumber(n, 2)} K`
  }

  function animateCounter(target: number, durationMs = 900) {
    if (raf !== null) cancelAnimationFrame(raf)
    stopCountLoop()

    startCountLoop(getSoundUrl('count', bigWin.value.tier), vol.value * 0.25)

    const start = performance.now()
    const from = 0
    const to = Math.max(0, Number(target) || 0)

    const tick = (now: number) => {
      const p = clamp01((now - start) / durationMs)
      const k = easeOutExpo(p)
      const v = from + (to - from) * k
      bigWin.value.displayValue = v
      bigWin.value.displayText = (opts.shortMoney ?? defaultShortMoney)(v)

      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = null
        stopCountLoop()
        playOne(getSoundUrl('climax', bigWin.value.tier), vol.value * 0.95)
      }
    }

    raf = requestAnimationFrame(tick)
  }

  function defaultTier(mult: number) {
    if (mult >= 100) return { tier: 3 as const, title: 'SUPER WIN' }
    if (mult >= 50) return { tier: 2 as const, title: 'MEGA WIN' }
    return { tier: 1 as const, title: 'BIG WIN' }
  }

  async function showBigWin(mult: number, amount: number) {
    if (hideTimer !== null) window.clearTimeout(hideTimer)
    if (raf !== null) cancelAnimationFrame(raf)

    const t = (opts.getTier ?? defaultTier)(mult)

    bigWin.value.show = true
    bigWin.value.tier = t.tier
    bigWin.value.title = t.title
    bigWin.value.mult = mult
    bigWin.value.amount = amount

    playOne(getSoundUrl('impact', bigWin.value.tier), vol.value * 0.95)

    bigWin.value.displayValue = 0
    bigWin.value.displayText = (opts.shortMoney ?? defaultShortMoney)(0)
    animateCounter(amount, t.tier === 3 ? 1200 : t.tier === 2 ? 1050 : 900)

    // site-wide sfx fallback
    try {
      opts.sfx?.('big_win')
    } catch {
      try {
        opts.sfx?.('win')
      } catch {}
    }

    const ttl = t.tier === 3 ? 3400 : t.tier === 2 ? 3000 : 2600
    hideTimer = window.setTimeout(() => {
      stopCountLoop()
      bigWin.value.show = false
      hideTimer = null
    }, ttl)
  }

  function dispose() {
    if (hideTimer !== null) window.clearTimeout(hideTimer)
    hideTimer = null
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
    stopCountLoop()
  }

  onBeforeUnmount(dispose)

  return { bigWin, showBigWin, dispose }
}
