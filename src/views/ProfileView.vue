<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTicketsStore } from '../stores/tickets'
import { useUiStore } from '../stores/ui'
import { formatNumber } from '../utils/format'
import { api } from '../utils/api'

const auth = useAuthStore()
const ticketsStore = useTicketsStore()
const ui = useUiStore()
const router = useRouter()
const { t, locale } = useI18n()

const stats = ref<any>(null)
const achievements = ref<any[]>([])
const statsLoading = ref(false)

const RARITY_KEY: Record<string, string> = {
  common: 's_rarity_common', uncommon: 's_rarity_uncommon',
  rare: 's_rarity_rare', epic: 's_rarity_epic',
  legendary: 's_rarity_legendary', mythic: 's_rarity_mythic',
}
const ACH_COLORS: Record<string, string> = {
  common: '#9ca3af', uncommon: '#34d399', rare: '#3b82f6',
  epic: '#a855f7', legendary: '#f59e0b', mythic: '#ec4899',
}
function achName(a: any) { return locale.value === 'ua' ? a.nameUa : a.name }
function achDesc(a: any) { return locale.value === 'ua' ? a.descUa : a.desc }
function rarityLabel(r: string) { return t(`ui.${RARITY_KEY[r] ?? 's_rarity_common'}`) }
const editingNick = ref(false)
const newNickname = ref('')
const nickMsg = ref('')
const nickLoading = ref(false)

async function saveNickname() {
  if (!newNickname.value.trim()) return
  nickLoading.value = true
  nickMsg.value = ''
  try {
    const res = await api<any>('/api/v1/accounts/users/me', {
      method: 'PATCH', json: true, body: { nickname: newNickname.value.trim() }
    })
    auth.user = res.user
    nickMsg.value = '✓'
    editingNick.value = false
  } catch (e: any) {
    nickMsg.value = e?.message ?? t('ui.s_error')
  } finally {
    nickLoading.value = false
  }
}

// Avatar editing
const editingAvatar = ref(false)
const newAvatarUrl = ref('')
const avatarMsg = ref('')
const avatarLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function startAvatarEdit() {
  newAvatarUrl.value = auth.user?.avatar_url ?? ''
  avatarMsg.value = ''
  editingAvatar.value = true
}

async function saveAvatar() {
  avatarLoading.value = true
  avatarMsg.value = ''
  try {
    const res = await api<any>('/api/v1/accounts/users/me', {
      method: 'PATCH', json: true, body: { avatar_url: newAvatarUrl.value.trim() || null }
    })
    auth.user = res.user
    editingAvatar.value = false
  } catch (e: any) {
    avatarMsg.value = e?.message ?? 'Помилка'
  } finally {
    avatarLoading.value = false
  }
}

function clearAvatar() {
  newAvatarUrl.value = ''
}

function pickFile() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    avatarMsg.value = 'Оберіть зображення (jpg, png, webp…)'
    return
  }
  avatarMsg.value = ''

  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 256
      let { width, height } = img
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      newAvatarUrl.value = canvas.toDataURL('image/jpeg', 0.88)
    }
    img.src = ev.target!.result as string
  }
  reader.readAsDataURL(file)

  // reset input so same file can be picked again
  ;(e.target as HTMLInputElement).value = ''
}

const fmt = (v: number | string, d = 2) => formatNumber(v, d)

const GAME_LABELS: Record<string,{ua:string,en:string}> = {
  dice:     { ua: 'Кості', en: 'Dice' },
  roulette: { ua: 'Рулетка', en: 'Roulette' },
  mines:    { ua: 'Міни', en: 'Mines' },
  plinko:   { ua: 'Плінко', en: 'Plinko' },
  cases:    { ua: 'Кейси', en: 'Cases' },
  battles:  { ua: 'Коїнфліп', en: 'CoinFlip' },
}
function gameLabel(key: string) {
  const g = GAME_LABELS[key]
  return g ? (locale.value === 'ua' ? g.ua : g.en) : key
}

async function loadStats() {
  if (!auth.user) return
  statsLoading.value = true
  try {
    const res = await api<any>('/api/v1/stats/me', { method: 'GET' })
    stats.value = res.stats
    achievements.value = res.achievements ?? []
  } catch {}
  finally { statsLoading.value = false }
}

