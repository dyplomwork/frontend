<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import BaseSelect from '../components/BaseSelect.vue'
import GameHowTo from '../components/GameHowTo.vue'
import { useAuthStore } from '../stores/auth'
import { useBigWinStore } from '../stores/bigwin'
import { useUiStore } from '../stores/ui'
import { useRequireAuthAction } from '../composables/useRequireAuthAction'
import { sfx } from '../utils/sfx'
import { formatNumber } from '../utils/format'
import { normalizeError, reportError, userMessageForStatusI18n } from '../utils/errors'
import { minesFinish, minesGetSession, minesMultiplier, minesStart, minesStep } from '../api/games'

type Cell = { id: number; hasMine: boolean; revealed: boolean }

const auth = useAuthStore()
const bigwinStore = useBigWinStore()
const ui = useUiStore()
const { t } = useI18n()
const { requireAuth } = useRequireAuthAction()

const bet = ref(20)
const mines = ref(3)

const minesOptions = computed(() =>
  Array.from({ length: 24 }, (_, i) => {
    const v = i + 1
    return { value: v, label: String(v) }
  })
)
const SIZE = 25

const grid = ref<Cell[]>([])
const inGame = ref(false)
const lost = ref(false)
const safePicks = ref(0)
const multiplier = ref(1)
const nextMultiplier = ref<number | null>(null)
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

const explodingId = ref<number | null>(null)
const boardShake = ref(false)
const cashPulse = ref(false)
const boardFlash = ref<'mine' | 'cash' | ''>('')
const boardFlashTick = ref(0)
const cashFxTick = ref(0)

function triggerBoardFlash(kind: 'mine' | 'cash') {
  boardFlash.value = kind
  boardFlashTick.value += 1
  window.setTimeout(() => {
    if (boardFlash.value == kind) boardFlash.value = ''
  }, 620)
}



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
  try {
    if (!auth.user) await auth.fetchBalance()
  } catch (e) {
    reportError(e)
  }

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
    // Both multiplier fetches are independent (same inputs) — run in parallel
    await Promise.all([refreshMultiplierFromServer(), refreshNextMultiplierFromServer()])
  } catch (e) {
    reportError(e)
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

async function startInternal() {
  if (!canStart.value) return
  message.value = ''
  messageType.value = 'info'
  sfx('click')


  bumpRound()
  clearAllTimeouts()
  explodingId.value = null
  boardShake.value = false
  cashPulse.value = false

  try {
    await minesStart({ bet: Number(bet.value), mines: Number(mines.value) })

    buildGrid()
    inGame.value = true
    lost.value = false
    safePicks.value = 0
    multiplier.value = 1
    nextMultiplier.value = null

    // Balance is display-only here — game already started server-side
    void auth.fetchBalance({ force: true }).catch(() => {})

    try {
      const s = await minesGetSession()
      safePicks.value = (s.opened?.length ?? 0)
      await Promise.all([refreshMultiplierFromServer(), refreshNextMultiplierFromServer()])
    } catch {}
  } catch (e: any) {
    setError(e, t('ui.s_mines_error_start'))
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
      await Promise.all([refreshMultiplierFromServer(), refreshNextMultiplierFromServer()])
      message.value = ''
      return
    } catch (e2) {
      reportError(e2)
    }

    inGame.value = false
  }
}

function start() {
  return requireAuth(() => startInternal())
}

async function revealInternal(cell: Cell) {
  if (!canClick.value) return
  if (cell.revealed) return
  message.value = ''
  messageType.value = 'info'
  sfx('click')

  const { row, col } = cellToRC(cell.id)
  try {
    const res = await minesStep({ row, col })

    if (res.finish) {
      cell.revealed = true
      cell.hasMine = true
      explodingId.value = cell.id
      boardShake.value = true
      triggerBoardFlash('mine')
      const ridShake = roundId.value
      setSafeTimeout(() => {
        if (ridShake !== roundId.value) return
        boardShake.value = false
      }, 180)

      lost.value = true
      inGame.value = false
      message.value = 'Бомба! Програш'
      sfx('lose')

      const rid = roundId.value
      setSafeTimeout(() => {
        if (rid !== roundId.value) return
        if (res.field) revealWholeField(res.field)
        explodingId.value = null
      }, 680)

      void auth.fetchBalance({ force: true }).catch(() => {})
      return
    }

    cell.revealed = true
    cell.hasMine = false
    safePicks.value += 1

    await refreshMultiplierFromServer()
    if (res.nextMultiplier != null) {
      nextMultiplier.value = Number(res.nextMultiplier)
    } else {
      await refreshNextMultiplierFromServer()
    }

    if (safePicks.value >= gems.value) {
      await cashOut()
    }
  } catch (e: any) {
    setError(e, t('ui.s_error'))
    try {
      const fin = await minesFinish()
      revealWholeField(fin.field)
      inGame.value = false
      lost.value = true
      void auth.fetchBalance({ force: true }).catch(() => {})
    } catch (e2) {
      reportError(e2)
    }
  }
}

