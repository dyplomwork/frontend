<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { minesFinish, minesGetSession, minesMultiplier, minesStart, minesStep } from '../api/games'

type Cell = { id: number; hasMine: boolean; revealed: boolean }

type OpenedCell = { row: number; col: number }

type FieldDTO = { field: boolean[][]; opened: boolean[][] }

const auth = useAuthStore()
const bigwinStore = useBigWinStore()

async function safeFetchBalance() {
  const fn = (auth as any)?.fetchBalance
  if (typeof fn !== 'function') return
  try {
    await fn.call(auth)
  } catch {
    // ignore
  }
}

const bet = ref(20)
const mines = ref(3) // 1..24
const SIZE = 25 // 5x5

const grid = ref<Cell[]>([])
const inGame = ref(false)
const lost = ref(false)
const safePicks = ref(0)
const multiplier = ref(1)
const message = ref('')
const ending = ref(false)

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const gems = computed(() => SIZE - mines.value)

const canStart = computed(
  () => !!auth.user && !inGame.value && Number(bet.value) > 0 && auth.user.balance >= Number(bet.value)
)
const canClick = computed(() => inGame.value && !lost.value && !ending.value)

const payoutAmount = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.round(Number(bet.value) * Number(multiplier.value) * 100) / 100
})

const totalNetGain = computed(() => {
  if (!inGame.value || safePicks.value <= 0) return 0
  return Math.max(0, payoutAmount.value - Number(bet.value))
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

function applyField(field: FieldDTO) {
  // Defensive: backend can theoretically return null/undefined.
  if (!field) return
  for (const c of grid.value) {
    const { row, col } = cellToRC(c.id)
    c.hasMine = !!field.field?.[row]?.[col]
    c.revealed = !!field.opened?.[row]?.[col]
  }
}

function revealAll(field: FieldDTO) {
  if (!field) return
  // Defensive: make sure grid exists
  if (!grid.value.length) buildGrid()
  for (const c of grid.value) {
    const { row, col } = cellToRC(c.id)
    c.hasMine = !!field.field?.[row]?.[col]
    c.revealed = true
  }
}

function applyOpened(opened: OpenedCell[]) {
  for (const oc of opened || []) {
    const id = rcToId(oc.row, oc.col)
    const c = grid.value[id]
    if (!c) continue
    c.revealed = true
    c.hasMine = false
  }
}

async function refreshMultiplierFromServer() {
  try {
    // IMPORTANT: backend step response has an off-by-one nextMultiplier;
    // the multiplier endpoint is the source of truth.
    const m = await minesMultiplier(Number(safePicks.value), Number(mines.value))
    multiplier.value = Number(m)
  } catch {
    // keep previous
  }
}

async function syncSession() {
  // Resume a running session if backend has one.
  try {
    const s = await minesGetSession()
    buildGrid()
    inGame.value = true
    lost.value = false

    const opened = (s as any)?.opened as OpenedCell[] | undefined
    safePicks.value = Array.isArray(opened) ? opened.length : 0
    applyOpened(Array.isArray(opened) ? opened : [])

    // If user changed mines count in UI while a session exists – lock it to session value.
    if (typeof (s as any)?.minesCount === 'number') mines.value = Number((s as any).minesCount)

    await refreshMultiplierFromServer()
  } catch {
    // no active session
    inGame.value = false
    lost.value = false
    safePicks.value = 0
    multiplier.value = 1
  }
}

async function start() {
  if (!canStart.value) return
  message.value = ''
  sfx('click')

  try {
    // balance before start (project convention)
    await safeFetchBalance()
    await minesStart({ bet: Number(bet.value), mines: Number(mines.value) })

    // game started: reset UI state
    buildGrid()
    inGame.value = true
    lost.value = false
    safePicks.value = 0
    multiplier.value = 1

    // balance decreased on backend
    await safeFetchBalance()

    // sync session (opened cells etc.)
    await syncSession()
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

  // Optimistic flip for better UX (and avoids "nothing happens" feeling)
  // We will correct the content after backend response.
  cell.revealed = true

  const { row, col } = cellToRC(cell.id)
  try {
    const res = await minesStep({ row, col })

    if (res.finish) {
      // mine hit: backend returns full field
      lost.value = true
      inGame.value = false
      // Ensure the clicked tile is marked as a mine even if field is missing for any reason.
      cell.hasMine = true

      if (res.field) {
        revealAll(res.field as any)
      } else {
        // Fallback: at least show the clicked mine.
        // (Session is already deleted on backend, so /finish may 404.)
        for (const c of grid.value) {
          if (c.id !== cell.id) c.revealed = c.revealed || false
        }
      }
      message.value = 'Бомба! Проигрыш'
      sfx('mine_boom')
      await safeFetchBalance()
      return
    }

    // safe step
    cell.hasMine = false
    safePicks.value += 1
    sfx('mine_safe')
    await refreshMultiplierFromServer()
  } catch (e: any) {
    // If request failed, revert optimistic flip unless we can fetch a final field.
    cell.revealed = false
    message.value = e?.message ? String(e.message) : 'Ошибка'

    // If backend ended the game, try to reveal the full field.
    try {
      const fin = await minesFinish()
      revealAll(fin.field as any)
      inGame.value = false
      lost.value = Number(fin.win) <= 0
      await safeFetchBalance()
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

    // show full board (where mines were)
    revealAll(res.field as any)

    inGame.value = false
    lost.value = false
    await safeFetchBalance()
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
  message.value = ''

  // Temporary "Reset" = "End game" request.
  if (inGame.value) {
    ending.value = true
    try {
      const res = await minesFinish()
      // end-game reveals all
      revealAll(res.field as any)
      inGame.value = false
      lost.value = false
      await safeFetchBalance()
      message.value = 'Игра завершена'
    } catch (e: any) {
      message.value = e?.message ? String(e.message) : 'Ошибка завершения'
    } finally {
      ending.value = false
    }
    return
  }

  // If not in game – just reset UI.
  inGame.value = false
  lost.value = false
  safePicks.value = 0
  multiplier.value = 1
  buildGrid()
}

// initial
buildGrid()

onMounted(() => {
  void syncSession()
})
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
          <select class="input" v-model.number="mines" :disabled="inGame" @change="sfx('click')">
            <option v-for="n in 24" :key="n" :value="n">{{ n }}</option>
          </select>
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
            <div class="label">Net Profit (x{{ fmt(multiplier, 4) }})</div>
            <div class="net">
              <span class="num">{{ fmt(totalNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <button class="btn btn-primary" @click="cashOut" :disabled="!(inGame && safePicks > 0) || ending">
            Cashout ({{ fmt(payoutAmount, 2) }}K)
          </button>

          <button class="btn btn-ghost" @click="reset" :disabled="ending">
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
          :class="{ revealed: cell.revealed, mine: cell.revealed && cell.hasMine, gem: cell.revealed && !cell.hasMine }"
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

.tile.mine .tile-inner {
  animation: mineBoom 520ms ease-out;
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
</style>
