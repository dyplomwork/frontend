<script setup lang="ts">
import { computed, ref } from 'vue'
import GameLayout from '../components/GameLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { sfx } from '../utils/sfx'

type Cell = { id:number; hasMine:boolean; revealed:boolean }

const auth = useAuthStore()

const bet = ref(20)
const mines = ref(3) // 1..24
const HOUSE_EDGE = 0.97
const SIZE = 25 // 5x5

const grid = ref<Cell[]>([])
const inGame = ref(false)
const lost = ref(false)
const safePicks = ref(0)
const multiplier = ref(1)
const message = ref('')

const gems = computed(() => SIZE - mines.value)

const canStart = computed(() => !!auth.user && bet.value > 0 && auth.user.balance >= bet.value && !inGame.value)
const canClick = computed(() => inGame.value && !lost.value)

function buildGrid(){
  const arr: Cell[] = Array.from({length: SIZE}, (_,i) => ({ id:i, hasMine:false, revealed:false }))
  // place mines
  const idxs = new Set<number>()
  while(idxs.size < mines.value){
    idxs.add(Math.floor(Math.random()*SIZE))
  }
  for(const i of idxs) arr[i].hasMine = true
  grid.value = arr
}

function calcMultiplier(picks: number){
  // inverse of survival probability after `picks` safe picks, * house edge
  let inv = 1
  for(let i=0; i<picks; i++){
    const remainingTotal = SIZE - i
    const remainingSafe = (SIZE - mines.value) - i
    inv *= remainingTotal / remainingSafe
  }
  const m = inv * HOUSE_EDGE
  return Math.round(m * 100)/100
}

const totalNetGain = computed(() => {
  if(!inGame.value || safePicks.value === 0) return 0
  const payout = bet.value * multiplier.value
  return Math.round((payout - bet.value) * 100) / 100
})

const payoutAmount = computed(() => {
  if(!inGame.value || safePicks.value === 0) return 0
  return Math.round((bet.value * multiplier.value) * 100) / 100
})

async function start(){
  message.value = ''
  if(!auth.user){ message.value = 'Нужен вход'; return }
  if(bet.value <= 0){ message.value = 'Ставка > 0'; return }
  if(mines.value < 1 || mines.value >= SIZE){ message.value = 'Некорректно'; return }
  if(auth.user.balance < bet.value){ message.value = 'Недостаточно баланса'; return }

  sfx('click')
  buildGrid()
  inGame.value = true
  lost.value = false
  safePicks.value = 0
  multiplier.value = 1

  await auth.applyBalance(-bet.value)
}

async function reveal(cell: Cell){
  if(!canClick.value) return
  if(cell.revealed) return

  cell.revealed = true

  if(cell.hasMine){
    lost.value = true
    inGame.value = false
    message.value = 'Мина. Раунд проигран.'
    sfx('mine_boom')
    // reveal all
    grid.value.forEach(c => c.revealed = true)
    return
  }

  safePicks.value += 1
  multiplier.value = calcMultiplier(safePicks.value)
  sfx('mine_safe')
}

async function cashOut(){
  if(!auth.user) return
  if(!inGame.value) return
  if(lost.value) return
  if(safePicks.value === 0){ message.value = 'Сначала открой 1 клетку'; return }

  const payout = bet.value * multiplier.value
  await auth.applyBalance(payout)
  sfx('cashout')
  message.value = `Кэш-аут: +${payoutAmount.value} (x${multiplier.value})`
  inGame.value = false
}

async function randomPick(){
  if(!canClick.value) return
  const candidates = grid.value.filter(c => !c.revealed)
  if(!candidates.length) return
  const pick = candidates[Math.floor(Math.random()*candidates.length)]
  await reveal(pick)
}

function reset(){
  sfx('click')
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
            <div class="label">Total Net Gain ({{ multiplier.toFixed(2) }}x)</div>
            <div class="net">
              <span class="num">{{ totalNetGain.toFixed(2) }}</span>
              <span class="coin">G</span>
            </div>
          </div>

          <button class="btn btn-primary" @click="cashOut" :disabled="!(inGame && safePicks>0)">
            Cashout ({{ payoutAmount.toFixed(2) }}G)
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
