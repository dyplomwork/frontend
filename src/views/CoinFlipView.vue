<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import Modal from '../components/Modal.vue'
import { useAuthStore } from '../stores/auth'
import { formatNumber } from '../utils/format'
import { sfx } from '../utils/sfx'
import {
  battlesApprove,
  battlesCancel,
  battlesCreate,
  battlesGet,
  battlesJoin,
  battlesList,
  type BattleDTO,
  type CoinSide,
} from '../api/battles'

const auth = useAuthStore()

const { t } = useI18n()

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

// lobby
const loading = ref(false)
const error = ref('')
const list = ref<BattleDTO[]>([])
const selectedId = ref<string | null>(null)
const selected = ref<BattleDTO | null>(null)

// create
const createOpen = ref(false)
const amount = ref(0)
const side = ref<CoinSide | ''>('')

// approve
const mySide = ref<CoinSide | ''>('')
const approving = ref(false)

// coin anim
const coinState = ref<'idle' | 'flipping' | 'result'>('idle')
const coinResult = ref<CoinSide | ''>('')
const coinTick = ref(0)
let coinTimer: number | null = null

const isAuthed = computed(() => !!auth.user)
const myId = computed(() => String(auth.user?.id || ''))
const isMine = computed(() => !!selected.value && selected.value.creatorId === myId.value)
const isJoiner = computed(() => !!selected.value && String(selected.value.joinerId || '') === myId.value)
const isParticipant = computed(() => isMine.value || isJoiner.value)

const statusText = (s: string) => {
  const k = `ui.s_cf_status_${String(s || '').toLowerCase()}`
  const v = t(k)
  return v === k ? s : v
}

const sideText = (s: CoinSide | string | null | undefined) => {
  if (!s) return '—'
  const v = String(s).toLowerCase()
  if (v === 'heads') return t('ui.s_cf_heads')
  if (v === 'tails') return t('ui.s_cf_tails')
  return String(s)
}

const canJoin = computed(() => {
  const b = selected.value
  if (!b) return false
  if (!auth.user) return false
  return b.status === 'OPEN' && b.creatorId !== myId.value
})

const canCancel = computed(() => {
  const b = selected.value
  if (!b) return false
  return !!auth.user && b.status === 'OPEN' && b.creatorId === myId.value
})

const canApprove = computed(() => {
  const b = selected.value
  if (!b) return false
  if (!auth.user) return false
  if (b.status !== 'APPROVING') return false
  if (!isParticipant.value) return false
  const a = b.approvals || {}
  return !a[myId.value]
})

const yourLockedSide = computed<CoinSide | null>(() => {
  const b = selected.value
  if (!b) return null
  if (!auth.user) return null
  if (isMine.value) return (b.creatorSide ?? null) as any
  if (isJoiner.value) return (b.joinerSide ?? null) as any
  return null
})

function pickBattle(id: string) {
  selectedId.value = id
  void refreshSelected()
}

