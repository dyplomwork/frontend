<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import BaseSelect from '../components/BaseSelect.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { minesFinish, minesGetSession, minesMultiplier, minesStart, minesStep } from '../api/games'

type Cell = { id: number; hasMine: boolean; revealed: boolean }

const auth = useAuthStore()
const bigwinStore = useBigWinStore()

const bet = ref(20)
const mines = ref(3) // 1..24

const minesOptions = computed(() =>
  Array.from({ length: 24 }, (_, i) => {
    const v = i + 1
    return { value: v, label: String(v) }
  })
)
const SIZE = 25 // 5x5

const grid = ref<Cell[]>([])
const inGame = ref(false)
const lost = ref(false)
const safePicks = ref(0)
const multiplier = ref(1)
const nextMultiplier = ref<number | null>(null)
const message = ref('')

// UX effects
const explodedId = ref<number | null>(null)
const cashoutPulse = ref(false)
let tRevealAll: number | null = null
let tPulseOff: number | null = null

function clearTimers() {
  if (tRevealAll != null) window.clearTimeout(tRevealAll)
  if (tPulseOff != null) window.clearTimeout(tPulseOff)
  tRevealAll = null
  tPulseOff = null
}

onBeforeUnmount(() => {
  clearTimers()
})

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const mineOptions = computed(() =>
  Array.from({ length: 24 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
)

const gems = computed(() => SIZE - mines.value)

const canStart = computed(
  () => !!auth.user && !inGame.value && Number(bet.value) > 0 && auth.user.balance >= Number(bet.value)
)
const canClick = computed(() => inGame.value && !lost.value)

const payoutAmount = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.round(Number(bet.value) * Number(multiplier.value) * 100) / 100
})

const totalNetGain = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.max(0, payoutAmount.value - Number(bet.value))
})

const nextNetGain = computed(() => {
  if (!inGame.value || nextMultiplier.value == null) return 0
  const nextPayout = Math.round(Number(bet.value) * Number(nextMultiplier.value) * 100) / 100
  return Math.max(0, nextPayout - Number(bet.value))
})

function buildGrid() {
  // backend owns mine placement; frontend keeps only UI state
  grid.value = Array.from({ length: SIZE }, (_, i) => ({ id: i, hasMine: false, revealed: false }))
}

function cellToRC(id: number) {
  return { row: Math.floor(id / 5), col: id % 5 }
}

function applyField(field: { field: boolean[][]; opened: boolean[][] }) {
  for (const c of grid.value) {
    const { row, col } = cellToRC(c.id)
    c.hasMine = !!field.field?.[row]?.[col]
    c.revealed = !!field.opened?.[row]?.[col]
  }
}

async function refreshMultiplierFromServer() {
  try {
    const m = await minesMultiplier(Number(safePicks.value), Number(mines.value))
    multiplier.value = Number(m)
  } catch {
    // keep previous
  }

  // next multiplier preview (for the next safe pick)
  try {
    if (!inGame.value) {
      nextMultiplier.value = null
      return
    }
    const nextSafe = Number(safePicks.value) + 1
    const maxSafe = SIZE - Number(mines.value)
    if (nextSafe > maxSafe) {
      nextMultiplier.value = null
      return
    }
    const nm = await minesMultiplier(nextSafe, Number(mines.value))
    nextMultiplier.value = Number(nm)
  } catch {
    nextMultiplier.value = null
  }
}

async function start() {
  if (!canStart.value) return
  message.value = ''
  sfx('click')
  clearTimers()
  explodedId.value = null
  cashoutPulse.value = false

  try {
    await minesStart({ bet: Number(bet.value), mines: Number(mines.value) })

    // game started: reset UI state
    buildGrid()
    inGame.value = true
    lost.value = false
    safePicks.value = 0
    multiplier.value = 1

    // balance decreased on backend
    await auth.fetchMe()

    // try to sync session (opened cells etc.)
    try {
      const s = await minesGetSession()
      safePicks.value = (s.opened?.length ?? 0)
      await refreshMultiplierFromServer()
    } catch {}
  } catch (e: any) {
    message.value = e?.message ? String(e.message) : 'Ошибка старта'
    inGame.value = false
  }
}

