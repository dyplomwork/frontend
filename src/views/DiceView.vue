<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { dicePayout, dicePlay } from '../api/games'

const auth = useAuthStore()

const amount = ref(0)
// rollOver in [1..99]. Win if roll >= rollOver (green on the right).
const rollOver = ref(30)

const running = ref(false)
const lastRoll = ref<number | null>(null)
const message = ref('')

// server-driven odds/payout
const payoutMul = ref<number>(0)
const winChancePct = ref<number>(0)


const fmt = (v: number | string, d = 2) => formatNumber(v, d)

// prevent slider spam-sfx
let lastSliderSfxAt = 0
function sliderSfx() {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  if (now - lastSliderSfxAt < 80) return
  lastSliderSfxAt = now
  sfx('click')
}

// fetch payout info from backend (debounced by latest-only)
let payoutReqId = 0
watch(rollOver, async (v) => {
  const id = ++payoutReqId
  try {
    const res = await dicePayout(Number(v))
    if (id !== payoutReqId) return
    payoutMul.value = Number(res.payout)
    winChancePct.value = Number(res.winChancePercentage)
  } catch {
    // ignore (keep previous)
  }
}, { immediate: true })


const bet = computed(() => Math.max(0, Number(amount.value) || 0))
const winChance = computed(() => {
  const c = 100 - Number(rollOver.value || 0)
  // allow full range like Stake: 1%..99%
  return Math.max(1, Math.min(99, c))
})
const multiplier = computed(() => payoutMul.value || 0)
const winnings = computed(() => Math.round(bet.value * multiplier.value * 10000) / 10000)
const profitOnWin = computed(() => Math.round(bet.value * (multiplier.value - 1) * 10000) / 10000)

// UI needle position (0..100)
const needle = ref(50)
const bump = ref(false)
const flashZone = ref<'win' | 'lose' | ''>('')

const resultLabel = computed(() => needle.value.toFixed(2))



// prevent slider spam-sfx


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
  window.setTimeout(() => {
    flashZone.value = ''
  }, 520)
}

