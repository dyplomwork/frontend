<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import GameHowTo from '../components/GameHowTo.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { useUiStore } from '../stores/ui'
import { useRequireAuthAction } from '../composables/useRequireAuthAction'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { normalizeError, reportError, userMessageForStatusI18n } from '../utils/errors'
import { dicePlay } from '../api/games'

const auth = useAuthStore()
const bigwinStore = useBigWinStore()
const ui = useUiStore()
const { requireAuth } = useRequireAuthAction()
const { t } = useI18n()

const amount = ref(0)

const rollOverUi = ref(30)

const running = ref(false)
const lastRoll = ref<number | null>(null)
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

const payoutMul = ref<number>(0)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const bet = computed(() => Math.max(0, Number(amount.value) || 0))

const rollOver = computed(() => Math.max(1, Math.min(99, round2(Number(rollOverUi.value || 0)))))
const winChance = computed(() => round2(100 - rollOver.value))

const multiplier = computed(() => payoutMul.value || 0)

const needle = ref(50)
const bump = ref(false)
const flashZone = ref<'win' | 'lose' | ''>('')
const trailOn = ref(false)
const linePulse = ref(false)

const puckScale = ref(1)
const puckGlow = ref(0)

const burst = ref<'win' | 'lose' | ''>('')
const burstTick = ref(0)
const barShake = ref(false)

const runFxTick = ref(0)
const finishFx = ref<'win' | 'lose' | ''>('')

function triggerFinishFx(kind: 'win' | 'lose') {
  finishFx.value = kind
  runFxTick.value += 1
  window.setTimeout(() => (finishFx.value = ''), 620)
}

const resultLabel = computed(() => needle.value.toFixed(2))

type DiceHistoryItem = {
  roll: number
  isWin: boolean
  bet: number
  payout: number
  ts: number
}

const history = ref<DiceHistoryItem[]>([])

const displayRoll = computed(() => {
  if (running.value) return Number(resultLabel.value)
  if (lastRoll.value != null) return lastRoll.value
  return null
})

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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

