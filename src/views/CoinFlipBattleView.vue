<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import { useAuthStore } from '../stores/auth'
import { formatNumber } from '../utils/format'
import { sfx } from '../utils/sfx'
import { battlesCancel, battlesGet, battlesJoin, battlesLeave, battlesReady, type BattleDTO, type CoinSide } from '../api/battles'
import { publishMockEvent, subscribeBattle } from '../utils/coinflipRealtime'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const id = computed(() => String(route.params.id || ''))

const loading = ref(false)
const error = ref('')
const battle = ref<BattleDTO | null>(null)

const joinBusy = ref(false)
const readyBusy = ref(false)
const cancelBusy = ref(false)

let unsub: (() => void) | null = null
let pollTimer: number | null = null    // fallback polling when SSE absent
let nowTicker: number | null = null    // reactive clock for countdown display

const now = ref(Date.now())            // reactive — drives countdownLeft

const coinState = ref<'idle' | 'countdown' | 'flipping' | 'result'>('idle')
const coinResult = ref<CoinSide | ''>('')
const coinSeed = ref(0)
let flipTimer: number | null = null
let countdownTimer: number | null = null

const fmt = (v: number | string, d = 2) => formatNumber(v, d)
const myId = computed(() => String(auth.user?.id || ''))

const isCreator = computed(() => !!battle.value && battle.value.creatorId === myId.value)
const isJoiner = computed(() => !!battle.value && String(battle.value.joinerId || '') === myId.value)
const isParticipant = computed(() => isCreator.value || isJoiner.value)

// When both players chose random sides, the backend doesn't assign sides in the DB —
// it just picks a random winner. After FINISHED we can *derive* each player's side:
// the winner gets resultSide, the loser gets the opposite.
function deriveRandomSide(
  playerId: string,
  winnerId: string | null | undefined,
  resultSide: CoinSide | null | undefined
): CoinSide | null {
  if (!resultSide || !winnerId) return null   // battle not finished yet
  if (winnerId === playerId) return resultSide
  return resultSide === 'heads' ? 'tails' : 'heads'
}

// Resolved side for the creator:
// • explicit choice  → use it directly
// • random (null)    → derive from result once FINISHED, null before that
const creatorResolvedSide = computed<CoinSide | null>(() => {
  const b = battle.value
  if (!b) return null
  if (b.creatorSide) return b.creatorSide
  return deriveRandomSide(b.creatorId, b.winnerId, b.resultSide as CoinSide | null)
})

// Same for the joiner (joinerSide is also null only when BOTH chose random;
// if creator picked a side, backend auto-assigned the opposite to joiner)
const joinerResolvedSide = computed<CoinSide | null>(() => {
  const b = battle.value
  if (!b) return null
  if (b.joinerSide) return b.joinerSide
  return deriveRandomSide(b.joinerId ?? '', b.winnerId, b.resultSide as CoinSide | null)
})

const mySide = computed<CoinSide | null>(() => {
  if (isCreator.value) return creatorResolvedSide.value
  if (isJoiner.value) return joinerResolvedSide.value
  return null
})

const oppSide = computed<CoinSide | null>(() => {
  if (isCreator.value) return joinerResolvedSide.value
  if (isJoiner.value) return creatorResolvedSide.value
  return null
})

const oppNick = computed(() => {
  const b = battle.value
  if (!b) return '…'
  if (isCreator.value) return b.joinerNick || '…'
  if (isJoiner.value) return b.creatorNick || '…'
  return b.creatorNick || '…'
})

const myNick = computed(() => auth.user?.nickname || '—')

const myReady = computed(() => {
  const b = battle.value
  if (!b) return false
  if (isCreator.value) return !!b.creatorReady
  if (isJoiner.value) return !!b.joinerReady
  return false
})

const oppReady = computed(() => {
  const b = battle.value
  if (!b) return false
  if (isCreator.value) return !!b.joinerReady
  if (isJoiner.value) return !!b.creatorReady
  return false
})

const canJoin = computed(() => {
  const b = battle.value
  if (!b) return false
  if (!auth.user) return false
  if (b.status !== 'OPEN') return false
  return b.creatorId !== myId.value
})