async function refreshList() {
  error.value = ''
  loading.value = true
  try {
    list.value = await battlesList()
    // auto select first
    if (!selectedId.value && list.value.length) selectedId.value = list.value[0].id
  } catch (e: any) {
    error.value = e?.message || 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
  await refreshSelected()
}

async function refreshSelected() {
  if (!selectedId.value) {
    selected.value = null
    return
  }
  try {
    selected.value = await battlesGet(selectedId.value)
    // keep pick synced
    const inList = list.value.find((x) => x.id === selectedId.value)
    if (!inList) {
      // fallback: inject
      list.value = [selected.value, ...list.value]
    } else {
      list.value = list.value.map((x) => (x.id === selected.value!.id ? selected.value! : x))
    }

    if (yourLockedSide.value) mySide.value = ''

    if (selected.value.status === 'FINISHED' && selected.value.resultSide) {
      showCoinResult(selected.value.resultSide)
    }
  } catch {
    // ignore
  }
}

function openCreate() {
  sfx('click')
  amount.value = 0
  side.value = ''
  createOpen.value = true
}

async function createBattle() {
  if (!auth.user) {
    error.value = t('ui.s_need_login')
    return
  }
  const a = Math.max(0, Number(amount.value) || 0)
  if (a <= 0) return (error.value = t('ui.s_cf_error_enter_amount'))
  if (auth.user.balance < a) return (error.value = t('ui.s_insufficient_balance'))

  error.value = ''
  try {
    const b = await battlesCreate({ amount: a, side: side.value ? (side.value as CoinSide) : null })
    createOpen.value = false
    selectedId.value = b.id
    await refreshList()
    await auth.fetchBalance({ force: true }).catch(() => {})
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  }
}

async function joinBattle() {
  if (!selected.value) return
  if (!auth.user) return (error.value = t('ui.s_need_login'))
  if (auth.user.balance < Number(selected.value.amount || 0)) return (error.value = t('ui.s_insufficient_balance'))

  error.value = ''
  try {
    sfx('click')
    selected.value = await battlesJoin(selected.value.id)
    await refreshList()
    await auth.fetchBalance({ force: true }).catch(() => {})
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  }
}

async function cancelBattle() {
  if (!selected.value) return
  error.value = ''
  try {
    sfx('click')
    await battlesCancel(selected.value.id)
    await refreshList()
    await auth.fetchBalance({ force: true }).catch(() => {})
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  }
}

function showCoinResult(side: CoinSide) {
  if (coinState.value === 'result' && coinResult.value === side) return

  coinState.value = 'flipping'
  coinResult.value = ''
  coinTick.value += 1
  if (coinTimer) window.clearTimeout(coinTimer)
  coinTimer = window.setTimeout(() => {
    coinState.value = 'result'
    coinResult.value = side
    coinTick.value += 1
  }, 1200)
}

async function approve() {
  const b = selected.value
  if (!b) return
  if (!auth.user) return (error.value = t('ui.s_need_login'))
  if (!canApprove.value) return

  const locked = yourLockedSide.value
  const sideToSend = locked || (mySide.value ? (mySide.value as CoinSide) : null)
  if (!sideToSend) return (error.value = t('ui.s_cf_error_pick_side'))

  error.value = ''
  approving.value = true
  try {
    sfx('click')
    const upd = await battlesApprove(b.id, { side: sideToSend })
    selected.value = upd
    await refreshList()
    await auth.fetchBalance({ force: true }).catch(() => {})
    if (upd.status === 'FINISHED' && upd.resultSide) showCoinResult(upd.resultSide)
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  } finally {
    approving.value = false
  }
}

const visibleList = computed(() => {
  const arr = [...list.value]
  const pr = (s: string) => (s === 'OPEN' ? 0 : s === 'APPROVING' ? 1 : s === 'FULL' ? 2 : s === 'FINISHED' ? 3 : 4)
  return arr.sort((a, b) => {
    const pa = pr(a.status)
    const pb = pr(b.status)
    if (pa !== pb) return pa - pb
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
})

onMounted(() => {
  void refreshList()
})

onBeforeUnmount(() => {
  if (coinTimer) window.clearTimeout(coinTimer)
})
</script>

<template>
  <GamePageLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="loading"
        :message="error"
        :play-text="$t('ui.s_cf_create')"
        @play="openCreate"
        @half="amount = Math.max(0, (Number(amount) || 0) / 2)"
        @double="amount = (Number(amount) || 0) * 2"
      >
        <template #summary>
          <div class="summary">
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_650be61892') }}</span>
              <span class="num">{{ $t('ui.s_f664b8e28e') }}</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_2a6ba72e93') }}</span>
              <span class="num">/api/v1/battles</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_12ae2a1258') }}</span>
              <span class="num">{{ $t('ui.s_b3dc970af2') }}</span>
            </div>
          </div>
        </template>

        <template #below>
          <div class="panel-actions">
            <button class="btn btn-ghost" :disabled="loading" @click="refreshList">
              🔄 {{ $t('ui.s_cf_refresh') }}
            </button>
            <button class="btn btn-primary" :disabled="!isAuthed" @click="openCreate">
              🪙 {{ $t('ui.s_cf_create_battle') }}
            </button>
          </div>
        </template>
      </GamePanel>
    </template>

    <div class="cf">
      <div class="lobby panel">
        <div class="lobby-head">
          <div class="title">{{ $t('ui.s_cf_battles') }}</div>
          <div class="muted small">{{ $t('ui.s_cf_subtitle') }}</div>
        </div>

        <div v-if="loading" class="muted small pad">{{ $t('ui.s_cf_loading') }}</div>
        <div v-else-if="!visibleList.length" class="muted small pad">{{ $t('ui.s_cf_empty') }}</div>

        <button
          v-for="b in visibleList"
          :key="b.id"
          class="battle"
          :class="{ active: b.id === selectedId, open: b.status === 'OPEN', done: b.status === 'FINISHED' }"
          @click="pickBattle(b.id)"
        >
          <div class="b-top">
            <div class="b-creator">
              <span class="dot" :class="b.status.toLowerCase()" />
              <span class="nick">{{ b.creatorNick }}</span>
              <span class="muted small" v-if="b.joinerNick">{{ $t('ui.s_cf_vs') }} {{ b.joinerNick }}</span>
              <span class="muted small" v-else>{{ $t('ui.s_cf_waiting') }}</span>
            </div>
            <div class="b-amt">
              <span class="amt">{{ fmt(b.amount, 2) }}</span>
              <span class="coin" aria-label="Currency K">K</span>
            </div>
          </div>
          <div class="b-bottom">
            <span class="badge" :class="b.status.toLowerCase()">{{ statusText(b.status) }}</span>
            <span class="muted small" v-if="b.creatorSide">{{ $t('ui.s_cf_creator') }}: {{ sideText(b.creatorSide) }}</span>
            <span class="muted small" v-else>{{ $t('ui.s_cf_creator') }}: ?</span>
          </div>
        </button>
      </div>

      <div class="stage panel" v-if="selected">
        <div class="stage-head">
          <div class="title">
            {{ $t('ui.s_cf_battle') }} #{{ selected.id.slice(0, 6) }}
            <span class="badge" :class="selected.status.toLowerCase()">{{ statusText(selected.status) }}</span>
          </div>
          <div class="muted small">
            {{ selected.creatorNick }}
            <span class="muted">{{ $t('ui.s_cf_vs') }}</span>
            {{ selected.joinerNick || '…' }}
          </div>
        </div>

        <div class="coin-wrap" :class="[coinState, coinResult]" :key="`coin-${selected.id}-${coinTick}`">
          <div class="coin3d" aria-hidden="true">
            <div class="face front">
              <div class="glyph">K</div>
              <div class="ring"></div>
            </div>
            <div class="face back">
              <div class="glyph">SCX</div>
              <div class="ring"></div>
            </div>
            <div class="edge" aria-hidden="true"></div>
          </div>

          <div class="coin-hud" v-if="coinState !== 'idle'">
            <div class="muted small">{{ $t('ui.s_cf_result') }}</div>
            <div class="result">{{ coinResult ? sideText(coinResult) : '…' }}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info">
            <div class="muted small">{{ $t('ui.s_cf_amount') }}</div>
            <div class="big">{{ fmt(selected.amount, 2) }} <span class="coin">K</span></div>
          </div>
          <div class="info">
            <div class="muted small">{{ $t('ui.s_cf_creator_side') }}</div>
            <div class="big">{{ sideText(selected.creatorSide) }}</div>
          </div>
          <div class="info">
            <div class="muted small">{{ $t('ui.s_cf_joiner_side') }}</div>
            <div class="big">{{ sideText(selected.joinerSide) }}</div>
          </div>
          <div class="info">
            <div class="muted small">{{ $t('ui.s_cf_approvals') }}</div>
            <div class="big">
              <span class="ok" :class="{ on: !!selected.approvals?.[selected.creatorId] }">{{ selected.approvals?.[selected.creatorId] ? '✓' : '…' }}</span>
              <span class="muted">&nbsp;{{ $t('ui.s_cf_creator') }}</span>
              <span class="muted">&nbsp;•&nbsp;</span>
              <span
                class="ok"
                :class="{ on: !!selected.joinerId && !!selected.approvals?.[String(selected.joinerId)] }"
              >{{ selected.joinerId && selected.approvals?.[String(selected.joinerId)] ? '✓' : '…' }}</span>
              <span class="muted">&nbsp;{{ $t('ui.s_cf_joiner') }}</span>
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="loading" @click="refreshSelected">↻ {{ $t('ui.s_cf_sync') }}</button>

          <button class="btn btn-blue" :disabled="!canJoin" @click="joinBattle">
            {{ $t('ui.s_cf_join') }}
          </button>

          <button class="btn btn-ghost" :disabled="!canCancel" @click="cancelBattle">
            {{ $t('ui.s_cf_cancel') }}
          </button>

          <div class="approve" v-if="selected.status === 'APPROVING'">
            <div class="muted small">{{ $t('ui.s_cf_your_approve') }}</div>
            <div class="pick" v-if="!yourLockedSide">
              <button class="pill" :class="{ on: mySide === 'heads' }" @click="mySide = 'heads'">{{ $t('ui.s_cf_heads') }}</button>
              <button class="pill" :class="{ on: mySide === 'tails' }" @click="mySide = 'tails'">{{ $t('ui.s_cf_tails') }}</button>
            </div>
            <div class="muted small" v-else>
              {{ $t('ui.s_cf_locked') }}: <b>{{ sideText(yourLockedSide) }}</b>
            </div>

            <button class="btn btn-primary" :disabled="!canApprove || approving" @click="approve">
              ✅ {{ $t('ui.s_cf_approve') }}
            </button>
          </div>
        </div>

        <div v-if="selected.status === 'FINISHED'" class="result-card">
          <div class="r-top">
            <div>
            <div class="muted small">{{ $t('ui.s_cf_winner') }}</div>
              <div class="winner">{{ selected.winnerId === selected.creatorId ? selected.creatorNick : selected.joinerNick }}</div>
            </div>
            <div class="right">
            <div class="muted small">{{ $t('ui.s_cf_result_side') }}</div>
            <div class="winner">{{ sideText(selected.resultSide) }}</div>
            </div>
          </div>
          <div class="muted small">
            {{ $t('ui.s_cf_round_defined') }}
          </div>
        </div>
      </div>

      <div class="stage panel" v-else>
        <div class="pad muted">{{ $t('ui.s_cf_pick_battle') }}</div>
      </div>
    </div>

    <Modal v-if="createOpen" :open="createOpen" @close="createOpen = false">
      <div class="modal-title">{{ $t('ui.s_cf_create_title') }}</div>
      <div class="modal-body">
        <div class="form">
          <label class="lbl">{{ $t('ui.s_cf_amount') }}</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="amount" placeholder="10" />

          <label class="lbl">{{ $t('ui.s_cf_side_optional') }}</label>
          <div class="pick">
            <button class="pill" :class="{ on: side === 'heads' }" @click="side = side === 'heads' ? '' : 'heads'">{{ $t('ui.s_cf_heads') }}</button>
            <button class="pill" :class="{ on: side === 'tails' }" @click="side = side === 'tails' ? '' : 'tails'">{{ $t('ui.s_cf_tails') }}</button>
            <button class="pill" :class="{ on: side === '' }" @click="side = ''">{{ $t('ui.s_cf_random') }}</button>
          </div>
          <div class="muted small">
            {{ $t('ui.s_cf_hint_side') }}
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" @click="createOpen = false">{{ $t('ui.s_cf_cancel') }}</button>
        <button class="btn btn-primary" @click="createBattle">{{ $t('ui.s_cf_create') }}</button>
      </div>
    </Modal>
  </GamePageLayout>
</template>

<style scoped>
.summary{
  margin-top: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row-between{ display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.num{ font-weight: 1000; }
.small{ font-size: 12px; }
.panel-actions{ display:flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }

.cf{ width: min(1180px, 100%); margin: 0 auto; display:grid; grid-template-columns: 360px 1fr; gap: 16px; }
@media (max-width: 980px){ .cf{ grid-template-columns: 1fr; } }

.lobby{ padding: 14px; }
.lobby-head{ display:flex; flex-direction:column; gap: 2px; margin-bottom: 10px; }
.title{ font-weight: 1000; letter-spacing: .2px; }
.pad{ padding: 10px; }

.battle{
  width: 100%;
  text-align: left;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.18);
  padding: 12px;
  margin-top: 10px;
  cursor:pointer;
  transition: transform .12s ease, border-color .12s ease, background .12s ease;
  color: inherit;
}
.battle:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.14); background: rgba(0,0,0,.22); }
.battle.active{ border-color: rgba(43,120,255,.45); box-shadow: 0 0 0 3px rgba(43,120,255,.12); }
.battle.open{ background: radial-gradient(500px 200px at 10% 0%, rgba(0,231,1,.10), transparent 55%), rgba(0,0,0,.18); }
.battle.done{ background: radial-gradient(520px 220px at 85% 10%, rgba(245,197,66,.10), transparent 55%), rgba(0,0,0,.18); }

.b-top{ display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.b-creator{ display:flex; align-items:center; gap: 8px; flex-wrap: wrap; }
.nick{ font-weight: 1000; }
.b-amt{ display:flex; align-items:baseline; gap: 6px; }
.amt{ font-weight: 1000; }
.b-bottom{ display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-top: 8px; }

.dot{ width: 8px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.18); box-shadow: 0 0 0 2px rgba(255,255,255,.06); }
.dot.open{ background: rgba(0,231,1,.9); box-shadow: 0 0 0 2px rgba(0,231,1,.18), 0 0 16px rgba(0,231,1,.18); }
.dot.approving{ background: rgba(43,120,255,.9); box-shadow: 0 0 0 2px rgba(43,120,255,.18), 0 0 16px rgba(43,120,255,.18); }
.dot.finished{ background: rgba(245,197,66,.95); box-shadow: 0 0 0 2px rgba(245,197,66,.18), 0 0 16px rgba(245,197,66,.18); }
.dot.cancelled{ background: rgba(255,64,87,.95); box-shadow: 0 0 0 2px rgba(255,64,87,.18), 0 0 16px rgba(255,64,87,.18); }

.badge{ font-size: 12px; font-weight: 900; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.05); }
.badge.open{ border-color: rgba(0,231,1,.20); box-shadow: 0 0 0 2px rgba(0,231,1,.08); }
.badge.approving{ border-color: rgba(43,120,255,.22); box-shadow: 0 0 0 2px rgba(43,120,255,.08); }
.badge.finished{ border-color: rgba(245,197,66,.22); box-shadow: 0 0 0 2px rgba(245,197,66,.08); }
.badge.cancelled{ border-color: rgba(255,64,87,.22); box-shadow: 0 0 0 2px rgba(255,64,87,.08); }

.stage{ padding: 16px; position: relative; overflow: hidden; }
.stage::before{
  content:"";
  position:absolute;
  inset: -120px -180px;
  background:
    radial-gradient(520px 260px at 15% 10%, rgba(245,197,66,.12), transparent 55%),
    radial-gradient(520px 260px at 85% 20%, rgba(43,120,255,.10), transparent 55%),
    radial-gradient(520px 260px at 70% 95%, rgba(0,231,1,.08), transparent 60%);
  pointer-events:none;
}
.stage > *{ position: relative; }
.stage-head{ display:flex; flex-direction:column; gap: 6px; margin-bottom: 12px; }

.coin-wrap{
  position: relative;
  height: 260px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.18);
  display:grid;
  place-items:center;
  overflow:hidden;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.25), 0 18px 40px rgba(0,0,0,.35);
}
.coin-wrap::after{
  content:"";
  position:absolute;
  inset:-60px -80px;
  background: radial-gradient(420px 220px at 50% 40%, rgba(245,197,66,.10), transparent 60%);
  pointer-events:none;
  opacity:.9;
}

