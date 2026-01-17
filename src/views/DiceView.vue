<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import GameHowTo from '../components/GameHowTo.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { useUiStore } from '../stores/ui'
import { useRequireAuthAction } from '../composables/useRequireAuthAction'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { normalizeError, reportError, userMessageForStatus } from '../utils/errors'
import { dicePlay } from '../api/games'

const auth = useAuthStore()
const bigwinStore = useBigWinStore()
const ui = useUiStore()
const { requireAuth } = useRequireAuthAction()

const amount = ref(0)

// Slider = Roll Over
const rollOverUi = ref(30) // 1..99

const running = ref(false)
const lastRoll = ref<number | null>(null)
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

// local odds/payout
const payoutMul = ref<number>(0)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const bet = computed(() => Math.max(0, Number(amount.value) || 0))

const rollOver = computed(() => Math.max(1, Math.min(99, round2(Number(rollOverUi.value || 0)))))
const winChance = computed(() => round2(100 - rollOver.value))

const multiplier = computed(() => payoutMul.value || 0)
const profitOnWin = computed(() => Math.round(bet.value * (multiplier.value - 1) * 10000) / 10000)

// UI
const needle = ref(50)
const bump = ref(false)
const flashZone = ref<'win' | 'lose' | ''>('')
const trailOn = ref(false)
const linePulse = ref(false)

const puckScale = ref(1)
const puckGlow = ref(0)

// particles + micro shake
const burst = ref<'win' | 'lose' | ''>('')
const burstTick = ref(0)
const barShake = ref(false)

const resultLabel = computed(() => needle.value.toFixed(2))

const needleTarget = ref(needle.value)

let prevFrameTs = 0
const smooth = (cur: number, target: number, dt: number, tau = 0.09) => {
  const a = 1 - Math.exp(-dt / tau)
  return cur + (target - cur) * a
}

let raf: number | null = null
let lastTick = 0

function stopAnim() {
  if (raf !== null) {
    cancelAnimationFrame(raf)
    raf = null
  }
  lastTick = 0
}

function flash(kind: 'win' | 'lose') {
  flashZone.value = kind
  window.setTimeout(() => (flashZone.value = ''), 520)
}

function pulseLine() {
  linePulse.value = true
  window.setTimeout(() => (linePulse.value = false), 420)
}

function triggerBurst(kind: 'win' | 'lose') {
  burst.value = kind
  burstTick.value += 1
  window.setTimeout(() => (burst.value = ''), 520)
}

function triggerBarShake() {
  barShake.value = true
  window.setTimeout(() => (barShake.value = false), 180)
}

// ==== Slider behavior ====
function recalcLocalPayout() {
  const wc = Math.max(0.01, winChance.value)
  payoutMul.value = round2(99 / wc)
}

function onSliderInput() {
  rollOverUi.value = round2(Number(rollOverUi.value))
  recalcLocalPayout()
}

function onSliderCommit() {
  sfx('ui_tick')
}

recalcLocalPayout()

// easing
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

