<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import GameHowTo from '../components/GameHowTo.vue'
import GameStatus from '../components/GameStatus.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { useUiStore } from '../stores/ui'
import { useRequireAuthAction } from '../composables/useRequireAuthAction'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { normalizeError, reportError, userMessageForStatusI18n } from '../utils/errors'
import { normalizeRouletteKey, roulettePlay } from '../api/games'

type BetKey =
  | `n:${number}`
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | 'doz1'
  | 'doz2'
  | 'doz3'
  | 'col1'
  | 'col2'
  | 'col3'

const auth = useAuthStore()
const bigwinStore = useBigWinStore()
const ui = useUiStore()
const { requireAuth } = useRequireAuthAction()
const { t } = useI18n()

const TEMP_ALLOW_FREE_SPIN = false

const chips = [1, 5, 10, 50, 100, 500, 1000, 5000]
const chip = ref(10)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

type BetState = { amount: number }
const bets = ref<Record<string, BetState>>({})
const history = ref<{ key: BetKey; amount: number }[]>([])
const spinning = ref(false)

const lastNumber = ref<number | null>(null)
const message = ref('')
const messageType = ref<'info' | 'success' | 'error'>('info')

function setError(e: unknown, fallback = t('ui.s_error')) {
  const n = normalizeError(e)
  const text = userMessageForStatusI18n(n.status, n.message || fallback, t)
  messageType.value = 'error'
  message.value = text
  if (n.status === 401) ui.toast(text, 'info')
  else ui.toast(text, 'error')
  reportError(e)
}

const winKeys = ref<Set<BetKey>>(new Set())
const tappedKey = ref<string>('')
let tapTimer: number | null = null
function tap(key: BetKey) {
  tappedKey.value = key
  if (tapTimer !== null) window.clearTimeout(tapTimer)
  tapTimer = window.setTimeout(() => (tappedKey.value = ''), 150)
}

let winTimer: number | null = null
function setWinKeysFor(win: number) {
  if (winTimer !== null) {
    window.clearTimeout(winTimer)
    winTimer = null
  }
  const s = new Set<BetKey>()
  for (const k of Object.keys(bets.value)) {
    const key = k as BetKey
    if (payoutFor(key, win) > 0) s.add(key)
  }
  winKeys.value = s
  winTimer = window.setTimeout(() => {
    winKeys.value = new Set()
  }, 1200)
}
function isWinKey(key: BetKey) {
  return winKeys.value.has(key)
}

const redSet = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
function colorOf(n: number) {
  if (n === 0) return 'green'
  return redSet.has(n) ? 'red' : 'black'
}

const hoverBet = ref<BetKey | ''>('')
function setHover(key: BetKey | '') {
  hoverBet.value = key
}
function numbersForOutsideBet(key: BetKey): number[] {
  switch (key) {
    case 'doz1':
      return Array.from({ length: 12 }, (_, i) => i + 1)
    case 'doz2':
      return Array.from({ length: 12 }, (_, i) => i + 13)
    case 'doz3':
      return Array.from({ length: 12 }, (_, i) => i + 25)
    case 'col1':
      return Array.from({ length: 12 }, (_, i) => (i + 1) * 3)
    case 'col2':
      return Array.from({ length: 12 }, (_, i) => 2 + i * 3)
    case 'col3':
      return Array.from({ length: 12 }, (_, i) => 1 + i * 3)
    case 'red':
      return Array.from(redSet)
    case 'black':
      return Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !redSet.has(n))
    case 'even':
      return Array.from({ length: 18 }, (_, i) => (i + 1) * 2)
    case 'odd':
      return Array.from({ length: 18 }, (_, i) => i * 2 + 1)
    case 'low':
      return Array.from({ length: 18 }, (_, i) => i + 1)
    case 'high':
      return Array.from({ length: 18 }, (_, i) => i + 19)
    default:
      return []
  }
}
const hoverNums = computed(() => {
  if (!hoverBet.value) return new Set<number>()
  return new Set(numbersForOutsideBet(hoverBet.value as BetKey))
})

const totalBet = computed(() => Object.values(bets.value).reduce((a, b) => a + (b?.amount ?? 0), 0))

type Tier = 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7' | 't8'
function tierForValue(v: number): Tier {
  if (v >= 5000) return 't8'
  if (v >= 1000) return 't7'
  if (v >= 500) return 't6'
  if (v >= 100) return 't5'
  if (v >= 50) return 't4'
  if (v >= 10) return 't3'
  if (v >= 5) return 't2'
  return 't1'
}
function betBadgeClass(v: number) {
  return `bet-${tierForValue(v)}`
}