function reveal(cell: Cell) {
  return requireAuth(() => revealInternal(cell))
}

async function cashOutInternal() {
  if (!inGame.value || safePicks.value <= 0) return
  message.value = ''
  messageType.value = 'info'

  try {
    const res = await minesFinish()
    sfx('cashout')

    cashPulse.value = true
    triggerBoardFlash('cash')
    cashFxTick.value += 1
    setTimeout(() => (cashPulse.value = false), 520)

    const win = Number(res.win)
    const profit = Math.max(0, win - Number(bet.value))
    messageType.value = 'success'
    message.value = t('ui.s_mines_cashout', { p: fmt(profit, 2), x: formatNumber(multiplier.value, 4) })
    bigwinStore.maybeShow(win, bet.value)

    const rid = roundId.value
    setSafeTimeout(() => {
      if (rid !== roundId.value) return
      revealWholeField(res.field)
    }, 1000)

    inGame.value = false
    lost.value = false
    void auth.fetchBalance({ force: true }).catch(() => {})
  } catch (e: any) {
    setError(e, t('ui.s_mines_error_cashout'))
  }
}

function cashOut() {
  return requireAuth(() => cashOutInternal())
}

buildGrid()
</script>

<template>
  <GamePageLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="bet"
        :disabled="inGame"
        :play-text="$t('ui.s_de3c731be5')"
        :message="message"
        :message-type="messageType"
        @half="bet = Math.max(1, Math.floor((Number(bet) || 0) / 2))"
        @double="bet = Math.floor((Number(bet) || 0) * 2)"
        @play="start"
      >
        <div class="field">
          <div class="label">{{ $t('ui.s_c3fc302af4') }}</div>
          <BaseSelect
            v-model="mines"
            :options="minesOptions"
            :disabled="inGame" :aria-label="$t('ui.s_c3fc302af4')"
            @update:model-value="sfx('click')"
          />
        </div>

        <div class="field">
          <div class="label">{{ $t('ui.s_a0910e2226') }}</div>
          <div class="input" style="display: flex; align-items: center; justify-content: space-between; height: var(--control-h)">
            <span class="num">{{ gems }}</span>
          </div>
        </div>

        <template #summary>
          <div class="summary">
            <div class="label">{{ $t('ui.s_mines_current_profit') }}: x{{ fmt(multiplier, 4) }}</div>
            <div class="net">
              <span class="num">{{ fmt(totalNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <div class="summary" style="margin-top: 10px">
            <div class="label">{{ $t('ui.s_mines_next_multiplier') }}: x{{ nextMultiplier == null ? '—' : fmt(nextMultiplier, 4) }}</div>
            <div class="net">
              <span class="num">{{ nextMultiplier == null ? '—' : fmt(nextNetGain, 2) }}</span>
              <span class="coin">K</span>
            </div>
          </div>

          <button class="btn btn-primary cash-btn" :class="{ 'cash-pulse': cashPulse }" @click="cashOut" :disabled="!(inGame && safePicks > 0)">
            <span class="cash-btn-txt">{{ $t('ui.s_cashout') }} ({{ fmt(payoutAmount, 2) }}K)</span>
            <span v-if="cashPulse" class="cash-btn-pop" :key="`cbp-${cashFxTick}`">+{{ fmt(totalNetGain, 2) }}K</span>
          </button>

        </template>
      </GamePanel>
    </template>

    <div class="board">
      <div class="board-fx" :key="`bf-${boardFlashTick}`" :class="boardFlash" aria-hidden="true"></div>
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
              <img v-if="cell.hasMine" class="reveal-ic" src="/icon/mines_mine.png" alt="Mine" />
              <img v-else class="reveal-ic" src="/icon/mines_gem.png" alt="Gem" />
            </div>
          </div>
        </button>
      </div>

    </div>

    <template #below>
      <GameHowTo
        :heading="$t('ui.s_howto_mines')"
        :intro="$t('ui.s_howto_mines_intro')"
        :sections="[
          { title: $t('ui.s_howto_steps'), items: [
            $t('ui.s_howto_mines_step_1'),
            $t('ui.s_howto_mines_step_2'),
            $t('ui.s_howto_mines_step_3'),
            $t('ui.s_howto_mines_step_4')
          ]},
          { title: $t('ui.s_howto_mechanics'), items: [
            $t('ui.s_howto_mines_mech_1'),
            $t('ui.s_howto_mines_mech_2'),
            $t('ui.s_howto_mines_mech_3')
          ]},
          { title: $t('ui.s_howto_tips'), items: [
            $t('ui.s_howto_mines_tip_1'),
            $t('ui.s_howto_mines_tip_2')
          ]}
        ]"
      />
    </template>
  </GamePageLayout>
</template>

<style scoped>
.board {
  padding: 18px;
  position: relative;
}

.board-fx{
  position:absolute;
  inset:-18px;
  border-radius: 18px;
  pointer-events:none;
  opacity:0;
  z-index: 1;
}
.board-fx.mine{ opacity:1; animation: boardMine 720ms ease-out both; }
.board-fx.cash{ opacity:1; animation: boardCash 720ms ease-out both; }

@keyframes boardMine{
  0%{ opacity:0; background: radial-gradient(circle at 50% 50%, rgba(248,81,73,.0), rgba(0,0,0,0) 60%); }
  18%{ opacity:1; background: radial-gradient(circle at 50% 50%, rgba(248,81,73,.22), rgba(0,0,0,0) 60%), radial-gradient(circle at 50% 50%, rgba(0,0,0,.75), rgba(0,0,0,0) 72%); }
  100%{ opacity:0; background: radial-gradient(circle at 50% 50%, rgba(248,81,73,.0), rgba(0,0,0,0) 60%); }
}

@keyframes boardCash{
  0%{ opacity:0; transform: scale(.98); }
  18%{ opacity:1; transform: scale(1.01); background: radial-gradient(circle at 50% 50%, rgba(61,255,157,.22), rgba(0,0,0,0) 62%), radial-gradient(circle at 50% 50%, rgba(255,178,74,.16), rgba(0,0,0,0) 70%); }
  100%{ opacity:0; transform: scale(1.03); }
}


.cash-btn{
  position: relative;
  overflow: hidden;
}
.cash-btn-pop{
  position: absolute;
  left: 50%;
  top: 50%;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(61,255,157,.14);
  color: rgba(255,255,255,.98);
  letter-spacing: .3px;
  font-weight: 1000;
  box-shadow: 0 14px 40px rgba(0,0,0,.45), 0 0 26px rgba(61,255,157,.18);
  animation: cashPop 620ms cubic-bezier(.2,.9,.2,1) both;
  pointer-events:none;
}

@keyframes cashPop{
  0%{ opacity:0; transform: translate(-50%,-50%) translateY(10px) scale(.88); }
  22%{ opacity:1; transform: translate(-50%,-50%) translateY(0) scale(1.03); }
  100%{ opacity:0; transform: translate(-50%,-50%) translateY(-12px) scale(.98); }
}

.grid5 {
  display: grid;
  grid-template-columns: repeat(5, 92px);
  gap: 14px;
  justify-content: center;
  padding: 8px 0;
  position: relative;
  z-index: 3;
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
  width: 104px;
  height: 104px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  box-shadow: none;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.92);
  font-size: 22px;
  transition: transform 120ms ease;
  perspective: 900px;
  position: relative;
  --tile-bg: rgba(255, 255, 255, 0.08);
  --tile-border: rgba(255, 255, 255, 0.06);
  --tile-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}
.tile:hover {
  transform: translateY(-1px);
}

/* Subtle green hover outline (only if not revealed) */
.tile:not(.revealed):hover .face.front {
  box-shadow:
    inset 0 0 0 1px rgba(0, 231, 1, 0.55),
    inset 0 0 0 2px rgba(0, 231, 1, 0.10),
    var(--tile-shadow);
}
.tile.revealed {
  --tile-bg: rgba(255, 255, 255, 0.05);
}
.tile.mine {
  --tile-bg: rgba(248, 81, 73, 0.18);
}
.tile.gem {
  --tile-bg: rgba(34, 197, 94, 0.14);
}

.tile-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transform: rotateY(0deg) translateZ(0.1px);
  border-radius: 10px;
}
.tile-inner::after{
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 65%, rgba(0,0,0,.55), rgba(0,0,0,0) 64%);
  opacity: 0;
  transform: translateZ(-1px);
  pointer-events: none;
}
.tile.revealed .tile-inner {
  transform: rotateY(180deg);
  animation: flipReal 520ms cubic-bezier(.2,.9,.2,1) both;
}
.tile.revealed .tile-inner::after{
  animation: flipShadow 520ms cubic-bezier(.2,.9,.2,1) both;
}

@keyframes flipReal{
  0%{ transform: rotateY(0deg) translateZ(0.1px); }
  45%{ transform: rotateY(92deg) translateZ(6px); }
  70%{ transform: rotateY(165deg) translateZ(2px); }
  100%{ transform: rotateY(180deg) translateZ(0.1px); }
}

@keyframes flipShadow{
  0%{ opacity: 0; filter: blur(6px); }
  45%{ opacity: .55; filter: blur(9px); }
  100%{ opacity: 0; filter: blur(6px); }
}

.face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  backface-visibility: hidden;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--tile-border), var(--tile-shadow);
}
.face.front {
  transform: rotateY(0deg);
  background: radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0) 65%), var(--tile-bg);
}
.face.back {
  transform: rotateY(180deg);
  background: var(--tile-bg);
}

.reveal-ic{
  width: 46px;
  height: 46px;
  object-fit: contain;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.35));
}

.reveal-ic{
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
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
  .app-layout {
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
