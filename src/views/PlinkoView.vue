<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../utils/api'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { useBigWinOverlay } from '../composables/useBigWinOverlay'

const auth = useAuthStore()

const amount = ref(0)
const ballCount = ref(1)
const difficulty = ref<'LOW'|'MEDIUM'|'HIGH'>('MEDIUM')
const rows = ref(16)
const spinning = ref(false)
const message = ref('')
function shortMoney(v: number) {
  const n = Number(v) || 0
  const abs = Math.abs(n)

  // ВАЖНО: у тебя числа уже в K-единицах
  // 1000K = 1M, 1_000_000K = 1B, 1_000_000_000K = 1T

  if (abs >= 1_000_000_000) return `${fmt(n / 1_000_000_000, 2)} T`
  if (abs >= 1_000_000)     return `${fmt(n / 1_000_000, 2)} B`
  if (abs >= 1_000)         return `${fmt(n / 1_000, 2)} M`

  // Вариант А: показывать K явно
  return `${fmt(n, 2)} K`

  // Вариант B: если суффикс K у тебя везде “по умолчанию”, можно так:
  // return fmt(n, 2)
}

// BIG WIN / MEGA WIN / SUPER WIN overlay (kept for Plinko, reusable for other games)
const { bigWin, showBigWin } = useBigWinOverlay({
  formatNumber,
  sfx,
  shortMoney,
  // If later you add a global sound toggle, pass it here.
  soundOn: () => true,
  volume: () => 0.35,
})


const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const rowsList = [8, 12, 16]

/** fallback multipliers */
const baseTables: Record<string, number[]> = {
  'low:8':    [3, 1.5, 1.1, 1.0, 0.7, 1.0, 1.1, 1.5, 3],
  'medium:8': [8, 2.0, 1.3, 0.7, 0.3, 0.7, 1.3, 2.0, 8],
  'high:8':   [29, 4.0, 1.5, 0.5, 0.2, 0.5, 1.5, 4.0, 29],

  'low:12':    [5, 2.0, 1.6, 1.3, 1.1, 1.0, 0.8, 1.0, 1.1, 1.3, 1.6, 2.0, 5],
  'medium:12': [29, 8.0, 3.0, 1.6, 1.1, 0.8, 0.5, 0.8, 1.1, 1.6, 3.0, 8.0, 29],
  'high:12':   [120, 26, 8.0, 2.0, 1.0, 0.6, 0.2, 0.6, 1.0, 2.0, 8.0, 26, 120],

  'low:16':    [10, 3, 2, 1.6, 1.3, 1.1, 1.0, 0.8, 0.7, 0.8, 1.0, 1.1, 1.3, 1.6, 2, 3, 10],
  'medium:16': [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  'high:16':   [1000, 110, 41, 10, 5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5, 10, 41, 110, 1000],
}

const diffLower = computed(() => difficulty.value.toLowerCase() as 'low'|'medium'|'high')

function fallbackTable() {
  const key = `${diffLower.value}:${rows.value}`
  const t = baseTables[key]
  if (t && t.length === rows.value + 1) return t
  const n = rows.value + 1
  return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 10 : 1))
}

/** multipliers: async load -> ref */
const multipliers = ref<number[]>(fallbackTable())
const loadingMult = ref(false)

async function loadMultipliers() {
  loadingMult.value = true
  try {
    const url =
      `/api/v1/games/plinko/game/multipliers` +
      `?rows=${encodeURIComponent(rows.value)}` +
      `&difficulty=${encodeURIComponent(difficulty.value)}` +
      `&_=${Date.now()}`

    const t = await api<number[]>(url, {
      method: 'GET',
      cache: 'no-store' as any,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      } as any,
    })

    multipliers.value =
      (Array.isArray(t) && t.length === rows.value + 1)
        ? [...t]
        : [...fallbackTable()]
  } catch (e) {
    console.error('loadMultipliers failed:', e)
    multipliers.value = [...fallbackTable()]
  } finally {
    loadingMult.value = false
  }
}


onMounted(() => { void loadMultipliers() })
watch([rows, difficulty], () => { void loadMultipliers() }, { immediate: true })


const table = computed(() =>
  (Array.isArray(multipliers.value) && multipliers.value.length === rows.value + 1)
    ? multipliers.value
    : fallbackTable()
)