const canReady = computed(() => {
  const b = battle.value
  if (!b) return false
  if (!isParticipant.value) return false
  if (!b.joinerId) return false
  if (b.status !== 'FULL' && b.status !== 'COUNTDOWN') return false
  return !myReady.value
})

const canCancel = computed(() => {
  const b = battle.value
  if (!b) return false
  if (!isCreator.value) return false
  return b.status === 'OPEN'
})

const countdownLeft = computed(() => {
  const b = battle.value
  if (!b?.countdownStartedAt) return 0
  const start = new Date(b.countdownStartedAt).getTime()
  const end = start + 3000
  const left = end - now.value   // now.value is reactive — updates every 150ms
  return Math.max(0, Math.ceil(left / 1000))
})

const sideText = (s: CoinSide | string | null | undefined) => {
  if (!s) return '—'
  const v = String(s).toLowerCase()
  if (v === 'heads') return t('ui.s_cf_heads')
  if (v === 'tails') return t('ui.s_cf_tails')
  return String(s)
}

// Side label shown inside the arena player badge.
// Null means "random, not yet revealed" → show a dice emoji + label.
// After FINISHED the resolved computed fills in the real side.
const arenaSideText = (side: CoinSide | null) => {
  if (!side) return t('ui.s_cf_side_pending')   // 🎲 Рандом / 🎲 Random
  return sideText(side)
}

async function fetchBattle() {
  if (!id.value) return
  loading.value = true
  try {
    battle.value = await battlesGet(id.value)
  } catch (e: any) {
    error.value = e?.message || t('ui.s_error')
  } finally {
    loading.value = false
  }
}

function bindRealtime() {
  if (unsub) {
    try {
      unsub()
    } catch {
    }
    unsub = null
  }
  if (!id.value) return
  unsub = subscribeBattle(id.value, (b) => {
    battle.value = b as any
  })
}

watch(
  () => id.value,
  async () => {
    await fetchBattle()
    bindRealtime()
  },
)

async function join() {
  if (!battle.value) return
  error.value = ''
  if (joinBusy.value) return
  joinBusy.value = true
  try {
    sfx('click')
    const nb = await battlesJoin(battle.value.id)
    publishMockEvent({ type: 'battle', battle: nb })
    publishMockEvent({ type: 'battles' })
    void auth.fetchBalance({ force: true }).catch(() => {})
    battle.value = nb as any
  } catch (e: any) {
    error.value = e?.message || t('ui.s_error')
  } finally {
    joinBusy.value = false
  }
}

async function ready() {
  if (!battle.value) return
  error.value = ''
  if (readyBusy.value) return
  readyBusy.value = true
  try {
    sfx('click')
    const nb = await battlesReady(battle.value.id)
    publishMockEvent({ type: 'battle', battle: nb })
    publishMockEvent({ type: 'battles' })
    battle.value = nb as any
  } catch (e: any) {
    error.value = e?.message || t('ui.s_error')
  } finally {
    readyBusy.value = false
  }
}

async function cancel() {
  if (!battle.value) return
  error.value = ''
  if (cancelBusy.value) return
  cancelBusy.value = true
  try {
    sfx('click')
    await battlesCancel(battle.value.id)
    publishMockEvent({ type: 'battle', battle: { id: battle.value.id, status: 'CANCELLED' } as any })
    publishMockEvent({ type: 'battles' })
    void auth.fetchBalance({ force: true }).catch(() => {})
    await router.push({ name: 'coinflip' })
  } catch (e: any) {
    error.value = e?.message || t('ui.s_error')
  } finally {
    cancelBusy.value = false
  }
}

async function leave() {
  const b = battle.value
  if (!b) return
  if (!isParticipant.value) return
  if (b.status === 'FINISHED' || b.status === 'CANCELLED' || b.status === 'ABANDONED') return
  try {
    const nb = await battlesLeave(b.id)
    publishMockEvent({ type: 'battle', battle: nb })
    publishMockEvent({ type: 'battles' })
    void auth.fetchBalance({ force: true }).catch(() => {})
  } catch {
  }
}

