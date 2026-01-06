<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

// VFX
const explodingId = ref<number | null>(null)
const boardShake = ref(false)
const cashPulse = ref(false)

const roundId = ref(0)
const timeouts: number[] = []
const bumpRound = () => { roundId.value += 1 }
const clearAllTimeouts = () => { while (timeouts.length) { const id = timeouts.pop()!; clearTimeout(id) } }
const setSafeTimeout = (fn: () => void, ms: number) => {
  const id = window.setTimeout(fn, ms)
  timeouts.push(id)
  return id
}

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const gems = computed(() => SIZE - mines.value)

const canStart = computed(
  () => !!auth.user && !inGame.value && Number(bet.value) > 0 && auth.user.balance >= Number(bet.value)
)
const canClick = computed(() => inGame.value && !lost.value)

onMounted(async () => {
  // Important: after reload auth may not be hydrated yet. Without token the session call fails -> UI thinks game is idle,
  // but backend keeps the running session ("game started"), and player can't resume.
  try {
    if (!auth.user) await auth.fetchBalance()
  } catch {
    // ignore, session restore below will fail without auth
  }

  // If there's an active session on backend, restore it (opened cells, bet, mines)
  try {
    const s = await minesGetSession()
    bet.value = Number(s.bet)
    mines.value = Number(s.minesCount)
    buildGrid()
    applyOpenedCells(s.opened ?? [])
    safePicks.value = (s.opened?.length ?? 0)
    inGame.value = true
    lost.value = false
    message.value = ''
    nextMultiplier.value = null
    await refreshMultiplierFromServer()
    await refreshNextMultiplierFromServer()
  } catch {
    // no active session -> ignore
  }
})


const payoutAmount = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.round(Number(bet.value) * Number(multiplier.value) * 100) / 100
})

const totalNetGain = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.max(0, payoutAmount.value - Number(bet.value))
})

const nextPayoutAmount = computed(() => {
  if (!inGame.value || safePicks.value < 0) return 0
  if (nextMultiplier.value == null) return 0
  return Math.round(Number(bet.value) * Number(nextMultiplier.value) * 100) / 100
})

const nextNetGain = computed(() => {
  if (!inGame.value || nextMultiplier.value == null) return 0
  return Math.max(0, nextPayoutAmount.value - Number(bet.value))
})

function buildGrid() {
  // backend owns mine placement; frontend keeps only UI state
  grid.value = Array.from({ length: SIZE }, (_, i) => ({ id: i, hasMine: false, revealed: false }))
}

function cellToRC(id: number) {
  return { row: Math.floor(id / 5), col: id % 5 }
}

function rcToId(row: number, col: number) {
  return row * 5 + col
}

function applyOpenedCells(opened: { row: number; col: number }[]) {
  for (const c of grid.value) c.revealed = false
  for (const cell of opened ?? []) {
    const id = rcToId(cell.row, cell.col)
    const ui = grid.value[id]
    if (ui) ui.revealed = true
  }
}

function revealWholeField(field: { field: boolean[][] }) {
  for (const c of grid.value) {
    const { row, col } = cellToRC(c.id)
    c.hasMine = !!field.field?.[row]?.[col]
    c.revealed = true
  }
}

async function refreshMultiplierFromServer() {
  try {
    const m = await minesMultiplier(Number(safePicks.value), Number(mines.value))
    multiplier.value = Number(m)
  } catch {
    // keep previous
  }
}

async function refreshNextMultiplierFromServer() {
  try {
    const next = await minesMultiplier(Number(safePicks.value) + 1, Number(mines.value))
    nextMultiplier.value = Number(next)
  } catch {
    nextMultiplier.value = null
  }
}

