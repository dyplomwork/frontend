<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../utils/api'
import { useAuthStore } from '../stores/auth'
import { formatNumber } from '../utils/format'

const { t, locale } = useI18n()
const auth = useAuthStore()

const tab = ref<'dashboard' | 'users' | 'battles' | 'games' | 'drops' | 'audit' | 'donations'>('dashboard')
const loading = ref(false)
const globalMsg = ref('')
const globalMsgType = ref<'ok'|'err'>('ok')

const dashboard = ref<any>(null)
const users = ref<any[]>([])
const meta = ref<{ achievements: any[]; items: any[] }>({ achievements: [], items: [] })
const battles = ref<any[]>([])
const battlesLoading = ref(false)
const analytics = ref<any>(null)
const analyticsLoading = ref(false)
const auditLog = ref<any[]>([])
const auditLoading = ref(false)
const donations = ref<{ summary: any; donations: any[] } | null>(null)
const donationsLoading = ref(false)

const searchUsers = ref('')
const filterRole = ref('')
const filterStatus = ref('')
const userPage = ref(1)
const userPageSize = 20
const userTotal = ref(0)
const expandedUser = ref<string | null>(null)
const userDetail = ref<any>(null)
const userDetailLoading = ref(false)

const pendingAction = ref<{ kind: 'delete' | 'ban'; id: string; nick: string } | null>(null)
const pendingReason = ref('')
const pendingBusy = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(userTotal.value / userPageSize)))

const giveAmount = ref(0)
const giveItemDef = ref('')
const giveAchId = ref('')
const giveClickerCoins = ref(0)
const giveBusy = ref(false)

const editNick = ref('')
const editRole = ref<'user'|'admin'>('user')
const editBalance = ref(0)
const editBusy = ref(false)

const fmt = (v: number, d = 2) => formatNumber(v, d)
const fmt0 = (v: number) => formatNumber(v, 0)

function showMsg(text: string, type: 'ok'|'err' = 'ok') {
  globalMsg.value = text; globalMsgType.value = type
  setTimeout(() => { globalMsg.value = '' }, 3000)
}

async function loadDashboard() {
  try {
    const res = await api<any>('/api/v1/admin/dashboard', { method: 'GET' })
    dashboard.value = res.dashboard
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
}

async function loadUsers() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (searchUsers.value.trim()) params.set('search', searchUsers.value.trim())
    if (filterRole.value) params.set('role', filterRole.value)
    if (filterStatus.value) params.set('status', filterStatus.value)
    params.set('page', String(userPage.value))
    params.set('pageSize', String(userPageSize))
    const res = await api<any>(`/api/v1/admin/users?${params.toString()}`, { method: 'GET' })
    users.value = res.users ?? []
    userTotal.value = res.total ?? users.value.length
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { loading.value = false }
}

function applyUserFilters() {
  userPage.value = 1
  loadUsers()
}
function changePage(delta: number) {
  const next = userPage.value + delta
  if (next < 1 || next > totalPages.value) return
  userPage.value = next
  loadUsers()
}

async function loadMeta() {
  try {
    const res = await api<any>('/api/v1/admin/meta', { method: 'GET' })
    meta.value = res
  } catch {}
}

async function refreshAll() {
  await Promise.all([loadDashboard(), loadUsers(), loadMeta()])
}

onMounted(refreshAll)

async function toggleUser(id: string) {
  if (expandedUser.value === id) { expandedUser.value = null; userDetail.value = null; return }
  expandedUser.value = id
  userDetailLoading.value = true
  userDetail.value = null
  try {
    const res = await api<any>(`/api/v1/admin/users/${id}`, { method: 'GET' })
    userDetail.value = res
    const u = res.user
    editNick.value = u.nickname
    editRole.value = u.role
    editBalance.value = u.balance
    giveAmount.value = 1000
    giveItemDef.value = meta.value.items[0]?.id ?? ''
    giveAchId.value = meta.value.achievements[0]?.id ?? ''
    giveClickerCoins.value = 1000
  } catch {}
  finally { userDetailLoading.value = false }
}