const bet = computed(() => Math.max(0, Number(amount.value) || 0))
const ballsN = computed(() => Math.max(1, Math.min(50, Number(ballCount.value) || 1)))
const totalBet = computed(() => bet.value * ballsN.value)

/** stage sizing */
const stageEl = ref<HTMLElement | null>(null)
const stageW = ref(620)
const stageH = ref(560)

let ro: ResizeObserver | null = null
onMounted(() => {
  if(!stageEl.value) return
  ro = new ResizeObserver(() => {
    const el = stageEl.value
    if(!el) return
    stageW.value = Math.max(360, el.clientWidth)
    stageH.value = Math.max(420, el.clientHeight)
  })
  ro.observe(stageEl.value)
  stageW.value = Math.max(360, stageEl.value.clientWidth)
  stageH.value = Math.max(420, stageEl.value.clientHeight)
})
onBeforeUnmount(() => {
  if(ro && stageEl.value) ro.unobserve(stageEl.value)
  ro = null
})
// stop bigwin loop if any
stopCountLoop()

function clamp(min: number, v: number, max: number){
  return Math.max(min, Math.min(max, v))
}

const PAD_X = computed(() => clamp(26, stageW.value * 0.06, 54))
const W = computed(() => stageW.value)

const pegGapX = computed(() => {
  const denom = Math.max(1, rows.value - 1)
  const raw = (W.value - PAD_X.value * 2) / denom
  return clamp(20, raw, 36)
})
const pegGapY = computed(() => clamp(20, pegGapX.value * 0.95, 34))
const BIN_SIZE = computed(() => clamp(34, pegGapX.value * 1.45, 58))

const stageHeight = computed(() => {
  const h = 3 + rows.value * pegGapY.value + 44 + BIN_SIZE.value + 40
  return clamp(460, h, 860)
})

type Ball = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  row: number
  idx: number
  visible: boolean
  landing: number | null
  msg: string
}

const balls = ref<Ball[]>([])
const safeBalls = computed(() => (balls.value || []).filter(Boolean) as Ball[])
const hitKeys = ref<Set<string>>(new Set())

function pegPos(r: number, c: number) {
  const cols = r + 1
  const startX = W.value / 2 - (cols - 1) * pegGapX.value / 2
  return { x: startX + c * pegGapX.value, y: 60 + r * pegGapY.value }
}

const pegs = computed(() => {
  const out: { r: number; c: number; x: number; y: number; key: string }[] = []
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c <= r; c++) {
      const p = pegPos(r, c)
      out.push({ r, c, x: p.x, y: p.y, key: `${r}-${c}` })
    }
  }
  return out
})

const bins = computed(() => {
  const n = rows.value + 1
  const y = 60 + rows.value * pegGapY.value + 44
  const startX = W.value / 2 - (n - 1) * pegGapX.value / 2
  return Array.from({ length: n }, (_, i) => ({
    i,
    mult: table.value[i] ?? 0,
    x: startX + i * pegGapX.value,
    y
  }))
})

const binsWidth = computed(() => {
  const n = rows.value + 1
  return (n - 1) * pegGapX.value + BIN_SIZE.value
})

/** glow */
const glowBin = ref<number | null>(null)
let glowTimer: number | null = null
function setGlow(i: number){
  glowBin.value = i
  if(glowTimer !== null) window.clearTimeout(glowTimer)
  glowTimer = window.setTimeout(() => {
    glowBin.value = null
    glowTimer = null
  }, 420)
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)) }

async function flashPeg(r: number, c: number) {
  const key = `${r}-${c}`
  hitKeys.value.add(key)
  await sleep(90)
  hitKeys.value.delete(key)
}

/** backend response */
type ApiTrace = { win: number; mask: number }
type ApiPlay = { total: number; traces: ApiTrace[] }

type BallResult = {
  rights: boolean[]      // rows-length
  landing: number        // 0..rows
  payout: number
  multiplier: number
}

function popcount32(x: number) {
  x >>>= 0
  let c = 0
  while (x) { x &= x - 1; c++ }
  return c
}

/**
 * mask -> rights
 * бит r = решение на уровне r: 1 = вправо, 0 = влево
 * landing = кол-во единиц (сколько раз пошёл вправо)
 */