const CHIP_COLORS: Record<number, string> = {
  1: '#ec4899',
  5: '#06b6d4',
  10: '#6d28d9',
  50: '#f97316',
  100: '#facc15',
  500: '#22c55e',
  1000: '#1e40af',
  5000: '#7f1d1d',
}
const CHIP_DENOMS = Object.keys(CHIP_COLORS)
  .map(Number)
  .sort((a, b) => a - b)

function chipStyle(v: number) {
  return { '--chip': CHIP_COLORS[v] ?? '#60a5fa' } as Record<string, string>
}

function nearestChipDenom(sum: number): number {
  const v = Math.max(0, Number(sum) || 0)
  let best = CHIP_DENOMS[0]
  let bestDiff = Math.abs(v - best)
  for (const d of CHIP_DENOMS) {
    const diff = Math.abs(v - d)
    if (diff < bestDiff) {
      best = d
      bestDiff = diff
    }
  }
  return best
}
function betColorByAmount(totalAmount: number) {
  const denom = nearestChipDenom(totalAmount)
  return CHIP_COLORS[denom] ?? 'rgba(245, 197, 66, 0.92)'
}
function betBadgeStyleByAmount(totalAmount: number) {
  return { '--bet': betColorByAmount(totalAmount) } as Record<string, string>
}

function selectChip(c: number) {
  chip.value = c
  sfx('click')
}

function addBet(key: BetKey) {
  if (spinning.value) return
  message.value = ''

  const cur = bets.value[key]?.amount ?? 0
  const next = cur + chip.value
  bets.value[key] = { amount: next }

  history.value.push({ key, amount: chip.value })
  tap(key)
  sfx('click')
}

function removeBetOnce(key: BetKey) {
  if (spinning.value) return
  message.value = ''

  const cur = bets.value[key]?.amount ?? 0
  if (cur <= 0) return

  const next = Math.max(0, cur - chip.value)
  if (next === 0) delete bets.value[key]
  else bets.value[key] = { amount: next }

  tap(key)
  sfx('click')
}
function clearBet(key: BetKey) {
  if (spinning.value) return
  message.value = ''

  if (bets.value[key]) {
    delete bets.value[key]
    tap(key)
    sfx('click')
  }
}
function onBetContext(e: MouseEvent, key: BetKey) {
  if (e.shiftKey) clearBet(key)
  else removeBetOnce(key)
}

function undo() {
  if (spinning.value) return
  const last = history.value.pop()
  if (!last) return

  const cur = bets.value[last.key]
  if (!cur) return

  const next = Math.max(0, cur.amount - last.amount)
  if (next === 0) delete bets.value[last.key]
  else bets.value[last.key] = { amount: next }

  sfx('click')
}

function clearAll() {
  if (spinning.value) return
  bets.value = {}
  history.value = []
  winKeys.value = new Set()
  sfx('click')
}

function payoutFor(key: BetKey, win: number) {
  if (key.startsWith('n:')) {
    const n = Number(key.slice(2))
    return n === win ? 36 : 0
  }
  if (key === 'red') return colorOf(win) === 'red' ? 2 : 0
  if (key === 'black') return colorOf(win) === 'black' ? 2 : 0
  if (key === 'even') return win !== 0 && win % 2 === 0 ? 2 : 0
  if (key === 'odd') return win % 2 === 1 ? 2 : 0
  if (key === 'low') return win >= 1 && win <= 18 ? 2 : 0
  if (key === 'high') return win >= 19 && win <= 36 ? 2 : 0
  if (key === 'doz1') return win >= 1 && win <= 12 ? 3 : 0
  if (key === 'doz2') return win >= 13 && win <= 24 ? 3 : 0
  if (key === 'doz3') return win >= 25 && win <= 36 ? 3 : 0
  if (key === 'col1') return win !== 0 && win % 3 === 0 ? 3 : 0
  if (key === 'col2') return win !== 0 && (win - 2) % 3 === 0 ? 3 : 0
  if (key === 'col3') return win !== 0 && (win - 1) % 3 === 0 ? 3 : 0
  return 0
}
const wheelNumbers = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31,
  9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

const SLICE_COUNT = computed(() => wheelNumbers.length)
const SLICE_ANGLE = computed(() => 360 / SLICE_COUNT.value)

