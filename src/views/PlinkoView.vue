<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import GamePageLayout from '../components/GamePageLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import GameHowTo from '../components/GameHowTo.vue'
import BaseSelect from '../components/BaseSelect.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { useUiStore } from '../stores/ui'
import { useRequireAuthAction } from '../composables/useRequireAuthAction'
import { api } from '../utils/api'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { normalizeError, reportError, userMessageForStatus } from '../utils/errors'

const auth = useAuthStore()
const ui = useUiStore()
const { requireAuth } = useRequireAuthAction()

const amount = ref(0)
const difficulty = ref<'LOW'|'MEDIUM'|'HIGH'>('MEDIUM')
const rows = ref(16)
const inFlightStake = ref(0)
const localBalance = ref(0)
const pendingWinTotal = ref(0)
const landedSinceSync = ref(0)
const lastSyncAt = ref(0)
const SYNC_INTERVAL_MS = 30_000
const SYNC_EVERY_N_LANDED = 6
const activeRequests = ref(0)
const MAX_ACTIVE_BALLS = 30
const message = ref('')
const messageType = ref<'info' | 'success' | 'error'>('info')

function setError(e: unknown, fallback = 'Ошибка') {
  const n = normalizeError(e)
  const text = userMessageForStatus(n.status, n.message || fallback)
  messageType.value = 'error'
  message.value = text
  if (n.status === 401) ui.toast(text, 'info')
  else ui.toast(text, 'error')
  reportError(e)
}
const bigwinStore = useBigWinStore()

watch(
  () => auth.user?.balance,
  (b) => {
    if (b == null) return
    if (!lastSyncAt.value) {
      localBalance.value = Number(b) || 0
      lastSyncAt.value = Date.now()
      ui.setBalanceOverride(localBalance.value)
      return
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  ui.setBalanceOverride(null)
})


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
const totalBet = computed(() => bet.value)

const controlsDisabled = computed(() => activeBallCount() >= MAX_ACTIVE_BALLS)

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

const binsGap = computed(() => clamp(20, pegGapY.value * 0.65, 44))
const binsCenterY = computed(() => 60 + rows.value * pegGapY.value + binsGap.value)
const stageHeight = computed(() => {
  const h = binsCenterY.value + BIN_SIZE.value / 2 + 70
  return clamp(420, h, 860)
})

type Ball = {
  id: number
  bet: number
  win: number
  net: number
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
  const y = binsCenterY.value
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

    const sx = jitterSigned(ball.id * 0.001 + r * 1.31, 1.6)
    const sy = jitterSigned(ball.id * 0.002 + r * 2.17, 0.8)

    // glide into peg (smooth)
    await tweenTo(ball, hit.x + sx, hit.y - 10 + sy, 95, 8)

    // visual + audio "thud"
    void flashPeg(r, idx)
    try { sfx('plinko_hit') } catch { try { sfx('plinko_tick') } catch {} }
    await bump(ball, 5)

    if (result.rights[r]) idx += 1

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

  await bump(ball, 6)

  ball.landing = idx
  setGlow(idx)

  const mult = table.value[idx] ?? result.multiplier ?? 0
  const win = Math.round((Number(result.payout) || 0) * 100) / 100

  if (win > 0) {
    try { sfx('win') } catch {}
    ball.msg = `x${mult} → +${fmt(win, 2)}`

    // big/mega/super overlay (global)
    bigwinStore.maybeShow(win, bet.value)
  } else {
    try { sfx('lose') } catch {}
    ball.msg = `x${mult} → 0`
  }

  await sleep(260)
  ball.visible = false
}


async function syncBalanceFromServer() {
  const fn = (auth as any)?.fetchBalance
  if (typeof fn !== 'function') return
  try {
    await fn.call(auth)
    const server = Number(auth.user?.balance ?? 0) || 0
    localBalance.value = server - pendingWinTotal.value
    ui.setBalanceOverride(localBalance.value)
    lastSyncAt.value = Date.now()
    landedSinceSync.value = 0
  } catch {}
}

async function maybeSyncBalance(force = false) {
  if (force || !lastSyncAt.value) return syncBalanceFromServer()
  const age = Date.now() - lastSyncAt.value
  if (age >= SYNC_INTERVAL_MS || landedSinceSync.value >= SYNC_EVERY_N_LANDED) {
    return syncBalanceFromServer()
  }
}

function availableBalance() {
  return localBalance.value
}

function activeBallCount() {
  return balls.value.filter(b => b.visible || b.landing == null).length
}

async function dropInternal(count: number) {
  if (count <= 0) return
  if (activeRequests.value > 0 && activeBallCount() >= MAX_ACTIVE_BALLS) return
  message.value = ''
  messageType.value = 'info'

  await maybeSyncBalance()

  const freeSlots = Math.max(0, MAX_ACTIVE_BALLS - activeBallCount())
  const n = Math.min(count, freeSlots)

  if (bet.value <= 0) { messageType.value = 'error'; message.value = 'Укажи Amount'; return }
  if (n <= 0) { messageType.value = 'error'; message.value = 'Слишком много шаров на поле'; return }

  const totalCost = bet.value * n
  if (availableBalance() < totalCost) { messageType.value = 'error'; message.value = 'Недостаточно баланса'; return }

  localBalance.value -= totalCost
  ui.setBalanceOverride(localBalance.value)
  inFlightStake.value += totalCost
  activeRequests.value += 1

  if (hitKeys.value.size > 500) hitKeys.value = new Set()

  sfx('plinko_drop')

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
  } catch (e) {
    setError(e, 'Ошибка игры (play)')
    localBalance.value += totalCost
    ui.setBalanceOverride(localBalance.value)
    inFlightStake.value -= totalCost
    activeRequests.value -= 1
    return
  }
  activeRequests.value -= 1

  const traces = Array.isArray(res?.traces) ? res.traces : []
  const winsSum = traces.slice(0, n).reduce((acc, t) => acc + (Number((t as any)?.win) || 0), 0)
  pendingWinTotal.value += winsSum

  for (let i = 0; i < n; i++) {
    const t = traces[i]
    const win = Number((t as any)?.win) || 0
    const net = Math.round((win - bet.value) * 100) / 100
    const result: BallResult = t
      ? traceToBallResult(t)
      : { rights: Array(rows.value).fill(false), landing: 0, payout: 0, multiplier: table.value[0] ?? 0 }

    const ball = reactive<Ball>({
      id: Date.now() + Math.floor(Math.random() * 100000) + i,
      bet: bet.value,
      win,
      net,
      x: W.value / 2,
      y: 42,
      visible: false,
      landing: null,
      msg: '',
      scale: 1
    })
    balls.value = [...balls.value, ball]

    void (async () => {
      await dropBall(ball, result)

      inFlightStake.value -= ball.bet
      pendingWinTotal.value -= ball.win
      localBalance.value += ball.win
      ui.setBalanceOverride(localBalance.value)
      landedSinceSync.value += 1
      void maybeSyncBalance()

      bigwinStore.maybeShow(ball.win, ball.bet)
      if (ball.net > 0) message.value = `Профит +${fmt(ball.net, 2)}`
      else if (ball.net < 0) message.value = `Минус ${fmt(-ball.net, 2)}`
      else message.value = 'В ноль'
    })()
  }
}

