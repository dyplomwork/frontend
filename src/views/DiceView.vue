<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { sfx } from '../utils/sfx'

const auth = useAuthStore()

const amount = ref(0)
// rollOver in [1..99]. Win if roll >= rollOver (green on the right).
const rollOver = ref(30)

const running = ref(false)
const lastRoll = ref<number | null>(null)
const message = ref('')

// Stake-like: 1% house edge
const HOUSE_EDGE = 0.01

const bet = computed(() => Math.max(0, Number(amount.value) || 0))
const winChance = computed(() => {
  const c = 100 - Number(rollOver.value || 0)
  return Math.max(1, Math.min(95, c))
})
const multiplier = computed(() => {
  // multiplier = (100 / winChance) * (1 - houseEdge)
  const m = (100 / winChance.value) * (1 - HOUSE_EDGE)
  return Math.max(1, Math.round(m * 10000) / 10000)
})
const winnings = computed(() => {
  return Math.round((bet.value * multiplier.value) * 10000) / 10000
})

const profitOnWin = computed(() => {
  return Math.round((bet.value * (multiplier.value - 1)) * 10000) / 10000
})

// UI needle position (0..100)
const needle = ref(50)
const bump = ref(false)
const flashZone = ref<'win'|'lose'|''>('')
const hitPoint = ref(false)

let raf: number | null = null
let lastTick = 0

function stopAnim(){
  if(raf !== null){ cancelAnimationFrame(raf); raf = null }
  lastTick = 0
}

function flash(kind: 'win'|'lose'){
  flashZone.value = kind
  window.setTimeout(() => { flashZone.value = '' }, 520)
}

function flashHit(){
  hitPoint.value = true
  window.setTimeout(() => { hitPoint.value = false }, 520)
}

async function play(){
  if(running.value) return
  message.value = ''
  if(!auth.user){ message.value = 'Нужен вход'; return }
  if(bet.value <= 0){ message.value = 'Укажи Amount'; return }
  if(auth.user.balance < bet.value){ message.value = 'Недостаточно баланса'; return }

  running.value = true
  lastRoll.value = null

  // pay bet upfront
  await auth.applyBalance(-bet.value)
  sfx('click')

  const target = Math.round(Math.random() * 10000) / 100 // 0..100 with 2 decimals
  const duration = 1400
  const t0 = performance.now()
  const start = needle.value

  // Stake-like tick cadence: 12–18 ticks over the animation.
  const TOTAL_TICKS = 16
  lastTick = 0

  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / duration)
    // easeOutCubic
    const e = 1 - Math.pow(1 - p, 3)
    needle.value = start + (target - start) * e

    const curTick = Math.floor(e * TOTAL_TICKS)
    if(curTick > lastTick){
      lastTick = curTick
      sfx('dice_tick')
    }

    if(p < 1){
      raf = requestAnimationFrame(step)
      return
    }

    stopAnim()
    lastRoll.value = target
    sfx('dice_stop')

    flashHit()

    bump.value = false
    requestAnimationFrame(() => {
      bump.value = true
      window.setTimeout(() => (bump.value = false), 240)
    })

    const isWin = target >= Number(rollOver.value)
    if(isWin){
      void auth.applyBalance(winnings.value)
      sfx('win')
      flash('win')
      message.value = `Победа: +${profitOnWin.value.toFixed(2)} (x${multiplier.value})`
    }else{
      sfx('lose')
      flash('lose')
      message.value = 'Проигрыш'
    }

    running.value = false
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
        @half="amount = Math.max(0, (Number(amount)||0)/2)"
        @double="amount = (Number(amount)||0)*2"
        @play="play"
      >
        <template #summary>
          <div class="summary">
            <div class="row-between">
              <span class="muted">Payout</span>
              <span class="num">x{{ multiplier.toFixed(4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">Profit on win</span>
              <span class="num">{{ profitOnWin.toFixed(4) }}</span>
            </div>
            <div class="row-between">
              <span class="muted">Win Chance</span>
              <span class="num">{{ winChance.toFixed(4) }}%</span>
            </div>
            <div class="row-between">
              <span class="muted">Roll Over</span>
              <span class="num">{{ rollOver.toFixed(2) }}</span>
            </div>
          </div>
        </template>
      </GamePanel>
    </template>

    <div class="dial">
      <div class="bar" :class="flashZone">
        <div class="red" :style="{ width: rollOver + '%' }" />
        <div class="green" :style="{ width: (100-rollOver) + '%' }" />

        <div class="roll-label" :style="{ left: rollOver + '%' }" aria-hidden="true">
          Roll Over
        </div>
        <div class="roll-line" :style="{ left: rollOver + '%' }" aria-hidden="true" />

        <div
          v-if="lastRoll !== null && hitPoint"
          class="hit"
          :class="flashZone"
          :style="{ left: needle + '%' }"
          aria-hidden="true"
        />

        <div class="needle" :class="{ bump }" :style="{ left: needle + '%' }" aria-hidden="true" />
      </div>

      <div class="scale">
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>

      <div class="controls">
        <input
          class="slider"
          type="range"
          min="1"
          max="99"
          step="0.01"
          v-model.number="rollOver"
          @input="sfx('click')"
          :disabled="running"
        />
        <div class="hint muted">
          Выигрыш, если стрелка остановилась <b class="text">справа</b> от линии Roll Over.
        </div>
      </div>

      <div v-if="lastRoll !== null" class="last">
        Last roll: <b>{{ lastRoll.toFixed(2) }}</b>
      </div>
    </div>
  </GameLayout>
</template>

<style scoped>
.summary{
  margin-top: 14px;
  border: 1px solid rgba(255,255,255,.06);
  background: rgba(0,0,0,.18);
  border-radius: 14px;
  padding: 12px;
  display:flex;
  flex-direction:column;
  gap: 10px;
}
.row-between{ display:flex; align-items:center; justify-content:space-between; gap: 10px; }

.dial{ width: min(900px, 100%); margin: 0 auto; }
.bar{
  position: relative;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.08);
  overflow: hidden;
  background: rgba(255,255,255,.03);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.25), inset 0 10px 18px rgba(0,0,0,.28);
}
.bar::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius: 999px;
  box-shadow:
    inset 18px 0 22px rgba(0,0,0,.32),
    inset -18px 0 22px rgba(0,0,0,.18);
}
.red{
  height:100%;
  background-image:
    linear-gradient(90deg, rgba(255,59,87,.92), rgba(255,59,87,.58)),
    repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 1px, rgba(0,0,0,0) 1px 5px);
  background-blend-mode: normal, multiply;
}
.green{
  height:100%;
  background-image: linear-gradient(90deg, rgba(0,231,1,.55), rgba(0,231,1,.92));
}