function degToRad(d: number) {
  return (d * Math.PI) / 180
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = degToRad(deg)
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
function sliceAngles(i: number) {
  const a0 = -90 - SLICE_ANGLE.value / 2 + i * SLICE_ANGLE.value
  const a1 = a0 + SLICE_ANGLE.value
  return { a0, a1, mid: (a0 + a1) / 2 }
}
function slicePath(i: number) {
  const { a0, a1 } = sliceAngles(i)
  const r = 96
  const p0 = polar(100, 100, r, a0)
  const p1 = polar(100, 100, r, a1)
  const large = SLICE_ANGLE.value > 180 ? 1 : 0
  return `M 100 100 L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`
}
function labelPos(i: number) {
  const { mid } = sliceAngles(i)
  const p = polar(100, 100, 68, mid)
  return { x: p.x, y: p.y }
}
function labelRot(i: number) {
  return sliceAngles(i).mid + 90
}
function sliceColor(n: number) {
  if (n === 0) return '#1cb96a'
  return redSet.has(n) ? '#ff3b57' : '#1d2731'
}

function normalizeDeg(d: number) {
  return ((d % 360) + 360) % 360
}
function desiredWheelDegForNumber(n: number) {
  const idx = wheelNumbers.indexOf(n)
  if (idx < 0) return 0
  return normalizeDeg(-idx * SLICE_ANGLE.value)
}

const highlightIdx = ref<number | null>(null)
let highlightTimer: number | null = null
function highlightNumber(n: number) {
  const idx = wheelNumbers.indexOf(n)
  highlightIdx.value = idx >= 0 ? idx : null
  if (highlightTimer !== null) window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => {
    highlightIdx.value = null
  }, 1000)
}

const wheelDeg = ref(0)
const wheelAnimating = ref(false)
const idlePausedUntil = ref(0)
function pauseIdle(ms = 10_000) {
  idlePausedUntil.value = Date.now() + ms
}

let rafId: number | null = null
function startIdleSpin() {
  const tick = () => {
    const now = Date.now()
    const paused = now < idlePausedUntil.value
    if (!spinning.value && !paused) wheelDeg.value = (wheelDeg.value + 0.15) % 360
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}
function stopIdleSpin() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

const lastNumbers = ref<number[]>([])
const wheelFlash = ref(false)
let wheelFlashTimer: number | null = null
function flashWheel() {
  wheelFlash.value = true
  if (wheelFlashTimer !== null) window.clearTimeout(wheelFlashTimer)
  wheelFlashTimer = window.setTimeout(() => (wheelFlash.value = false), 420)
}

onMounted(() => startIdleSpin())
onBeforeUnmount(() => {
  stopIdleSpin()
  if (tapTimer !== null) window.clearTimeout(tapTimer)
  if (winTimer !== null) window.clearTimeout(winTimer)
  if (wheelFlashTimer !== null) window.clearTimeout(wheelFlashTimer)
  if (highlightTimer !== null) window.clearTimeout(highlightTimer)
})


async function spinInternal() {
  if (spinning.value) return

  spinning.value = true
  wheelAnimating.value = true
  message.value = ''
  messageType.value = 'info'
  lastNumber.value = null
  winKeys.value = new Set()
  pauseIdle(1_000)

  try {
    sfx('spin')

    let win: number
    let payout = 0
    let shouldRefreshBalance = false

    if (TEMP_ALLOW_FREE_SPIN) {
      win = wheelNumbers[Math.floor(Math.random() * wheelNumbers.length)]
    } else {
      if (!auth.user) {
        messageType.value = 'error'
        message.value = t('ui.s_need_login')
        return
      }
      if (totalBet.value <= 0) {
        messageType.value = 'error'
        message.value = t('ui.s_roulette_make_bet')
        return
      }
      if (auth.user.balance < totalBet.value) {
        messageType.value = 'error'
        message.value = t('ui.s_insufficient_balance')
        return
      }

      const payload = Object.entries(bets.value)
        .filter(([, b]) => (b?.amount ?? 0) > 0)
        .map(([key, b]) => ({
          key: normalizeRouletteKey(key),
          amount: round2(Number(b.amount)),
        }))

      const res = await roulettePlay({ bets: payload })
      win = Number((res as any).number)
      payout = Number((res as any).amount ?? (res as any).payout ?? 0)
      shouldRefreshBalance = true
    }

    const extra = 360 * (7 + Math.floor(Math.random() * 3))
    const current = normalizeDeg(wheelDeg.value)
    const desired = desiredWheelDegForNumber(win)
    const correction = desired - current

    wheelDeg.value = wheelDeg.value + extra + correction

    await new Promise((r) => setTimeout(r, 3600))
    sfx('stop')
    wheelAnimating.value = false
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    wheelDeg.value = desiredWheelDegForNumber(win)

    lastNumber.value = win
    lastNumbers.value = [win, ...lastNumbers.value].slice(0, 30)

    flashWheel()
    highlightNumber(win)
    setWinKeysFor(win)

    if (payout > 0) {
      const profit = Math.max(0, payout - Number(totalBet.value))
      messageType.value = 'success'
      message.value = t('ui.s_roulette_win', { n: win, p: fmt(profit, 2) })
      bigwinStore.maybeShow(payout, totalBet.value)
    } else {
      messageType.value = 'info'
      message.value = t('ui.s_roulette_result', { n: win })
    }

    if (shouldRefreshBalance) {
      try {
        await auth.fetchBalance({ force: true })
      } catch (e) {
        reportError(e)
      }
    }
  } catch (e: any) {
    setError(e, t('ui.s_error'))
  } finally {
    spinning.value = false
    wheelAnimating.value = false
  }
}

function spin() {
  if (TEMP_ALLOW_FREE_SPIN) return spinInternal()
  return requireAuth(() => spinInternal())
}

const numGrid = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
]