async function saveUser(id: string) {
  editBusy.value = true
  try {
    await api(`/api/v1/admin/users/${id}`, { method: 'PATCH', json: true, body: { nickname: editNick.value, role: editRole.value, balance: editBalance.value } })
    await loadUsers()
    showMsg('User saved ✓')
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { editBusy.value = false }
}

async function giveBalance(id: string) {
  if (!giveAmount.value) return
  giveBusy.value = true
  try {
    const res = await api<any>(`/api/v1/admin/users/${id}/give-balance`, { method: 'POST', json: true, body: { amount: giveAmount.value } })
    editBalance.value = res.balance
    await loadUsers()
    showMsg(`Balance updated → ${fmt(res.balance)} K`)
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { giveBusy.value = false }
}

async function giveItem(id: string) {
  if (!giveItemDef.value) return
  giveBusy.value = true
  try {
    await api(`/api/v1/admin/users/${id}/give-item`, { method: 'POST', json: true, body: { itemDefId: giveItemDef.value } })
    showMsg('Item given ✓')
    await toggleUser(id); await toggleUser(id)
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { giveBusy.value = false }
}

async function giveClicker(id: string) {
  if (!giveClickerCoins.value) return
  giveBusy.value = true
  try {
    const res = await api<any>(`/api/v1/admin/users/${id}/give-clicker-coins`, { method: 'POST', json: true, body: { amount: giveClickerCoins.value } })
    showMsg(`Clicker coins: ${fmt0(res.coins)} 🪙`)
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { giveBusy.value = false }
}

async function giveAchievement(id: string) {
  if (!giveAchId.value) return
  giveBusy.value = true
  try {
    await api(`/api/v1/admin/users/${id}/give-achievement`, { method: 'POST', json: true, body: { achievementId: giveAchId.value } })
    showMsg('Achievement granted ✓')
    await toggleUser(id); await toggleUser(id)
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { giveBusy.value = false }
}

async function revokeAchievement(userId: string, achId: string) {
  try {
    await api(`/api/v1/admin/users/${userId}/achievement/${achId}`, { method: 'DELETE' })
    showMsg('Achievement revoked')
    await toggleUser(userId); await toggleUser(userId)
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
}

function askConfirm(kind: 'delete' | 'ban', id: string, nick: string) {
  pendingAction.value = { kind, id, nick }
  pendingReason.value = ''
}
async function runPendingAction() {
  const a = pendingAction.value
  if (!a) return
  pendingBusy.value = true
  try {
    if (a.kind === 'delete') {
      await api(`/api/v1/admin/users/${a.id}`, { method: 'DELETE' })
      if (expandedUser.value === a.id) { expandedUser.value = null; userDetail.value = null }
      showMsg('User deleted')
    } else {
      await api(`/api/v1/admin/users/${a.id}/ban`, { method: 'POST', json: true, body: { reason: pendingReason.value } })
      showMsg(`Banned ${a.nick}`)
    }
    pendingAction.value = null
    await loadUsers()
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { pendingBusy.value = false }
}

async function unbanUser(id: string, nick: string) {
  try {
    await api(`/api/v1/admin/users/${id}/unban`, { method: 'POST', json: true, body: {} })
    showMsg(`Unbanned ${nick}`)
    await loadUsers()
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
}

async function loadAudit() {
  auditLoading.value = true
  try {
    const res = await api<any>('/api/v1/admin/audit?limit=200', { method: 'GET' })
    auditLog.value = res.actions ?? []
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { auditLoading.value = false }
}
async function loadDonations() {
  donationsLoading.value = true
  try {
    donations.value = await api<any>('/api/v1/admin/donations?limit=200', { method: 'GET' })
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { donationsLoading.value = false }
}

async function loadBattles() {
  battlesLoading.value = true
  try {
    const res = await api<any[]>('/api/v1/battles/history?limit=100', { method: 'GET' })
    battles.value = Array.isArray(res) ? res : []
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { battlesLoading.value = false }
}

async function loadAnalytics() {
  if (analytics.value) return
  analyticsLoading.value = true
  try {
    const res = await api<any>('/api/v1/admin/analytics', { method: 'GET' })
    analytics.value = res.analytics
  } catch (e: any) { showMsg(e?.message ?? 'Error', 'err') }
  finally { analyticsLoading.value = false }
}

const GAME_LABELS: Record<string, string> = {
  dice: 'Dice', roulette: 'Roulette', mines: 'Mines',
  plinko: 'Plinko', coinflip: 'Coin Flip', cases: 'Cases',
}
function gameLabel(k: string) { return GAME_LABELS[k] ?? k }

function rarityColor(r: string) {
  const m: Record<string,string> = { common:'#9ca3af', uncommon:'#34d399', rare:'#3b82f6', epic:'#a855f7', legendary:'#f59e0b', mythic:'#ec4899' }
  return m[r] ?? '#9ca3af'
}
function achDef(id: string) { return meta.value.achievements.find(a => a.id === id) ?? { icon: '🏅', name: id, rarity: 'common' } }
function itemDef(id: string) { return meta.value.items.find(i => i.id === id) ?? { icon: '📦', name: id, rarity: 'common' } }
</script>

<template>
  <div v-if="!auth.isAdmin" style="padding:40px;text-align:center;color:rgba(255,59,87,.9);font-weight:900;">
    403 — Access Denied
  </div>
  <div v-else class="admin-shell">
    <nav class="admin-nav">
      <div class="admin-logo">⚙️ ADMIN</div>
      <button class="nav-btn" :class="{ on: tab==='dashboard' }" @click="tab='dashboard'">
        <span>📊</span> Dashboard
      </button>
      <button class="nav-btn" :class="{ on: tab==='users' }" @click="tab='users'; loadUsers()">
        <span>👥</span> Users <span class="nav-badge">{{ users.length }}</span>
      </button>
      <button class="nav-btn" :class="{ on: tab==='battles' }" @click="tab='battles'; loadBattles()">
        <span>🪙</span> CoinFlip History
      </button>
      <button class="nav-btn" :class="{ on: tab==='games' }" @click="tab='games'; loadAnalytics()">
        <span>🎮</span> Game Stats
      </button>
      <button class="nav-btn" :class="{ on: tab==='drops' }" @click="tab='drops'; loadAnalytics()">
        <span>🎁</span> Drops
      </button>
      <button class="nav-btn" :class="{ on: tab==='donations' }" @click="tab='donations'; loadDonations()">
        <span>💳</span> Donations
      </button>
      <button class="nav-btn" :class="{ on: tab==='audit' }" @click="tab='audit'; loadAudit()">
        <span>📋</span> Audit Log
      </button>
      <div class="nav-spacer" />
      <button class="nav-btn refresh-btn" @click="refreshAll" :disabled="loading">
        <span>↻</span> Refresh
      </button>
    </nav>

    <div class="admin-content">
      <div v-if="globalMsg" class="global-msg" :class="globalMsgType">{{ globalMsg }}</div>

      <div v-if="tab === 'dashboard'" class="dash-grid">
        <template v-if="dashboard">
          <div class="stat-card blue">
            <div class="sc-icon">👥</div>
            <div class="sc-num">{{ dashboard.totalUsers }}</div>
            <div class="sc-lbl">Total Users</div>
          </div>
          <div class="stat-card orange">
            <div class="sc-icon">📦</div>
            <div class="sc-num">{{ dashboard.totalItems ?? 0 }}</div>
            <div class="sc-lbl">Items in Economy</div>
          </div>
          <div class="stat-card gold">
            <div class="sc-icon">💰</div>
            <div class="sc-num">{{ fmt(dashboard.totalWagered, 0) }}</div>
            <div class="sc-lbl">Total Wagered (K)</div>
          </div>
          <div class="stat-card green">
            <div class="sc-icon">🏆</div>
            <div class="sc-num">{{ fmt(dashboard.biggestWin, 0) }}</div>
            <div class="sc-lbl">Biggest Win Ever (K)</div>
          </div>

          <div class="dash-card top-balances">
            <div class="dc-title">💎 Top Balances</div>
            <div v-for="(u, i) in dashboard.topBalance" :key="u.nickname" class="top-row">
              <span class="top-rank">#{{ i+1 }}</span>
              <span class="top-nick">{{ u.nickname }}</span>
              <span class="top-bal">{{ fmt(u.balance) }} K</span>
            </div>
          </div>

          <div class="dash-card quick-actions">
            <div class="dc-title">⚡ Quick Actions</div>
            <button class="btn btn-primary qa-btn" @click="tab='users'; loadUsers()">
              Manage {{ dashboard.totalUsers }} Users
            </button>
            <button class="btn qa-btn" @click="refreshAll">
              ↻ Refresh All Stats
            </button>
          </div>

          <div class="dash-card">
            <div class="dc-title">📈 Economy</div>
            <div class="eco-row"><span class="muted">Wagered</span><span>{{ fmt(dashboard.totalWagered, 0) }} K</span></div>
            <div class="eco-row"><span class="muted">Won back</span><span>{{ fmt(dashboard.totalWon, 0) }} K</span></div>
            <div class="eco-row"><span class="muted">House kept</span>
              <span :style="{ color: '#34d399' }">{{ fmt(dashboard.totalWagered - dashboard.totalWon, 0) }} K</span>
            </div>
          </div>
        </template>
        <div v-else class="muted">Loading dashboard…</div>
      </div>

      <!-- ╔═ USERS ══════════════════════════════════════════════════════╗ -->
      <div v-if="tab === 'users'" class="users-panel">
        <div class="panel-head">
          <h2 class="panel-title">Users ({{ userTotal }})</h2>
          <div class="user-filters">
            <input class="input search-input" v-model="searchUsers" placeholder="Search nickname…" @keyup.enter="applyUserFilters" />
            <select class="input" v-model="filterRole" @change="applyUserFilters">
              <option value="">All roles</option>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <select class="input" v-model="filterStatus" @change="applyUserFilters">
              <option value="">All statuses</option>
              <option value="active">active</option>
              <option value="banned">banned</option>
            </select>
            <button class="btn btn-sm" @click="applyUserFilters">Search</button>
          </div>
        </div>

        <div v-if="loading" class="muted pad">Loading…</div>
        <div v-else class="users-list">
          <div v-for="u in users" :key="u.id" class="user-row" :class="{ 'row-banned': u.status === 'banned' }">
            <!-- Row header -->
            <div class="ur-head" @click="toggleUser(u.id)">
              <div class="ur-left">
                <span class="ur-expand">{{ expandedUser === u.id ? '▼' : '▶' }}</span>
                <div class="ur-avatar">{{ u.nickname.slice(0,2).toUpperCase() }}</div>
                <div class="ur-info">
                  <span class="ur-nick">{{ u.nickname }}</span>
                </div>
              </div>
              <div class="ur-right">
                <span v-if="u.status === 'banned'" class="ban-tag" :title="u.banReason || ''">BANNED</span>
                <span class="role-tag" :class="'role-' + u.role">{{ u.role }}</span>
                <span class="ur-bal">{{ fmt(u.balance) }} K</span>
                <span class="ur-items muted small">📦 {{ u.itemCount }}</span>
                <button v-if="u.status === 'banned'" class="btn btn-xs btn-approve" @click.stop="unbanUser(u.id, u.nickname)" title="Unban">⊘</button>
                <button v-else-if="u.id !== auth.user?.id" class="btn btn-xs" @click.stop="askConfirm('ban', u.id, u.nickname)" title="Ban">🚫</button>
                <button class="btn btn-danger btn-xs" @click.stop="askConfirm('delete', u.id, u.nickname)">🗑</button>
              </div>
            </div>

            <!-- Expanded detail -->
            <div v-if="expandedUser === u.id" class="ur-detail">
              <div v-if="userDetailLoading" class="muted small pad">Loading details…</div>

              <div v-else-if="userDetail" class="detail-grid">

                <!-- Edit profile -->
                <div class="detail-card">
                  <div class="dc-title">✏️ Edit Profile</div>
                  <div class="form-row">
                    <label class="form-label">Nickname</label>
                    <input class="input input-sm" v-model="editNick" maxlength="50" />
                  </div>
                  <div class="form-row">
                    <label class="form-label">Role</label>
                    <select class="input input-sm" v-model="editRole">
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div class="form-row">
                    <label class="form-label">Balance (K)</label>
                    <input class="input input-sm" type="number" v-model.number="editBalance" min="0" />
                  </div>
                  <button class="btn btn-primary btn-sm mt-8" @click="saveUser(u.id)" :disabled="editBusy">
                    Save Changes
                  </button>
                </div>

                <!-- Give K-coins -->
                <div class="detail-card">
                  <div class="dc-title">💰 Give / Take K-coins</div>
                  <div class="give-row">
                    <input class="input input-sm" type="number" v-model.number="giveAmount" placeholder="Amount (can be negative)" />
                    <button class="btn btn-primary btn-sm" @click="giveBalance(u.id)" :disabled="giveBusy">Give</button>
                  </div>
                  <div class="muted small mt-4">Current: {{ fmt(userDetail.user.balance) }} K</div>

                  <div class="dc-title mt-12">🪙 Give Clicker Coins</div>
                  <div class="give-row">
                    <input class="input input-sm" type="number" v-model.number="giveClickerCoins" min="1" />
                    <button class="btn btn-primary btn-sm" @click="giveClicker(u.id)" :disabled="giveBusy">Give</button>
                  </div>
                  <div class="muted small mt-4">
                    Current: {{ userDetail.clicker ? fmt0(userDetail.clicker.coins) : 0 }} 🪙
                  </div>
                </div>

                <!-- Give item -->
                <div class="detail-card">
                  <div class="dc-title">📦 Give Item</div>
                  <div class="give-row">
                    <select class="input input-sm" v-model="giveItemDef">
                      <option v-for="item in meta.items" :key="item.id" :value="item.id">
                        {{ item.icon }} {{ item.name }} ({{ item.rarity }})
                      </option>
                    </select>
                    <button class="btn btn-primary btn-sm" @click="giveItem(u.id)" :disabled="giveBusy">Give</button>
                  </div>

                  <div class="dc-title mt-12">Inventory Summary</div>
                  <div class="inv-mini" v-if="userDetail.inventory.length">
                    <div v-for="inv in userDetail.inventory" :key="inv.itemDefId" class="inv-mini-row">
                      <span>{{ itemDef(inv.itemDefId).icon }} {{ itemDef(inv.itemDefId).name }}</span>
                      <span class="muted small">×{{ inv.count }}</span>
                    </div>
                  </div>
                  <div v-else class="muted small">No items</div>
                </div>

                <!-- Achievements -->
                <div class="detail-card">
                  <div class="dc-title">🏅 Grant Achievement</div>
                  <div class="give-row">
                    <select class="input input-sm" v-model="giveAchId">
                      <option v-for="a in meta.achievements" :key="a.id" :value="a.id">
                        {{ a.icon }} {{ a.name }}
                      </option>
                    </select>
                    <button class="btn btn-primary btn-sm" @click="giveAchievement(u.id)" :disabled="giveBusy">Grant</button>
                  </div>

                  <div class="ach-mini" v-if="userDetail.achievements.length">
                    <div v-for="rawAch in userDetail.achievements" :key="typeof rawAch === 'string' ? rawAch : rawAch.id" class="ach-mini-row">
                      <template v-if="typeof rawAch === 'string'">
                        <span :style="{ color: rarityColor(achDef(rawAch).rarity) }">
                          {{ achDef(rawAch).icon }} {{ achDef(rawAch).name }}
                        </span>
                        <button class="btn btn-xs btn-danger" @click="revokeAchievement(u.id, rawAch)">✕</button>
                      </template>
                      <template v-else>
                        <span :style="{ color: rarityColor(rawAch.rarity) }">
                          {{ rawAch.icon }} {{ rawAch.nameUa || rawAch.name }}
                          <span v-if="!rawAch.manual" class="ach-auto-tag">auto</span>
                        </span>
                        <button v-if="rawAch.manual" class="btn btn-xs btn-danger" @click="revokeAchievement(u.id, rawAch.id)">✕</button>
                      </template>
                    </div>
                  </div>
                  <div v-else class="muted small">No achievements</div>
                </div>

                <!-- Stats -->
                <div class="detail-card detail-wide">
                  <div class="dc-title">📊 Game Stats</div>
                  <div v-if="userDetail.stats.length" class="stats-mini">
                    <div class="stats-mini-head">
                      <span>Game</span><span>Played</span><span>Wagered</span><span>Won</span><span>Best</span>
                    </div>
                    <div v-for="s in userDetail.stats" :key="s.gameType" class="stats-mini-row">
                      <span class="game-name">{{ s.gameType }}</span>
                      <span>{{ s.gamesPlayed }}</span>
                      <span>{{ fmt(s.totalWagered, 0) }} K</span>
                      <span>{{ fmt(s.totalWon, 0) }} K</span>
                      <span class="gold">{{ fmt(s.biggestWin, 0) }} K</span>
                    </div>
                  </div>
                  <div v-else class="muted small">No game history</div>

                  <div v-if="userDetail.clicker" class="clicker-mini mt-8">
                    <span class="muted small">🪙 Clicker: {{ fmt0(userDetail.clicker.coins) }} coins • {{ userDetail.clicker.clickPower }}/click • {{ userDetail.clicker.autoPower }}/sec</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="users.length === 0" class="muted pad">No users found.</div>
        </div>

        <div v-if="!loading && userTotal > userPageSize" class="pager">
          <button class="btn btn-sm" :disabled="userPage <= 1" @click="changePage(-1)">← Prev</button>
          <span class="muted small">Page {{ userPage }} / {{ totalPages }}</span>
          <button class="btn btn-sm" :disabled="userPage >= totalPages" @click="changePage(1)">Next →</button>
        </div>
      </div>

      <!-- ╔═ BATTLES HISTORY ═══════════════════════════════════════════╗ -->
      <div v-if="tab === 'battles'">
        <div class="dash-card" style="grid-column:unset">
          <div class="row-between" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div class="dc-title">🪙 CoinFlip History</div>
            <button class="btn btn-sm" @click="loadBattles" :disabled="battlesLoading">↻ Refresh</button>
          </div>

          <div v-if="battlesLoading" class="muted small">Loading…</div>
          <div v-else-if="!battles.length" class="muted small">No finished battles yet.</div>
          <div v-else class="battles-table-wrap">
            <table class="battles-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Amount</th>
                  <th>Creator</th>
                  <th>Joiner</th>
                  <th>Result</th>
                  <th>Winner</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in battles" :key="b.id">
                  <td class="muted small">{{ i + 1 }}</td>
                  <td class="gold">{{ fmt(b.amount * 2, 0) }} K</td>
                  <td>{{ b.creatorNick }}</td>
                  <td>{{ b.joinerNick ?? '—' }}</td>
                  <td><span class="side-badge" :class="b.resultSide">{{ b.resultSide ?? '—' }}</span></td>
                  <td :class="{ 'gold': !!b.winnerId }">
                    {{ b.winnerId === b.creatorId ? b.creatorNick : b.joinerNick ?? '—' }}
                  </td>
                  <td class="muted small">{{ b.updatedAt ? new Date(b.updatedAt).toLocaleString('uk') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ╔═ GAME STATS (per-game analytics) ═══════════════════════════╗ -->
      <div v-if="tab === 'games'">
        <div class="dash-card" style="grid-column:unset">
          <div class="row-between" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div class="dc-title">🎮 Game Statistics</div>
            <button class="btn btn-sm" @click="analytics = null; loadAnalytics()" :disabled="analyticsLoading">↻ Refresh</button>
          </div>

          <div v-if="analyticsLoading" class="muted small">Loading…</div>
          <div v-else-if="!analytics || !analytics.byGame.length" class="muted small">No game data yet.</div>
          <div v-else class="battles-table-wrap">
            <table class="battles-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Rounds</th>
                  <th>Wagered</th>
                  <th>Paid out</th>
                  <th>House profit</th>
                  <th>RTP</th>
                  <th>Biggest win</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in analytics.byGame" :key="g.gameType">
                  <td class="game-name">{{ gameLabel(g.gameType) }}</td>
                  <td>{{ fmt0(g.games) }}</td>
                  <td>{{ fmt0(g.wagered) }} K</td>
                  <td>{{ fmt0(g.won) }} K</td>
                  <td :class="g.profit >= 0 ? 'gold' : ''">{{ g.profit >= 0 ? '+' : '' }}{{ fmt0(g.profit) }} K</td>
                  <td>{{ g.rtp }}%</td>
                  <td class="gold">{{ fmt0(g.biggest) }} K</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ╔═ DROPS (item rarity distribution) ══════════════════════════╗ -->
      <div v-if="tab === 'drops'">
        <div class="dash-card" style="grid-column:unset">
          <div class="row-between" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div class="dc-title">🎁 Item Drops — {{ analytics ? fmt0(analytics.totalItems) : 0 }} total</div>
            <button class="btn btn-sm" @click="analytics = null; loadAnalytics()" :disabled="analyticsLoading">↻ Refresh</button>
          </div>

          <div v-if="analyticsLoading" class="muted small">Loading…</div>
          <div v-else-if="!analytics" class="muted small">No drop data yet.</div>
          <template v-else>
            <div class="rarity-bars">
              <div v-for="r in analytics.byRarity" :key="r.rarity" class="rarity-row">
                <span class="rarity-name" :style="{ color: rarityColor(r.rarity) }">{{ r.rarity }}</span>
                <div class="rarity-track">
                  <div class="rarity-fill" :style="{ width: r.percent + '%', background: rarityColor(r.rarity) }"></div>
                </div>
                <span class="rarity-val">{{ fmt0(r.count) }} ({{ r.percent }}%)</span>
              </div>
            </div>

            <div class="dc-title" style="margin:18px 0 10px; font-size:14px;">Most dropped items</div>
            <div class="top-items">
              <div v-for="it in analytics.topItems" :key="it.itemDefId" class="top-item">
                <span class="ti-icon">{{ it.icon }}</span>
                <span class="ti-name" :style="{ color: rarityColor(it.rarity) }">{{ it.name }}</span>
                <span class="ti-count">{{ fmt0(it.count) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ╔═ DONATIONS / REVENUE ═══════════════════════════════════════╗ -->
      <div v-if="tab === 'donations'">
        <div class="dash-card" style="grid-column:unset">
          <div class="row-between" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div class="dc-title">💳 Donations
              <span v-if="donations" class="muted small" style="font-weight:600;">
                — ${{ fmt(donations.summary.revenueUsd) }} from {{ donations.summary.count }} payments ({{ fmt0(donations.summary.coinsCredited) }} K credited)
              </span>
            </div>
            <button class="btn btn-sm" @click="loadDonations" :disabled="donationsLoading">↻ Refresh</button>
          </div>

          <div v-if="donationsLoading" class="muted small">Loading…</div>
          <div v-else-if="!donations || !donations.donations.length" class="muted small">No donations yet.</div>
          <div v-else class="battles-table-wrap">
            <table class="battles-table">
              <thead>
                <tr><th>User</th><th>Package</th><th>Amount</th><th>Coins</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in donations.donations" :key="d.id">
                  <td>{{ d.nickname }}</td>
                  <td>{{ d.packageId }}</td>
                  <td>${{ d.amountUsd.toFixed(2) }}</td>
                  <td class="gold">{{ fmt0(d.coinsCredited) }} K</td>
                  <td>{{ d.status }}</td>
                  <td class="muted small">{{ new Date(d.createdAt).toLocaleString('uk') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ╔═ AUDIT LOG ═════════════════════════════════════════════════╗ -->
      <div v-if="tab === 'audit'">
        <div class="dash-card" style="grid-column:unset">
          <div class="row-between" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div class="dc-title">📋 Admin Audit Log</div>
            <button class="btn btn-sm" @click="loadAudit" :disabled="auditLoading">↻ Refresh</button>
          </div>

          <div v-if="auditLoading" class="muted small">Loading…</div>
          <div v-else-if="!auditLog.length" class="muted small">No actions recorded yet.</div>
          <div v-else class="battles-table-wrap">
            <table class="battles-table">
              <thead>
                <tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th><th>Reason</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in auditLog" :key="a.id">
                  <td class="muted small">{{ new Date(a.createdAt).toLocaleString('uk') }}</td>
                  <td>{{ a.adminNick }}</td>
                  <td><span class="audit-action">{{ a.action }}</span></td>
                  <td>{{ a.targetNick ?? '—' }}</td>
                  <td class="muted small">{{ a.details ? JSON.stringify(a.details) : '—' }}</td>
                  <td class="muted small">{{ a.reason ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- Confirmation modal (delete / ban) -->
    <div v-if="pendingAction" class="modal-backdrop" @click.self="pendingAction = null">
      <div class="modal-box card">
        <h3 style="margin:0 0 10px">
          {{ pendingAction.kind === 'delete' ? '🗑 Delete user' : '🚫 Ban user' }} «{{ pendingAction.nick }}»?
        </h3>
        <p v-if="pendingAction.kind === 'delete'" class="muted small" style="margin:0 0 12px">
          This permanently removes the account and all its data. Cannot be undone.
        </p>
        <template v-else>
          <p class="muted small" style="margin:0 0 8px">The user is logged out immediately and cannot sign in until unbanned.</p>
          <input class="input" v-model="pendingReason" placeholder="Reason (optional)" style="width:100%; margin-bottom:12px" />
        </template>
        <div class="row" style="display:flex; gap:10px; justify-content:flex-end;">
          <button class="btn" @click="pendingAction = null">Cancel</button>
          <button class="btn btn-danger" :disabled="pendingBusy" @click="runPendingAction">
            {{ pendingBusy ? '…' : (pendingAction.kind === 'delete' ? 'Delete' : 'Ban') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  height: calc(100vh - 64px);
  overflow: hidden;
}

.admin-nav {
  background: rgba(0,0,0,.35);
  border-right: 1px solid rgba(255,255,255,.06);
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}
.admin-logo {
  font-size: 15px; font-weight: 1000; letter-spacing: .5px;
  padding: 0 8px 14px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  margin-bottom: 6px;
  color: #ffb24a;
}
.nav-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 12px;
  border: 1px solid transparent;
  background: transparent; color: rgba(255,255,255,.75);
  cursor: pointer; font-size: 13px; font-weight: 900;
  transition: all .15s;
}
.nav-btn:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.08); color: #fff; }
.nav-btn.on { background: rgba(255,178,74,.14); border-color: rgba(255,178,74,.28); color: #fff; }
.nav-badge {
  margin-left: auto; padding: 2px 8px; border-radius: 999px;
  background: rgba(255,255,255,.10); font-size: 11px;
}
.nav-badge.pending { background: rgba(250,204,21,.25); color: #fcd34d; }
.nav-spacer { flex: 1; }
.refresh-btn { opacity: .7; }
.refresh-btn:hover { opacity: 1; }

.admin-content {
  overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 14px;
}

.global-msg {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
  z-index: 9999; padding: 10px 28px; border-radius: 12px;
  font-size: 13px; font-weight: 900; border: 1px solid;
  white-space: nowrap; box-shadow: 0 8px 32px rgba(0,0,0,.45);
  pointer-events: none;
}
.global-msg.ok { border-color: rgba(34,197,94,.5); background: rgba(10,40,20,.95); color: #4ade80; }
.global-msg.err { border-color: rgba(248,81,73,.5); background: rgba(40,10,10,.95); color: #f87171; }

select.input {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1L6 7L11 1' stroke='rgba(255,255,255,0.45)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 30px;
  cursor: pointer;
}
select.input option {
  background: #1a1a2e;
  color: #fff;
  padding: 6px 10px;
}

.muted { color: rgba(255,255,255,.6); }
.small { font-size: 12px; }
.pad { padding: 16px; }
.mt-4 { margin-top: 4px; }
.mt-8 { margin-top: 8px; }
.mt-12 { margin-top: 12px; }
.gold { color: #ffd700; font-weight: 900; }

.dash-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 1200px) { .dash-grid { grid-template-columns: repeat(2, 1fr); } }

.stat-card {
  border-radius: 16px; padding: 18px;
  border: 1px solid rgba(255,255,255,.06);
  display: flex; flex-direction: column; gap: 6px;
  background: rgba(0,0,0,.2);
}
.stat-card.blue { border-color: rgba(59,130,246,.3); box-shadow: 0 0 20px rgba(59,130,246,.08); }
.stat-card.orange { border-color: rgba(251,146,60,.3); box-shadow: 0 0 20px rgba(251,146,60,.08); }
.stat-card.gold { border-color: rgba(255,210,80,.3); box-shadow: 0 0 20px rgba(255,210,80,.08); }
.stat-card.green { border-color: rgba(34,197,94,.3); box-shadow: 0 0 20px rgba(34,197,94,.08); }
.sc-icon { font-size: 28px; }
.sc-num { font-size: 26px; font-weight: 1000; }
.sc-lbl { font-size: 12px; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .4px; }

.dash-card {
  background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.06);
  border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px;
  grid-column: span 2;
}
.dc-title { font-weight: 1000; font-size: 14px; margin-bottom: 4px; }
.top-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.top-rank { width: 24px; font-weight: 900; color: #ffd700; }
.top-nick { flex: 1; font-weight: 900; }
.top-bal { font-weight: 900; color: #ffd700; }
.qa-btn { width: 100%; height: 42px; border-radius: 12px; margin-top: 4px; }
.eco-row { display: flex; justify-content: space-between; font-size: 13px; }

.panel-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 4px;
}
.panel-title { font-size: 18px; font-weight: 1000; margin: 0; display: flex; align-items: center; gap: 10px; }
.pending-badge { padding: 4px 12px; border-radius: 999px; background: rgba(250,204,21,.2); border: 1px solid rgba(250,204,21,.4); font-size: 12px; font-weight: 900; color: #fcd34d; }
.search-input { flex: 1; min-width: 200px; max-width: 400px; }

.users-list { display: flex; flex-direction: column; gap: 6px; }
.user-row { border: 1px solid rgba(255,255,255,.06); border-radius: 14px; overflow: hidden; }
.ur-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; cursor: pointer;
  background: rgba(0,0,0,.15);
  transition: background .12s;
}
.ur-head:hover { background: rgba(255,255,255,.04); }
.ur-left { display: flex; align-items: center; gap: 10px; }
.ur-right { display: flex; align-items: center; gap: 10px; }
.ur-expand { font-size: 11px; color: rgba(255,255,255,.4); width: 14px; }
.ur-avatar {
  width: 34px; height: 34px; border-radius: 999px;
  background: rgba(255,178,74,.2); border: 1px solid rgba(255,178,74,.3);
  display: grid; place-items: center; font-weight: 1000; font-size: 12px;
  flex-shrink: 0;
}
.ur-info { display: flex; flex-direction: column; gap: 1px; }
.ur-nick { font-weight: 900; font-size: 14px; }
.ur-bal { font-weight: 900; }
.ur-items { }
.role-tag { padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .4px; }
.role-tag.role-admin { background: rgba(255,59,87,.15); border: 1px solid rgba(255,59,87,.3); color: #f87171; }
.role-tag.role-user { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); }
.btn-xs { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
.btn-sm { height: 34px; padding: 0 12px; border-radius: 10px; font-size: 12px; }
.btn-danger { border-color: rgba(248,81,73,.35); background: rgba(248,81,73,.10); color: #f87171; }
.btn-danger:hover { background: rgba(248,81,73,.20); }
.btn-approve { border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.12); color: #34d399; }
.btn-approve:hover { background: rgba(34,197,94,.22); }

.user-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.user-filters .input { height: 34px; }
.row-banned { opacity: .75; }
.ban-tag { font-size: 10px; font-weight: 900; letter-spacing: .5px; padding: 2px 7px; border-radius: 999px; background: rgba(248,81,73,.18); color: #f87171; border: 1px solid rgba(248,81,73,.4); }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px; }
.audit-action { font-weight: 800; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,.08); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 300; }
.modal-box { width: min(420px, 92vw); padding: 22px; border-radius: 16px; }

.ur-detail { padding: 14px; border-top: 1px solid rgba(255,255,255,.05); background: rgba(0,0,0,.12); }
.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (max-width: 1000px) { .detail-grid { grid-template-columns: 1fr; } }
.detail-card { background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.06); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.detail-wide { grid-column: span 2; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-label { font-size: 11px; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .4px; }
.input-sm { height: 36px; font-size: 13px; }
.give-row { display: flex; gap: 8px; }
.give-row .input-sm { flex: 1; }
.inv-mini { display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; }
.inv-mini-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.ach-mini { display: flex; flex-direction: column; gap: 4px; }
.ach-mini-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.ach-auto-tag { font-size: 10px; opacity: .5; padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,.15); margin-left: 4px; }
.stats-mini { display: grid; gap: 4px; font-size: 12px; }
.stats-mini-head { display: grid; grid-template-columns: 1fr 60px 90px 90px 90px; color: rgba(255,255,255,.4); font-size: 11px; text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,.06); }
.stats-mini-row { display: grid; grid-template-columns: 1fr 60px 90px 90px 90px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.game-name { font-weight: 900; text-transform: capitalize; }
.clicker-mini { border-top: 1px solid rgba(255,255,255,.06); padding-top: 8px; }

.rarity-bars { display: flex; flex-direction: column; gap: 8px; }
.rarity-row { display: grid; grid-template-columns: 90px 1fr 120px; align-items: center; gap: 12px; }
.rarity-name { font-weight: 900; text-transform: capitalize; font-size: 13px; }
.rarity-track { height: 14px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden; }
.rarity-fill { height: 100%; border-radius: 999px; min-width: 2px; transition: width .3s; }
.rarity-val { text-align: right; font-size: 12px; color: rgba(255,255,255,.7); }
.top-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.top-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(0,0,0,.15); border: 1px solid rgba(255,255,255,.06); }
.ti-icon { font-size: 20px; }
.ti-name { font-weight: 800; flex: 1; }
.ti-count { font-weight: 900; color: rgba(255,255,255,.85); }

@media (max-width: 720px) {
  .admin-shell { grid-template-columns: 1fr; height: auto; overflow: visible; }
  .admin-nav {
    flex-direction: row; flex-wrap: wrap; gap: 4px;
    padding: 10px; border-right: none;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .admin-logo { display: none; }
  .nav-btn { padding: 8px 10px; font-size: 12px; flex: 0 0 auto; }
  .nav-spacer, .refresh-btn { display: none; }
  .admin-content { padding: 10px; }
  .dash-grid { grid-template-columns: repeat(2, 1fr); }
  .detail-grid { grid-template-columns: 1fr; }
  .detail-wide { grid-column: span 1; }
  .ur-row { flex-wrap: wrap; gap: 6px; }
  .stats-mini-head, .stats-mini-row { grid-template-columns: 1fr 50px 70px 70px 70px; }
}
@media (max-width: 480px) {
  .dash-grid { grid-template-columns: 1fr; }
  .search-row { flex-direction: column; gap: 8px; }
  .search-input { max-width: 100%; }
  .stats-mini-head { display: none; }
  .stats-mini-row { grid-template-columns: 1fr auto auto; }
  .rarity-row { grid-template-columns: 60px 1fr 78px; gap: 8px; }
  .rarity-name { font-size: 11px; }
  .top-items { grid-template-columns: 1fr; }
}

.battles-table-wrap { overflow-x: auto; }
.battles-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.battles-table th {
  text-align: left; padding: 8px 12px;
  font-size: 11px; text-transform: uppercase; letter-spacing: .4px;
  color: rgba(255,255,255,.45); font-weight: 900;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.battles-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.battles-table tr:last-child td { border-bottom: none; }
.battles-table tr:hover td { background: rgba(255,255,255,.03); }
.side-badge {
  display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 900; text-transform: uppercase;
}
.side-badge.heads { background: rgba(255,178,74,.15); color: #ffb24a; border: 1px solid rgba(255,178,74,.3); }
.side-badge.tails { background: rgba(59,130,246,.15); color: #60a5fa; border: 1px solid rgba(59,130,246,.3); }
</style>