function playFlip(result: CoinSide) {
  if (coinState.value === 'result' && coinResult.value === result) return
  if (flipTimer) window.clearTimeout(flipTimer)
  coinSeed.value = Math.floor(Math.random() * 1e9)
  coinState.value = 'flipping'
  coinResult.value = ''
  // Always use even base spins so front face (heads) = 0°, back face (tails) = 180°
  const spinsBase = (10 + Math.floor(Math.random() * 5)) * 2  // 20,22,24,26,28
  const tilt = (Math.random() * 12 - 6).toFixed(2)
  const rot = result === 'heads' ? spinsBase * 180 : spinsBase * 180 + 180
  const root = document.documentElement
  root.style.setProperty('--cf-tilt', `${tilt}deg`)
  root.style.setProperty('--cf-rot', `${rot}deg`)
  flipTimer = window.setTimeout(() => {
    coinState.value = 'result'
    coinResult.value = result
  }, 2300)
}

function updateCountdownState() {
  const b = battle.value
  if (!b) return
  if (b.status !== 'COUNTDOWN' || !b.countdownStartedAt) return
  coinState.value = 'countdown'
  if (countdownTimer) window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(() => {
    if (countdownLeft.value <= 0) {
      if (countdownTimer) window.clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 150)
}

watch(
  () => battle.value?.status,
  () => {
    const b = battle.value
    if (!b) return
    if (b.status === 'COUNTDOWN') updateCountdownState()
    if (b.status === 'FINISHED' && b.resultSide) playFlip(b.resultSide as CoinSide)
  },
)

const TERMINAL = new Set(['FINISHED', 'CANCELLED', 'ABANDONED'])

function startPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = window.setInterval(async () => {
    if (battle.value && TERMINAL.has(battle.value.status)) {
      clearInterval(pollTimer!); pollTimer = null; return
    }
    await fetchBattle()
  }, 2000)
}

onMounted(async () => {
  nowTicker = window.setInterval(() => { now.value = Date.now() }, 150)
  await fetchBattle()
  bindRealtime()
  startPoll()
  window.addEventListener('beforeunload', leave)
})

onBeforeRouteLeave(async () => {
  await leave()
})

onBeforeUnmount(() => {
  if (unsub) { try { unsub() } catch {} unsub = null }
  if (flipTimer) window.clearTimeout(flipTimer)
  if (countdownTimer) window.clearInterval(countdownTimer)
  if (pollTimer) window.clearInterval(pollTimer)
  if (nowTicker) window.clearInterval(nowTicker)
  window.removeEventListener('beforeunload', leave)
})
</script>

<template>
  <GamePageLayout :min-height="560">
    <div class="cf-battle panel" v-if="battle">
      <div class="head">
        <div class="title">{{ $t('ui.s_cf_battle') }} #{{ battle.id.slice(0, 6) }}</div>
        <div class="muted small">{{ error }}</div>
      </div>

      <div v-if="battle.status === 'CANCELLED'" class="state-box cancelled">
        <div class="state-title">{{ $t('ui.s_cf_cancelled') }}</div>
        <div class="muted small">{{ $t('ui.s_cf_cancelled_desc') }}</div>
        <div class="state-actions">
          <button class="btn btn-ghost" @click="router.push({ name: 'coinflip' })">{{ $t('ui.s_cf_back_lobby') }}</button>
        </div>
      </div>

      <div v-else-if="battle.status === 'ABANDONED'" class="state-box abandoned">
        <div class="state-title">{{ $t('ui.s_cf_abandoned') }}</div>
        <div class="muted small">{{ $t('ui.s_cf_abandoned_desc') }}</div>
        <div class="state-actions">
          <button class="btn btn-ghost" @click="router.push({ name: 'coinflip' })">{{ $t('ui.s_cf_back_lobby') }}</button>
        </div>
      </div>

      <div class="arena" v-if="battle.status !== 'CANCELLED' && battle.status !== 'ABANDONED'">
        <!-- Left player: me (participant view) or creator (spectator view) -->
        <div class="player left">
          <div class="nick">{{ isParticipant ? myNick : battle.creatorNick }}</div>
          <div class="meta">
            <span class="badge" :class="{ on: isParticipant ? myReady : !!battle.creatorReady }">
              {{ (isParticipant ? myReady : !!battle.creatorReady) ? '✓' : '…' }}
            </span>
            <!-- arenaSideText: shows "🎲 Рандом" until FINISHED, then the resolved side -->
            <span class="muted small side-label" :class="{ 'side-revealed': !!(isParticipant ? mySide : creatorResolvedSide) }">
              {{ arenaSideText(isParticipant ? mySide : creatorResolvedSide) }}
            </span>
          </div>
        </div>

        <div class="coin-center">
          <div class="pot">
            <span class="amt">{{ fmt(battle.amount, 2) }}</span><span class="coin">K</span>
          </div>

          <div class="timer" v-if="battle.status === 'COUNTDOWN'">
            {{ countdownLeft }}
          </div>

          <div class="coin-wrap" :class="[coinState, coinResult]" :key="`coin-${battle.id}-${coinSeed}`">
            <div class="coin3d" aria-hidden="true">
              <div class="face front"><div class="glyph">K</div><div class="ring" /></div>
              <div class="face back"><div class="glyph">SCX</div><div class="ring" /></div>
              <div class="edge" aria-hidden="true" />
            </div>
          </div>

          <div class="muted small" v-if="coinState === 'result'">{{ $t('ui.s_cf_result') }}: <b>{{ sideText(coinResult) }}</b></div>
        </div>

        <!-- Right player: opponent (participant view) or joiner (spectator view) -->
        <div class="player right">
          <div class="nick">{{ isParticipant ? oppNick : battle.joinerNick || '…' }}</div>
          <div class="meta">
            <span class="badge" :class="{ on: isParticipant ? oppReady : !!battle.joinerReady }">
              {{ (isParticipant ? oppReady : !!battle.joinerReady) ? '✓' : '…' }}
            </span>
            <span class="muted small side-label" :class="{ 'side-revealed': !!(isParticipant ? oppSide : joinerResolvedSide) }">
              {{ arenaSideText(isParticipant ? oppSide : joinerResolvedSide) }}
            </span>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="fetchBattle" :disabled="loading">↻ {{ $t('ui.s_cf_sync') }}</button>
        <button class="btn btn-blue" v-if="canJoin" :disabled="joinBusy" @click="join">{{ joinBusy ? $t('ui.s_cf_loading') : $t('ui.s_cf_join') }}</button>
        <button class="btn btn-primary" v-if="canReady" :disabled="readyBusy" @click="ready">✅ {{ readyBusy ? $t('ui.s_cf_loading') : $t('ui.s_cf_approve') }}</button>
        <button class="btn btn-ghost" v-if="canCancel" :disabled="cancelBusy" @click="cancel">{{ cancelBusy ? $t('ui.s_cf_loading') : $t('ui.s_cf_cancel') }}</button>
        <button class="btn btn-ghost" @click="router.push({ name: 'coinflip' })">{{ $t('ui.s_cf_battles') }}</button>
      </div>

      <div class="result" v-if="battle.status === 'FINISHED'">
        <div class="muted small">{{ $t('ui.s_cf_winner') }}</div>
        <div class="winner">{{ battle.winnerId === battle.creatorId ? battle.creatorNick : battle.joinerNick }}</div>
      </div>
    </div>

    <div class="panel pad" v-else>
      <div class="muted">{{ $t('ui.s_cf_loading') }}</div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.cf-battle{ width: min(1180px, 100%); margin: 0 auto; padding: 14px; }
.head{ display:flex; flex-direction:column; gap: 6px; margin-bottom: 12px; }
.title{ font-weight: 1000; letter-spacing: .2px; }
.small{ font-size: 12px; }
.pad{ padding: 14px; }

.state-box{ border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.18); border-radius: 16px; padding: 14px; margin-bottom: 14px; display:flex; flex-direction:column; gap: 8px; }
.state-title{ font-weight: 1000; }
.state-actions{ display:flex; gap: 10px; margin-top: 6px; }
.state-box.cancelled{ border-color: rgba(255,85,85,.18); box-shadow: 0 0 0 4px rgba(255,85,85,.08); }
.state-box.abandoned{ border-color: rgba(255,210,80,.18); box-shadow: 0 0 0 4px rgba(255,210,80,.08); }