// ── Deposit / withdraw tickets ─────────────────────────────────────────────
const ticketAmount = ref<number | null>(null)
const ticketBusy = ref(false)
const pendingCount = computed(() => ticketsStore.mine.filter((tk) => tk.status === 'PENDING').length)

async function submitTicket(type: 'DEPOSIT' | 'WITHDRAW') {
  const amt = Number(ticketAmount.value)
  if (!Number.isFinite(amt) || amt <= 0) {
    ui.toast(t('ui.s_ticket_amount'), 'error')
    return
  }
  ticketBusy.value = true
  try {
    await ticketsStore.create(type, amt)
    ui.toast(type === 'DEPOSIT' ? t('ui.s_ticket_deposit_sent') : t('ui.s_ticket_withdraw_sent'), 'success')
    ticketAmount.value = null
    // WITHDRAW reserves funds immediately on the server — refresh the balance.
    if (type === 'WITHDRAW') void auth.fetchBalance({ force: true })
  } catch (e: any) {
    ui.toast(e?.message ?? t('ui.s_ticket_create_failed'), 'error')
  } finally {
    ticketBusy.value = false
  }
}

function ticketStatusLabel(s: string) {
  if (s === 'APPROVED') return t('ui.s_ticket_status_approved')
  if (s === 'REJECTED') return t('ui.s_ticket_status_rejected')
  return t('ui.s_ticket_status_pending')
}

function loadAll() {
  loadStats()
  if (auth.user) ticketsStore.fetchMine()
}

onMounted(loadAll)
watch(() => auth.user?.id, (v) => { if (v) loadAll() })
</script>