async function start() {
  if (!canStart.value) return
  message.value = ''
  sfx('click')


  // New round: cancel any delayed reveals from previous game
  bumpRound()
  clearAllTimeouts()
  explodingId.value = null
  boardShake.value = false
  cashPulse.value = false

  try {
    await minesStart({ bet: Number(bet.value), mines: Number(mines.value) })

    // game started: reset UI state
    buildGrid()
    inGame.value = true
    lost.value = false
    safePicks.value = 0
    multiplier.value = 1
    nextMultiplier.value = null

    // balance decreased on backend
    // balance decreased on backend
    await auth.fetchBalance()

    // try to sync session (opened cells etc.)
    try {
      const s = await minesGetSession()
      safePicks.value = (s.opened?.length ?? 0)
      await refreshMultiplierFromServer()
      await refreshNextMultiplierFromServer()
    } catch {}
  } catch (e: any) {
    message.value = e?.message ? String(e.message) : 'Ошибка старта'
    // If backend says the game is already started, try to restore the existing session
    try {
      const s = await minesGetSession()
      bet.value = Number(s.bet)
      mines.value = Number(s.minesCount)
      buildGrid()
      applyOpenedCells(s.opened ?? [])
      safePicks.value = (s.opened?.length ?? 0)
      inGame.value = true
      lost.value = false
      nextMultiplier.value = null
      await refreshMultiplierFromServer()
      await refreshNextMultiplierFromServer()
      message.value = ''
      return
    } catch {}

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

    // If finish=true => we hit a mine. Backend returns full field.
    if (res.finish) {
      // mark clicked cell as mine immediately for correct animation
      cell.revealed = true
      cell.hasMine = true
      explodingId.value = cell.id
      boardShake.value = true
      const ridShake = roundId.value
      setSafeTimeout(() => {
        if (ridShake !== roundId.value) return
        boardShake.value = false
      }, 180)

      lost.value = true
      inGame.value = false
      message.value = 'Бомба! Проигрыш'
      sfx('lose')

      // After the explosion, reveal whole field (not only "opened")
      const rid = roundId.value
      setSafeTimeout(() => {
        // If a new round has started, ignore late reveal
        if (rid !== roundId.value) return
        if (res.field) revealWholeField(res.field)
        explodingId.value = null
      }, 680)

      await auth.fetchBalance()
      return
    }

    // Safe pick
    cell.revealed = true
    cell.hasMine = false
    safePicks.value += 1

    // Always compute the *current* multiplier from opened cells.
    // `res.nextMultiplier` (if provided) is the multiplier for the *next* pick.
    await refreshMultiplierFromServer()
    if (res.nextMultiplier != null) {
      nextMultiplier.value = Number(res.nextMultiplier)
    } else {
      await refreshNextMultiplierFromServer()
    }

    // If all safe cells are opened, there is no next move — auto cashout.
    if (safePicks.value >= gems.value) {
      await cashOut()
    }
  } catch (e: any) {
    // backend might throw on invalid state / mine hit
    message.value = e?.message ? String(e.message) : 'Ошибка'
    // try to fetch full field to reveal (if game already ended)
    try {
      const fin = await minesFinish()
      revealWholeField(fin.field)
      inGame.value = false
      lost.value = true
      await auth.fetchBalance()
    } catch {}
  }
}