.coin3d{ width: 132px; height: 132px; position: relative; transform-style: preserve-3d; }
.face{
  position:absolute;
  inset: 0;
  border-radius: 999px;
  display:grid;
  place-items:center;
  border: 1px solid rgba(255,255,255,.18);
  box-shadow:
    inset 0 8px 14px rgba(255,255,255,.10),
    inset 0 -14px 22px rgba(0,0,0,.35),
    0 18px 35px rgba(0,0,0,.45);
  background: url("/icon/coin_k.png") center/cover no-repeat;
}
.face .glyph{ display:none; }
.face .ring{
  position:absolute;
  inset: 10px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.22);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.12);
}
.front{ transform: translateZ(10px); }
.back{
  transform: rotateY(180deg) translateZ(10px);
  background: url("/icon/coin_k.png") center/cover no-repeat;
}
.back .glyph{ display:none; }

.edge{
  position:absolute;
  left: 50%;
  top: 50%;
  width: 132px;
  height: 22px;
  transform: translate(-50%, -50%) rotateX(90deg);
  transform-style: preserve-3d;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,.18), rgba(0,0,0,.28), rgba(255,255,255,.14));
  box-shadow: 0 10px 24px rgba(0,0,0,.30);
  opacity: .85;
}

.coin-hud{
  position:absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap: 10px;
  pointer-events:none;
}
.result{ font-weight: 1000; font-size: 20px; }

