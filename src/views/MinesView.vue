<script setup lang="ts">
import { computed, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { minesFinish, minesStart, minesStep } from '../api/games'

type Cell = { id: number; hasMine: boolean; revealed: boolean }

const auth = useAuthStore()

const bet = ref(20)
const mines = ref(3) // 1..24
const SIZE = 25 // 5x5

const grid = ref<Cell[]>([])
const inGame = ref(false)
const lost = ref(false)
const safePicks = ref(0)
const multiplier = ref(1)
const message = ref('')

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const gems = computed(() => SIZE - mines.value)

const canStart = computed(() => !!auth.user && bet.value > 0 && auth.user.balance >= bet.value && !inGame.value)
const canClick = computed(() => inGame.value && !lost.value)

function buildGrid() {
  grid.value = Array.from({ length: SIZE }, (_, i) => ({ id: i, hasMine: false, revealed: false }))
}

function reset() {
  sfx('click')
  inGame.value = false
  lost.value = false
  safePicks.value = 0
  multiplier.value = 1
  message.value = ''
  buildGrid()
}

// 👉 Сумма выплаты по текущему множителю (то, что ожидаешь получить, если нажмёшь Cashout)
// ВАЖНО: сервер всё равно является источником истины, это только UI-превью.
const payoutAmount = computed(() => {
  if (!inGame.value || safePicks.value === 0) return 0
  const b = Number(bet.value) || 0
  return Math.max(0, b * Number(multiplier.value))
})

// 👉 Чистая “чистая прибыль” (payout - bet)
const totalNetGain = computed(() => {
  if (!inGame.value || safePicks.value === 0) return 0
  const b = Number(bet.value) || 0
  return Math.max(0, payoutAmount.value - b)
})

async function start() {
  if (!canStart.value) return
  sfx('click')
  message.value = ''
  lost.value = false
  safePicks.value = 0
  multiplier.value = 1
  buildGrid()

  // старт игры на бэке (он “знает” размещение мин)
  // IMPORTANT: если minesStart ожидает другой body — подстрой по своей openapi/беку
  await minesStart({ bet: Number(bet.value), mines: Number(mines.value) })

  inGame.value = true
  await auth.fetchMe()
}

async function reveal(cell: Cell) {
  if (!canClick.value) return
  if (cell.revealed) return

  sfx('click')

  const r = Math.floor(cell.id / 5)
  const c = cell.id % 5

  // шаг на бэке: открыть клетку
  // IMPORTANT: если у тебя coords называются иначе (row/col, x/y) — подстрой.
  const res = await minesStep({ row: r, col: c })

  // ожидаем, что сервер вернёт win/lose и multiplier
  // Примерно:
  // { hitMine: boolean, multiplier: number, done?: boolean, field?: ... }
  cell.revealed = true
  cell.hasMine = !!res.hitMine

  if (res.hitMine) {
    sfx('boom')
    lost.value = true
    inGame.value = false
    message.value = 'Ты подорвался 💥'

    // если сервер возвращает поле на проигрыше — раскрываем всё
    if (res.field?.field) {
      const f = res.field.field
      for (const cc of grid.value) {
        const rr = Math.floor(cc.id / 5)
        const col = cc.id % 5
        cc.hasMine = !!f?.[rr]?.[col]
        cc.revealed = true
      }
    }

    await auth.fetchMe()
    return
  }

  safePicks.value += 1
  if (typeof res.multiplier === 'number') {
    multiplier.value = res.multiplier
  }
}

async function cashOut() {
  if (!(inGame.value && safePicks.value > 0)) return

  const res = await minesFinish()
  sfx('cashout')

  const win = Number(res.win ?? 0)
  const profit = Math.max(0, win - Number(bet.value))
  message.value = `Кэш-аут: +${fmt(profit, 2)} (x${formatNumber(multiplier.value, 4)})`

  // раскрываем поле по ответу finish
  const f = res.field
  if (f?.field) {
    for (const c of grid.value) {
      const r = Math.floor(c.id / 5)
      const cc = c.id % 5
      c.hasMine = !!f.field?.[r]?.[cc]
      c.revealed = true
    }
  }

  inGame.value = false
  await auth.fetchMe()
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
        @half="bet = Math.max(1, Math.floor((Number(bet)||0)/2))"
        @double="bet = Math.floor((Number(bet)||0)*2)"
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
          <div class="input" style="display:flex; align-items:center; justify-content:space-between; height: var(--control-h);">
            <span class="num">{{ gems }}</span>
          </div>
        </div>

        <button class="btn btn-ghost" @click="randomPick" :disabled="!canClick">
          Random Pick
        </button>

        <template #summary>
          <div class="summary">
            <div class="label">Total Net Gain ({{ fmt(multiplier, 2) }}x)</div>
            <div class="net">
              <span class="num">{{ fmt(totalNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <button class="btn btn-primary" @click="cashOut" :disabled="!(inGame && safePicks>0)">
            Cashout ({{ fmt(payoutAmount, 2) }}K)
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

      <div class="muted" style="margin-top:14px;">
        Множитель растёт за каждую открытую “безопасную” клетку. Можно забрать выигрыш в любой момент через Cashout.
      </div>
    </div>
  </GameLayout>
</template>

<style scoped>

.board{
  padding: 18px;
}

.grid5{
  display:grid;
  grid-template-columns: repeat(5, 92px);
  gap: 14px;
  justify-content:center;
  padding: 8px 0;
}
.tile{
  width: 92px;
  height: 92px;
  border-radius: 10px;
  border: 0;
  background: rgba(255,255,255,.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
  display:grid;
  place-items:center;
  color: rgba(255,255,255,.92);
  font-size: 22px;
  transition: transform 120ms ease, background 120ms ease;
  perspective: 800px;
  position: relative;
}
.tile:hover{ transform: translateY(-1px); }
.tile.revealed{ background: rgba(255,255,255,.05); }
.tile.mine{ background: rgba(248,81,73,.18); }
.tile.gem{ background: rgba(34,197,94,.14); }

.tile-inner{
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 380ms ease;
}
.tile.revealed .tile-inner{ transform: rotateY(180deg); }

.face{
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  backface-visibility: hidden;
}
.face.front{
  transform: rotateY(0deg);
  background: radial-gradient(circle at 50% 35%, rgba(255,255,255,.06), rgba(0,0,0,.0) 65%);
}
.face.back{ transform: rotateY(180deg); }

.tile.mine .tile-inner{
  animation: mineBoom 520ms ease-out;
}

@keyframes mineBoom{
  0%{ transform: rotateY(180deg) scale(1); filter: brightness(1); }
  15%{ transform: rotateY(180deg) scale(1.06); filter: brightness(1.25); }
  45%{ transform: rotateY(180deg) scale(0.96); }
  100%{ transform: rotateY(180deg) scale(1); filter: brightness(1); }
}

@media (max-width: 980px){
  .stake-layout{ grid-template-columns: 1fr; }
  .grid5{ grid-template-columns: repeat(5, 64px); gap: 10px; }
  .tile{ width: 64px; height: 64px; }
}
</style>