function betOf(key: BetKey) {
  return bets.value[key]?.amount ?? 0
}
</script>

<template>
  <GamePageLayout>
    <template #panel>
      <div class="panel-stack">
        <div class="field">
          <div class="label">{{ $t('ui.s_c65930bb15') }}</div>
          <div class="chip-row">
            <button
              v-for="c in chips"
              :key="c"
              class="chip"
              :style="chipStyle(c)"
              :class="{ on: chip === c }"
              @click="selectChip(c)"
            >
              <span class="chip-core">
                <span class="chip-val">{{ fmt(c, 0) }}</span>
              </span>
            </button>
          </div>
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_a876fbe73a') }}</div>
          <div class="amount-total">
            <div class="num">{{ fmt(totalBet, 2) }}</div>
            <span class="coin" :aria-label="$t('ui.s_d940a38dce')">K</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-ghost" :disabled="spinning" @click="undo">{{ $t('ui.s_undo') }}</button>
            <button class="btn btn-ghost" :disabled="spinning" @click="clearAll">{{ $t('ui.s_clear') }}</button>
          </div>
        </div>

        <button class="btn btn-primary" :disabled="spinning" @click="spin">
          {{ spinning ? $t('ui.s_spinning') : $t('ui.s_de3c731be5') }}
        </button>

        <GameStatus :type="messageType" :text="message" />
      </div>
    </template>

    <div class="roulette-wrap">
      <div>
        <div class="wheel-area">
          <div class="pointer" aria-hidden="true"></div>

          <div
            class="wheel-svg"
            :class="{ spinning: wheelAnimating, flash: wheelFlash }"
            :style="{ transform: `rotate(${wheelDeg}deg)` }"
          >
            <svg class="wheel-svg__el" viewBox="0 0 200 200" aria-hidden="true">
              <g>
                <path
                  v-for="(n, i) in wheelNumbers"
                  :key="`s-${i}`"
                  :d="slicePath(i)"
                  :fill="sliceColor(n)"
                  :class="{ 'slice-win': highlightIdx === i }"
                />
                <text
                  v-for="(n, i) in wheelNumbers"
                  :key="`t-${i}`"
                  :x="labelPos(i).x"
                  :y="labelPos(i).y"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="wheel-label"
                  :transform="`rotate(${labelRot(i)} ${labelPos(i).x} ${labelPos(i).y})`"
                >
                  {{ n }}
                </text>
              </g>
              <circle cx="100" cy="100" r="6" fill="rgba(255,255,255,.9)" />
            </svg>
          </div>

          <div class="last" v-if="lastNumber !== null">
            <span class="badge" :class="colorOf(lastNumber)">{{ lastNumber }}</span>
          </div>
        </div>

        <div class="history-under" v-if="lastNumbers.length">
          <div class="history-title">{{ $t('ui.s_last') }}</div>
          <div class="history-row">
            <span v-for="(n, idx) in lastNumbers" :key="idx" class="history-pill" :class="colorOf(n)">
              {{ n }}
            </span>
          </div>
        </div>
      </div>

      <div class="board">
        <div class="roulette-table">
          <div class="table-top">
            <button
              class="cell-zero"
              :class="{ win: isWinKey('n:0'), tap: tappedKey === 'n:0' }"
              @click="addBet('n:0')"
              @contextmenu.prevent="onBetContext($event, 'n:0')"
            >
              0
              <span
                v-if="betOf('n:0')"
                class="chip-badge"
                :class="betBadgeClass(betOf('n:0'))"
                :style="betBadgeStyleByAmount(betOf('n:0'))"
              >
                {{ fmt(betOf('n:0'), 0) }}
              </span>
            </button>

            <div class="nums">
              <div class="row" v-for="(row, ri) in numGrid" :key="ri">
                <button
                  v-for="n in row"
                  :key="n"
                  class="cell"
                  :class="[
                    colorOf(n),
                    {
                      win: isWinKey(`n:${n}` as any),
                      has: !!betOf(`n:${n}` as any),
                      tap: tappedKey === `n:${n}`,
                      hover: hoverNums.has(n),
                    },
                  ]"
                  @click="addBet(`n:${n}` as any)"
                  @contextmenu.prevent="onBetContext($event, `n:${n}` as any)"
                >
                  {{ n }}
                  <span
                    v-if="betOf(`n:${n}` as any)"
                    class="chip-badge"
                    :class="betBadgeClass(betOf(`n:${n}` as any))"
                    :style="betBadgeStyleByAmount(betOf(`n:${n}` as any))"
                  >
                    {{ fmt(betOf(`n:${n}` as any), 0) }}
                  </span>
                </button>
              </div>
            </div>

            <div class="col-2to1">
              <button
                class="cell out"
                :class="{ win: isWinKey('col1'), has: !!betOf('col1'), tap: tappedKey === 'col1' }"
                @click="addBet('col1')"
                @contextmenu.prevent="onBetContext($event, 'col1')"
                @mouseenter="setHover('col1')"
                @mouseleave="setHover('')"
              >
                2:1
                <span
                  v-if="betOf('col1')"
                  class="chip-badge"
                  :class="betBadgeClass(betOf('col1'))"
                  :style="betBadgeStyleByAmount(betOf('col1'))"
                >
                  {{ fmt(betOf('col1'), 0) }}
                </span>
              </button>

              <button
                class="cell out"
                :class="{ win: isWinKey('col2'), has: !!betOf('col2'), tap: tappedKey === 'col2' }"
                @click="addBet('col2')"
                @contextmenu.prevent="onBetContext($event, 'col2')"
                @mouseenter="setHover('col2')"
                @mouseleave="setHover('')"
              >
                2:1
                <span
                  v-if="betOf('col2')"
                  class="chip-badge"
                  :class="betBadgeClass(betOf('col2'))"
                  :style="betBadgeStyleByAmount(betOf('col2'))"
                >
                  {{ fmt(betOf('col2'), 0) }}
                </span>
              </button>

              <button
                class="cell out"
                :class="{ win: isWinKey('col3'), has: !!betOf('col3'), tap: tappedKey === 'col3' }"
                @click="addBet('col3')"
                @contextmenu.prevent="onBetContext($event, 'col3')"
                @mouseenter="setHover('col3')"
                @mouseleave="setHover('')"
              >
                2:1
                <span
                  v-if="betOf('col3')"
                  class="chip-badge"
                  :class="betBadgeClass(betOf('col3'))"
                  :style="betBadgeStyleByAmount(betOf('col3'))"
                >
                  {{ fmt(betOf('col3'), 0) }}
                </span>
              </button>
            </div>
          </div>

          <div class="dozens-row">
            <button
              class="cell big"
              :class="{ win: isWinKey('doz1'), has: !!betOf('doz1'), tap: tappedKey === 'doz1' }"
              @click="addBet('doz1')"
              @contextmenu.prevent="onBetContext($event, 'doz1')"
              @mouseenter="setHover('doz1')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_1_to_12') }}
              <span
                v-if="betOf('doz1')"
                class="chip-badge"
                :class="betBadgeClass(betOf('doz1'))"
                :style="betBadgeStyleByAmount(betOf('doz1'))"
              >
                {{ fmt(betOf('doz1'), 0) }}
              </span>
            </button>

            <button
              class="cell big"
              :class="{ win: isWinKey('doz2'), has: !!betOf('doz2'), tap: tappedKey === 'doz2' }"
              @click="addBet('doz2')"
              @contextmenu.prevent="onBetContext($event, 'doz2')"
              @mouseenter="setHover('doz2')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_13_to_24') }}
              <span
                v-if="betOf('doz2')"
                class="chip-badge"
                :class="betBadgeClass(betOf('doz2'))"
                :style="betBadgeStyleByAmount(betOf('doz2'))"
              >
                {{ fmt(betOf('doz2'), 0) }}
              </span>
            </button>

            <button
              class="cell big"
              :class="{ win: isWinKey('doz3'), has: !!betOf('doz3'), tap: tappedKey === 'doz3' }"
              @click="addBet('doz3')"
              @contextmenu.prevent="onBetContext($event, 'doz3')"
              @mouseenter="setHover('doz3')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_25_to_36') }}
              <span
                v-if="betOf('doz3')"
                class="chip-badge"
                :class="betBadgeClass(betOf('doz3'))"
                :style="betBadgeStyleByAmount(betOf('doz3'))"
              >
                {{ fmt(betOf('doz3'), 0) }}
              </span>
            </button>
          </div>

          <div class="outside-row">
            <button
              class="cell big"
              :class="{ win: isWinKey('low'), has: !!betOf('low'), tap: tappedKey === 'low' }"
              @click="addBet('low')"
              @contextmenu.prevent="onBetContext($event, 'low')"
              @mouseenter="setHover('low')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_1_to_18') }}
              <span
                v-if="betOf('low')"
                class="chip-badge"
                :class="betBadgeClass(betOf('low'))"
                :style="betBadgeStyleByAmount(betOf('low'))"
              >
                {{ fmt(betOf('low'), 0) }}
              </span>
            </button>

            <button
              class="cell big"
              :class="{ win: isWinKey('even'), has: !!betOf('even'), tap: tappedKey === 'even' }"
              @click="addBet('even')"
              @contextmenu.prevent="onBetContext($event, 'even')"
              @mouseenter="setHover('even')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_even') }}
              <span
                v-if="betOf('even')"
                class="chip-badge"
                :class="betBadgeClass(betOf('even'))"
                :style="betBadgeStyleByAmount(betOf('even'))"
              >
                {{ fmt(betOf('even'), 0) }}
              </span>
            </button>

            <button
              class="cell big bet-red"
              :class="{ win: isWinKey('red'), has: !!betOf('red'), tap: tappedKey === 'red' }"
              @click="addBet('red')"
              @contextmenu.prevent="onBetContext($event, 'red')"
              @mouseenter="setHover('red')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_red') }}
              <span
                v-if="betOf('red')"
                class="chip-badge"
                :class="betBadgeClass(betOf('red'))"
                :style="betBadgeStyleByAmount(betOf('red'))"
              >
                {{ fmt(betOf('red'), 0) }}
              </span>
            </button>

            <button
              class="cell big bet-black"
              :class="{ win: isWinKey('black'), has: !!betOf('black'), tap: tappedKey === 'black' }"
              @click="addBet('black')"
              @contextmenu.prevent="onBetContext($event, 'black')"
              @mouseenter="setHover('black')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_black') }}
              <span
                v-if="betOf('black')"
                class="chip-badge"
                :class="betBadgeClass(betOf('black'))"
                :style="betBadgeStyleByAmount(betOf('black'))"
              >
                {{ fmt(betOf('black'), 0) }}
              </span>
            </button>

            <button
              class="cell big"
              :class="{ win: isWinKey('odd'), has: !!betOf('odd'), tap: tappedKey === 'odd' }"
              @click="addBet('odd')"
              @contextmenu.prevent="onBetContext($event, 'odd')"
              @mouseenter="setHover('odd')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_odd') }}
              <span
                v-if="betOf('odd')"
                class="chip-badge"
                :class="betBadgeClass(betOf('odd'))"
                :style="betBadgeStyleByAmount(betOf('odd'))"
              >
                {{ fmt(betOf('odd'), 0) }}
              </span>
            </button>

            <button
              class="cell big"
              :class="{ win: isWinKey('high'), has: !!betOf('high'), tap: tappedKey === 'high' }"
              @click="addBet('high')"
              @contextmenu.prevent="onBetContext($event, 'high')"
              @mouseenter="setHover('high')"
              @mouseleave="setHover('')"
            >
              {{ $t('ui.s_19_to_36') }}
              <span
                v-if="betOf('high')"
                class="chip-badge"
                :class="betBadgeClass(betOf('high'))"
                :style="betBadgeStyleByAmount(betOf('high'))"
              >
                {{ fmt(betOf('high'), 0) }}
              </span>
            </button>
          </div>
        </div>

        <div class="bets-mini" v-if="Object.keys(bets).length">
          <div class="mini-title">{{ $t('ui.s_bets') }}</div>
          <div class="mini-row">
            <div
              v-for="(b, k) in bets"
              :key="k"
              class="mini-pill"
              :style="betBadgeStyleByAmount(b.amount)"
              @contextmenu.prevent="onBetContext($event, k as any)"
            >
              <span class="k">{{ k }}</span>
              <span class="v">{{ fmt(b.amount, 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #below>
      <GameHowTo
        :heading="$t('ui.s_howto_roulette')"
        :intro="$t('ui.s_howto_roulette_intro')"
        :sections="[
          { title: $t('ui.s_howto_steps'), items: [
            $t('ui.s_howto_roulette_step_1'),
            $t('ui.s_howto_roulette_step_2'),
            $t('ui.s_howto_roulette_step_3'),
            $t('ui.s_howto_roulette_step_4')
          ]},
          { title: $t('ui.s_howto_mechanics'), items: [
            $t('ui.s_howto_roulette_mech_1'),
            $t('ui.s_howto_roulette_mech_2'),
            $t('ui.s_howto_roulette_mech_3')
          ]},
          { title: $t('ui.s_howto_tips'), items: [
            $t('ui.s_howto_roulette_tip_1'),
            $t('ui.s_howto_roulette_tip_2')
          ]}
        ]"
      />
    </template>
  </GamePageLayout>
</template>


<style scoped>
.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  margin-top: 4px;
}
.label {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
  font-weight: 600;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  --c: var(--chip, #60a5fa);
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 999px;
  border: 0;
  cursor: pointer;
  padding: 0;
  color: #fff;
  user-select: none;
  overflow: hidden;
  background:
    radial-gradient(18px 18px at 32% 28%, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 60%),
    radial-gradient(70% 70% at 50% 60%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0) 62%), var(--c);
  box-shadow:
    0 10px 18px rgba(0, 0, 0, 0.45),
    inset 0 2px 0 rgba(255, 255, 255, 0.2),
    inset 0 -6px 10px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.12s ease,
    filter 0.12s ease,
    box-shadow 0.18s ease;
  outline: none;
}
.chip:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}
.chip.on {
  transform: translateY(-2px) scale(1.04);
  box-shadow:
    0 14px 26px rgba(0, 0, 0, 0.55),
    0 0 0 3px rgba(255, 255, 255, 0.18),
    inset 0 2px 0 rgba(255, 255, 255, 0.22),
    inset 0 -7px 12px rgba(0, 0, 0, 0.35);
}
.chip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 8px, rgba(255, 255, 255, 0.95) 0 2px, transparent 3px),
    radial-gradient(
      circle at calc(100% - 8px) 50%,
      rgba(255, 255, 255, 0.95) 0 2px,
      transparent 3px
    ),
    radial-gradient(
      circle at 50% calc(100% - 8px),
      rgba(255, 255, 255, 0.95) 0 2px,
      transparent 3px
    ),
    radial-gradient(circle at 8px 50%, rgba(255, 255, 255, 0.95) 0 2px, transparent 3px),
    repeating-conic-gradient(
      from -10deg,
      rgba(255, 255, 255, 0.95) 0 14deg,
      rgba(255, 255, 255, 0) 14deg 62deg
    );
  -webkit-mask: radial-gradient(circle, transparent 0 58%, #000 60% 100%);
  mask: radial-gradient(circle, transparent 0 58%, #000 60% 100%);
  opacity: 0.95;
  z-index: 1;
}
.chip::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0.75) 0 10deg,
    rgba(255, 255, 255, 0) 10deg 20deg
  );
  -webkit-mask: radial-gradient(circle, transparent 0 34%, #000 36% 44%, transparent 46% 100%);
  mask: radial-gradient(circle, transparent 0 34%, #000 36% 44%, transparent 46% 100%);
  opacity: 0.55;
  z-index: 1;
}
.chip-core {
  position: absolute;
  inset: 22%;
  border-radius: 999px;
  display: grid;
  place-items: center;
  z-index: 3;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.35) 0 55%, rgba(0, 0, 0, 0) 58%);
}
.chip-val {
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.2px;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.55),
    0 0 10px rgba(0, 0, 0, 0.35);
  -webkit-text-stroke: 0.35px rgba(0, 0, 0, 0.35);
  transform: translateY(-0.5px);
}

