<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { normalizeError, reportError, userMessageForStatusI18n } from '../utils/errors'
import { useI18n } from 'vue-i18n'

const auth = useAuthStore()
const ui = useUiStore()
const { requireAuth } = useRequireAuthAction()
const { t } = useI18n()

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
const MAX_ACTIVE_BALLS = 11150
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

const difficultyOptions = computed(() =>
  [
    { value: 'LOW', label: t('ui.s_low') },
    { value: 'MEDIUM', label: t('ui.s_medium') },
    { value: 'HIGH', label: t('ui.s_high') },
  ] as const
)

const rowsOptions = computed(() => rowsList.map((r) => ({ value: r, label: String(r) })))

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

type Segment = {
  x0: number
  y0: number
  x1: number
  y1: number
  t0: number
  ms: number
  arc: number
  pegKey?: string
}

type BallState = {
  id: number
  seed: number
  speedMul: number
  bet: number
  win: number
  net: number
  rights: boolean[]
  landing: number
  msg: string
  startAt: number
  segments: Segment[]
  x: number
  y: number
  scale: number
  rot: number
  rot0: number
  rotAmp: number
  rotSpeed: number
  wobbleX: number
  wobbleY: number
  wobbleSpeed: number
  bumpUntil: number
  lastPegKey: string | null
  finishedAt: number | null
  removedAt: number | null
  didLand: boolean
}

const canvasEl = ref<HTMLCanvasElement | null>(null)
const activeBalls = ref(0)

const ballsArr: BallState[] = []
const pool: BallState[] = []

const pegHitUntil = new Map<string, number>()

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
  return x - Math.floor(x)
}
function jitterSigned(seed: number, amp = 1){
  return (jitter01(seed) * 2 - 1) * amp
}

let rafId: number | null = null
let lastHitSfxAt = 0

let ctx: CanvasRenderingContext2D | null = null
let dpr = 1

let ballSprite: HTMLCanvasElement | null = null

type Impact = {
  x: number
  y: number
  kind: 'win' | 'lose' | 'zero'
  mult: number
  hue: number
  at: number
}

const impacts: Impact[] = []

function multHue(mult: number) {
  const maxM = Math.max(1, ...table.value)
  const t = Math.max(0, Math.min(1, Math.log(mult + 1) / Math.log(maxM + 1)))
  return 140 + 180 * t
}


function rebuildCanvas() {
  const el = canvasEl.value
  if (!el) return
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const w = Math.max(1, Math.floor(stageW.value))
  const h = Math.max(1, Math.floor(stageHeight.value))
  el.width = Math.floor(w * dpr)
  el.height = Math.floor(h * dpr)
  el.style.width = w + 'px'
  el.style.height = h + 'px'
  ctx = el.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ballSprite = makeBallSprite(16)
}

onMounted(() => {
  if (typeof window === 'undefined') return
  rebuildCanvas()
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(tick)
})

watch([stageW, stageHeight], () => {
  if (typeof window === 'undefined') return
  rebuildCanvas()
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  ctx = null
  ballSprite = null
  ballsArr.length = 0
  pegHitUntil.clear()
})