function start() {
  return requireAuth(() => dropInternal(1))
}

function dropMany(n: number) {
  return requireAuth(() => dropInternal(n))
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
  <GamePageLayout>
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="controlsDisabled"
        play-text="Drop"
        :message="message"
        :message-type="messageType"
        @half="amount = Math.max(0, (Number(amount)||0)/2)"
        @double="amount = (Number(amount)||0)*2"
        @play="start"
      >
        <div class="quick-drop-row">
          <button class="btn btn-ghost" :disabled="controlsDisabled" @click="dropMany(5)">Drop 5</button>
          <button class="btn btn-ghost" :disabled="controlsDisabled" @click="dropMany(10)">Drop 10</button>
          <button class="btn btn-ghost" :disabled="controlsDisabled" @click="dropMany(25)">Drop 25</button>
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_7b29ca96ad') }}</div>
          <BaseSelect
            v-model="difficulty"
            :options="difficultyOptions"
            :disabled="controlsDisabled"
            :aria-label="$t('ui.s_7b29ca96ad')"
          />
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_530f488f7a') }}</div>
          <BaseSelect
            v-model="rows"
            :options="rowsOptions"
            :disabled="controlsDisabled"
            :aria-label="$t('ui.s_530f488f7a')"
          />
        </div>

        <div class="field">
          <div class="mini">{{ $t('ui.s_66d3a865e2') }} <b class="num">{{ fmt(totalBet, 2) }}</b></div>
          <div v-if="inFlightStake > 0" class="mini">В игре: <b class="num">{{ fmt(inFlightStake, 2) }}</b></div>
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
            :style="{ width: binsWidth + 'px', '--bin': BIN_SIZE + 'px', '--bins-top': (binsCenterY - BIN_SIZE / 2) + 'px' }"
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

    <template #below>
      <GameHowTo
        heading="Plinko — как играть"
        intro="Запускайте шары сверху и наблюдайте, в какой слот они попадут. Множитель зависит от выбранной сложности и количества рядов: крайние слоты обычно дают выше множитель, но попадают реже." 
        :sections="[
          { title: 'Базовые шаги', items: [
            'Укажите сумму ставки и количество шаров (Balls).',
            'Выберите Difficulty и количество Rows — это меняет таблицу множителей.',
            'Нажмите Start и дождитесь падения шаров.',
            'Итоговая выплата складывается из результатов всех шаров.'
          ]},
          { title: 'Режимы и механики', items: [
            'Higher risk: высокая сложность/больше рядов чаще приводит к крайним слотам с большими множителями, но общий разброс результатов выше.',
            'Multiple balls: несколько шаров сглаживают дисперсию, но требуют большего общего бет.'
          ]},
          { title: 'Советы', items: [
            'Если играете на стабильность — увеличивайте Balls и выбирайте более мягкую сложность.',
            'Если цель — поймать большой множитель, снижайте Balls и пробуйте более рискованные настройки.'
          ]}
        ]"
      />
    </template>
  </GamePageLayout>
</template>

<style scoped>
.field{ margin-top: 8px; }
.quick-drop-row{ display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
.quick-drop-row .btn{ height: 42px; border-radius: 14px; }
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
  top: var(--bins-top, 420px);
  height: var(--bin, 56px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0;
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
