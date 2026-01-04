<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { dicePlay } from '../api/games'

const auth = useAuthStore()

const amount = ref(0)

// ✅ Слайдер теперь = Roll Over (то, что ждёт бэк)
// Win, если roll >= rollOver
const rollOverUi = ref(30) // 1..99

const running = ref(false)
const lastRoll = ref<number | null>(null)
const message = ref('')

// payout is calculated on the frontend (saves an extra request)
// Common dice formula with ~1% house edge: multiplier = 99 / winChance
const HOUSE_EDGE_BASE = 99

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const bet = computed(() => Math.max(0, Number(amount.value) || 0))

// ✅ WinChance = 100 - rollOver
const rollOver = computed(() => Math.max(1, Math.min(99, round2(Number(rollOverUi.value || 0)))))
const winChance = computed(() => round2(100 - rollOver.value))

const multiplier = computed(() => {
  const wc = Math.max(0.01, Number(winChance.value) || 0)
  return Math.round((HOUSE_EDGE_BASE / wc) * 10000) / 10000
})
const winnings = computed(() => Math.round(bet.value * multiplier.value * 10000) / 10000)
const profitOnWin = computed(() => Math.round(bet.value * (multiplier.value - 1) * 10000) / 10000)

// UI needle position (0..100)
const needle = ref(50)
const bump = ref(false)
const flashZone = ref<'win' | 'lose' | ''>('')

const resultLabel = computed(() => needle.value.toFixed(2))

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

// ==== Slider behavior (NO lag) ====
function onSliderInput() {
  // keep slider value neat (2 decimals) while multiplier updates continuously
  rollOverUi.value = round2(Number(rollOverUi.value))
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

  // ✅ отправляем РЕАЛЬНЫЙ rollOver (без инверсии!)
  const ro = round2(Number(rollOverUi.value))

  let res: any
  try {
    res = await dicePlay({ bet: Number(bet.value), rollOver: ro })
  } catch (e: any) {
    running.value = false
    message.value = e?.message || 'Ошибка запроса'
    return
  }

  const target = Number(res.roll) // 0..100 (2 decimals)
  // backend can return either { win } or { isWin }
  const resultIsWin = !!(res.win ?? res.isWin)
  const resultPayout = Number(res.payout)

  const duration = 1400
  const t0 = performance.now()
  const start = needle.value

  const TOTAL_TICKS = 10
  lastTick = 0

  const finalize = async () => {
    if (resultIsWin) {
      sfx('win')
      flash('win')
      const profit = Math.max(0, resultPayout - Number(bet.value))
      message.value = `Победа: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
    } else {
      sfx('lose')
      flash('lose')
      message.value = 'Проигрыш'
    }

    try {
      await auth.fetchBalance()
    } catch {}

    running.value = false
  }

  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / duration)
    const e = 1 - Math.pow(1 - p, 3)
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
              <span class="num">{{ fmt(winChance, 2) }}%</span>
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
      <div class="scale-top" aria-hidden="true">
        <div class="tick" style="left: 0%"><span>0</span></div>
        <div class="tick" style="left: 25%"><span>25</span></div>
        <div class="tick" style="left: 50%"><span>50</span></div>
        <div class="tick" style="left: 75%"><span>75</span></div>
        <div class="tick" style="left: 100%"><span>100</span></div>
      </div>

      <div class="bar stake" :class="flashZone">
        <div class="track">
          <!-- ✅ Lose зона слева: 0..rollOver -->
          <div class="split red" :style="{ width: rollOver + '%' }" />
          <!-- ✅ Win зона справа: rollOver..100 -->
          <div class="split green" :style="{ width: (100 - rollOver) + '%' }" />
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
          @change="sfx('click')"
          :disabled="running"
          aria-label="Roll Over"
        />

        <!-- Mark line (thin + glow) -->
        <div class="roll-line" :style="{ left: rollOver + '%' }" aria-hidden="true" />

        <!-- Thumb / ролик -->
        <div class="roll-thumb" :style="{ left: rollOver + '%' }" aria-hidden="true">
          <div class="thumb-grip">
            <span class="grip-bar"></span>
            <span class="grip-bar"></span>
            <span class="grip-bar"></span>
          </div>

          <!-- value bubble -->
          <div class="thumb-bubble">
            <div class="bubble-top">ROLL OVER</div>
            <div class="bubble-val">{{ fmt(rollOver, 2) }}</div>
          </div>
        </div>


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
  padding-top: 28px;
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
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 10px 18px rgba(0, 0, 0, 0.55);
}

/* ===== Main bar ===== */
.bar.stake {
  position: relative;
  height: 48px; /* чуть выше */
  border-radius: 999px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(14, 24, 34, 0.72);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.28),
    inset 0 18px 28px rgba(0, 0, 0, 0.35),
    0 18px 40px rgba(0, 0, 0, 0.36);
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
    inset 0 0 0 1px rgba(255, 255, 255, 0.07),
    inset 0 10px 18px rgba(0, 0, 0, 0.26);
  display: flex;
}

/* split zones */
.split { height: 100%; }
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

/* subtle moving sheen */
.track-shine {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(
    115deg,
    rgba(255,255,255,0) 38%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0) 62%
  );
  transform: translateX(-40%);
  animation: shine 3.8s linear infinite;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}
@keyframes shine {
  0% { transform: translateX(-40%); }
  100% { transform: translateX(40%); }
}

/* ===== Invisible slider (input) ===== */
.bar-slider {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 48px;
  margin: 0;
  opacity: 0;
  z-index: 8; /* above track */
  -webkit-appearance: none;
  appearance: none;
}
.bar-slider::-webkit-slider-runnable-track { height: 48px; background: transparent; }
.bar-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 64px; height: 44px; }
.bar-slider::-moz-range-track { height: 48px; background: transparent; border: none; }
.bar-slider::-moz-range-thumb { width: 64px; height: 44px; border: none; background: transparent; }

/* ===== Roll line (thin + glow) ===== */
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

/* ===== Thumb / ролик: четкий, понятный ===== */
.roll-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 40px;
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(120, 205, 255, 0.96), rgba(56, 145, 255, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.20);
  box-shadow:
    0 18px 32px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(0, 0, 0, 0.40),
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 0 -10px 18px rgba(0, 0, 0, 0.14);
  z-index: 7;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

/* glossy overlay */
.roll-thumb::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0));
  pointer-events: none;
}

/* grip lines */
.thumb-grip {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 1px;
  z-index: 2;
}
.grip-bar {
  display: block;
  width: 7px;
  height: 3px;
  border-radius: 999px;
  background: rgba(10, 26, 40, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 8px 18px rgba(0,0,0,0.25);
  opacity: 0.95;
}

/* value bubble above thumb */
.thumb-bubble {
  position: absolute;
  left: 50%;
  top: -48px;
  transform: translateX(-50%);
  min-width: 108px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.38);
  box-shadow:
    0 18px 34px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255,255,255,0.08);
  text-align: center;
  z-index: 10;
}
.thumb-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 9px solid rgba(0, 0, 0, 0.38);
  filter: drop-shadow(0 10px 14px rgba(0,0,0,0.45));
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
  text-shadow: 0 10px 18px rgba(0,0,0,0.55);
}

/* ===== Result puck ===== */
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
  z-index: 5;
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

/* ===== Text areas ===== */
.controls { margin-top: 16px; }
.hint { margin-top: 10px; }
.last { margin-top: 14px; color: rgba(255, 255, 255, 0.85); }

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

@media (prefers-reduced-motion: reduce) {
  .track-shine { animation: none; opacity: 0.25; }
}

</style>