function makeBallSprite(size: number) {
  const c = document.createElement('canvas')
  const s = size
  c.width = s
  c.height = s
  const g = c.getContext('2d')
  if (!g) return c
  const r = s / 2
  const grad = g.createRadialGradient(r * 0.65, r * 0.55, r * 0.1, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,.98)')
  grad.addColorStop(1, 'rgba(255,178,74,.95)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(r, r, r - 0.5, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.85
  const hl = g.createRadialGradient(r * 0.55, r * 0.5, 0, r * 0.55, r * 0.5, r)
  hl.addColorStop(0, 'rgba(255,255,255,.55)')
  hl.addColorStop(0.55, 'rgba(255,255,255,0)')
  g.fillStyle = hl
  g.beginPath()
  g.arc(r, r, r - 0.5, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  return c
}

function nowMs() {
  return performance.now()
}

function addPegHit(key: string, until: number) {
  pegHitUntil.set(key, until)
}

function maybePlayHitSfx(t: number) {
  if (t - lastHitSfxAt < 55) return
  lastHitSfxAt = t
  try { sfx('plinko_hit') } catch { try { sfx('plinko_tick') } catch {} }
}

function allocBall(): BallState {
  const b = pool.pop()
  if (b) return b
  return {
    id: 0,
    seed: 0,
    speedMul: 1,
    bet: 0,
    win: 0,
    net: 0,
    rights: [],
    landing: 0,
    msg: '',
    startAt: 0,
    segments: [],
    x: 0,
    y: 0,
    scale: 1,
    rot: 0,
    rot0: 0,
    rotAmp: 0,
    rotSpeed: 0,
    wobbleX: 0,
    wobbleY: 0,
    wobbleSpeed: 0,
    bumpUntil: 0,
    lastPegKey: null,
    finishedAt: null,
    removedAt: null,
    didLand: false,
  }
}

function releaseBall(b: BallState) {
  b.rights = []
  b.segments = []
  b.msg = ''
  b.lastPegKey = null
  b.finishedAt = null
  b.removedAt = null
  b.didLand = false
  b.speedMul = 1
  pool.push(b)
}

function buildSegments(seed: number, rights: boolean[], speedMul: number) {
  const segs: Segment[] = []
  const startX = W.value / 2 + jitterSigned(seed * 0.000001, pegGapX.value * 0.18)
  const startY = 42 + jitterSigned(seed * 0.000002, 4)
  let t = 0
  let idx = 0
  let fromX = startX
  let fromY = startY

  for (let r = 0; r < rows.value; r++) {
    const hit = pegPos(r, idx)
    const sx = jitterSigned(seed * 0.0003 + r * 1.31, 2.6)
    const sy = jitterSigned(seed * 0.0005 + r * 2.17, 1.3)
    const d1 = (82 + jitter01(seed * 0.00001 + r * 2.07) * 45) * speedMul
    const arc1 = 8 + jitterSigned(seed * 0.000013 + r * 0.77, 4.2)
    segs.push({
      x0: fromX,
      y0: fromY,
      x1: hit.x + sx,
      y1: hit.y - 10 + sy,
      t0: t,
      ms: d1,
      arc: arc1,
      pegKey: `${r}-${idx}`,
    })
    t += d1
    fromX = hit.x + sx
    fromY = hit.y - 10 + sy

    if (rights[r]) idx += 1

    if (r < rows.value - 1) {
      const next = pegPos(r + 1, idx)
      const nx = jitterSigned(seed * 0.0007 + r * 3.11, 2.1)
      const ny = jitterSigned(seed * 0.0009 + r * 4.07, 1.1)
      const d2 = (98 + jitter01(seed * 0.00002 + r * 1.33) * 55) * speedMul
      const arc2 = 10 + jitterSigned(seed * 0.000021 + r * 0.93, 5)
      segs.push({ x0: fromX, y0: fromY, x1: next.x + nx, y1: next.y - 10 + ny, t0: t, ms: d2, arc: arc2 })
      t += d2
      fromX = next.x + nx
      fromY = next.y - 10 + ny
    }
  }

  const b = bins.value[idx]
  const d3 = 150 * speedMul
  const arc3 = 12 + jitterSigned(seed * 0.000031, 6)
  segs.push({ x0: fromX, y0: fromY, x1: b.x, y1: b.y - 18, t0: t, ms: d3, arc: arc3 })
  t += d3
  return { segs, landing: idx, totalMs: t, startX, startY }
}

function updateBall(b: BallState, tNow: number) {
  const t = tNow - b.startAt
  const segs = b.segments
  if (!segs.length) return
  const last = segs[segs.length - 1]

  if (t >= last.t0 + last.ms) {
    b.x = last.x1
    b.y = last.y1
    if (!b.didLand) {
      b.didLand = true
      b.finishedAt = tNow
      b.bumpUntil = tNow + 120
      setGlow(b.landing)
      const mult = table.value[b.landing] ?? 0
      const bin = bins.value[b.landing]
      if (bin) {
        impacts.push({
          x: bin.x,
          y: bin.y - 4,
          kind: b.win > 0 ? 'win' : b.win < 0 ? 'lose' : 'zero',
          mult,
          hue: multHue(mult),
          at: tNow,
        })
      }
      if (b.win > 0) {
        try { sfx('win') } catch {}
        b.msg = `x${mult} → +${fmt(b.win, 2)}`
        bigwinStore.maybeShow(b.win, b.bet)
      } else {
        try { sfx('lose') } catch {}
        b.msg = `x${mult} → 0`
      }
      b.removedAt = tNow + 260

      inFlightStake.value -= b.bet
      pendingWinTotal.value -= b.win
      localBalance.value += b.win
      ui.setBalanceOverride(localBalance.value)
      landedSinceSync.value += 1
      void maybeSyncBalance()

      if (b.net > 0) message.value = `Профит +${fmt(b.net, 2)}`
      else if (b.net < 0) message.value = `Минус ${fmt(-b.net, 2)}`
      else message.value = 'В ноль'
    }
    return
  }

  let seg: Segment | null = null
  let segIndex = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (t >= s.t0 && t < s.t0 + s.ms) { seg = s; segIndex = i; break }
  }
  if (!seg) seg = segs[0]
  const p = Math.max(0, Math.min(1, (t - seg.t0) / Math.max(1, seg.ms)))
  const j = Math.sin((tNow * 0.012) + b.seed * 0.000003 + segIndex * 1.7) * 0.014
  const k = Math.max(0, Math.min(1, easeInOutCubic(p) + j))
  const lift = seg.arc > 0 ? Math.sin(Math.PI * k) * seg.arc : 0
  const x = seg.x0 + (seg.x1 - seg.x0) * k
  const y = seg.y0 + (seg.y1 - seg.y0) * k - lift

  const pegTrigger = 0.88 + jitter01(b.seed * 0.000009 + segIndex * 1.13) * 0.1
  if (seg.pegKey && p >= pegTrigger && b.lastPegKey !== seg.pegKey) {
    b.lastPegKey = seg.pegKey
    b.bumpUntil = tNow + 120
    addPegHit(seg.pegKey, tNow + 90)
    maybePlayHitSfx(tNow)
  }

  const tsec = tNow * 0.001
  const wob = Math.sin(tsec * b.wobbleSpeed + b.seed)
  const wob2 = Math.sin(tsec * (b.wobbleSpeed * 0.62) + b.seed * 0.31)
  b.x = x + wob * b.wobbleX + wob2 * (b.wobbleX * 0.45)
  b.y = y + Math.cos(tsec * b.wobbleSpeed + b.seed) * b.wobbleY + Math.cos(tsec * (b.wobbleSpeed * 0.7) + b.seed * 0.17) * (b.wobbleY * 0.35)
  b.rot = b.rot0 + Math.sin(tsec * b.rotSpeed + b.seed) * b.rotAmp

  if (tNow < b.bumpUntil) {
    const pb = 1 - (b.bumpUntil - tNow) / 120
    b.scale = 1 + 0.12 * Math.sin(Math.PI * pb)
  } else {
    b.scale = 1
  }
}

function drawScene(tNow: number) {
  if (!ctx || !canvasEl.value) return
  const w = stageW.value
  const h = stageHeight.value
  ctx.clearRect(0, 0, w, h)

  const pr = 3
  const hr = 5.5
  for (const p of pegs.value) {
    const until = pegHitUntil.get(p.key) || 0
    const hit = until > tNow
    ctx.save()
    if (hit) {
      ctx.shadowColor = 'rgba(255,178,74,.28)'
      ctx.shadowBlur = 18
      ctx.fillStyle = 'rgba(255,255,255,.92)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, hr, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.92)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, pr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  for (let i = impacts.length - 1; i >= 0; i--) {
    const imp = impacts[i]
    const age = tNow - imp.at
    if (age > 520) {
      impacts.splice(i, 1)
      continue
    }
    const p = Math.max(0, Math.min(1, age / 520))
    const k = 1 - Math.pow(1 - p, 3)
    const r1 = 10 + 46 * k
    const r2 = r1 + 18
    const alpha = (1 - p) * 0.9
    const g = ctx.createRadialGradient(imp.x, imp.y, r1 * 0.25, imp.x, imp.y, r2)
    const base = imp.kind === 'lose' ? 0.75 : imp.kind === 'win' ? 1 : 0.6
    const h = imp.kind === 'lose' ? (340 + (imp.hue - 140) * 0.18) : imp.hue
    const a0 = (imp.kind === 'win' ? 0.24 : imp.kind === 'lose' ? 0.22 : 0.18) * alpha
    g.addColorStop(0, `hsla(${h}, 100%, 62%, ${a0 * base})`)
    g.addColorStop(1, `hsla(${h}, 100%, 62%, 0)`)

    ctx.save()
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(imp.x, imp.y, r2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = `hsla(${h}, 100%, 62%, ${imp.kind === 'lose' ? 0.66 : 0.62})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(imp.x, imp.y, r1, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  if (ballSprite) {
    for (const b of ballsArr) {
      if (b.removedAt && tNow >= b.removedAt) continue
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate((b.rot * Math.PI) / 180)
      ctx.scale(b.scale, b.scale)
      ctx.drawImage(ballSprite, -ballSprite.width / 2, -ballSprite.height / 2)
      ctx.restore()
    }
  }
}

function tick() {
  const tNow = nowMs()
  for (let i = ballsArr.length - 1; i >= 0; i--) {
    const b = ballsArr[i]
    updateBall(b, tNow)
    if (b.removedAt && tNow >= b.removedAt) {
      ballsArr.splice(i, 1)
      releaseBall(b)
    }
  }
  activeBalls.value = ballsArr.length

  const cutoff = tNow - 500
  for (const [k, until] of pegHitUntil) {
    if (until < cutoff) pegHitUntil.delete(k)
  }

  drawScene(tNow)
  rafId = requestAnimationFrame(tick)
}

type ApiTrace = { win: number; mask: number }
type ApiPlay = { total: number; traces: ApiTrace[] }

type BallResult = {
  rights: boolean[]
  landing: number
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


async function syncBalanceFromServer() {
  const fn = (auth as any)?.fetchBalance
  if (typeof fn !== 'function') return
  try {
    await fn.call(auth, { force: true })
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
  return activeBalls.value
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
    setError(e, t('ui.s_plinko_error_play'))
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

  const baseNow = nowMs()
  for (let i = 0; i < n; i++) {
    const tr = traces[i]
    const win = Number((tr as any)?.win) || 0
    const net = Math.round((win - bet.value) * 100) / 100
    const result: BallResult = tr
      ? traceToBallResult(tr)
      : { rights: Array(rows.value).fill(false), landing: 0, payout: 0, multiplier: table.value[0] ?? 0 }

    const ball = allocBall()
    const seed = Math.floor(Math.random() * 1_000_000_000)
    const speedMul = 1.1 * (0.95 + Math.random() * 0.10)
    const built = buildSegments(seed, result.rights, speedMul)
    const stagger = Math.floor(jitter01(seed) * 120) + i * 35
    ball.id = Date.now() + Math.floor(Math.random() * 100000) + i
    ball.seed = seed
    ball.speedMul = speedMul
    ball.bet = bet.value
    ball.win = Math.round((Number(result.payout) || win) * 100) / 100
    ball.net = net
    ball.rights = result.rights
    ball.landing = built.landing
    ball.msg = ''
    ball.startAt = baseNow + stagger
    ball.segments = built.segs
    ball.x = built.startX
    ball.y = built.startY
    ball.scale = 1
    ball.rot = 0
    ball.rot0 = jitterSigned(Math.random() * 9999, 180)
    ball.rotAmp = 7 + Math.random() * 20
    ball.rotSpeed = 2.5 + Math.random() * 7
    ball.wobbleX = 0.35 + Math.random() * 1.05
    ball.wobbleY = 0.15 + Math.random() * 0.65
    ball.wobbleSpeed = 4.5 + Math.random() * 7.5
    ball.bumpUntil = 0
    ball.lastPegKey = null
    ball.finishedAt = null
    ball.removedAt = null
    ball.didLand = false
    ballsArr.push(ball)
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




function binGlowColor(mult: number) {
  if (mult >= 50) return 'rgba(170, 255, 255, .95)'
  if (mult >= 12) return 'rgba(255, 178, 74, .95)'
  if (mult >= 3) return 'rgba(61, 255, 157, .95)'
  return 'rgba(168, 185, 255, .95)'
}

function binRippleMs(mult: number) {
  if (mult >= 50) return 520
  if (mult >= 12) return 620
  if (mult >= 3) return 720
  return 860
}

function binRippleScale(mult: number) {
  if (mult >= 50) return 1.28
  if (mult >= 12) return 1.18
  if (mult >= 3) return 1.12
  return 1.06
}
</script>


<template>
  <GamePageLayout>
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="controlsDisabled"
        :play-text="$t('ui.s_drop')"
        :message="message"
        :message-type="messageType"
        @half="amount = Math.max(0, (Number(amount)||0)/2)"
        @double="amount = (Number(amount)||0)*2"
        @play="start"
      >
        <div class="quick-drop-row">
          <button class="btn btn-primary" :disabled="controlsDisabled" @click="dropMany(5)">{{ $t('ui.s_drop_n', { n: 5 }) }}</button>
          <button class="btn btn-primary" :disabled="controlsDisabled" @click="dropMany(10)">{{ $t('ui.s_drop_n', { n: 10 }) }}</button>
          <button class="btn btn-primary" :disabled="controlsDisabled" @click="dropMany(25)">{{ $t('ui.s_drop_n', { n: 25 }) }}</button>
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

      <canvas class="plinko-canvas" ref="canvasEl" />

          <div
            class="bins-grid"
            :style="{ width: binsWidth + 'px', '--bin': BIN_SIZE + 'px', '--bins-top': (binsCenterY - BIN_SIZE / 2) + 'px' }"
          >
            <div
              v-for="bin in bins"
              :key="bin.i"
              class="bin"
              :class="{ glow: glowBin === bin.i }"
              :style="{ background: binGradient(bin.mult), '--g': binGlowColor(bin.mult), '--r': binRippleMs(bin.mult) + 'ms', '--rs': String(binRippleScale(bin.mult)) }"
            >
              <span class="bin-mult">{{ bin.mult }}x</span>
            </div>
          </div>
    </div>

    <template #below>
      <GameHowTo
        :heading="$t('ui.s_howto_plinko')"
        :intro="$t('ui.s_howto_plinko_intro')"
        :sections="[
          { title: $t('ui.s_howto_steps'), items: [
            $t('ui.s_howto_plinko_step_1'),
            $t('ui.s_howto_plinko_step_2'),
            $t('ui.s_howto_plinko_step_3'),
            $t('ui.s_howto_plinko_step_4')
          ]},
          { title: $t('ui.s_howto_mechanics'), items: [
            $t('ui.s_howto_plinko_mech_1'),
            $t('ui.s_howto_plinko_mech_2')
          ]},
          { title: $t('ui.s_howto_tips'), items: [
            $t('ui.s_howto_plinko_tip_1'),
            $t('ui.s_howto_plinko_tip_2')
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
.plinko-canvas{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  z-index: 3;
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
  z-index: 4;
}
.bin{
  width: var(--bin, 56px);
  height: var(--bin, 56px);
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  color: rgba(255,255,255,.92);
  font-size: 11px;
  display:grid;
  place-items:center;
  position: relative;
  overflow: hidden;
  background: rgba(0,0,0,.14);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.06),
    0 10px 30px rgba(0,0,0,.28),
    0 0 0 rgba(0,0,0,0);
}

.bin::before{
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  background: radial-gradient(circle at 50% 45%, var(--g, rgba(61,255,157,.85)), rgba(0,0,0,0) 64%);
  opacity: .20;
  filter: blur(1px);
  pointer-events: none;
}

.bin::after{
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 32%, rgba(255,255,255,.24), rgba(255,255,255,0) 55%),
    radial-gradient(circle at 50% 80%, rgba(0,0,0,.55), rgba(0,0,0,0) 60%);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.08),
    inset 0 -10px 18px rgba(0,0,0,.38);
  opacity: .85;
  pointer-events: none;
}

.bin.glow{
  animation: binGlow 420ms ease-out;
}

.bin.glow::before{
  animation: binRipple var(--r, 720ms) ease-out;
}

@keyframes binRipple{
  0%{ opacity: .10; transform: scale(.84); }
  40%{ opacity: .62; transform: scale(var(--rs, 1.12)); }
  100%{ opacity: .18; transform: scale(1.0); }
}

@keyframes binGlow{
  0%{ filter: brightness(1.0); box-shadow: inset 0 0 0 1px rgba(255,255,255,.10), 0 0 0 rgba(0,0,0,0); }
  20%{ filter: brightness(1.20); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 0 20px color-mix(in srgb, var(--g, rgba(61,255,157,.95)) 55%, transparent), 0 0 44px color-mix(in srgb, var(--g, rgba(61,255,157,.95)) 30%, transparent); }
  100%{ filter: brightness(1.0); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 0 0 rgba(0,0,0,0); }
}


.bin-mult{ font-weight: 1000; position: relative; z-index: 2; text-shadow: 0 8px 20px rgba(0,0,0,.55); }

</style>