function traceToBallResult(trace: ApiTrace): BallResult {
  const mask = (Number(trace.mask) >>> 0)
  const rights = Array.from({ length: rows.value }, (_, r) => ((mask >>> r) & 1) === 1)
  const landing = popcount32(mask)
  const payout = Number(trace.win) || 0
  const multiplier = table.value[landing] ?? 0
  return { rights, landing, payout, multiplier }
}

// --- Physics-ish ball animation (single RAF loop per ball)
// Goal: smoother + more realistic than step-by-step sleeps, and scales better with many balls.
function animateBall(ball: Ball, result: BallResult, delayMs = 0) {
  // IMPORTANT REQUIREMENT:
  // - Ball MUST always land in the correct bin according to backend trace.mask.
  // - No "stuck" physics / no mode freeze.
  // We keep a realistic feel (gravity + kicks on pegs), but the path is trace-driven (deterministic).

  const g = 2600 // px/s^2 (gravity)
  const drag = 0.992

  ball.visible = true
  ball.landing = null
  ball.msg = ''
  ball.x = W.value / 2
  ball.y = 42
  ball.vx = 0
  ball.vy = 0
  ball.row = 0
  ball.idx = 0

  const startAt = performance.now() + Math.max(0, delayMs)
  const y0 = 42

  // where we MUST land
  const landing = clamp(0, result.landing ?? 0, rows.value)
  const targetBin = bins.value[landing]
  const targetY = targetBin?.y ?? (60 + rows.value * pegGapY.value + 44)

  // schedule "peg hits" (one per row)
  // total fall time scales gently with rows to keep it readable
  const totalMs = rows.value <= 8 ? 1650 : rows.value <= 12 ? 2050 : 2450
  const rowMs = totalMs / Math.max(1, rows.value)
  const pegHitTimes = Array.from({ length: rows.value }, (_, r) => startAt + (r + 1) * rowMs)

  let firedRow = -1
  let idxAtRow = 0

  return new Promise<void>((resolve) => {
    let prevT = 0
    const tick = (t: number) => {
      if (!spinning.value) {
        ball.visible = false
        resolve()
        return
      }
      if (t < startAt) {
        requestAnimationFrame(tick)
        return
      }

      // time step
      const dt = prevT ? Math.min(0.034, (t - prevT) / 1000) : 1 / 60
      prevT = t

      // gravity + simple damping (smooth & stable)
      ball.vy = (ball.vy + g * dt) * Math.pow(drag, dt * 60)
      ball.y = ball.y + ball.vy * dt

      // progress 0..1 based on vertical movement (for guided centering towards landing bin)
      const prog = clamp(0, (ball.y - y0) / Math.max(1, (targetY - 14) - y0), 1)

      // base X drifts towards the correct landing bin as the ball falls
      const baseX = lerp(W.value / 2, targetBin?.x ?? (W.value / 2), prog)

      // apply "kicks" on each row hit time, decaying over time (gives realistic sways)
      // Also fires peg flash + tick SFX deterministically.
      while (firedRow + 1 < rows.value && t >= pegHitTimes[firedRow + 1]) {
        firedRow++
        const goRight = !!result.rights[firedRow]
        const dir = goRight ? 1 : -1

        // flash the peg we "hit" at this row
        void flashPeg(firedRow, idxAtRow)
        sfx('plinko_tick')

        if (goRight) idxAtRow++
        ball.row = firedRow + 1
        ball.idx = idxAtRow

        // deterministic-ish horizontal impulse
        // small randomness is ok but MUST NOT affect landing (baseX handles that)
        const kick = (pegGapX.value * 7.5) * (0.11 + Math.random() * 0.04)
        ball.vx = (ball.vx * 0.25) + dir * kick
      }

      // decay vx over time + add subtle wobble
      ball.vx *= 0.975
      const wobble = Math.sin(elapsedS * 12 + ball.id) * 0.7

      // final x is guided + impulse + wobble
      ball.x = baseX + ball.vx + wobble
      ball.x = clamp(PAD_X.value, ball.x, W.value - PAD_X.value)

      // landing into the correct bin
      // IMPORTANT: do not "sink" below the hole; instead do a small damped bounce and then hide.
      const restY = (targetY - 10) // visually sits inside the bin/hole
      if (ball.y >= restY) {
        ball.x = targetBin?.x ?? ball.x
        ball.y = restY

        ball.landing = landing
        ball.idx = landing
        setGlow(landing)

        const mult = table.value[landing] ?? result.multiplier ?? 0
        const win = Math.round((Number(result.payout) || 0) * 100) / 100

        if (win > 0) {
          sfx('win')
          ball.msg = `x${mult} → +${fmt(win, 2)}`
          if (bet.value > 0 && win >= bet.value * 20) {
            void showBigWin(mult, win)
          }
        } else {
          sfx('lose')
          ball.msg = `x${mult} → 0`
        }

        // small bin "bounce" (very smooth): a couple of decaying hops + tiny horizontal rebound
        const bounceStart = performance.now()
        const ampY = 10 + Math.random() * 4
        const ampX = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4)
        const bounce = (tt: number) => {
          const p = Math.min(1, (tt - bounceStart) / 420)
          // decaying cosine bounce: starts at 0, goes down a bit, then settles
          const k = 1 - p
          const w = Math.cos(p * Math.PI * 2.2)
          // keep within hole area: only bounce UP (negative y) visually
          const dy = -Math.abs(w) * ampY * k
          const dx = ampX * w * k
          ball.y = restY + dy
          ball.x = (targetBin?.x ?? ball.x) + dx
          if (p < 1) requestAnimationFrame(bounce)
          else {
            ball.y = restY
            ball.x = targetBin?.x ?? ball.x
            // brief hold so the player sees the result
            window.setTimeout(() => {
              ball.visible = false
              resolve()
            }, 180)
          }
        }
        requestAnimationFrame(bounce)
        return
      }

      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

async function safeFetchBalance() {
  const fn = (auth as any)?.fetchBalance
  if (typeof fn !== 'function') return
  try { await fn.call(auth) } catch {}
}

async function start() {
  if (spinning.value) return
  if (!auth.user) { message.value = 'Нужен вход'; return }

  // баланс перед стартом
  await safeFetchBalance()

  if (bet.value <= 0) { message.value = 'Укажи Amount'; return }
  if ((auth.user?.balance ?? 0) < totalBet.value) { message.value = 'Недостаточно баланса'; return }

  spinning.value = true
  message.value = ''
  balls.value = []
  hitKeys.value = new Set()

  sfx('plinko_drop')

  const n = ballsN.value

  let res: ApiPlay
  try {
    res = await api<ApiPlay>('/api/v1/games/plinko/game/play', {
      method: 'POST',
      body: JSON.stringify({
        bet: bet.value,
        balls: n,
        rows: rows.value,
        difficulty: difficulty.value,
      }),
    })
  } catch {
    message.value = 'Ошибка игры (play)'
    spinning.value = false
    return
  }

  const traces = Array.isArray(res?.traces) ? res.traces : []
  const results: BallResult[] = Array.from({ length: n }, (_, i) => {
    const t = traces[i]
    return t
      ? traceToBallResult(t)
      : { rights: Array(rows.value).fill(false), landing: 0, payout: 0, multiplier: table.value[0] ?? 0 }
  })

  const created: Ball[] = Array.from({ length: n }, (_, i) => ({
    id: Date.now() + i,
    x: W.value / 2,
    y: 42,
    vx: 0,
    vy: 0,
    row: 0,
    idx: 0,
    visible: false,
    landing: null,
    msg: ''
  }))
  balls.value = created

  const tasks = created.map((b, i) => animateBall(b, results[i], i * 80))
  await Promise.allSettled(tasks)

  // баланс после игры
  await safeFetchBalance()

  const totalWin = Number(res?.total) || 0
  // BIG WIN: threshold by total round (totalWin >= totalBet * 20)
  if (totalBet.value > 0) {
    const totalMult = totalWin / totalBet.value
    if (totalWin >= totalBet.value * 20) {
      // show overlay with total multiplier + total win amount
      void showBigWin(totalMult, totalWin)
    }
  }
  const net = Math.round((totalWin - totalBet.value) * 100) / 100
  if (net > 0) message.value = `Профит +${fmt(net, 2)}`
  else if (net < 0) message.value = `Минус ${fmt(net, 2)}`
  else message.value = 'В ноль'

  spinning.value = false
}

function binGradient(mult: number) {
  const min = 0.2
  const max = 110
  const t = Math.max(0, Math.min(1, (mult - min) / (max - min)))
  const hue = 45 * (1 - t)
  const c1 = `hsl(${hue} 85% 55% / .9)`
  const c2 = `hsl(${Math.max(0, hue - 8)} 85% 38% / .9)`
  return `linear-gradient(180deg, ${c1}, ${c2})`
}
// dev helper
if (typeof window !== 'undefined') {
  ;(window as any).__testBigWin = (mult: number, amount: number) => showBigWin(mult, amount)
}

</script>



<template>
  <GameLayout>
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="spinning"
        play-text="Start"
        :message="message"
        @half="amount = Math.max(0, (Number(amount)||0)/2)"
        @double="amount = (Number(amount)||0)*2"
        @play="start"
      >
        <div class="field">
          <div class="label">Difficulty</div>
          <select class="input" v-model="difficulty" @change="sfx('click')">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div class="field">
          <div class="label">Rows</div>
          <select class="input" v-model.number="rows" @change="sfx('click')">
            <option v-for="r in rowsList" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>

        <div class="field">
          <div class="label">Balls</div>
          <div class="balls-row">
            <input class="input" v-model.number="ballCount" type="number" min="1" max="50" step="1" />
            <div class="pill">×</div>
          </div>
          <div class="mini">Total bet: <b class="num">{{ fmt(totalBet, 2) }}</b></div>
        </div>
      </GamePanel>
    </template>

    <div class="plinko-stage" ref="stageEl" :style="{ height: stageHeight + 'px' }">
      <transition name="bigwin-fade">
        <div v-if="bigWin.show" class="bigwin" :class="`tier-${bigWin.tier}`">
          <div class="bigwin-backdrop"></div>

          <div class="bigwin-rays"></div>
          <div class="bigwin-burst"></div>
          <div class="bigwin-shock"></div>
          <div class="bigwin-shock shock2"></div>

          <div class="bigwin-card">
            <div class="bigwin-title">{{ bigWin.title }}</div>

            <!-- бегущие цифры -->
            <div class="bigwin-amount">
              ⭐ {{ bigWin.displayText }} {{ bigWin.title }} ⭐
            </div>

            <div class="bigwin-sub">
              x{{ fmt(bigWin.mult, 2) }} • +{{ fmt(bigWin.amount, 2) }}
            </div>

            <div class="bigwin-sparks">
              <i v-for="i in 26" :key="i" />
            </div>
          </div>
        </div>
      </transition>
      <div class="pegs">
            <div
              v-for="p in pegs"
              :key="p.key"
              class="peg"
              :class="{ hit: hitKeys.has(p.key) }"
              :style="{ left: p.x+'px', top: p.y+'px' }"
            />
          </div>

          <!-- Avoid v-if + v-for on the same element (Vue 3 evaluates v-if first) -->
          <div class="balls">
            <div
              v-for="b in safeBalls"
              :key="b.id"
              class="ball"
              v-show="b.visible"
              :style="{ left: b.x + 'px', top: b.y + 'px' }"
            />
          </div>

          <div
            class="bins-grid"
            :style="{ width: binsWidth + 'px', '--bin': BIN_SIZE + 'px' }"
          >
            <div
              v-for="bin in bins"
              :key="bin.i"
              class="bin"
              :class="{ glow: glowBin === bin.i }"
              :style="{ background: binGradient(bin.mult) }"
            >
              <span class="bin-mult">{{ bin.mult }}x</span>
            </div>
          </div>
    </div>
  </GameLayout>
</template>

<style scoped>
.field{ margin-top: 8px; }
.label{ color: var(--muted); font-size: 12px; margin-bottom: 8px; font-weight: 600; }
.balls-row{ display:grid; grid-template-columns: 1fr auto; gap: 10px; align-items:center; }
.pill{
  width: var(--control-h);
  height: var(--control-h);
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,.22);
  display:grid;
  place-items:center;
  font-weight: 800;
  opacity:.9;
}
.mini{ margin-top: 8px; color: rgba(255,255,255,.65); font-size: 12px; }

.plinko-stage{
  width: 100%;
  height: 560px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.06);
  background: radial-gradient(circle at 50% 30%, rgba(0,0,0,.0) 0 35%, rgba(0,0,0,.25) 36% 100%),
              linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,0));
  position: relative;
  overflow: hidden;
}
.pegs{ position:absolute; inset:0; }
.peg{
  position:absolute;
  width: 6px; height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,.92);
  transform: translate(-50%, -50%);
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,.22),
    0 0 12px rgba(255,255,255,.10),
    0 0 18px rgba(90,180,255,.06);
  transition: transform .08s ease, box-shadow .08s ease, filter .08s ease;
}
.peg.hit{
  transform: translate(-50%,-50%) scale(1.85);
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,.22),
    0 0 18px rgba(90,180,255,.28),
    0 0 38px rgba(90,180,255,.18);
  filter: brightness(1.15);
}
.balls{ position:absolute; inset:0; }
.ball{
  position:absolute;
  width: 14px; height: 14px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.98), rgba(110,200,255,.95));
  box-shadow: 0 0 18px rgba(90,180,255,.24), 0 18px 40px rgba(0,0,0,.35);
  transform: translate(-50%, -50%);
  transition: none;
  z-index: 4;
}
.ball::after{
  content:'';
  position:absolute;
  inset: 0;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 55%);
  opacity: .85;
}
.bins-grid{
  position:absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 34px;
  height: calc(var(--bin, 56px) + 16px);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0;
  padding: 8px 0;
  z-index: 8;
}
.bin{
  width: var(--bin, 56px);
  height: var(--bin, 56px);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.10);
  color: rgba(255,255,255,.92);
  font-size: 11px;
  display:grid;
  place-items:center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
}