async function playInternal() {
  if (running.value) return
  message.value = ''
  messageType.value = 'info'

  if (bet.value <= 0) {
    messageType.value = 'error'
    return (message.value = 'Укажи Amount')
  }
  if (auth.user?.balance != null && auth.user.balance < bet.value) {
    messageType.value = 'error'
    return (message.value = 'Недостаточно баланса')
  }

  running.value = true
  lastRoll.value = null
  sfx('click')

  const ro = round2(Number(rollOverUi.value))
  let res: any
  try {
    res = await dicePlay({ bet: Number(bet.value), rollOver: ro })
  } catch (e: any) {
    running.value = false
    setError(e, 'Ошибка запроса')
    return
  }

  const target = Number(res.roll)
  const resultIsWin = !!res.isWin
  const resultPayout = Number(res.payout)

  const SPIN_MS = 1100
  const BRAKE_MS = 950
  const SNAP_MS = 360

  const t0 = performance.now()
  prevFrameTs = 0
  lastTick = 0

  const start = needle.value
  const spinSeed = Math.random() * 1000

  trailOn.value = true
  puckGlow.value = 0.9

  const finalize = async () => {
    if (resultIsWin) {
      sfx('win')
      flash('win')
      triggerBurst('win')
      const profit = Math.max(0, resultPayout - Number(bet.value))
      messageType.value = 'success'
      message.value = `Победа: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
      bigwinStore.maybeShow(resultPayout, bet.value)
    } else {
      sfx('lose')
      flash('lose')
      triggerBurst('lose')
      triggerBarShake()
      messageType.value = 'error'
      message.value = 'Проигрыш'
    }

    try {
      await auth.fetchBalance()
    } catch (e) {
      reportError(e)
    }

    running.value = false
  }

  const tickDynamic = (speed: number, t: number) => {
    const interval = speed > 0.65 ? 70 : speed > 0.4 ? 95 : 130
    const desired = Math.floor((t - t0) / interval)
    if (desired > lastTick) {
      lastTick = desired
      sfx('dice_tick')
      if (desired % 3 === 0) pulseLine()
    }
  }

  const step = (t: number) => {
    const dt = Math.max(0.001, (t - (prevFrameTs || t)) / 1000)
    prevFrameTs = t

    const elapsed = t - t0

    if (elapsed < SPIN_MS) {
      const p = clamp01(elapsed / SPIN_MS)
      const e = easeOutCubic(p)

      const laps = 2.4
      const base = start + e * (laps * 100)

      const wT = (t + spinSeed) / 1000
      const wobble = Math.sin(wT * Math.PI * 2 * 1.35) * 3.4

      needleTarget.value = (base + wobble + 1000) % 100
      needle.value = smooth(needle.value, needleTarget.value, dt, 0.075)

      puckScale.value = 1 + 0.06 * (0.5 + 0.5 * Math.sin(wT * Math.PI * 2 * 0.9))
      puckGlow.value = 0.95

      tickDynamic(1.0, t)
      raf = requestAnimationFrame(step)
      return
    }

    const t1 = elapsed - SPIN_MS
    if (t1 < BRAKE_MS) {
      const p = clamp01(t1 / BRAKE_MS)
      const e = easeInOutCubic(p)

      const from = needle.value
      let delta = target - from
      if (delta > 50) delta -= 100
      if (delta < -50) delta += 100

      const pos = from + delta * (0.22 + 0.78 * e)

      const wT = (t + spinSeed) / 1000
      const decay = Math.exp(-3.4 * p)
      const osc = Math.sin(wT * Math.PI * 2 * 1.05) * (2.2 * decay)

      needleTarget.value = (pos + osc + 1000) % 100
      needle.value = smooth(needle.value, needleTarget.value, dt, 0.1)

      puckScale.value = 1 + 0.05 * decay
      puckGlow.value = 0.72 + 0.18 * decay

      tickDynamic(0.55, t)
      raf = requestAnimationFrame(step)
      return
    }

    const t2 = t1 - BRAKE_MS
    if (t2 < SNAP_MS) {
      const p = clamp01(t2 / SNAP_MS)
      const e = easeOutCubic(p)

      const ease = easeInOutCubic(p)
      const overshoot = Math.sin(ease * Math.PI) * (0.9 * (1 - ease))

      needleTarget.value = (target + overshoot + 1000) % 100
      needle.value = smooth(needle.value, needleTarget.value, dt, 0.1)

      puckScale.value = 1.14 - 0.14 * e
      puckGlow.value = 1.0

      raf = requestAnimationFrame(step)
      return
    }

    stopAnim()
    trailOn.value = false
    lastRoll.value = target
    needle.value = target

    puckScale.value = 1
    puckGlow.value = 0

    sfx('dice_stop')

    bump.value = false
    requestAnimationFrame(() => {
      bump.value = true
      window.setTimeout(() => (bump.value = false), 120)
      window.setTimeout(() => (bump.value = true), 155)
      window.setTimeout(() => (bump.value = false), 240)
    })

    void finalize()
  }

  raf = requestAnimationFrame(step)
}

function play() {
  return requireAuth(() => playInternal())
}
onBeforeUnmount(() => stopAnim())
</script>

<template>
  <GameLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="running"
        :message="message"
        :message-type="messageType"
        play-text="Play"
        @half="amount = Math.max(0, (Number(amount) || 0) / 2)"
        @double="amount = (Number(amount) || 0) * 2"
        @play="play"
      >
        <template #summary>
          <div class="summary">
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_ea1c527187') }}</span>
              <span class="num">x{{ fmt(multiplier, 4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_047de663a9') }}</span>
              <span class="num">{{ fmt(profitOnWin, 4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_ebeefd375d') }}</span>
              <span class="num">{{ fmt(winChance, 2) }}%</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_3245db459e') }}</span>
              <span class="num">{{ fmt(rollOver, 2) }}</span>
            </div>
          </div>
        </template>
      </GamePanel>
    </template>

    <div class="dial">
      <div class="scale-top" aria-hidden="true">
        <div class="tick" style="left: 0%"><span>0</span></div>
        <div class="tick" style="left: 25%"><span>25</span></div>
        <div class="tick" style="left: 50%"><span>50</span></div>
        <div class="tick" style="left: 75%"><span>75</span></div>
        <div class="tick" style="left: 100%"><span>100</span></div>
      </div>

      <div class="bar-wrap">
        <div class="bar stake" :class="[flashZone, { shake: barShake }]">
          <div class="track">
            <div class="split red" :style="{ width: rollOver + '%' }" />
            <div class="split green" :style="{ width: 100 - rollOver + '%' }" />
            <div class="track-shine" aria-hidden="true" />
          </div>

          <input
            class="bar-slider"
            type="range"
            min="1"
            max="99"
            step="0.01"
            v-model.number="rollOverUi"
            @input="onSliderInput"
            @change="onSliderCommit"
            @pointerup="onSliderCommit"
            @keyup.enter="onSliderCommit"
            :disabled="running"
            aria-label="Roll Over"
          />

          <div
            class="roll-line"
            :class="{ pulse: linePulse }"
            :style="{ left: rollOver + '%' }"
            aria-hidden="true"
          />

          <div class="roll-thumb" :style="{ left: rollOver + '%' }" aria-hidden="true">
            <div class="thumb-grip">
              <span class="grip-bar"></span>
              <span class="grip-bar"></span>
              <span class="grip-bar"></span>
            </div>
          </div>

          <div class="thumb-bubble-layer" :style="{ left: rollOver + '%' }" aria-hidden="true">
            <div class="thumb-bubble">
              <div class="bubble-top">ROLL OVER</div>
              <div class="bubble-val">{{ fmt(rollOver, 2) }}</div>
            </div>
          </div>

          <div
            class="result-puck"
            :class="[flashZone, { bump, trail: trailOn }]"
            :style="{
              left: needle + '%',
              transform: `translate(-50%, -50%) scale(${puckScale})`,
              '--glow': String(puckGlow),
            }"
            :data-v="resultLabel"
            aria-hidden="true"
          >
            <div
              v-if="burst"
              class="burst"
              :class="burst"
              :key="`burst-${burst}-${burstTick}`"
              aria-hidden="true"
            >
              <span class="p p1"></span>
              <span class="p p2"></span>
              <span class="p p3"></span>
              <span class="p p4"></span>
              <span class="p p5"></span>
              <span class="p p6"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="controls">
        <div class="hint muted">
          Выигрыш, если результат <b class="text">справа</b> от линии Roll Over.
        </div>
      </div>

      <div v-if="lastRoll !== null" class="last">
        Last roll: <b>{{ fmt(lastRoll, 2) }}</b>
      </div>

      <div class="legend" aria-hidden="true">
        <span class="pill red">Lose</span>
        <span class="pill green">Win</span>
      </div>
    </div>

    <template #below>
      <GameHowTo
        heading="Dice — как играть"
        intro="Вы выбираете порог Roll Over и делаете ставку. Система генерирует число от 0 до 100: если результат выше выбранного порога — вы выигрываете по рассчитанному множителю. Чем выше шанс — тем ниже множитель." 
        :sections="[
          { title: 'Базовые шаги', items: [
            'Укажите сумму ставки.',
            'Выберите значение Roll Over на шкале.',
            'Нажмите Play и дождитесь результата.',
            'В случае победы выплата рассчитывается автоматически.'
          ]},
          { title: 'Механика и режимы', items: [
            'Roll Over задаёт порог: шанс победы равен 100 − Roll Over.',
            'Множитель растёт при уменьшении шанса победы.',
            'Результат и ставка влияют только на текущий раунд.'
          ]},
          { title: 'Советы', items: [
            'Для более стабильной игры выбирайте более высокий шанс победы.',
            'Для риск-игры снижайте шанс победы и ловите высокий множитель, но помните, что серия проигрышей возможна.'
          ]}
        ]"
      />
    </template>
  </GameLayout>
</template>

<style scoped>
.summary {
  margin-top: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dial {
  width: min(920px, 100%);
  margin: 0 auto;
  position: relative;
  padding-top: 28px;

  /* если вдруг где-то сверху есть странные слои — это лечит почти всё */
  isolation: isolate;
}

/* bubble fix */
.bar-wrap {
  position: relative;
  overflow: visible;
  z-index: 1;
}

.scale-top {
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 22px;
  pointer-events: none;
  z-index: 0;
}
.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.tick::after {
  content: '';
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid rgba(255, 255, 255, 0.18);
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5));
}
.tick span {
  font-size: 13px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 10px 18px rgba(0, 0, 0, 0.55);
}

.bar.stake {
  position: relative;
  height: 48px;
  border-radius: 999px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(14, 24, 34, 0.72);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.28),
    inset 0 18px 28px rgba(0, 0, 0, 0.35),
    0 18px 40px rgba(0, 0, 0, 0.36);
  overflow: hidden;
  z-index: 1;
}
.bar.stake.shake {
  animation: barShakeSoft 180ms ease-in-out;
}

@keyframes barShakeSoft {
  0% {
    transform: translateX(0);
  }
  15% {
    transform: translateX(-3px);
  }
  35% {
    transform: translateX(2px);
  }
  55% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(1px);
  }
  100% {
    transform: translateX(0);
  }
}

.track {
  position: relative;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.07),
    inset 0 10px 18px rgba(0, 0, 0, 0.26);
  display: flex;
}

.split {
  height: 100%;
}
.split.red {
  background-image:
    linear-gradient(90deg, rgba(255, 64, 87, 0.95), rgba(255, 64, 87, 0.45)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0 1px, rgba(0, 0, 0, 0) 1px 7px);
  background-blend-mode: normal, multiply;
}
.split.green {
  flex: 1;
  background-image:
    linear-gradient(90deg, rgba(0, 231, 1, 0.42), rgba(0, 231, 1, 0.95)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 1px, rgba(0, 0, 0, 0) 1px 9px);
  background-blend-mode: normal, multiply;
}

.track-shine {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(
    115deg,
    rgba(255, 255, 255, 0) 38%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0) 62%
  );
  transform: translateX(-40%);
  animation: shine 3.8s linear infinite;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}
@keyframes shine {
  0% {
    transform: translateX(-40%);
  }
  100% {
    transform: translateX(40%);
  }
}

.bar-slider {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 48px;
  margin: 0;
  opacity: 0;
  z-index: 8;
  -webkit-appearance: none;
  appearance: none;
}
.bar-slider::-webkit-slider-runnable-track {
  height: 48px;
  background: transparent;
}
.bar-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 64px;
  height: 44px;
}
.bar-slider::-moz-range-track {
  height: 48px;
  background: transparent;
  border: none;
}
.bar-slider::-moz-range-thumb {
  width: 64px;
  height: 44px;
  border: none;
  background: transparent;
}

.roll-line {
  position: absolute;
  top: 6px;
  bottom: 6px;
  width: 2px;
  transform: translateX(-1px);
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35),
    0 0 18px rgba(255, 255, 255, 0.12);
  z-index: 6;
  pointer-events: none;
  border-radius: 2px;
}
.roll-line.pulse {
  animation: linePulse 420ms ease-out;
}
@keyframes linePulse {
  0% {
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 10px rgba(255, 255, 255, 0.14);
    opacity: 0.9;
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 26px rgba(255, 255, 255, 0.22);
    opacity: 1;
  }
  100% {
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 14px rgba(255, 255, 255, 0.12);
    opacity: 0.95;
  }
}

.roll-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 40px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(120, 205, 255, 0.96), rgba(56, 145, 255, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 18px 32px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 0 -10px 18px rgba(0, 0, 0, 0.14);
  z-index: 9;
  pointer-events: none;
  backdrop-filter: blur(6px);
}
.roll-thumb::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
}

.thumb-grip {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 1px;
  z-index: 2;
}
.grip-bar {
  width: 7px;
  height: 3px;
  border-radius: 999px;
  background: rgba(10, 26, 40, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 8px 18px rgba(0, 0, 0, 0.25);
}

.thumb-bubble-layer {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  pointer-events: none;
  overflow: visible;
}

.thumb-bubble {
  position: absolute;
  left: 50%;
  top: -54px;
  transform: translateX(-50%);
  min-width: 108px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.38);
  box-shadow:
    0 18px 34px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  text-align: center;
  z-index: 9999;
}
.thumb-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 9px solid rgba(0, 0, 0, 0.38);
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.45));
}
.bubble-top {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.72);
}
.bubble-val {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 1000;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 10px 18px rgba(0, 0, 0, 0.55);
}

.result-puck {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid rgba(0, 0, 0, 0.55);
  box-shadow:
    0 10px 16px rgba(0, 0, 0, 0.45),
    0 0 calc(18px + 20px * var(--glow)) rgba(255, 255, 255, calc(0.1 + 0.22 * var(--glow)));
  filter: drop-shadow(0 0 calc(10px * var(--glow)) rgba(255, 255, 255, 0.18));
  z-index: 5;
  pointer-events: none;
}

.result-puck.trail::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 14px;
  transform: translate(-10px, -50%);
  border-radius: 999px;
  background: radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0));
  filter: blur(1px);
  opacity: 0.85;
}

.result-puck::after {
  content: attr(data-v);
  position: absolute;
  top: -34px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.92);
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.32);
  text-shadow: 0 8px 16px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
}

.burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.burst .p {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  opacity: 0;
  animation: particle 520ms ease-out forwards;
}
.burst.win .p {
  background: rgba(0, 231, 1, 0.92);
  box-shadow: 0 0 18px rgba(0, 231, 1, 0.28);
}
.burst.lose .p {
  background: rgba(255, 64, 87, 0.92);
  box-shadow: 0 0 18px rgba(255, 64, 87, 0.28);
}
.burst .p1 {
  animation-delay: 0ms;
  --dx: -22px;
  --dy: -14px;
}
.burst .p2 {
  animation-delay: 18ms;
  --dx: 18px;
  --dy: -18px;
}
.burst .p3 {
  animation-delay: 28ms;
  --dx: -14px;
  --dy: 20px;
}
.burst .p4 {
  animation-delay: 10ms;
  --dx: 24px;
  --dy: 10px;
}
.burst .p5 {
  animation-delay: 36ms;
  --dx: 0px;
  --dy: -26px;
}
.burst .p6 {
  animation-delay: 44ms;
  --dx: 0px;
  --dy: 26px;
}

@keyframes particle {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
  }
  10% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0);
  }
}

.controls {
  margin-top: 16px;
}
.last {
  margin-top: 14px;
  color: rgba(255, 255, 255, 0.85);
}

.legend {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  opacity: 0.9;
}
.pill {
  font-size: 12px;
  font-weight: 900;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.22);
}
.pill.red {
  color: rgba(255, 160, 171, 0.95);
}
.pill.green {
  color: rgba(160, 255, 160, 0.95);
}

@media (prefers-reduced-motion: reduce) {
  .track-shine {
    animation: none;
    opacity: 0.25;
  }
}
</style>