/* Animations */
.coin-wrap.flipping .coin3d{ animation: toss 1200ms cubic-bezier(.2,.9,.2,1) both; }
.coin-wrap.flipping::after{ animation: flash 1200ms ease-out both; }

@keyframes toss{
  0%{ transform: translateY(30px) rotateX(15deg) rotateY(0deg) scale(.9); filter: drop-shadow(0 12px 24px rgba(0,0,0,.45)); }
  35%{ transform: translateY(-40px) rotateX(80deg) rotateY(720deg) scale(1.02); }
  70%{ transform: translateY(-18px) rotateX(160deg) rotateY(1260deg) scale(1.00); }
  100%{ transform: translateY(6px) rotateX(180deg) rotateY(1440deg) scale(1.0); filter: drop-shadow(0 22px 40px rgba(0,0,0,.55)); }
}
@keyframes flash{
  0%{ opacity: 0; transform: scale(.8); }
  18%{ opacity: 1; }
  100%{ opacity: .2; transform: scale(1.05); }
}

/* Result lock: show correct face */
.coin-wrap.result.heads .coin3d{ transform: rotateY(0deg) translateY(6px); }
.coin-wrap.result.tails .coin3d{ transform: rotateY(180deg) translateY(6px); }
.coin-wrap.result::after{ opacity: .25; }