.bin.glow{
  animation: binGlow 420ms ease-out;
}

@keyframes binGlow{
  0%{ filter: brightness(1.0); box-shadow: inset 0 0 0 1px rgba(255,255,255,.10), 0 0 0 rgba(255,208,90,0); }
  20%{ filter: brightness(1.25); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 0 22px rgba(255,208,90,.38), 0 0 46px rgba(255,208,90,.20); }
  100%{ filter: brightness(1.0); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 0 0 rgba(255,208,90,0); }
}

.bin-mult{ font-weight: 900; }
/* BIG WIN overlay (more epic) */
.bigwin{
  position:absolute;
  inset:0;
  z-index: 50;
  display:grid;
  place-items:center;
  pointer-events:none;
}

.bigwin-backdrop{
  position:absolute;
  inset:0;
  background:
    radial-gradient(circle at 50% 45%, rgba(0,0,0,.18) 0 25%, rgba(0,0,0,.82) 70% 100%),
    linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.55));
  animation: bigwinBackdrop 3000ms ease-out both;
}

.bigwin-rays{
  position:absolute;
  inset:-30%;
  background:
    conic-gradient(from 0deg,
    rgba(255,210,90,.00),
    rgba(255,210,90,.14),
    rgba(110,200,255,.00),
    rgba(255,210,90,.18),
    rgba(110,200,255,.00),
    rgba(255,210,90,.12),
    rgba(255,210,90,.00)
    );
  filter: blur(0px);
  opacity: 0;
  animation: bigwinRays 1500ms ease-out both;
}