async function playInternal() {
  if (running.value) return
  message.value = ''
  messageType.value = 'info'

  if (bet.value <= 0) {
    messageType.value = 'error'
    return (message.value = 'Вкажи Amount')
  }
  if (auth.user?.balance != null && auth.user.balance < bet.value) {
    messageType.value = 'error'
    return (message.value = 'Недостатньо коштів')
  }

  running.value = true
  runFxTick.value += 1
  lastRoll.value = null
  sfx('click')

  const ro = round2(Number(rollOverUi.value))
  let res: any
  try {
    res = await dicePlay({ bet: Number(bet.value), rollOver: ro })
  } catch (e: any) {
    running.value = false
    setError(e, 'Помилка запросу')
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
    history.value = [
      {
        roll: target,
        isWin: resultIsWin,
        bet: Number(bet.value),
        payout: resultPayout,
        ts: Date.now(),
      },
      ...history.value,
    ].slice(0, 12)

    if (resultIsWin) {
      sfx('win')
      flash('win')
      triggerBurst('win')
      triggerFinishFx('win')
      const profit = Math.max(0, resultPayout - Number(bet.value))
      messageType.value = 'success'
      message.value = `Победа: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
      bigwinStore.maybeShow(resultPayout, bet.value)
    } else {
      sfx('lose')
      flash('lose')
      triggerBurst('lose')
      triggerFinishFx('lose')
      triggerBarShake()
      messageType.value = 'error'
      message.value = 'Проигрыш'
    }

    try {
      await auth.fetchBalance({ force: true })
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
  <GamePageLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="running"
        :message="message"
        :message-type="messageType"
        :play-text="$t('ui.s_de3c731be5')"
        @half="amount = Math.max(0, (Number(amount) || 0) / 2)"
        @double="amount = (Number(amount) || 0) * 2"
        @play="play"
      >
        <div class="summary dice-result" :class="flashZone">
          <div class="row-between dice-result-head">
            <div class="label">{{ $t('ui.s_dice_result') }}</div>
            <div class="dice-stats">
              <span>{{ $t('ui.s_3245db459e') }}: <b>{{ fmt(rollOver, 2) }}</b></span>
              <span class="sep">•</span>
              <span>{{ $t('ui.s_ebeefd375d') }}: <b>{{ fmt(winChance, 2) }}%</b></span>
              <span class="sep">•</span>
              <span>{{ $t('ui.s_ea1c527187') }}: <b>x{{ fmt(multiplier, 4) }}</b></span>
            </div>
          </div>

          <div class="dice-big">
            <span v-if="displayRoll != null">{{ fmt(displayRoll, 2) }}</span>
            <span v-else class="muted">—</span>
          </div>

          <div class="dice-sub muted">
            <span v-if="lastRoll != null">{{ $t('ui.s_dice_last_roll') }}: <b>{{ fmt(lastRoll, 2) }}</b></span>
            <span v-else>{{ $t('ui.s_dice_no_rolls') }}</span>
          </div>
        </div>
      </GamePanel>
    </template>

    <div class="dice-field">
    <div class="dial">
      <div class="bar-wrap">
        <div
          class="bar bet"
          :class="[flashZone, { shake: barShake }]"
          :style="{ '--ro': rollOver + '%', '--needle': needle + '%' }"
        >
          <div class="track" aria-hidden="true">
            <div class="zone lose"></div>
            <div class="zone win"></div>
            <div class="track-inner"></div>
            <div class="track-ticks"></div>
            <div class="track-cut" :class="{ pulse: linePulse }"></div>
            <div class="scan" :key="`scan-${runFxTick}`" :class="{ on: running }" aria-hidden="true"></div>
            <div class="finish-fx" :key="`fx-${runFxTick}`" :class="finishFx" aria-hidden="true"></div>
          </div>

          <input
            class="dice-slider"
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
            class="result-puck"
            :class="[flashZone, { bump, trail: trailOn }]"
            :style="{
              left: needle + '%',
              transform: `translate(-50%, -50%) scale(${puckScale})`,
              '--glow': String(puckGlow),
            }"
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
        <div class="hint muted">{{ $t('ui.s_dice_hint_over') }}</div>
      </div>
    </div>

    <div class="summary dice-history">
      <div class="row-between dice-history-head">
        <div class="label">{{ $t('ui.s_16d2b386b2') }}</div>
        <div class="muted small">{{ $t('ui.s_dice_last_n', { n: 12 }) }}</div>
      </div>

      <div v-if="history.length" class="hist-grid">
        <button
          v-for="(h, i) in history"
          :key="h.ts + '-' + i"
          class="hist-item"
          :class="h.isWin ? 'win' : 'lose'"
          type="button"
          :title="h.isWin ? $t('ui.s_dice_win') : $t('ui.s_dice_lose')"
        >
          <span class="v">{{ fmt(h.roll, 2) }}</span>
        </button>
      </div>
      <div v-else class="empty muted">{{ $t('ui.s_dice_no_rolls') }}</div>
     </div>
    </div>

    <template #below>
      <GameHowTo
        :heading="$t('ui.s_howto_dice')"
        :intro="$t('ui.s_howto_dice_intro')"
        :sections="[
          { title: $t('ui.s_howto_steps'), items: [
            $t('ui.s_howto_dice_step_1'),
            $t('ui.s_howto_dice_step_2'),
            $t('ui.s_howto_dice_step_3'),
            $t('ui.s_howto_dice_step_4')
          ]},
          { title: $t('ui.s_howto_mechanics'), items: [
            $t('ui.s_howto_dice_mech_1'),
            $t('ui.s_howto_dice_mech_2'),
            $t('ui.s_howto_dice_mech_3')
          ]},
          { title: $t('ui.s_howto_tips'), items: [
            $t('ui.s_howto_dice_tip_1'),
            $t('ui.s_howto_dice_tip_2')
          ]}
        ]"
      />
    </template>
  </GamePageLayout>
</template>


<style scoped>
.dial {
  width: min(920px, 100%);
  margin: 0 auto;
  position: relative;
  padding-top: 6px;
  isolation: isolate;
}

.bar-wrap {
  position: relative;
  overflow: visible;
  z-index: 1;
}

.bar.bet {
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

.bar.bet.shake {
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
}

.zone{
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  opacity: .22;
  filter: blur(0.2px);
}
.zone.lose{
  left: 0;
  width: var(--ro);
  background: linear-gradient(180deg, rgba(255,64,87,.38), rgba(255,64,87,0));
}
.zone.win{
  left: var(--ro);
  right: 0;
  background: linear-gradient(180deg, rgba(0,231,1,.32), rgba(0,231,1,0));
}

.threshold{
  position: absolute;
  top: -22px;
  left: var(--ro);
  transform: translateX(-50%);
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.28);
  box-shadow: 0 10px 24px rgba(0,0,0,.35);
  backdrop-filter: blur(8px);
}
.thr{ font-size: 12px; font-weight: 1000; letter-spacing: .2px; }

.track-inner {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      90deg,
      rgba(255, 64, 87, 0.92) 0%,
      rgba(255, 64, 87, 0.52) var(--ro),
      rgba(0, 231, 1, 0.52) var(--ro),
      rgba(0, 231, 1, 0.92) 100%
    ),
    repeating-linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.06) 0 1px,
      rgba(0, 0, 0, 0) 1px 9px
    );
  background-blend-mode: normal, multiply;
}

.track-ticks {
  position: absolute;
  inset: 0;
  opacity: 0.55;
  background: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.08) 0 1px,
    rgba(0, 0, 0, 0) 1px 18px
  );
  mix-blend-mode: overlay;
}

.track-cut {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: var(--ro);
  width: 2px;
  transform: translateX(-1px);
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35),
    0 0 18px rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  pointer-events: none;
}

.track-cut.pulse {
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

.dice-slider {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 65px;
  margin: 0;
  background: transparent;
  z-index: 8;
  -webkit-appearance: none;
  appearance: none;
}

.dice-slider::-webkit-slider-runnable-track {
  height: 48px;
  background: transparent;
}

.dice-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(248, 250, 253, 0.98), rgba(206, 214, 226, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 18px 32px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(0, 0, 0, 0.45),
    inset 0 2px 0 rgba(255, 255, 255, 0.55);
}

.dice-slider::-moz-range-track {
  height: 48px;
  background: transparent;
  border: none;
}

.dice-slider::-moz-range-thumb {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(248, 250, 253, 0.98), rgba(206, 214, 226, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 18px 32px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(0, 0, 0, 0.45),
    inset 0 2px 0 rgba(255, 255, 255, 0.55);
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

.controls {
  margin-top: 16px;
}

.dice-history {
  width: min(920px, 100%);
  margin: 14px auto 0;
  margin-top: auto;
}

.dice-history-head {
  gap: 12px;
  align-items: baseline;
}

.hist-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.hist-item {
  border-radius: 12px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.24);
  color: inherit;
  cursor: default;
  user-select: none;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.hist-item.win {
  border-color: rgba(60, 255, 170, 0.14);
  box-shadow: 0 0 0 1px rgba(60, 255, 170, 0.04) inset;
}

.hist-item.lose {
  border-color: rgba(255, 110, 110, 0.14);
  box-shadow: 0 0 0 1px rgba(255, 110, 110, 0.04) inset;
}

.hist-item .v {
  font-weight: 900;
  font-size: 12px;
  opacity: 0.95;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.empty {
  opacity: 0.65;
  margin-top: 10px;
}

.dice-result {
  margin-top: 12px;
}

.dice-result-head {
  gap: 12px;
  align-items: flex-start;
}

.dice-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.78);
}

.dice-stats b {
  font-weight: 900;
  color: rgba(255, 255, 255, 0.92);
}

.sep {
  opacity: 0.55;
}

.dice-big {
  margin-top: 10px;
  font-size: 38px;
  font-weight: 950;
  letter-spacing: -0.6px;
  text-align: center;
  line-height: 1;
}

.dice-sub {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
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

.dice-field {
  width: min(920px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 360px; /* подбери под свой дизайн */
}

@media (max-width: 520px) {
  .dice-big {
    font-size: 34px;
  }
}
.scan{ position:absolute; inset:0; border-radius: 16px; overflow:hidden; pointer-events:none; opacity:0; }
.scan::before{ content:''; position:absolute; top:-40%; left:-30%; width: 40%; height: 180%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), rgba(61,255,157,.24), rgba(255,255,255,.14), transparent); transform: rotate(18deg) translateX(-140%); filter: blur(1px); }
.scan.on{ opacity:1; }
.scan.on::before{ animation: scanSweep 900ms linear infinite; }
 @keyframes scanSweep{ 0%{ transform: rotate(18deg) translateX(-140%); } 100%{ transform: rotate(18deg) translateX(360%); } }

.finish-fx{ position:absolute; inset:-6px; border-radius: 18px; pointer-events:none; opacity:0; }
.finish-fx.win{ opacity:1; animation: finishFlash 620ms ease-out both; background: radial-gradient(circle at 50% 50%, rgba(61,255,157,.26), rgba(61,255,157,0) 62%); filter: blur(0.2px); }
.finish-fx.lose{ opacity:1; animation: finishFlash 620ms ease-out both; background: radial-gradient(circle at 50% 50%, rgba(248,81,73,.22), rgba(248,81,73,0) 62%); filter: blur(0.2px); }
 @keyframes finishFlash{ 0%{ transform: scale(.94); opacity:0; } 20%{ opacity:1; } 100%{ transform: scale(1.06); opacity:0; } }

</style>