.arena{ display:grid; grid-template-columns: 1fr 360px 1fr; gap: 16px; align-items:center; }
@media (max-width: 980px){ .arena{ grid-template-columns: 1fr; } }

.player{ border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); border-radius: 16px; padding: 14px; }
.nick{ font-weight: 1000; font-size: 18px; }
.meta{ margin-top: 8px; display:flex; align-items:center; gap: 10px; }
.badge{ width: 26px; height: 26px; border-radius: 999px; display:flex; align-items:center; justify-content:center; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); }
.badge.on{ border-color: rgba(0,231,1,.6); box-shadow: 0 0 0 3px rgba(0,231,1,.12); }

.coin-center{ display:flex; flex-direction:column; align-items:center; gap: 10px; }
.pot{ font-weight: 1000; font-size: 22px; }
.coin{ font-weight: 1000; opacity:.9; margin-left: 6px; }

.timer{ width: 46px; height: 46px; border-radius: 999px; display:flex; align-items:center; justify-content:center; font-weight: 1000; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.22); box-shadow: 0 0 0 4px rgba(43,120,255,.10); }

.coin-wrap{ width: 170px; height: 170px; display:flex; align-items:center; justify-content:center; perspective: 900px; }
.coin3d{ width: 140px; height: 140px; position: relative; transform-style: preserve-3d; }
.face{ position:absolute; inset:0; border-radius: 999px; display:flex; align-items:center; justify-content:center; backface-visibility:hidden; border: 1px solid rgba(255,255,255,.14); background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.25), rgba(0,0,0,.35) 60%), radial-gradient(circle at 65% 70%, rgba(255,210,80,.18), transparent 55%); }
.face.back{ transform: rotateY(180deg); }
.glyph{ font-weight: 1200; font-size: 34px; letter-spacing: .5px; text-shadow: 0 2px 10px rgba(0,0,0,.4); }
.ring{ position:absolute; inset: 10px; border-radius: 999px; border: 2px solid rgba(255,210,80,.35); box-shadow: inset 0 0 0 2px rgba(0,0,0,.35); }
.edge{ position:absolute; inset:0; border-radius: 999px; transform: translateZ(-6px); box-shadow: inset 0 0 0 10px rgba(255,210,80,.14); }