.bigwin-burst{
  position:absolute;
  width: 180vmax;
  height: 180vmax;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255,210,90,.22), rgba(110,200,255,.08) 40%, rgba(0,0,0,0) 72%);
  filter: blur(8px);
  opacity: 0;
  animation: bigwinBurst 1200ms ease-out both;
}

.bigwin-shock{
  position:absolute;
  width: min(620px, 92vw);
  height: min(620px, 92vw);
  border-radius: 999px;
  border: 2px solid rgba(255,210,90,.82);
  box-shadow: 0 0 60px rgba(255,210,90,.25), inset 0 0 40px rgba(110,200,255,.14);
  transform: scale(.58);
  opacity: 0;
  animation: bigwinShock 950ms ease-out both;
}
.bigwin-shock.shock2{
  width: min(760px, 98vw);
  height: min(760px, 98vw);
  border-color: rgba(110,200,255,.60);
  animation-delay: 120ms;
  opacity: 0;
}

.bigwin-card{
  position:relative;
  width: min(680px, 92vw);
  padding: 22px 22px 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.12);
  background:
    radial-gradient(circle at 50% 0%, rgba(255,210,90,.10), rgba(0,0,0,0) 55%),
    linear-gradient(180deg, rgba(25,25,30,.78), rgba(0,0,0,.66));
  box-shadow:
    0 30px 100px rgba(0,0,0,.60),
    0 0 80px rgba(255,210,90,.18);
  text-align:center;
  overflow:hidden;
  animation: bigwinCard 3000ms ease-out both;
}