.amount-total {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}
.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
.hint {
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.78);
  font-weight: 600;
}

.roulette-wrap {
  --wheel: clamp(240px, 24vw, 340px);
  --zero: 70px;
  --col: 60px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}
.wheel-area {
  position: relative;
  width: var(--wheel);
  height: var(--wheel);
  margin: 0 auto;
}

.pointer {
  position: absolute;
  left: 50%;
  top: 1px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 18px solid #f5c542;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));
  z-index: 6;
}

.last {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 7;
}

.history-under {
  margin: 10px auto 0;
  width: calc(var(--wheel) - 36px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  border-radius: 14px;
  padding: 10px 12px;
}
.history-title {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}
.history-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-start;
}
.history-pill {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  font-weight: 900;
  font-size: 12px;
}
.history-pill.red {
  background: rgba(255, 59, 87, 0.86);
  color: #081018;
}
.history-pill.black {
  background: rgba(44, 58, 72, 0.92);
}
.history-pill.green {
  background: rgba(0, 231, 1, 0.72);
  color: #07130c;
}

.badge {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  font-weight: 900;
}
.badge.red {
  box-shadow: 0 0 18px rgba(255, 58, 84, 0.25);
}
.badge.black {
  box-shadow: 0 0 18px rgba(180, 210, 255, 0.12);
}
.badge.green {
  box-shadow: 0 0 18px rgba(25, 170, 90, 0.22);
}