async function cashOut() {
  if (!inGame.value || safePicks.value <= 0) return
  message.value = ''

  try {
    const res = await minesFinish()
    sfx('cashout')

    // green pulse on win
    cashPulse.value = true
    setTimeout(() => (cashPulse.value = false), 520)

    const win = Number(res.win)
    const profit = Math.max(0, win - Number(bet.value))
    message.value = `Кэш-аут: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`
	    // BIG/MEGA/SUPER overlay (global)
	    bigwinStore.maybeShow(win, bet.value)

    // Wait a bit so user sees the win pulse, then reveal the whole field for inspection
    const rid = roundId.value
    setSafeTimeout(() => {
      if (rid !== roundId.value) return
      revealWholeField(res.field)
    }, 1000)

    inGame.value = false
    lost.value = false
    await auth.fetchBalance()
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
      await auth.fetchBalance()
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
            @update:model-value="sfx('click')"
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
            <div class="label">Текущий профит: x{{ fmt(multiplier, 4) }}</div>
            <div class="net">
              <span class="num">{{ fmt(totalNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <div class="summary" style="margin-top: 10px">
            <div class="label">Следующий множитель: x{{ nextMultiplier == null ? '—' : fmt(nextMultiplier, 4) }}</div>
            <div class="net">
              <span class="num">{{ nextMultiplier == null ? '—' : fmt(nextNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <button class="btn btn-primary" :class="{ 'cash-pulse': cashPulse }" @click="cashOut" :disabled="!(inGame && safePicks > 0)">
            Cashout ({{ fmt(payoutAmount, 2) }}K)
          </button>

          <button class="btn btn-ghost" @click="reset" :disabled="inGame">
            Reset
          </button>
        </template>
      </GamePanel>
    </template>

    <div class="board">
      <div class="grid5" :class="{ shake: boardShake }">
        <button
          v-for="cell in grid"
          :key="cell.id"
          class="tile"
          :class="{ revealed: cell.revealed, mine: cell.revealed && cell.hasMine, gem: cell.revealed && !cell.hasMine, boom: explodingId === cell.id }"
          @click="reveal(cell)"
          :disabled="!canClick"
        >
          <div class="tile-fx" aria-hidden="true">
            <span class="flash"></span>
            <span class="ring"></span>
            <span class="spark s1"></span>
            <span class="spark s2"></span>
            <span class="spark s3"></span>
            <span class="spark s4"></span>
            <span class="spark s5"></span>
            <span class="spark s6"></span>
          </div>
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

.grid5.shake {
  animation: gridShake 180ms ease-in-out;
}

@keyframes gridShake {
  0% { transform: translate(0,0); }
  25% { transform: translate(2px,-1px); }
  50% { transform: translate(-2px,1px); }
  75% { transform: translate(1px,2px); }
  100% { transform: translate(0,0); }
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

/* Subtle green hover outline (only if not revealed) */
.tile:not(.revealed):hover {
  box-shadow:
    inset 0 0 0 1px rgba(0, 231, 1, 0.55),
    inset 0 0 0 2px rgba(0, 231, 1, 0.10),
    0 10px 24px rgba(0, 0, 0, 0.28);
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

/* --- Explosion VFX (only when clicked mine) --- */
.tile-fx{ position:absolute; inset:0; pointer-events:none; opacity:0; }
.tile.boom .tile-fx{ opacity:1; }

.tile-fx .flash{
  position:absolute; inset:-6px;
  border-radius: 16px;
  background: radial-gradient(120px 90px at 50% 45%, rgba(255,255,255,.55), rgba(255,255,255,0) 70%);
  filter: blur(0.2px);
  opacity:0;
}

.tile.boom .tile-fx .flash{ animation: boomFlash 520ms ease-out; }

@keyframes boomFlash{
  0%{ opacity:0; transform: scale(.92); }
  12%{ opacity:1; transform: scale(1.02); }
  45%{ opacity:.55; transform: scale(1.08); }
  100%{ opacity:0; transform: scale(1.18); }
}

.tile-fx .ring{
  position:absolute; inset: 50%;
  width: 8px; height: 8px;
  margin-left:-4px; margin-top:-4px;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.22);
  opacity:0;
}
.tile.boom .tile-fx .ring{ animation: boomRing 620ms ease-out; }
@keyframes boomRing{
  0%{ opacity:0; transform: scale(0.6); }
  10%{ opacity:.8; }
  100%{ opacity:0; transform: scale(12); }
}

.tile-fx .spark{
  position:absolute;
  left:50%; top:50%;
  width:6px; height:6px;
  margin-left:-3px; margin-top:-3px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.95), rgba(255,210,120,.75) 45%, rgba(255,120,60,0) 70%);
  opacity:0;
}
.tile.boom .tile-fx .spark{ opacity:1; }

.tile.boom .tile-fx .spark.s1{ animation: spark1 650ms ease-out; }
.tile.boom .tile-fx .spark.s2{ animation: spark2 650ms ease-out; }
.tile.boom .tile-fx .spark.s3{ animation: spark3 650ms ease-out; }
.tile.boom .tile-fx .spark.s4{ animation: spark4 650ms ease-out; }
.tile.boom .tile-fx .spark.s5{ animation: spark5 650ms ease-out; }
.tile.boom .tile-fx .spark.s6{ animation: spark6 650ms ease-out; }

@keyframes spark1{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(38px,-26px) scale(0); opacity:0; } }
@keyframes spark2{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(-34px,-30px) scale(0); opacity:0; } }
@keyframes spark3{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(42px,18px) scale(0); opacity:0; } }
@keyframes spark4{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(-44px,20px) scale(0); opacity:0; } }
@keyframes spark5{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(6px,-48px) scale(0); opacity:0; } }
@keyframes spark6{ 0%{ transform: translate(0,0) scale(.9); filter: brightness(1.2); } 100%{ transform: translate(-10px,50px) scale(0); opacity:0; } }

.tile.boom .tile-inner {
  animation: mineBoom 560ms ease-out;
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

/* Win pulse on cashout button */
.cash-pulse{
  animation: cashPulse 520ms ease-out;
}
@keyframes cashPulse{
  0%{ transform: translateY(0) scale(1); box-shadow: 0 0 0 0 rgba(0,231,1,.0); }
  35%{ transform: translateY(-1px) scale(1.02); box-shadow: 0 0 0 4px rgba(0,231,1,.14), 0 0 18px rgba(0,231,1,.10); }
  100%{ transform: translateY(0) scale(1); box-shadow: 0 0 0 0 rgba(0,231,1,.0); }
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

</style>