.bigwin-card::before{
  content:'';
  position:absolute;
  inset:-60%;
  background: radial-gradient(circle, rgba(255,255,255,.12), rgba(255,255,255,0) 55%);
  transform: translateX(-30%) rotate(18deg);
  opacity: 0;
  animation: bigwinShine 1200ms ease-out both;
}

.bigwin-title{
  font-size: 46px;
  font-weight: 1000;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: rgba(255,255,255,.96);
  text-shadow:
    0 0 22px rgba(255,210,90,.30),
    0 0 64px rgba(110,200,255,.16);
  animation: bigwinTitle 980ms cubic-bezier(.2,.9,.2,1) both;
}

.bigwin-amount{
  margin-top: 10px;
  font-size: 30px;
  font-weight: 1000;
  letter-spacing: .03em;
  color: rgba(255,210,90,.98);
  text-shadow:
    0 0 34px rgba(255,210,90,.28),
    0 0 62px rgba(110,200,255,.12);
  animation: bigwinAmount 1300ms cubic-bezier(.2,.9,.2,1) both;
}

.bigwin-sub{
  margin-top: 10px;
  font-size: 14px;
  color: rgba(255,255,255,.72);
  font-weight: 750;
  opacity: .95;
}

.bigwin-sparks{
  position:absolute;
  inset:0;
  pointer-events:none;
  opacity: .92;
  mix-blend-mode: screen;
}

