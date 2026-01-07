<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import BaseSelect from '../components/BaseSelect.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { api } from '../utils/api'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'

const auth = useAuthStore()

const amount = ref(0)
const ballCount = ref(1)
const difficulty = ref<'LOW'|'MEDIUM'|'HIGH'>('MEDIUM')
const rows = ref(16)
const spinning = ref(false)
const message = ref('')
const bigwinStore = useBigWinStore()


const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const rowsList = [8, 12, 16]

const difficultyOptions = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const

const rowsOptions = computed(() => rowsList.map((r) => ({ value: r, label: String(r) })))

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
  // During prerender (vite-ssg) there is no API / no browser.
  if (typeof window === 'undefined') return
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
// User-requested hard limit: you shouldn't be able to input >50 balls.
const ballsN = computed(() => Math.max(1, Math.min(50, Number(ballCount.value) || 1)))

// Keep the input itself clamped (HTML max can be bypassed by typing).
watch(ballCount, (v) => {
  const n = Math.max(1, Math.min(50, Number(v) || 1))
  if (n !== Number(v)) ballCount.value = n
})
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
  visible: boolean
  landing: number | null
  msg: string
  scale: number
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


function easeInOutCubic(t: number){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2 }

// deterministic tiny jitter (so same path isn't a clone, but landing stays correct)
function jitter01(seed: number){
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x) // 0..1
}
function jitterSigned(seed: number, amp = 1){
  return (jitter01(seed) * 2 - 1) * amp
}

async function tweenTo(ball: Ball, toX: number, toY: number, ms: number, arc = 0){
  const fromX = ball.x
  const fromY = ball.y
  const start = performance.now()
  return await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / Math.max(1, ms))
      const k = easeInOutCubic(p)
      const x = fromX + (toX - fromX) * k
      // arc > 0 => lift up in middle (negative y)
      const lift = arc > 0 ? Math.sin(Math.PI * k) * arc : 0
      const y = fromY + (toY - fromY) * k - lift
      ball.x = x
      ball.y = y
      if (p < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
}

async function bump(ball: Ball, strength = 6){
  // tiny "thud": quick up then settle + a bit of scale
  const baseScale = ball.scale || 1
  ball.scale = baseScale * 1.12
  await tweenTo(ball, ball.x, ball.y - strength, 50, 0)
  await tweenTo(ball, ball.x, ball.y + strength * 0.35, 70, 0)
  ball.scale = baseScale
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


async function dropBall(ball: Ball, result: BallResult) {
  ball.visible = true
  ball.landing = null
  ball.msg = ''
  ball.scale = 1

  ball.x = W.value / 2
  ball.y = 42

  let idx = 0
  for (let r = 0; r < rows.value; r++) {
    const hit = pegPos(r, idx)

    // small deterministic variation per row/ball
    const sx = jitterSigned(ball.id * 0.001 + r * 1.31, 1.6)
    const sy = jitterSigned(ball.id * 0.002 + r * 2.17, 0.8)

    // glide into peg (smooth)
    await tweenTo(ball, hit.x + sx, hit.y - 10 + sy, 95, 8)

    // visual + audio "thud"
    void flashPeg(r, idx)
    try { sfx('plinko_hit') } catch { try { sfx('plinko_tick') } catch {} }
    await bump(ball, 5)

    // choose direction from trace mask
    if (result.rights[r]) idx += 1

    // glide to next row (slightly different arc)
    if (r < rows.value - 1) {
      const next = pegPos(r + 1, idx)
      const nx = jitterSigned(ball.id * 0.003 + r * 3.11, 1.3)
      const ny = jitterSigned(ball.id * 0.004 + r * 4.07, 0.7)
      await tweenTo(ball, next.x + nx, next.y - 10 + ny, 115, 10)
    }
  }

  // idx = final slot
  const b = bins.value[idx]
  // approach bin
  await tweenTo(ball, b.x, b.y - 18, 150, 12)

  // settle: small bounce (never below bin)
  await bump(ball, 6)

  ball.landing = idx
  setGlow(idx)

  const mult = table.value[idx] ?? result.multiplier ?? 0
  const win = Math.round((Number(result.payout) || 0) * 100) / 100

  if (win > 0) {
    try { sfx('win') } catch {}
    ball.msg = `x${mult} → +${fmt(win, 2)}`

    // per-ball big win (same as before)
    // big/mega/super overlay (global)
    bigwinStore.maybeShow(win, bet.value)
  } else {
    try { sfx('lose') } catch {}
    ball.msg = `x${mult} → 0`
  }

  await sleep(260)
  ball.visible = false
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
    visible: false,
    landing: null,
    msg: '',
    scale: 1
  }))
  balls.value = created

  const tasks = created.map(async (b, i) => {
    await sleep(i * 80)
    await dropBall(b, results[i])
  })
  await Promise.allSettled(tasks)

  // баланс после игры
  await safeFetchBalance()

  const totalWin = Number(res?.total) || 0
  // BIG/MEGA/SUPER by total round
  bigwinStore.maybeShow(totalWin, totalBet.value)
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
  ;(window as any).__testBigWin = (mult: number, amount: number) => bigwinStore.show(mult, amount)
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
          <div class="label">{{ $t('ui.s_7b29ca96ad') }}</div>
          <BaseSelect
            v-model="difficulty"
            :options="difficultyOptions"
            :disabled="spinning"
            :aria-label="$t('ui.s_7b29ca96ad')"
          />
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_530f488f7a') }}</div>
          <BaseSelect
            v-model="rows"
            :options="rowsOptions"
            :disabled="spinning"
            :aria-label="$t('ui.s_530f488f7a')"
          />
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_3136a9f696') }}</div>
          <div class="balls-row">
            <input class="input" v-model.number="ballCount" type="number" min="1" max="50" step="1" />
            <div class="pill">×</div>
          </div>
          <div class="mini">{{ $t('ui.s_66d3a865e2') }} <b class="num">{{ fmt(totalBet, 2) }}</b></div>
        </div>
      </GamePanel>
    </template>

    <div class="plinko-stage" ref="stageEl" :style="{ height: stageHeight + 'px' }">

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
              :style="{ left: b.x + 'px', top: b.y + 'px', transform: `translate(-50%, -50%) scale(${b.scale || 1})` }"
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
  z-index: 5;
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

</style>