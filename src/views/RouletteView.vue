<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../utils/api'
import { sfx } from '../utils/sfx'

type BetKey =
    | `n:${number}` // straight up 0..36
    | 'red'
    | 'black'
    | 'even'
    | 'odd'
    | 'low'
    | 'high'
    | 'Диапазон1'
    | 'Диапазон2'
    | 'Диапазон3'
    | 'Ряд1'
    | 'Ряд2'
    | 'Ряд3'

const auth = useAuthStore()

const chips = [1, 2, 5, 10, 25, 50, 100]
const chip = ref(10)

const bets = ref<Record<string, number>>({})
const history = ref<{ key: BetKey; amount: number }[]>([])
const spinning = ref(false)

const lastNumber = ref<number | null>(null)
const message = ref('')

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

const totalBet = computed(() => Object.values(bets.value).reduce((a, b) => a + b, 0))

function addBet(key: BetKey) {
  if (spinning.value) return
  if (!auth.user) {
    message.value = 'Нужен вход'
    return
  }
  message.value = ''
  const cur = bets.value[key] ?? 0
  bets.value[key] = cur + chip.value
  history.value.push({ key, amount: chip.value })
  tap(key)
  sfx('click')
}

function undo() {
  if (spinning.value) return
  const last = history.value.pop()
  if (!last) return
  bets.value[last.key] = Math.max(0, (bets.value[last.key] ?? 0) - last.amount)
  if (bets.value[last.key] === 0) delete bets.value[last.key]
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
    return n === win ? 36 : 0 // includes stake => 35:1 profit
  }
  if (key === 'red') return colorOf(win) === 'red' ? 2 : 0
  if (key === 'black') return colorOf(win) === 'black' ? 2 : 0
  if (key === 'even') return win !== 0 && win % 2 === 0 ? 2 : 0
  if (key === 'odd') return win % 2 === 1 ? 2 : 0
  if (key === 'low') return win >= 1 && win <= 18 ? 2 : 0
  if (key === 'high') return win >= 19 && win <= 36 ? 2 : 0
  if (key === 'Диапазон1') return win >= 1 && win <= 12 ? 3 : 0
  if (key === 'Диапазон2') return win >= 13 && win <= 24 ? 3 : 0
  if (key === 'Диапазон3') return win >= 25 && win <= 36 ? 3 : 0
  if (key === 'Ряд1') return win !== 0 && win % 3 === 0 ? 3 : 0
  if (key === 'Ряд2') return win !== 0 && (win - 2) % 3 === 0 ? 3 : 0
  if (key === 'Ряд3') return win !== 0 && (win - 1) % 3 === 0 ? 3 : 0
  return 0
}

const wheelDeg = ref(0)
const idlePausedUntil = ref(0)
function pauseIdle(ms = 10_000) {
  idlePausedUntil.value = Date.now() + ms
}