.bigwin-sparks i{
  position:absolute;
  left: 50%;
  top: 55%;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.95), rgba(255,210,90,.88));
  box-shadow: 0 0 22px rgba(255,210,90,.28), 0 0 36px rgba(110,200,255,.12);
  transform: translate(-50%,-50%) scale(.9);
  animation: sparkFly 1200ms ease-out both;
}
.bigwin-sparks i:nth-child(3n){ background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.95), rgba(110,200,255,.85)); }
.bigwin-sparks i:nth-child(4n){ width: 6px; height: 6px; opacity: .85; }

/* pseudo-random spread (26 sparks) */
.bigwin-sparks i:nth-child(1){ --a:-70deg; --d:260px; }
.bigwin-sparks i:nth-child(2){ --a:-40deg; --d:230px; }
.bigwin-sparks i:nth-child(3){ --a:-15deg; --d:290px; }
.bigwin-sparks i:nth-child(4){ --a:10deg;  --d:250px; }
.bigwin-sparks i:nth-child(5){ --a:35deg;  --d:300px; }
.bigwin-sparks i:nth-child(6){ --a:65deg;  --d:270px; }
.bigwin-sparks i:nth-child(7){ --a:-95deg; --d:230px; }
.bigwin-sparks i:nth-child(8){ --a:-120deg;--d:260px; }
.bigwin-sparks i:nth-child(9){ --a:95deg;  --d:240px; }
.bigwin-sparks i:nth-child(10){--a:120deg; --d:270px; }
.bigwin-sparks i:nth-child(11){--a:-10deg; --d:340px; }
.bigwin-sparks i:nth-child(12){--a:20deg;  --d:340px; }
.bigwin-sparks i:nth-child(13){--a:-160deg;--d:250px; }
.bigwin-sparks i:nth-child(14){--a:160deg; --d:250px; }
.bigwin-sparks i:nth-child(15){--a:-55deg; --d:320px; }
.bigwin-sparks i:nth-child(16){--a:55deg;  --d:320px; }
.bigwin-sparks i:nth-child(17){--a:-135deg;--d:300px; }
.bigwin-sparks i:nth-child(18){--a:135deg; --d:300px; }
.bigwin-sparks i:nth-child(19){--a:-30deg; --d:360px; }
.bigwin-sparks i:nth-child(20){--a:30deg;  --d:360px; }
.bigwin-sparks i:nth-child(21){--a:-110deg;--d:320px; }
.bigwin-sparks i:nth-child(22){--a:110deg; --d:320px; }
.bigwin-sparks i:nth-child(23){--a:-175deg;--d:280px; }
.bigwin-sparks i:nth-child(24){--a:175deg; --d:280px; }
.bigwin-sparks i:nth-child(25){--a:-82deg; --d:360px; }
.bigwin-sparks i:nth-child(26){--a:82deg;  --d:360px; }