.board {
  padding-top: 6px;
  width: 100%;
}
.board {
  --cell: 44px;
  --gap: 6px;
}

.roulette-table {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.table-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.col-2to1 {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  width: var(--col);
}

.dozens-row,
.outside-row {
  display: grid;
  gap: var(--gap);
  margin-left: calc(var(--zero) + 10px);
  margin-right: calc(var(--col) + 10px);
}

.dozens-row {
  grid-template-columns: repeat(3, 1fr);
  width: calc(var(--cell) * 12 + var(--gap) * 11);
}

.outside-row {
  grid-template-columns: repeat(6, 1fr);
  width: calc(var(--cell) * 12 + var(--gap) * 11);
}

.cell-zero {
  width: 70px;
  height: calc(var(--cell) * 3 + var(--gap) * 2);
  background: rgba(0, 231, 1, 0.72);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-weight: 900;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    filter 0.12s ease,
    box-shadow 0.18s ease;
  position: relative;
  overflow: hidden;
}

.row {
  display: flex;
  gap: var(--gap);
  margin-bottom: var(--gap);
}

.cell {
  width: var(--cell);
  height: var(--cell);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.92);
  font-weight: 900;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    filter 0.12s ease,
    box-shadow 0.18s ease;
  position: relative;
  overflow: hidden;
}
.cell:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}
.cell.red {
  background: rgba(255, 58, 84, 0.86);
  color: #081018;
}
.cell.black {
  background: rgba(44, 58, 72, 0.88);
}