.coin-wrap.flipping .coin3d{ animation: cfFlip 2.3s cubic-bezier(.18,.9,.15,1) forwards; }
.coin-wrap.result .coin3d{ transform: rotateX(var(--cf-tilt, 0deg)) rotateY(var(--cf-rot, 0deg)); }

@keyframes cfFlip{
  0%{ transform: rotateX(14deg) rotateY(0deg); filter: drop-shadow(0 6px 18px rgba(0,0,0,.45)); }
  20%{ transform: rotateX(18deg) rotateY(calc(var(--cf-rot, 1800deg) * .55)); }
  55%{ transform: rotateX(calc(var(--cf-tilt, 0deg) + 18deg)) rotateY(calc(var(--cf-rot, 1800deg) * .92)); }
  100%{ transform: rotateX(var(--cf-tilt, 0deg)) rotateY(var(--cf-rot, 1800deg)); filter: drop-shadow(0 10px 26px rgba(0,0,0,.55)); }
}

.actions{ margin-top: 14px; display:flex; gap: 10px; flex-wrap: wrap; justify-content:center; }
.result{ margin-top: 12px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); border-radius: 16px; padding: 12px; text-align:center; }
.winner{ font-weight: 1100; font-size: 22px; }

/* Side label in player badge: muted while still random, highlighted once revealed */
.side-label { transition: color 300ms ease; }
.side-revealed { color: rgba(255,210,80,.9); font-weight: 900; }
</style>