.info-grid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 12px; }
@media (max-width: 760px){ .info-grid{ grid-template-columns: 1fr; } }
.info{ border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); padding: 12px; }
.big{ font-weight: 1000; font-size: 16px; margin-top: 3px; }

.actions{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items:flex-end; }
.approve{ margin-left:auto; display:flex; gap: 10px; align-items:flex-end; flex-wrap: wrap; }
@media (max-width: 980px){ .approve{ margin-left: 0; } }

.pick{ display:flex; gap: 8px; }
.pill{
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.88);
  font-weight: 900;
  cursor: pointer;
  transition: transform .12s ease, border-color .12s ease, background .12s ease;
}
.pill:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.06); }
.pill.on{ border-color: rgba(245,197,66,.35); box-shadow: 0 0 0 2px rgba(245,197,66,.10), 0 0 18px rgba(245,197,66,.10); }

.ok{ display:inline-flex; min-width: 18px; justify-content:center; font-weight: 1000; }
.ok.on{ color: rgba(0,231,1,.92); }

.result-card{
  margin-top: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.18);
  padding: 12px;
}
.r-top{ display:flex; align-items:flex-end; justify-content:space-between; gap: 10px; margin-bottom: 8px; }
.winner{ font-weight: 1000; font-size: 18px; }
.right{ text-align:right; }

.modal-title{ font-weight: 1000; font-size: 18px; margin-bottom: 10px; }
.modal-body{ padding: 6px 0 2px; }
.modal-actions{ display:flex; gap: 10px; justify-content:flex-end; margin-top: 12px; }
.form{ display:flex; flex-direction:column; gap: 10px; }
.lbl{ font-size: 12px; font-weight: 900; color: rgba(255,255,255,.70); }
</style>