// Slow idle spin
let rafId: number | null = null
function startIdleSpin() {
  const tick = () => {
    const now = Date.now()
    const paused = now < idlePausedUntil.value

    if (!spinning.value && !paused) {
      wheelDeg.value = (wheelDeg.value + 0.15) % 360
    }

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

onMounted(() => startIdleSpin())
onBeforeUnmount(() => {
  stopIdleSpin()
  if (tapTimer !== null) window.clearTimeout(tapTimer)
  if (winTimer !== null) window.clearTimeout(winTimer)
  if (wheelFlashTimer !== null) window.clearTimeout(wheelFlashTimer)
})

// Keep as plain array (avoids accidental ref misuse)
const wheelNumbers: number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 0, 5, 24, 16, 33, 1, 20, 14, 31, 9,
  22, 18, 29, 7, 28, 12, 35, 3, 26,
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
  const a0 = -90 + i * SLICE_ANGLE.value
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
function sliceColor(n: number) {
  if (n === 0) return '#1cb96a'
  return redSet.has(n) ? '#ff3b57' : '#1d2731'
}
function angleForNumberCentered(n: number){
  const idx = wheelNumbers.indexOf(n)
  if(idx < 0) return 0

  const slice = 360 / wheelNumbers.length

  // mid angle of slice in "slicePath" coordinates
  const mid = (idx + 0.5) * slice

  // pointer is at top (12 o'clock) => target angle = -90
  // rotate wheel by -mid to bring mid to top
  const pointerOffset = 1 // if you ever move pointer, adjust this

  return -mid + pointerOffset
}


const lastNumbers = ref<number[]>([])
const wheelFlash = ref(false)
let wheelFlashTimer: number | null = null
function flashWheel() {
  wheelFlash.value = true
  if (wheelFlashTimer !== null) window.clearTimeout(wheelFlashTimer)
  wheelFlashTimer = window.setTimeout(() => (wheelFlash.value = false), 420)
}

async function spin() {
  if (spinning.value) return
  if (!auth.user) {
    message.value = 'Нужен вход'
    return
  }
  if (totalBet.value <= 0) {
    message.value = 'Сделай ставку'
    return
  }
  if (auth.user.balance < totalBet.value) {
    message.value = 'Недостаточно баланса'
    return
  }

  spinning.value = true
  message.value = ''
  lastNumber.value = null
  winKeys.value = new Set()

  try {

    const res = await api<{
      ok: boolean
      winNumber: number
      color: 'red'|'black'|'green'
      totalBet: number
      totalReturn: number
      net: number
      balance: number
    }>('/api/roulette/spin', {
      method: 'POST',
      body: JSON.stringify({ bets: bets.value })
    })

    sfx('spin')

    const win = res.winNumber
    const base = angleForNumberCentered(win)
    const extra = 360 * (6 + Math.floor(Math.random() * 3))
    wheelDeg.value = extra + base

    await new Promise(r => setTimeout(r, 3200))
    sfx('stop')

    lastNumber.value = win
    lastNumbers.value = [win, ...lastNumbers.value].slice(0, 30)
    flashWheel()
    setWinKeysFor(win)

    // обновим баланс в auth-store
    if (auth.user) {
      auth.user = { ...auth.user, balance: res.balance }
      localStorage.setItem('casino_sim_user_v1', JSON.stringify(auth.user))
    }

    if (res.net > 0) {
      sfx('win')
      message.value = `Выпало ${win} — выигрыш +${Math.round(res.net * 100) / 100}`
    } else if (res.net < 0) {
      sfx('lose')
      message.value = `Выпало ${win} — проигрыш ${Math.round(res.net * 100) / 100}`
    } else {
      message.value = `Выпало ${win}`
    }

pauseIdle(1_000)
  } catch (e: any) {
    message.value = e?.message ? String(e.message) : 'Ошибка'
  } finally {
    spinning.value = false
  }
}

const numGrid = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
]

function betOf(key: BetKey) {
  return bets.value[key] ?? 0
}
</script>

<template>
  <GameLayout>
    <template #panel>
      <div class="panel-stack">
        <div class="field">
          <div class="label">Chip Value</div>
          <div class="chip-row">
            <button
                v-for="c in chips"
                :key="c"
                class="chip"
                :class="{ on: chip === c }"
                @click="chip = c; sfx('click')"
            >
              {{ c }}
            </button>
          </div>
        </div>

        <div class="field">
          <div class="label">Total Amount</div>
          <div class="amount-total">
            <div class="num">{{ totalBet.toFixed(2) }}</div>
            <div class="coin">G</div>
          </div>
          <div class="btn-row">
            <button class="btn btn-ghost" :disabled="spinning" @click="undo">Undo</button>
            <button class="btn btn-ghost" :disabled="spinning" @click="clearAll">Clear</button>
          </div>
        </div>

        <button class="btn btn-primary" :disabled="spinning || totalBet <= 0" @click="spin">
          {{ spinning ? 'Spinning...' : 'Play' }}
        </button>

        <div class="hint" v-if="message">{{ message }}</div>
      </div>
    </template>

    <div class="roulette-wrap">
      <div>
        <div class="wheel-area">
          <div class="pointer" aria-hidden="true"></div>

          <div
              class="wheel-svg"
              :class="[{ spinning }, { flash: wheelFlash }]"
              :style="{ transform: `rotate(${wheelDeg}deg)` }"
          >
            <svg class="wheel-svg__el" viewBox="0 0 200 200" aria-hidden="true">
              <g>
                <path
                    v-for="(n, i) in wheelNumbers"
                    :key="`s-${i}`"
                    :d="slicePath(i)"
                    :fill="sliceColor(n)"
                />
                <text
                    v-for="(n, i) in wheelNumbers"
                    :key="`t-${i}`"
                    :x="labelPos(i).x"
                    :y="labelPos(i).y"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="wheel-label"
                    :transform="`rotate(${-wheelDeg} ${labelPos(i).x} ${labelPos(i).y})`"
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

        <!-- moved history under wheel -->
        <div class="history-under" v-if="lastNumbers.length">
          <div class="history-title">Last</div>
          <div class="history-row">
            <span
                v-for="(n, idx) in lastNumbers"
                :key="idx"
                class="history-pill"
                :class="colorOf(n)"
            >
              {{ n }}
            </span>
          </div>
        </div>
      </div>

      <div class="board">
        <div class="grid grid-vertical">
          <!-- top: 0 + numbers -->
          <div class="main-table">
            <button
                class="cell-zero"
                :class="{ win: isWinKey('n:0'), tap: tappedKey === 'n:0' }"
                @click="addBet('n:0')"
            >
              0
              <span class="chip-badge" v-if="betOf('n:0')">{{ betOf('n:0') }}</span>
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
                    },
                  ]"
                    @click="addBet(`n:${n}` as any)"
                >
                  {{ n }}
                  <span class="chip-badge" v-if="betOf(`n:${n}` as any)">{{ betOf(`n:${n}` as any) }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- bottom: side bets -->
          <div class="side-table">
            <div class="col-bets">
              <button
                  class="cell out"
                  :class="{ win: isWinKey('Ряд1'), has: !!betOf('Ряд1'), tap: tappedKey === 'Ряд1' }"
                  @click="addBet('Ряд1')"
              >
                2:1
                <span class="chip-badge" v-if="betOf('Ряд1')">{{ betOf('Ряд1') }}</span>
              </button>
              <button
                  class="cell out"
                  :class="{ win: isWinKey('Ряд2'), has: !!betOf('Ряд2'), tap: tappedKey === 'Ряд2' }"
                  @click="addBet('Ряд2')"
              >
                2:1
                <span class="chip-badge" v-if="betOf('Ряд2')">{{ betOf('Ряд2') }}</span>
              </button>
              <button
                  class="cell out"
                  :class="{ win: isWinKey('Ряд3'), has: !!betOf('Ряд3'), tap: tappedKey === 'Ряд3' }"
                  @click="addBet('Ряд3')"
              >
                2:1
                <span class="chip-badge" v-if="betOf('Ряд3')">{{ betOf('Ряд3') }}</span>
              </button>
            </div>

            <div class="col-bets">
              <button
                  class="cell big"
                  :class="{ win: isWinKey('Диапазон1'), has: !!betOf('Диапазон1'), tap: tappedKey === 'Диапазон1' }"
                  @click="addBet('Диапазон1')"
              >
                1 to 12
                <span class="chip-badge" v-if="betOf('Диапазон1')">{{ betOf('Диапазон1') }}</span>
              </button>
              <button
                  class="cell big"
                  :class="{ win: isWinKey('Диапазон2'), has: !!betOf('Диапазон2'), tap: tappedKey === 'Диапазон2' }"
                  @click="addBet('Диапазон2')"
              >
                13 to 24
                <span class="chip-badge" v-if="betOf('Диапазон2')">{{ betOf('Диапазон2') }}</span>
              </button>
              <button
                  class="cell big"
                  :class="{ win: isWinKey('Диапазон3'), has: !!betOf('Диапазон3'), tap: tappedKey === 'Диапазон3' }"
                  @click="addBet('Диапазон3')"
              >
                25 to 36
                <span class="chip-badge" v-if="betOf('Диапазон3')">{{ betOf('Диапазон3') }}</span>
              </button>

            </div>
          </div>
        </div>

        <div class="bets-mini" v-if="Object.keys(bets).length">
          <div class="mini-title">Bets</div>
          <div class="mini-row">
            <div v-for="(amt, k) in bets" :key="k" class="mini-pill">
              <span class="k">{{ k }}</span>
              <span class="v">{{ amt }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </GameLayout>
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
  gap: 8px;
}

.amount-total {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}
.coin {
  width: var(--control-h);
  height: var(--control-h);
  border-radius: 12px;
  background: rgba(250, 204, 21, 0.92);
  color: rgba(0, 0, 0, 0.85);
  display: grid;
  place-items: center;
  font-weight: 900;
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
  display: grid;
  grid-template-columns: 399px 1fr;
  gap: 18px;
  align-items: start;
}
.wheel-area {
  position: relative;
  width: 399px;
  height: 399px;
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
  width: 363px;
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
}
.board {
  --cell: 44px;
  --gap: 6px;
}

.grid.grid-vertical {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.main-table {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.side-table {
  display: flex;
  gap: 10px;
  align-items: flex-start;
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
  transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.18s ease;
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
  transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.18s ease;
  position: relative;
  overflow: hidden;
}
.cell:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}
.cell.tap {
  animation: cellTap 140ms ease-out both;
}
@keyframes cellTap {
  0% {
    transform: translateY(0) scale(1);
  }
  45% {
    transform: translateY(0) scale(0.96);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}
.cell.red {
  background: rgba(255, 58, 84, 0.86);
  color: #081018;
}
.cell.black {
  background: rgba(44, 58, 72, 0.88);
}
.cell.out {
  width: var(--cell);
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
  width: calc(var(--cell) * 3 + var(--gap) * 2);
  height: var(--cell);
}

.cell.has {
  box-shadow: inset 0 0 0 1px rgba(245, 197, 66, 0.28);
}
.cell.win,
.cell-zero.win {
  box-shadow: 0 0 0 1px rgba(245, 197, 66, 0.55), 0 0 28px rgba(245, 197, 66, 0.22);
  filter: brightness(1.12);
}

.chip-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 20px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: radial-gradient(10px 10px at 30% 30%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%),
  rgba(245, 197, 66, 0.92);
  color: #0b1218;
  font-weight: 900;
  font-size: 11px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.35);
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  border-radius: 12px;
  display: flex;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
}
.mini-pill .v {
  color: #eaf3ff;
  font-weight: 900;
}

.wheel-svg {
  width: 363px;
  height: 363px;
  border-radius: 50%;
  overflow: hidden;

  box-shadow: inset 0 0 0 10px rgba(255, 255, 255, 0.06), inset 0 -18px 26px rgba(0, 0, 0, 0.25),
  0 14px 60px rgba(0, 0, 0, 0.52);

  transition: none;
  transform-origin: 50% 50%;
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
  box-shadow: inset 0 0 0 10px rgba(255, 255, 255, 0.06), 0 12px 50px rgba(0, 0, 0, 0.45),
  0 0 36px rgba(245, 197, 66, 0.18);
}
.wheel-svg.spinning {
  transition: transform 3.6s cubic-bezier(0.12, 0.88, 0.18, 1);
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
</style>