.cell.bet-red {
  background: rgba(255, 58, 84, 0.86);
  color: #081018;
}
.cell.bet-black {
  background: rgba(44, 58, 72, 0.92);
}
.cell.out {
  width: 100%;
  height: var(--cell);
  background: rgba(255, 255, 255, 0.03);
}

.col-bets {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  margin-left: 0;
}
.big {
  width: 100%;
  height: var(--cell);
}

.cell.has {
  box-shadow: inset 0 0 0 1px rgba(245, 197, 66, 0.28);
}
.cell.hover {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.1),
    0 0 0 2px rgba(245, 197, 66, 0.55),
    0 0 34px rgba(245, 197, 66, 0.26),
    0 0 60px rgba(245, 197, 66, 0.14);
  filter: brightness(1.14);
  transform: translateY(-1px) scale(1.03);
}
.cell.win,
.cell-zero.win {
  box-shadow:
    0 0 0 1px rgba(245, 197, 66, 0.55),
    0 0 28px rgba(245, 197, 66, 0.22);
  filter: brightness(1.12);
}

.chip-badge {
  --bet: rgba(245, 197, 66, 0.92);
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background:
    radial-gradient(10px 10px at 30% 30%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%),
    var(--bet);
  color: #071018;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35);
}

.bets-mini {
  margin-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 12px;
}
.mini-title {
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  margin-bottom: 8px;
}
.mini-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mini-pill {
  --bet: rgba(245, 197, 66, 0.92);
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  border-radius: 12px;
  display: flex;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
}
.mini-pill::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  background: var(--bet);
  opacity: 0.95;
}
.mini-pill .v {
  color: rgba(255,248,236,.92);
  font-weight: 900;
}

