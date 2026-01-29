<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GamePageLayout from '../components/GamePageLayout.vue'
import GamePanel from '../components/GamePanel.vue'
import { useAuthStore } from '../stores/auth'
import { formatNumber } from '../utils/format'
import { sfx } from '../utils/sfx'
import { battlesCreate, battlesJoin, battlesList, type BattleDTO, type CoinSide } from '../api/battles'
import { publishMockEvent, subscribeBattles } from '../utils/coinflipRealtime'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()

const loading = ref(false)
const error = ref('')
const list = ref<BattleDTO[]>([])

const amount = ref(0)
const side = ref<CoinSide | ''>('')
const createBusy = ref(false)
const joiningId = ref<string>('')
let unsubBattles: (() => void) | null = null

const isAuthed = computed(() => !!auth.user)
const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const sideText = (s: CoinSide | string | null | undefined) => {
  if (!s) return '—'
  const v = String(s).toLowerCase()
  if (v === 'heads') return t('ui.s_cf_heads')
  if (v === 'tails') return t('ui.s_cf_tails')
  return String(s)
}

async function refreshList() {
  error.value = ''
  loading.value = true
  try {
    const all = await battlesList()
    list.value = all.filter((b) => b.status === 'OPEN')
  } catch (e: any) {
    error.value = e?.message || 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
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
  if (createBusy.value) return
  createBusy.value = true
  try {
    sfx('click')
    const b = await battlesCreate({ amount: a, side: side.value ? (side.value as CoinSide) : null })
    publishMockEvent({ type: 'battle', battle: b })
    publishMockEvent({ type: 'battles' })
    await auth.fetchBalance({ force: true }).catch(() => {})
    await router.push({ name: 'coinflip-battle', params: { id: b.id } })
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  } finally {
    createBusy.value = false
  }
}

async function joinBattle(b: BattleDTO) {
  if (!auth.user) return (error.value = t('ui.s_need_login'))
  if (auth.user.balance < Number(b.amount || 0)) return (error.value = t('ui.s_insufficient_balance'))

  error.value = ''
  if (joiningId.value) return
  joiningId.value = b.id
  try {
    sfx('click')
    const nb = await battlesJoin(b.id)
    publishMockEvent({ type: 'battle', battle: nb })
    publishMockEvent({ type: 'battles' })
    await auth.fetchBalance({ force: true }).catch(() => {})
    await router.push({ name: 'coinflip-battle', params: { id: b.id } })
  } catch (e: any) {
    error.value = e?.message || 'Ошибка'
  } finally {
    joiningId.value = ''
  }
}

onMounted(() => {
  void refreshList()
  unsubBattles = subscribeBattles(() => {
    void refreshList()
  })
})

onBeforeUnmount(() => {
  if (!unsubBattles) return
  try {
    unsubBattles()
  } catch {
  }
  unsubBattles = null
})
</script>

<template>
  <GamePageLayout :min-height="560">
    <template #panel>
      <GamePanel
        v-model="amount"
        :disabled="loading || createBusy"
        :message="error"
        :play-text="$t('ui.s_cf_create')"
        @play="createBattle"
      >
        <template #mult>
          <button
            class="btn btn-ghost cf-side"
            :class="{ on: side === 'heads' }"
            :disabled="createBusy"
            type="button"
            @click="side = side === 'heads' ? '' : 'heads'"
          >
            {{ $t('ui.s_cf_heads') }}
          </button>
          <button
            class="btn btn-ghost cf-side"
            :class="{ on: side === 'tails' }"
            :disabled="createBusy"
            type="button"
            @click="side = side === 'tails' ? '' : 'tails'"
          >
            {{ $t('ui.s_cf_tails') }}
          </button>
        </template>

        <template #summary>
          <div class="summary">
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_cf_battles') }}</span>
              <span class="num">{{ list.length }}</span>
            </div>
            <div class="row-between">
              <span class="muted">{{ $t('ui.s_cf_amount') }}</span>
              <span class="num">{{ fmt(amount, 2) }}</span>
            </div>
          </div>
        </template>

      </GamePanel>
    </template>

    <div class="cf-lobby panel">
      <div class="lobby-head">
        <div class="lobby-left">
          <div class="title">{{ $t('ui.s_cf_battles') }}</div>
          <div class="muted small">{{ $t('ui.s_cf_subtitle') }}</div>
        </div>
        <button class="icon-btn cf-refresh" :disabled="loading" type="button" :aria-label="$t('ui.s_cf_refresh')" @click="refreshList">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M20 12a8 8 0 0 1-14.9 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M4 12a8 8 0 0 1 14.9-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M5 20v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19 4v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div v-if="loading" class="muted small pad">{{ $t('ui.s_cf_loading') }}</div>
      <div v-else-if="!list.length" class="muted small pad">{{ $t('ui.s_cf_empty') }}</div>

      <div v-for="b in list" :key="b.id" class="battle">
        <div class="b-top">
          <div class="b-creator">
            <span class="dot open" />
            <span class="nick">{{ b.creatorNick }}</span>
            <span class="muted small">{{ $t('ui.s_cf_waiting') }}</span>
          </div>
          <div class="b-amt">
            <span class="amt">{{ fmt(b.amount, 2) }}</span>
            <span class="coin" aria-label="Currency K">K</span>
          </div>
        </div>
        <div class="b-bottom">
          <span class="muted small">{{ $t('ui.s_cf_creator') }}: {{ sideText(b.creatorSide) }}</span>
          <button class="btn btn-blue" :disabled="!isAuthed || !!joiningId" @click="joinBattle(b)">{{ joiningId === b.id ? $t('ui.s_cf_loading') : $t('ui.s_cf_join') }}</button>
        </div>
      </div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.summary{ margin-top: 14px; border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(0, 0, 0, 0.18); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.row-between{ display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.num{ font-weight: 1000; }
.small{ font-size: 12px; }
.pad{ padding: 10px; }

.cf-side{ height: 42px; border-radius: 14px; font-weight: 1000; }
.cf-side.on{ background: rgba(255,255,255,.10); border-color: rgba(255,255,255,.22); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }


.cf-lobby{ width: min(980px, 100%); margin: 0 auto; padding: 14px; }
.lobby-head{ display:flex; align-items:center; justify-content:space-between; gap: 12px; margin-bottom: 10px; }
.lobby-left{ display:flex; flex-direction:column; gap: 2px; }
.cf-refresh{ width: 44px; height: 44px; border-radius: 14px; }
.title{ font-weight: 1000; letter-spacing: .2px; }

.battle{ width: 100%; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); padding: 12px; margin-top: 10px; color: inherit; }
.b-top{ display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.b-creator{ display:flex; align-items:center; gap: 8px; flex-wrap: wrap; }
.nick{ font-weight: 900; }
.dot{ width: 8px; height: 8px; border-radius: 999px; background: rgba(0,231,1,.9); box-shadow: 0 0 0 3px rgba(0,231,1,.12); }
.b-amt{ display:flex; align-items:baseline; gap: 6px; }
.amt{ font-weight: 1000; }
.coin{ font-weight: 1000; opacity:.85; }
.b-bottom{ margin-top: 10px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
</style>