async function play() {
  if (running.value) return
  message.value = ''
  if (!auth.user) {
    message.value = 'Нужен вход'
    return
  }
  if (bet.value <= 0) {
    message.value = 'Укажи Amount'
    return
  }
  if (auth.user.balance < bet.value) {
    message.value = 'Недостаточно баланса'
    return
  }

  running.value = true
  lastRoll.value = null

  sfx('click')

  // server decides roll + win + payout
  const res = await dicePlay({ bet: Number(bet.value), rollOver: Number(rollOver.value) })
  const target = Number(res.roll) // 0..100 (2 decimals)
  const resultIsWin = !!res.isWin
  const resultPayout = Number(res.payout)
  const duration = 1400
  const t0 = performance.now()
  const start = needle.value

  // tick cadence
  const TOTAL_TICKS = 10
  lastTick = 0

  // ✅ async-часть вынесена сюда
  const finalize = async () => {
    const isWin = resultIsWin
    if (isWin) {
      sfx('win')
      flash('win')
      const profit = Math.max(0, resultPayout - Number(bet.value))
      message.value = `Победа: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
    } else {
      sfx('lose')
      flash('lose')
      message.value = 'Проигрыш'
    }

    // refresh balance from auth service
    try {
      await auth.fetchMe()
    } finally {
      running.value = false
    }
  }

  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / duration)
    const e = 1 - Math.pow(1 - p, 3) // easeOutCubic
    needle.value = start + (target - start) * e

    const curTick = Math.floor(e * TOTAL_TICKS)
    if (curTick > lastTick) {
      lastTick = curTick
      sfx('dice_tick')
    }

    if (p < 1) {
      raf = requestAnimationFrame(step)
      return
    }

    stopAnim()
    lastRoll.value = target
    sfx('dice_stop')

    bump.value = false
    requestAnimationFrame(() => {
      bump.value = true
      window.setTimeout(() => (bump.value = false), 240)
    })

    // 👇 запускаем async-финализацию без await
    void finalize()
  }

  raf = requestAnimationFrame(step)
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
        play-text="Play"
        @half="amount = Math.max(0, (Number(amount) || 0) / 2)"
        @double="amount = (Number(amount) || 0) * 2"
        @play="play"
      >
        <template #summary>
          <div class="summary">
            <div class="row-between">
              <span class="muted">Payout</span>
              <span class="num">x{{ fmt(multiplier, 4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">Profit on win</span>
              <span class="num">{{ fmt(profitOnWin, 4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">Win Chance</span>
              <span class="num">{{ fmt(winChance, 4) }}%</span>
            </div>
            <div class="row-between">
              <span class="muted">Roll Over</span>
              <span class="num">{{ fmt(rollOver, 2) }}</span>
            </div>
          </div>
        </template>
      </GamePanel>
    </template>

    <div class="dial">
      <!-- TOP SCALE (Stake-like) -->
      <div class="scale-top" aria-hidden="true">
        <div class="tick" style="left: 0%"><span>0</span></div>
        <div class="tick" style="left: 25%"><span>25</span></div>
        <div class="tick" style="left: 50%"><span>50</span></div>
        <div class="tick" style="left: 75%"><span>75</span></div>
        <div class="tick" style="left: 100%"><span>100</span></div>
      </div>

      <div class="bar stake" :class="flashZone">
        <!-- inner track -->
        <div class="track">
          <div class="split red" :style="{ width: rollOver + '%' }" />
          <div class="split green" :style="{ width: (100 - rollOver) + '%' }" />
          <div class="track-shine" aria-hidden="true" />
        </div>

        <!-- (Invisible) native slider for interaction -->
        <input
          class="bar-slider"
          type="range"
          min="1"
          max="99"
          step="0.01"
          v-model.number="rollOver"
          @input="sliderSfx"
          :disabled="running"
          aria-label="Roll Over"
        />

        <!-- Visual thumb (Stake-like) -->
        <div class="roll-thumb" :style="{ left: rollOver + '%' }" aria-hidden="true">
          <div class="thumb-icon" />
        </div>

        <!-- RollOver marker -->
        <div class="roll-line" :style="{ left: rollOver + '%' }" aria-hidden="true" />

        <!-- Result puck -->
        <div
          class="result-puck"
          :class="[flashZone, { bump }]"
          :style="{ left: needle + '%' }"
          :data-v="resultLabel"
          aria-hidden="true"
        />
      </div>

      <div class="controls">
        <div class="hint muted">
          Выигрыш, если результат <b class="text">справа</b> от линии Roll Over.
        </div>
      </div>

      <div v-if="lastRoll !== null" class="last">
        Last roll: <b>{{ fmt(lastRoll, 2) }}</b>
      </div>

      <!-- небольшая “фишка”: мини-легенда -->
      <div class="legend" aria-hidden="true">
        <span class="pill red">Lose</span>
        <span class="pill green">Win</span>
      </div>
    </div>
  </GameLayout>
</template>

<style scoped>
/* ===== Summary panel ===== */
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

/* ===== Dial wrapper ===== */
.dial {
  width: min(920px, 100%);
  margin: 0 auto;
  position: relative;
  padding-top: 28px; /* space for top ticks */
}

/* ===== Stake-like top ticks ===== */
.scale-top {
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 22px;
  pointer-events: none;
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
  content: "";
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid rgba(255, 255, 255, 0.18);
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5));
}
.tick span {
  font-size: 13px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 10px 18px rgba(0, 0, 0, 0.55);
}

/* ===== Main bar ===== */
.bar.stake {
  position: relative;
  height: 44px;
  border-radius: 999px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(14, 24, 34, 0.72);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.25),
    inset 0 16px 26px rgba(0, 0, 0, 0.35),
    0 18px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

/* inner track */
.track {
  position: relative;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 10px 18px rgba(0, 0, 0, 0.25);
  display: flex;
}

/* split zones */
.split {
  height: 100%;
}
.split.red {
  background-image:
    linear-gradient(90deg, rgba(255, 64, 87, 0.92), rgba(255, 64, 87, 0.45)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 1px, rgba(0, 0, 0, 0) 1px 6px);
  background-blend-mode: normal, multiply;
}
.split.green {
  flex: 1;
  background-image:
    linear-gradient(90deg, rgba(0, 231, 1, 0.40), rgba(0, 231, 1, 0.92)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 1px, rgba(0, 0, 0, 0) 1px 8px);
  background-blend-mode: normal, multiply;
}

/* subtle moving sheen */
.track-shine {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 62%);
  transform: translateX(-40%);
  animation: shine 3.6s linear infinite;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}
@keyframes shine {
  0% { transform: translateX(-40%); }
  100% { transform: translateX(40%); }
}

/* ===== Invisible slider (only for input) ===== */
.bar-slider {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 44px;
  margin: 0;
  opacity: 0;
  z-index: 6;
  -webkit-appearance: none;
  appearance: none;
}
.bar-slider::-webkit-slider-runnable-track { height: 44px; background: transparent; }
.bar-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 54px; height: 36px; }
.bar-slider::-moz-range-track { height: 44px; background: transparent; border: none; }
.bar-slider::-moz-range-thumb { width: 54px; height: 36px; border: none; background: transparent; }

/* ===== Visual RollOver thumb (Stake-ish blue handle) ===== */
.roll-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 54px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(105, 190, 255, 0.95), rgba(58, 145, 255, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 14px 26px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  z-index: 7;
  pointer-events: none;
}
.roll-thumb::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0));
  pointer-events: none;
}
.thumb-icon {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.thumb-icon::before,
.thumb-icon::after {
  content: "";
  width: 4px;
  height: 14px;
  border-radius: 999px;
  background: rgba(10, 26, 40, 0.85);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
  display: inline-block;
}
.thumb-icon::before { transform: translateX(-4px); }
.thumb-icon::after { transform: translateX(4px); }

/* RollOver vertical line */
.roll-line {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  transform: translateX(-1px);
  background: rgba(255, 255, 255, 0.32);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
  z-index: 5;
  pointer-events: none;
}

/* ===== Result puck (white circle) ===== */
.result-puck {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid rgba(0, 0, 0, 0.55);
  box-shadow: 0 10px 16px rgba(0, 0, 0, 0.45), 0 0 26px rgba(255, 255, 255, 0.18);
  z-index: 4;
  pointer-events: none;
}
.result-puck.win { box-shadow: 0 10px 16px rgba(0,0,0,.45), 0 0 26px rgba(0,231,1,.28); }
.result-puck.lose{ box-shadow: 0 10px 16px rgba(0,0,0,.45), 0 0 26px rgba(255,64,87,.28); }

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

.result-puck.bump { animation: bump 220ms ease-out; }
@keyframes bump {
  0% { transform: translate(-50%, -50%); }
  50% { transform: translate(-50%, calc(-50% + 2px)); }
  100% { transform: translate(-50%, -50%); }
}

/* Win/Lose glow around bar */
.bar.win {
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.25),
    inset 0 16px 26px rgba(0, 0, 0, 0.35),
    0 0 34px rgba(0, 231, 1, 0.14),
    0 18px 40px rgba(0, 0, 0, 0.35);
}
.bar.lose {
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.25),
    inset 0 16px 26px rgba(0, 0, 0, 0.35),
    0 0 34px rgba(255, 64, 87, 0.14),
    0 18px 40px rgba(0, 0, 0, 0.35);
}

/* ===== Text areas ===== */
.controls { margin-top: 16px; }
.hint { margin-top: 10px; }
.last { margin-top: 14px; color: rgba(255, 255, 255, 0.85); }

/* small extra polish */
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
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.22);
}
.pill.red { color: rgba(255, 160, 171, 0.95); }
.pill.green { color: rgba(160, 255, 160, 0.95); }

/* Reduce motion-friendly: if you already have a global flag/class, можешь завязать на неё */
@media (prefers-reduced-motion: reduce) {
  .track-shine { animation: none; opacity: 0.25; }
}
</style>