async function reveal(cell: Cell) {
  if (!canClick.value) return
  if (cell.revealed) return
  message.value = ''
  sfx('click')

  const { row, col } = cellToRC(cell.id)
  try {
    const res = await minesStep({ row, col })

    // finish=true -> hit a mine; backend returns full field
    if (res.finish) {
      cell.revealed = true
      cell.hasMine = true
      explodedId.value = cell.id

      lost.value = true
      inGame.value = false
      message.value = 'Бомба! Проигрыш'
      sfx('lose')

      const field = res.field
      if (field) {
        clearTimers()
        tRevealAll = window.setTimeout(() => {
          applyField(field)
          explodedId.value = null
        }, 650)
      }

      await auth.fetchMe()
      return
    }

    // safe pick
    cell.revealed = true
    cell.hasMine = false
    safePicks.value += 1

    if (res.nextMultiplier != null) {
      multiplier.value = Number(res.nextMultiplier)
    }

    await refreshMultiplierFromServer()
  } catch (e: any) {
    message.value = e?.message ? String(e.message) : 'Ошибка'
    // try to fetch full field to reveal (if game already ended)
    try {
      const fin = await minesFinish()
      applyField(fin.field)
      inGame.value = false
      lost.value = true
      await auth.fetchMe()
    } catch {}
  }
}