<template>
  <div class="profile-grid">
    <div v-if="!auth.user" class="card muted" style="padding:24px; text-align:center;">
      {{ $t('ui.s_profile_no_auth') }}
    </div>

    <template v-else>
      <!-- User info card -->
      <div class="card user-card">
        <div class="user-head">
          <div class="user-avatar" @click="startAvatarEdit" title="Змінити фото">
            <img v-if="auth.user.avatar_url" :src="auth.user.avatar_url" class="avatar-img" alt="Avatar" @error="($event.target as HTMLImageElement).style.display='none'" />
            <span v-else>{{ auth.user.nickname.slice(0,2).toUpperCase() }}</span>
            <div class="avatar-edit-overlay">✏️</div>
          </div>

          <div class="user-info">
            <div class="user-nick-row">
              <template v-if="editingNick">
                <input class="input nick-input" v-model="newNickname" @keyup.enter="saveNickname" @keyup.esc="editingNick=false" maxlength="50" />
                <button class="btn btn-primary btn-sm" @click="saveNickname" :disabled="nickLoading">✓</button>
                <button class="btn btn-sm" @click="editingNick=false">✕</button>
              </template>
              <template v-else>
                <div class="user-nick">{{ auth.user.nickname }}</div>
                <button class="btn btn-sm edit-nick-btn" @click="() => { editingNick=true; newNickname=auth.user!.nickname }">✏️</button>
              </template>
            </div>
            <div v-if="nickMsg" class="nick-msg muted small">{{ nickMsg }}</div>
            <div class="role-badge" :class="'role-' + auth.user.role">{{ auth.user.role }}</div>
          </div>
          <div class="balance-big">
            <div class="muted small">{{ $t('ui.s_99a808d8d1') }}</div>
            <div class="balance-val">{{ fmt(auth.user.balance) }} <span class="coin-unit">K</span></div>
          </div>
        </div>
      </div>

      <!-- Avatar edit modal (fixed overlay) -->
      <div v-if="editingAvatar" class="avatar-modal-backdrop" @click.self="editingAvatar=false">
        <div class="avatar-modal">
          <div class="avatar-modal-title">Фото профілю</div>

          <!-- Preview -->
          <div class="avatar-preview-wrap">
            <div class="avatar-preview">
              <img v-if="newAvatarUrl" :src="newAvatarUrl" alt="Preview" class="avatar-img" @error="($event.target as HTMLImageElement).style.display='none'" />
              <span v-else>{{ auth.user.nickname.slice(0,2).toUpperCase() }}</span>
            </div>
          </div>

          <!-- Upload from PC -->
          <button class="btn btn-upload" @click="pickFile" style="margin-top:14px; width:100%;">
            📁 Завантажити з ПК
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            style="display:none"
            @change="handleFileChange"
          />

          <!-- OR divider -->
          <div class="avatar-divider">або вставте URL</div>

          <!-- URL input -->
          <input class="input" v-model="newAvatarUrl" placeholder="https://example.com/photo.jpg" />

          <div v-if="avatarMsg" class="muted small" style="color:#f87171; margin-top:6px;">{{ avatarMsg }}</div>

          <div class="avatar-modal-btns">
            <button class="btn btn-sm" @click="clearAvatar">🗑 Видалити</button>
            <button class="btn btn-sm" @click="editingAvatar=false">Скасувати</button>
            <button class="btn btn-primary btn-sm" @click="saveAvatar" :disabled="avatarLoading">
              {{ avatarLoading ? '…' : '✓ Зберегти' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Stats card -->
      <div class="card stats-card">
        <div class="row-between">
          <h3 style="margin:0">{{ $t('ui.s_stats') }}</h3>
          <button class="btn" @click="loadStats" :disabled="statsLoading">↻</button>
        </div>

        <div v-if="statsLoading" class="muted" style="margin-top:12px;">{{ $t('ui.s_43e40d49fd') }}</div>
        <div v-else-if="!stats || stats.totalGames === 0" class="muted" style="margin-top:12px;">{{ $t('ui.s_stats_none') }}</div>
        <div v-else>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_total_games') }}</div>
              <div class="stat-num">{{ stats.totalGames }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_wagered') }}</div>
              <div class="stat-num">{{ fmt(stats.totalWagered) }} K</div>
            </div>
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_won') }}</div>
              <div class="stat-num">{{ fmt(stats.totalWon) }} K</div>
            </div>
            <div class="stat-box" :class="stats.netProfit >= 0 ? 'positive' : 'negative'">
              <div class="stat-label muted">{{ $t('ui.s_stats_profit') }}</div>
              <div class="stat-num">{{ stats.netProfit >= 0 ? '+' : '' }}{{ fmt(stats.netProfit) }} K</div>
            </div>
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_biggest_win') }}</div>
              <div class="stat-num gold">{{ fmt(stats.biggestWin) }} K</div>
            </div>
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_favorite') }}</div>
              <div class="stat-num">{{ stats.favoriteGame ? gameLabel(stats.favoriteGame) : '—' }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label muted">{{ $t('ui.s_stats_items') }}</div>
              <div class="stat-num">{{ stats.totalItems }}</div>
            </div>
          </div>

          <!-- Per-game breakdown -->
          <div v-if="Object.keys(stats.byGame).length" style="margin-top:16px;">
            <div class="section-title muted small">{{ $t('ui.s_stats_by_game') }}</div>
            <div class="by-game-list">
              <div v-for="(gs, key) in stats.byGame" :key="key" class="game-row">
                <span class="game-name">{{ gameLabel(String(key)) }}</span>
                <span class="game-detail muted small">{{ gs.gamesPlayed }} {{ $t('ui.s_stats_games') }}</span>
                <span class="game-detail muted small">{{ fmt(gs.totalWagered) }} K</span>
                <span class="game-best" :class="gs.biggestWin > 0 ? 'gold' : 'muted'">⭐ {{ fmt(gs.biggestWin) }} K</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Achievements -->
      <div class="card ach-section">
        <h3 style="margin:0 0 14px">🏅 {{ $t('ui.s_achievements') }}</h3>
        <div v-if="statsLoading" class="muted small">{{ $t('ui.s_43e40d49fd') }}</div>
        <div v-else-if="!achievements.length" class="ach-empty muted">{{ $t('ui.s_ach_none') }}</div>
        <div v-else class="ach-grid">
          <div
            v-for="a in achievements"
            :key="a.id"
            class="ach-card"
            :style="{ '--ac': ACH_COLORS[a.rarity] ?? '#9ca3af' }"
          >
            <div class="ach-icon">{{ a.icon }}</div>
            <div class="ach-info">
              <div class="ach-name" :style="{ color: ACH_COLORS[a.rarity] }">{{ achName(a) }}</div>
              <div class="ach-desc muted small">{{ achDesc(a) }}</div>
              <div class="ach-rarity small" :style="{ color: ACH_COLORS[a.rarity] }">{{ rarityLabel(a.rarity) }}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- Deposit / withdraw tickets -->
      <div class="card topup-section">
        <div class="row-between">
          <h3 style="margin:0">💳 {{ $t('ui.s_ticket_deposit') }} / {{ $t('ui.s_ticket_withdraw') }}</h3>
          <span v-if="pendingCount" class="muted small">{{ $t('ui.s_ticket_pending', { n: pendingCount }) }}</span>
        </div>
        <div class="muted small topup-hint">
          {{ $t('ui.s_457727a7c0') }} {{ $t('ui.s_30b0348a35') }}.
          <a class="topup-link" @click="router.push('/donate')">💎 Google Pay →</a>
        </div>
        <div class="topup-form">
          <input class="input" type="number" min="1" v-model.number="ticketAmount" :placeholder="$t('ui.s_ticket_amount')" />
          <button class="btn btn-primary" :disabled="ticketBusy" @click="submitTicket('DEPOSIT')">{{ $t('ui.s_ticket_deposit') }}</button>
          <button class="btn" :disabled="ticketBusy" @click="submitTicket('WITHDRAW')">{{ $t('ui.s_ticket_withdraw') }}</button>
        </div>
        <div class="topup-list">
          <div v-if="!ticketsStore.mine.length" class="muted small">{{ $t('ui.s_c7a9d14173') }}</div>
          <div v-for="tk in ticketsStore.mine" :key="tk.id" class="topup-row">
            <span class="tk-type" :class="tk.type === 'DEPOSIT' ? 'tk-dep' : 'tk-wd'">
              {{ tk.type === 'DEPOSIT' ? $t('ui.s_ticket_deposit') : $t('ui.s_ticket_withdraw') }}
            </span>
            <span class="tk-amt">{{ fmt(tk.amount) }} K</span>
            <span class="tk-status" :class="'tks-' + tk.status.toLowerCase()">{{ ticketStatusLabel(tk.status) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-grid { display: grid; gap: 16px; }
@media (min-width: 860px) {
  .profile-grid {
    grid-template-columns: 300px 1fr;
    grid-template-areas:
      "user  stats"
      "ach   ach"
      "topup topup";
  }
  .user-card  { grid-area: user; }
  .stats-card { grid-area: stats; }
  .ach-section { grid-area: ach; }
  .topup-section { grid-area: topup; }
}
.topup-section { border-radius: 18px; padding: 18px; }
.topup-hint { margin-top: 6px; }
.topup-link { color: #ffd54a; cursor: pointer; font-weight: 700; }
.topup-link:hover { text-decoration: underline; }
.topup-form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.topup-form .input { flex: 1; min-width: 140px; }
.topup-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.topup-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.tk-type { font-weight: 800; font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.tk-dep { background: rgba(34,197,94,.15); color: #34d399; }
.tk-wd { background: rgba(248,81,73,.12); color: #f87171; }
.tk-amt { font-weight: 900; min-width: 110px; }
.tk-status { font-size: 12px; font-weight: 700; }
.tks-pending { color: #fbbf24; }
.tks-approved { color: #34d399; }
.tks-rejected { color: #f87171; }
.small { font-size: 12px; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

.user-card { border-radius: 18px; padding: 18px; }
.user-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.user-avatar {
  width: 64px; height: 64px; border-radius: 999px;
  background: linear-gradient(135deg, rgba(255,178,74,.35), rgba(255,178,74,.15));
  border: 2px solid rgba(255,178,74,.4);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 20px; letter-spacing: 1px;
  flex-shrink: 0;
  position: relative; overflow: hidden;
  cursor: pointer; transition: border-color 150ms;
}
.user-avatar:hover { border-color: rgba(255,178,74,.8); }
.user-avatar:hover .avatar-edit-overlay { opacity: 1; }
.avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 999px; }
.avatar-edit-overlay {
  position: absolute; inset: 0; border-radius: 999px;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; opacity: 0; transition: opacity 150ms;
}

/* Avatar modal */
.avatar-modal-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.avatar-modal {
  background: #1a1a2e; border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px; padding: 24px; width: min(400px, 100%);
  display: flex; flex-direction: column; gap: 0;
}
.avatar-modal-title { font-size: 16px; font-weight: 800; margin-bottom: 16px; }
.avatar-preview-wrap { display: flex; justify-content: center; }
.avatar-preview {
  width: 96px; height: 96px; border-radius: 999px;
  background: linear-gradient(135deg, rgba(255,178,74,.35), rgba(255,178,74,.15));
  border: 2px solid rgba(255,178,74,.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 800; overflow: hidden;
}
.btn-upload {
  border: 1px dashed rgba(255,255,255,.25);
  background: rgba(255,255,255,.04);
  border-radius: 12px; height: 40px;
  font-size: 13px; font-weight: 700;
  transition: background 120ms, border-color 120ms;
}
.btn-upload:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.45); }
.avatar-divider {
  display: flex; align-items: center; gap: 10px;
  color: var(--muted); font-size: 12px; margin: 10px 0 6px;
}
.avatar-divider::before, .avatar-divider::after {
  content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.1);
}
.avatar-modal-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; flex-wrap: wrap; }
.user-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.user-nick-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.user-nick { font-weight: 1000; font-size: 18px; }
.nick-input { height: 34px; border-radius: 10px; padding: 0 10px; font-size: 14px; }
.btn-sm { height: 30px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
.edit-nick-btn { opacity: .6; }
.edit-nick-btn:hover { opacity: 1; }
.nick-msg { margin-top: 2px; }
.role-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); width: fit-content; }
.role-admin { border-color: rgba(255,59,87,.4); background: rgba(255,59,87,.12); color: rgba(255,120,120,.9); }
.balance-big { text-align: right; }
.balance-val { font-size: 22px; font-weight: 1000; }
.coin-unit { opacity: .85; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-top: 14px; }
.stat-box { border: 1px solid rgba(255,255,255,.06); background: rgba(0,0,0,.18); border-radius: 14px; padding: 12px; }
.stat-box.positive { border-color: rgba(34,197,94,.25); background: rgba(34,197,94,.06); }
.stat-box.negative { border-color: rgba(248,81,73,.25); background: rgba(248,81,73,.06); }
.stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
.stat-num { font-weight: 1000; font-size: 17px; }
.gold { color: #ffd700; }

.section-title { text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.by-game-list { display: flex; flex-direction: column; gap: 6px; }
.game-row {
  display: grid; grid-template-columns: 1fr auto auto auto;
  align-items: center; gap: 12px;
  border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 10px 12px;
  background: rgba(0,0,0,.14);
}
.game-name { font-weight: 900; font-size: 14px; }
.game-detail { white-space: nowrap; }
.game-best { font-weight: 900; font-size: 13px; white-space: nowrap; }

.ach-empty { padding: 8px 0; font-size: 14px; }
.ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.ach-card {
  display: flex; align-items: center; gap: 14px;
  border: 1px solid color-mix(in srgb, var(--ac) 25%, transparent);
  background: color-mix(in srgb, var(--ac) 6%, rgba(0,0,0,.18));
  border-radius: 14px; padding: 14px;
  transition: transform 100ms;
}
.ach-card:hover { transform: translateY(-2px); }
.ach-icon { font-size: 36px; flex-shrink: 0; filter: drop-shadow(0 3px 8px rgba(0,0,0,.5)); }
.ach-info { display: flex; flex-direction: column; gap: 3px; }
.ach-name { font-weight: 900; font-size: 14px; }
.ach-desc { font-size: 12px; }
.ach-rarity { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .4px; }

@media (max-width: 600px) {
  .user-head { flex-direction: column; align-items: flex-start; gap: 12px; }
  .balance-big { text-align: left; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .game-row { grid-template-columns: 1fr auto auto; }
  .game-row .game-detail:last-of-type { display: none; }
  .ach-grid { grid-template-columns: 1fr; }
}
@media (max-width: 400px) {
  .stats-grid { grid-template-columns: 1fr; }
}
</style>
