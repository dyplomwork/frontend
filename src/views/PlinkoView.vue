<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
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
// BIG WIN overlay (threshold by total round: totalWin >= totalBet * 20)
const bigWin = ref({
  show: false,
  title: 'BIG WIN',
  mult: 0,
  amount: 0,
  // animated counter values
  displayValue: 0,
  displayText: '0',
  // styling intensity
  tier: 1, // 1=big, 2=mega, 3=super
})

let bigWinTimer: number | null = null
let bigWinRaf: number | null = null

type SoundKey = 'impact' | 'count' | 'climax'

const soundOn = computed(() => true)
const bigWinVol = computed(() => 0.9)

const soundCache = new Map<string, HTMLAudioElement>()
let countLoop: HTMLAudioElement | null = null

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

function playOne(url: string, vol: number) {
  if (!soundOn.value) return
  let a = soundCache.get(url)
  if (!a) {
    a = new Audio(url)
    a.preload = 'auto'
    soundCache.set(url, a)
  }
  try {
    const b = a.cloneNode(true) as HTMLAudioElement
    b.volume = Math.max(0, Math.min(1, vol))
    void b.play()
  } catch {}
}

function startCountLoop(url: string, vol: number) {
  if (!soundOn.value) return
  stopCountLoop()
  const a = new Audio(url)
  a.preload = 'auto'
  a.loop = true
  a.volume = Math.max(0, Math.min(1, vol))
  countLoop = a
  try { void a.play() } catch {}
}

function stopCountLoop() {
  if (!countLoop) return
  try { countLoop.pause(); countLoop.currentTime = 0 } catch {}
  countLoop = null
}


function shortMoney(v: number) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${fmt(n / 1_000_000_000, 2)} B`
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000, 2)} M`
  if (abs >= 1_000) return `${fmt(n / 1_000, 2)} K`
  return fmt(n, 2)
}

function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

// “бегущие цифры” 0 -> target за durationMs
function animateBigWinCounter(target: number, durationMs = 900) {
  if (bigWinRaf !== null) cancelAnimationFrame(bigWinRaf)
  stopCountLoop()

  // start "count up" loop while numbers run
  startCountLoop(getSoundUrl('count', bigWin.value.tier), bigWinVol.value * 0.25)

  const start = performance.now()
  const from = 0
  const to = Math.max(0, Number(target) || 0)

  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / durationMs)
    const k = easeOutExpo(p)
    const v = from + (to - from) * k

    bigWin.value.displayValue = v
    bigWin.value.displayText = shortMoney(v)

    if (p < 1) {
      bigWinRaf = requestAnimationFrame(tick)
    } else {
      bigWinRaf = null
      stopCountLoop()
      playOne(getSoundUrl('climax', bigWin.value.tier), bigWinVol.value * 0.95)
    }
  }

  bigWinRaf = requestAnimationFrame(tick)
}


function getWinTier(mult: number) {
  // можешь подкрутить пороги
  if (mult >= 100) return { tier: 3, title: 'SUPER WIN' }
  if (mult >= 50) return { tier: 2, title: 'MEGA WIN' }
  return { tier: 1, title: 'BIG WIN' }
}

async function showBigWin(mult: number, amount: number) {
  if (bigWinTimer !== null) window.clearTimeout(bigWinTimer)
  if (bigWinRaf !== null) cancelAnimationFrame(bigWinRaf)

  const t = getWinTier(mult)

  bigWin.value.show = true
  bigWin.value.tier = t.tier
  bigWin.value.title = t.title
  bigWin.value.mult = mult
  bigWin.value.amount = amount

  // impact on open
  playOne(getSoundUrl('impact', bigWin.value.tier), bigWinVol.value * 0.95)

  // сброс и запуск “бегущих цифр”
  bigWin.value.displayValue = 0
  bigWin.value.displayText = shortMoney(0)
  animateBigWinCounter(amount, t.tier === 3 ? 1200 : t.tier === 2 ? 1050 : 900)

  // звук (если нет отдельного - просто win)
  try { sfx('big_win') } catch { try { sfx('win') } catch {} }

  // авто-скрытие (чуть дольше для mega/super)
  const ttl = t.tier === 3 ? 3400 : t.tier === 2 ? 3000 : 2600
  bigWinTimer = window.setTimeout(() => {
    stopCountLoop()
    bigWin.value.show = false
    bigWinTimer = null
  }, ttl)
}


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

async function dropBall(ball: Ball, result: BallResult) {
  ball.visible = true
  ball.landing = null
  ball.msg = ''

  ball.x = W.value / 2
  ball.y = 42

  let idx = 0
  for (let r = 0; r < rows.value; r++) {
    const hit = pegPos(r, idx)
    ball.x = hit.x
    ball.y = hit.y - 10

    void flashPeg(r, idx)
    sfx('plinko_tick')
    await sleep(110)

    if (result.rights[r]) idx += 1

    if (r < rows.value - 1) {
      const next = pegPos(r + 1, idx)
      ball.x = next.x
      ball.y = next.y - 10
      await sleep(130)
    }
  }

  // idx = фактический слот
  const b = bins.value[idx]
  ball.x = b.x
  ball.y = b.y - 18
  await sleep(160)

  ball.landing = idx
  setGlow(idx)

  const mult = table.value[idx] ?? result.multiplier ?? 0
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
    msg: ''
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
              * {{ bigWin.displayText }} {{ bigWin.title }} *
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
  transition: left .14s ease, top .14s ease;
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