.roll-label{
  position:absolute;
  top: -26px;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .02em;
  color: rgba(255,255,255,.86);
  text-shadow: 0 8px 16px rgba(0,0,0,.5);
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.28);
}

.roll-line{
  position:absolute;
  top: -8px;
  width: 2px;
  height: 46px;
  transform: translateX(-1px);
  background: rgba(255,255,255,.34);
  box-shadow: 0 0 0 1px rgba(0,0,0,.25);
}

.hit{
  position:absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.92);
  box-shadow: 0 0 0 2px rgba(0,0,0,.45), 0 0 18px rgba(255,255,255,.22);
  z-index: 3;
}
.hit.win{ box-shadow: 0 0 0 2px rgba(0,0,0,.45), 0 0 18px rgba(0,231,1,.35); }
.hit.lose{ box-shadow: 0 0 0 2px rgba(0,0,0,.45), 0 0 18px rgba(255,59,87,.35); }

.needle{
  position:absolute;
  top: -18px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 16px solid rgba(245,197,66,.95);
  filter: drop-shadow(0 8px 12px rgba(0,0,0,.55));
}
.needle.bump{ animation: bump 220ms ease-out; }
@keyframes bump{ 0%{ transform: translateX(-50%) translateY(0); } 50%{ transform: translateX(-50%) translateY(2px); } 100%{ transform: translateX(-50%) translateY(0); } }

.bar.win{ box-shadow: inset 0 0 0 1px rgba(0,0,0,.25), inset 0 10px 18px rgba(0,0,0,.28), 0 0 28px rgba(0,231,1,.16); }
.bar.lose{ box-shadow: inset 0 0 0 1px rgba(0,0,0,.25), inset 0 10px 18px rgba(0,0,0,.28), 0 0 28px rgba(255,59,87,.16); }
.scale{ display:flex; justify-content:space-between; margin-top: 10px; color: rgba(255,255,255,.85); font-weight: 800; }
.controls{ margin-top: 16px; }
.slider{ width:100%; }
.hint{ margin-top: 10px; }
.last{ margin-top: 14px; color: rgba(255,255,255,.85); }
</style>