async function cashOut() {
  if (!inGame.value || safePicks.value <= 0) return
  message.value = ''

  try {
    const res = await minesFinish()
    sfx('cashout')

    const win = Number(res.win)
    const profit = Math.max(0, win - Number(bet.value))
    message.value = `Кэш-аут: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
    // BIG/MEGA/SUPER overlay (global)
    bigwinStore.maybeShow(win, bet.value)

    // stop the game immediately, but reveal the whole field after a short "win" effect
    inGame.value = false
    lost.value = false

    cashoutPulse.value = true
    clearTimers()
    tPulseOff = window.setTimeout(() => (cashoutPulse.value = false), 650)

    const field = res.field
    if (field) {
      tRevealAll = window.setTimeout(() => {
        applyField(field)
      }, 1000)
    }

    await auth.fetchMe()
  } catch (e: any) {
    message.value = e?.message ? String(e.message) : 'Ошибка вывода'
  }
}

async function randomPick() {
  if (!canClick.value) return
  const candidates = grid.value.filter((c) => !c.revealed)
  if (!candidates.length) return
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  await reveal(pick)
}

async function reset() {
  sfx('click')

  // If a game is currently running, finish it to clear backend session
  if (inGame.value && !lost.value) {
    try {
      await minesFinish()
      await auth.fetchMe()
    } catch {
      // ignore network/backend errors here - still reset UI
    }
  }

  inGame.value = false
  lost.value = false
  safePicks.value = 0
  multiplier.value = 1
  message.value = ''
  buildGrid()
}

// initial
buildGrid()
</script>

<template>
  <GameLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="bet"
        :disabled="inGame"
        play-text="Play"
        :message="message"
        @half="bet = Math.max(1, Math.floor((Number(bet) || 0) / 2))"
        @double="bet = Math.floor((Number(bet) || 0) * 2)"
        @play="start"
      >
        <div class="field">
          <div class="label">Mines</div>
          <BaseSelect
            v-model="mines"
            :options="minesOptions"
            :disabled="inGame"
            aria-label="Mines"
            @update:modelValue="sfx('click')"
          />
        </div>

        <div class="field">
          <div class="label">Gems</div>
          <div class="input" style="display: flex; align-items: center; justify-content: space-between; height: var(--control-h)">
            <span class="num">{{ gems }}</span>
          </div>
        </div>

        <button class="btn btn-ghost" @click="randomPick" :disabled="!canClick">
          Random Pick
        </button>

        <template #summary>
          <div class="summary">
            <div class="row">
              <div class="label">Текущий профит:</div>
              <div class="net">
                <span class="num">{{ fmt(totalNetGain, 2) }}</span>
                <span class="coin" aria-label="Currency K">K</span>
                <span class="x">x{{ fmt(multiplier, 4) }}</span>
              </div>
            </div>

            <div class="row">
              <div class="label">Следующий множитель:</div>
              <div class="net">
                <span class="num">x{{ nextMultiplier != null ? fmt(nextMultiplier, 4) : '—' }}</span>
                <template v-if="nextMultiplier != null">
                  <span class="sep">•</span>
                  <span class="num">{{ fmt(nextNetGain, 2) }}</span>
                  <span class="coin" aria-label="Currency K">K</span>
                </template>
              </div>
            </div>
          </div>

          <button class="btn btn-primary" :class="{ 'cashout-pulse': cashoutPulse }" @click="cashOut" :disabled="!(inGame && safePicks > 0)">
            Cashout ({{ fmt(payoutAmount, 2) }}K)
          </button>

          <button class="btn btn-ghost" @click="reset" :disabled="inGame">
            Reset
          </button>
        </template>
      </GamePanel>
    </template>

    <div class="board">
      <div class="grid5">
        <button
          v-for="cell in grid"
          :key="cell.id"
          class="tile"
          :class="{ revealed: cell.revealed, mine: cell.revealed && cell.hasMine, gem: cell.revealed && !cell.hasMine, exploding: explodedId === cell.id }"
          @click="reveal(cell)"
          :disabled="!canClick"
        >
          <div class="tile-inner">
            <div class="face front"></div>
            <div class="face back">
              <span v-if="cell.hasMine">💣</span>
              <span v-else>💎</span>
            </div>
          </div>
        </button>
      </div>

      <div class="muted" style="margin-top: 14px">
        Множитель растёт за каждую открытую “безопасную” клетку. Можно забрать выигрыш в любой момент через Cashout.
      </div>
    </div>
  </GameLayout>
</template>

<style scoped>
.board {
  padding: 18px;
}

.grid5 {
  display: grid;
  grid-template-columns: repeat(5, 92px);
  gap: 14px;
  justify-content: center;
  padding: 8px 0;
}
.tile {
  width: 92px;
  height: 92px;
  border-radius: 10px;
  border: 0;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.92);
  font-size: 22px;
  transition: transform 120ms ease, background 120ms ease;
  perspective: 800px;
  position: relative;
}
.tile:hover {
  transform: translateY(-1px);
}
.tile:not(.revealed):hover {
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.75), inset 0 0 0 1px rgba(255,255,255,0.06);
}
.tile.revealed {
  background: rgba(255, 255, 255, 0.05);
}
.tile.mine {
  background: rgba(248, 81, 73, 0.18);
}
.tile.gem {
  background: rgba(34, 197, 94, 0.14);
}

.tile-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 380ms ease;
}
.tile.revealed .tile-inner {
  transform: rotateY(180deg);
}

.face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  backface-visibility: hidden;
}
.face.front {
  transform: rotateY(0deg);
  background: radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0) 65%);
}
.face.back {
  transform: rotateY(180deg);
}

.tile.exploding .tile-inner {
  animation: mineBoom 620ms ease-out;
}

.tile.exploding::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 50%, rgba(248, 81, 73, 0.55), rgba(248, 81, 73, 0) 60%);
  animation: boomFlash 620ms ease-out;
  pointer-events: none;
}

@keyframes boomFlash {
  0% { opacity: 0; transform: scale(0.9); }
  15% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1.15); }
}

@keyframes mineBoom {
  0% {
    transform: rotateY(180deg) scale(1);
    filter: brightness(1);
  }
  15% {
    transform: rotateY(180deg) scale(1.06);
    filter: brightness(1.25);
  }
  45% {
    transform: rotateY(180deg) scale(0.96);
  }
  100% {
    transform: rotateY(180deg) scale(1);
    filter: brightness(1);
  }
}

/* Cashout win pulse */
.cashout-pulse{
  animation: cashoutPulse 650ms ease-out;
}
@keyframes cashoutPulse{
  0%{ filter: brightness(1); transform: translateY(0); box-shadow: 0 0 0 0 rgba(34,197,94,0.0); }
  35%{ filter: brightness(1.15); transform: translateY(-1px); box-shadow: 0 0 0 4px rgba(34,197,94,0.18); }
  100%{ filter: brightness(1); transform: translateY(0); box-shadow: 0 0 0 0 rgba(34,197,94,0.0); }
}

@media (max-width: 980px) {
  .stake-layout {
    grid-template-columns: 1fr;
  }
  .grid5 {
    grid-template-columns: repeat(5, 64px);
    gap: 10px;
  }
  .tile {
    width: 64px;
    height: 64px;
  }
}


/* Keep amounts + coin inline */
.amount, .value, .bal, .net, .summary .value { display:inline-flex; align-items:center; gap:6px; }
.summary .value{ white-space: nowrap; }
.summary .row{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.summary .label{ opacity:0.85; }
.summary .net{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.summary .x{ opacity:0.75; font-size: 12px; }
.summary .sep{ opacity:0.55; margin: 0 2px; }

</style>