.wheel-svg {
  width: var(--wheel);
  height: var(--wheel);
  border-radius: 50%;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 10px rgba(255, 255, 255, 0.06),
    inset 0 -18px 26px rgba(0, 0, 0, 0.25),
    0 14px 60px rgba(0, 0, 0, 0.52);
  transition: none;
  transform-origin: 50% 50%;
  will-change: transform;
  margin: 18px auto 0;
  position: relative;
}
.wheel-svg::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 999px;
  border: 1px solid rgba(245, 197, 66, 0.22);
  pointer-events: none;
}
.wheel-svg.flash {
  box-shadow:
    inset 0 0 0 10px rgba(255, 255, 255, 0.06),
    0 12px 50px rgba(0, 0, 0, 0.45),
    0 0 36px rgba(245, 197, 66, 0.18);
}
.wheel-svg.spinning {
  transition: transform 3.6s cubic-bezier(0.08, 0.92, 0.12, 1);
}
.wheel-svg__el {
  width: 100%;
  height: 100%;
  display: block;
}
.wheel-label {
  fill: rgba(255, 255, 255, 0.92);
  font-weight: 800;
  font-size: 8px;
}
.slice-win {
  filter: brightness(1.25);
  stroke: rgba(245, 197, 66, 0.95);
  stroke-width: 2.2;
  animation: winPulse 260ms ease-in-out infinite alternate;
}
@keyframes winPulse {
  from {
    filter: brightness(1.15);
  }
  to {
    filter: brightness(1.38);
  }
}

@media (max-width: 1400px) {
  .roulette-wrap {
    --wheel: clamp(220px, 22vw, 310px);
  }
}

@media (max-width: 1200px) {
  .roulette-wrap {
    --wheel: 300px;
  }
}

@media (max-width: 980px) {
  .roulette-wrap {
    --wheel: 280px;
  }
  .board {
    --cell: 42px;
    --gap: 6px;
  }
}
@media (max-width: 420px) {
  .board {
    --cell: 40px;
    --gap: 6px;
  }
  .cell-zero {
    width: 62px;
  }
  .chip {
    width: 50px;
    height: 50px;
  }
  .chip-val {
    font-size: 11px;
  }
}
</style>