/* Tier intensity */
.bigwin.tier-2 .bigwin-title{ text-shadow: 0 0 28px rgba(255,210,90,.36), 0 0 80px rgba(110,200,255,.18); }
.bigwin.tier-2 .bigwin-card{ box-shadow: 0 30px 120px rgba(0,0,0,.62), 0 0 110px rgba(255,210,90,.22); }
.bigwin.tier-3 .bigwin-title{ animation: bigwinTitleGlitch 1200ms ease-out both; }
.bigwin.tier-3 .bigwin-card{ animation: bigwinCard 3400ms ease-out both, bigwinShake 900ms ease-out both; }
.bigwin.tier-3 .bigwin-rays{ animation-duration: 1700ms; opacity: 1; }

@keyframes bigwinBackdrop{
  0%{ opacity: 0; }
  10%{ opacity: 1; }
  100%{ opacity: 0; }
}
@keyframes bigwinRays{
  0%{ transform: scale(.7) rotate(-18deg); opacity: 0; }
  15%{ opacity: .9; }
  100%{ transform: scale(1.15) rotate(12deg); opacity: 0; }
}
@keyframes bigwinBurst{
  0%{ transform: scale(.55); opacity: 0; filter: blur(12px); }
  18%{ opacity: 1; }
  100%{ transform: scale(1.18); opacity: 0; filter: blur(2px); }
}
@keyframes bigwinShock{
  0%{ transform: scale(.55); opacity: 0; }
  30%{ opacity: 1; }
  100%{ transform: scale(1.20); opacity: 0; }
}
@keyframes bigwinCard{
  0%{ transform: translateY(12px) scale(.90); opacity: 0; filter: blur(5px); }
  16%{ transform: translateY(0) scale(1.03); opacity: 1; filter: blur(0); }
  70%{ transform: translateY(0) scale(1.00); opacity: 1; }
  100%{ transform: translateY(-8px) scale(.98); opacity: 0; }
}
@keyframes bigwinShine{
  0%{ opacity: 0; transform: translateX(-35%) rotate(18deg); }
  20%{ opacity: 1; }
  100%{ opacity: 0; transform: translateX(35%) rotate(18deg); }
}
@keyframes bigwinTitle{
  0%{ transform: scale(.86); opacity: 0; letter-spacing: .22em; }
  100%{ transform: scale(1); opacity: 1; letter-spacing: .10em; }
}
@keyframes bigwinTitleGlitch{
  0%{ transform: scale(.86); opacity: 0; }
  25%{ opacity: 1; transform: scale(1.03); filter: drop-shadow(2px 0 rgba(110,200,255,.5)) drop-shadow(-2px 0 rgba(255,210,90,.35)); }
  40%{ transform: translateX(2px) scale(1.02); }
  55%{ transform: translateX(-2px) scale(1.01); }
  100%{ transform: translateX(0) scale(1); filter:none; opacity: 1; }
}
@keyframes bigwinAmount{
  0%{ transform: translateY(10px) scale(.90); opacity: 0; }
  26%{ transform: translateY(0) scale(1.02); opacity: 1; }
  100%{ transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes sparkFly{
  0%{ opacity: 0; transform: translate(-50%,-50%) scale(.7); }
  20%{ opacity: 1; }
  100%{
    opacity: 0;
    transform:
      translate(-50%,-50%)
      rotate(var(--a, 0deg))
      translateX(var(--d, 260px))
      scale(.18);
  }
}
@keyframes bigwinShake{
  0%{ }
  10%{ transform: translateY(0) scale(1.03) translateX(0); }
  15%{ transform: translateY(0) scale(1.03) translateX(3px); }
  20%{ transform: translateY(0) scale(1.03) translateX(-3px); }
  25%{ transform: translateY(0) scale(1.03) translateX(2px); }
  30%{ transform: translateY(0) scale(1.03) translateX(-2px); }
  100%{ }
}

.bigwin-fade-enter-active, .bigwin-fade-leave-active{ transition: opacity .18s ease; }
.bigwin-fade-enter-from, .bigwin-fade-leave-to{ opacity: 0; }


</style>