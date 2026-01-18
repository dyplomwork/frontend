<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GamePageLayout from '../components/GamePageLayout.vue'
import BaseSelect from '../components/BaseSelect.vue'
import { api } from '../utils/api'
import { useAuthStore } from '../stores/auth'

type Role = 'user' | 'admin'

type AdminUser = {
  id: string
  nickname: string
  discord: string
  role: Role
  balance: number
}

type TicketStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type TicketType = 'DEPOSIT' | 'WITHDRAW'

type Ticket = {
  id: number
  ownerId: number
  type: TicketType
  amount: number
  status: TicketStatus
  closedAt?: string | null
  nickname?: string
  discord?: string
}


const tab = ref<'users' | 'tickets'>('users')

const users = ref<AdminUser[]>([])
const tickets = ref<Ticket[]>([])

const loadingUsers = ref(false)
const loadingTickets = ref(false)
const msg = ref('')
const auth = useAuthStore()

const err = ref('')

const qUsers = ref('')
const qTickets = ref('')

const pendingCount = computed(() => tickets.value.filter(t => t.status === 'PENDING').length)

const filteredUsers = computed(() => {
  const q = qUsers.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    (u.nickname || "").toLowerCase().includes(q) ||
    (u.discord || "").toLowerCase().includes(q) ||
    String(u.id).toLowerCase().includes(q) ||
    (u.role || "").toLowerCase().includes(q)
  )
})

const filteredTickets = computed(() => {
  const q = qTickets.value.trim().toLowerCase()
  if (!q) return tickets.value
  return tickets.value.filter(t =>
    String(t.id).toLowerCase().includes(q) ||
    String(t.ownerId).toLowerCase().includes(q) ||
    (t.nickname || '').toLowerCase().includes(q) ||
    (t.discord || '').toLowerCase().includes(q) ||
    t.type.toLowerCase().includes(q) ||
    t.status.toLowerCase().includes(q)
  )
})


// ==== Sorting ====
type SortDir = 'asc' | 'desc'

const sortUsersKey = ref<keyof AdminUser | ''>('')
const sortUsersDir = ref<SortDir>('asc')

const sortTicketsKey = ref<keyof Ticket | ''>('')
const sortTicketsDir = ref<SortDir>('asc')

function toggleSortUsers(key: keyof AdminUser) {
  if (sortUsersKey.value === key) sortUsersDir.value = sortUsersDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortUsersKey.value = key
    sortUsersDir.value = 'asc'
  }
}

function toggleSortTickets(key: keyof Ticket) {
  if (sortTicketsKey.value === key) sortTicketsDir.value = sortTicketsDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortTicketsKey.value = key
    sortTicketsDir.value = 'asc'
  }
}

function cmp(a: any, b: any) {
  // nulls/undefined last
  const an = a === null || a === undefined
  const bn = b === null || b === undefined
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1

  // numbers
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  const bothNumeric = Number.isFinite(na) && Number.isFinite(nb) && (typeof a === 'number' || typeof b === 'number' || /^[0-9.]+$/.test(String(a)) && /^[0-9.]+$/.test(String(b)))
  if (bothNumeric) return na - nb

  // strings
  const sa = String(a).toLowerCase()
  const sb = String(b).toLowerCase()
  return sa.localeCompare(sb)
}

function sortedBy<T extends object>(rows: T[], key: keyof T | '', dir: SortDir) {
  if (!key) return rows
  const sorted = [...rows].sort((ra: any, rb: any) => cmp(ra?.[key as any], rb?.[key as any]))
  return dir === 'asc' ? sorted : sorted.reverse()
}

const sortedUsers = computed(() => sortedBy(filteredUsers.value, sortUsersKey.value, sortUsersDir.value))
const sortedTickets = computed(() => sortedBy(filteredTickets.value, sortTicketsKey.value, sortTicketsDir.value))

function sortCaret(active: boolean, dir: SortDir) {
  if (!active) return '↕'
  return dir === 'asc' ? '↑' : '↓'
}

function thClass(active: boolean) {
  return ['th-sort', active ? 'is-active' : '']
}

const editingId = ref<string | null>(null)
const editNickname = ref('')
const editRole = ref<Role>('user')
const editBalance = ref<number>(0)

const roleOptions = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
] as const

function startEdit(u: AdminUser) {
  editingId.value = u.id
  editNickname.value = u.nickname
  editRole.value = u.role
  editBalance.value = Number(u.balance) || 0
  msg.value = ''
  err.value = ''
}

function cancelEdit() {
  editingId.value = null
}

async function loadUsers() {
  err.value = ''
  msg.value = ''
  loadingUsers.value = true
  try {
    const res = await api<{ ok: boolean; users: AdminUser[] }>('/api/v1/admin/users', { method: 'GET' })
    users.value = Array.isArray(res.users) ? res.users : []
  } catch (e: any) {
    err.value = e?.message || 'Не удалось загрузить пользователей'
  } finally {
    loadingUsers.value = false
  }
}

async function loadTickets() {
  err.value = ''
  msg.value = ''
  loadingTickets.value = true
  try {
    const res = await api<{ ok: boolean; ticket: Ticket[] }>('/api/v1/admin/tickets', { method: 'GET' })

    const list = Array.isArray(res.ticket) ? res.ticket : []

    // на всякий: нормализация чисел
    tickets.value = list.map((t: any) => ({
      ...t,
      id: Number(t.id),
      ownerId: Number(t.ownerId),
      amount: Number(t.amount),
      createdAt: t.createdAt ?? undefined,
    }))
  } catch (e: any) {
    err.value = e?.message || 'Не удалось загрузить тикеты'
  } finally {
    loadingTickets.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadUsers(), loadTickets()])
}

async function saveUser(id: string) {
  msg.value = ''
  err.value = ''

  const nickname = editNickname.value.trim()
  if (!nickname) {
    err.value = 'Никнейм не может быть пустым'
    return
  }
  const balance = Number(editBalance.value)
  if (!Number.isFinite(balance)) {
    err.value = 'Баланс должен быть числом'
    return
  }

  try {
    await api<{ ok: boolean; user: AdminUser }>(`/api/v1/admin/users/${id}`, {
      method: 'PATCH',
      body: { nickname, role: editRole.value, balance }
    })

    // update locally
    const idx = users.value.findIndex(u => u.id === id)
    if (idx !== -1) {
      users.value[idx] = { ...users.value[idx], nickname, role: editRole.value, balance }
    }

    editingId.value = null
    msg.value = 'Пользователь обновлён'
  } catch (e: any) {
    err.value = e?.message || 'Не удалось сохранить'
  }
}

async function deleteUser(id: string) {
  msg.value = ''
  err.value = ''
  if (!confirm('Удалить пользователя? Это действие нельзя отменить.')) return
  try {
    await api<{ ok: boolean }>(`/api/v1/admin/users/${id}`, { method: 'DELETE' })
    users.value = users.value.filter(u => u.id !== id)
    msg.value = 'Пользователь удалён'
    if (editingId.value === id) editingId.value = null
  } catch (e: any) {
    err.value = e?.message || 'Не удалось удалить'
  }
}

async function approveTicket(id: number) {
  msg.value = ''
  err.value = ''
  try {
    await api<void>(`/api/v1/admin/tickets/${id}`, {
      method: 'PATCH',
      body: { status: 'APPROVED' }
    })
    const t = tickets.value.find(x => x.id === Number(id))
    if (t) t.status = 'APPROVED'
    await auth.fetchBalance({ force: true }).catch(() => {})
    msg.value = 'Тикет подтверждён'
  } catch (e: any) {
    err.value = e?.message || 'Не удалось подтвердить тикет'
  }
}

async function rejectTicket(id: number) {
  msg.value = ''
  err.value = ''
  try {
    const note = prompt('Причина отклонения (необязательно):') ?? undefined
    await api<void>(`/api/v1/admin/tickets/${id}`, {
      method: 'PATCH',
      body: { status: 'REJECTED', note }
    })
    const t = tickets.value.find(x => x.id === Number(id))
    if (t) t.status = 'REJECTED'
    await auth.fetchBalance({ force: true }).catch(() => {})
    msg.value = 'Тикет отклонён'
  } catch (e: any) {
    err.value = e?.message || 'Не удалось отклонить тикет'
  }
}


onMounted(async () => {
  await refreshAll()
})
</script>

<template>
  <GamePageLayout :min-height="640">
    <div class="admin-wrap">
      <div class="admin-head card">
        <div class="row-between" style="gap:12px;">
          <div class="grid" style="gap:4px;">
            <h2 style="margin:0;">{{ $t('ui.s_a0e0d3f0c6') }}</h2>
            <div class="muted">{{ $t('ui.s_796e48762a') }} </div>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <button class="btn" @click="refreshAll" :disabled="loadingUsers || loadingTickets">Refresh</button>
            <span class="badge">pending tickets: {{ pendingCount }}</span>
          </div>
        </div>

        <div class="tabs" style="margin-top:12px;">
          <button class="tab" :class="{ on: tab === 'users' }" @click="tab = 'users'">
            Users <span class="pill">{{ users.length }}</span>
          </button>
          <button class="tab" :class="{ on: tab === 'tickets' }" @click="tab = 'tickets'">
            Tickets <span class="pill">{{ tickets.length }}</span>
          </button>
        </div>

        <div v-if="err" class="alert alert-err" style="margin-top:12px;">{{ err }}</div>
        <div v-else-if="msg" class="alert alert-ok" style="margin-top:12px;">{{ msg }}</div>
      </div>

      <!-- USERS -->
      <div v-if="tab === 'users'" class="card admin-card">
        <div class="row-between" style="gap:12px; flex-wrap:wrap;">
          <div class="row" style="gap:10px; align-items:center;">
            <b>{{ $t('ui.s_0d603cecbd') }}</b>
            <span v-if="loadingUsers" class="muted">{{ $t('ui.s_d8e058e700') }}</span>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <input class="input" v-model="qUsers" :placeholder="$t('ui.s_9db5fc32e4')" />
            <button class="btn" @click="loadUsers" :disabled="loadingUsers">Reload</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:12px;">
          <table class="table">
            <thead>
            <tr>
              <th style="width: 220px;" :class="thClass(sortUsersKey==='nickname')" @click="toggleSortUsers('nickname')">
                {{ $t('ui.s_8f9bfe9d13') }} <span class="caret">{{ sortCaret(sortUsersKey==='nickname', sortUsersDir) }}</span>
              </th>
              <th :class="thClass(sortUsersKey==='discord')" @click="toggleSortUsers('discord')">
                {{ $t('ui.s_8f5cc64306') }} <span class="caret">{{ sortCaret(sortUsersKey==='discord', sortUsersDir) }}</span>
              </th>
              <th style="width: 120px;" :class="thClass(sortUsersKey==='role')" @click="toggleSortUsers('role')">
                {{ $t('ui.s_bbbabdbe1b') }} <span class="caret">{{ sortCaret(sortUsersKey==='role', sortUsersDir) }}</span>
              </th>
              <th style="width: 160px; text-align:right;" :class="thClass(sortUsersKey==='balance')" @click="toggleSortUsers('balance')">
                {{ $t('ui.s_99a808d8d1') }} <span class="caret">{{ sortCaret(sortUsersKey==='balance', sortUsersDir) }}</span>
              </th>
              <th style="width: 260px; text-align:right;">{{ $t('ui.s_06df33001c') }}</th>
            </tr>
            </thead>

            <tbody>
            <tr v-for="u in sortedUsers" :key="u.id">
              <td>
                <div class="u-meta">
                  <div class="u-name">
                    <template v-if="editingId === u.id">
                      <input class="input input-sm" v-model="editNickname" />
                    </template>
                    <template v-else>
                      <b>{{ u.nickname }}</b>
                    </template>
                  </div>
                  <div class="muted u-id">#{{ String(u.id).slice(0, 8) }}</div>
                </div>
              </td>

              <td class="muted">
                <span>{{ u.discord }}</span>
              </td>

              <td>
                <template v-if="editingId === u.id">
                  <BaseSelect
                    class="input input-sm"
                    v-model="editRole"
                    :options="roleOptions as any"
                    aria-label="Role"
                  />
                </template>
                <template v-else>
                  <span class="badge">{{ u.role }}</span>
                </template>
              </td>

              <td style="text-align:right;">
                <template v-if="editingId === u.id">
                  <input class="input input-sm" type="number" step="0.01" v-model.number="editBalance" style="text-align:right;" />
                </template>
                <template v-else>
                  <span class="num">{{ Number(u.balance).toFixed(2) }}</span>
                </template>
              </td>

              <td style="text-align:right;">
                <div class="row" style="gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                  <template v-if="editingId === u.id">
                    <button class="btn btn-primary" @click="saveUser(u.id)">Save</button>
                    <button class="btn" @click="cancelEdit">Cancel</button>
                  </template>
                  <template v-else>
                    <button class="btn" @click="startEdit(u)">Edit</button>
                    <button class="btn btn-danger" @click="deleteUser(u.id)">Delete</button>
                  </template>
                </div>
              </td>
            </tr>

            <tr v-if="!loadingUsers && filteredUsers.length === 0">
              <td colspan="5" class="muted" style="padding:16px;">No users found.</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TICKETS -->
      <div v-else class="card admin-card">
        <div class="row-between" style="gap:12px; flex-wrap:wrap;">
          <div class="row" style="gap:10px; align-items:center;">
            <b>All tickets</b>
            <span class="badge">pending: {{ pendingCount }}</span>
            <span v-if="loadingTickets" class="muted">loading…</span>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <input class="input" v-model="qTickets" placeholder="Search: id / ownerId / status / type" />
            <button class="btn" @click="loadTickets" :disabled="loadingTickets">Reload</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:12px;">
          <table class="table">
            <thead>
            <tr>
              <th style="width: 220px;" :class="thClass(sortTicketsKey==='id')" @click="toggleSortTickets('id')">
                Ticket <span class="caret">{{ sortCaret(sortTicketsKey==='id', sortTicketsDir) }}</span>
              </th>
              <th style="width: 200px;" :class="thClass(sortTicketsKey==='nickname')" @click="toggleSortTickets('nickname')">
                User <span class="caret">{{ sortCaret(sortTicketsKey==='nickname', sortTicketsDir) }}</span>
              </th>
              <th style="width: 120px;" :class="thClass(sortTicketsKey==='type')" @click="toggleSortTickets('type')">
                Type <span class="caret">{{ sortCaret(sortTicketsKey==='type', sortTicketsDir) }}</span>
              </th>
              <th style="width: 140px; text-align:right;" :class="thClass(sortTicketsKey==='amount')" @click="toggleSortTickets('amount')">
                Amount <span class="caret">{{ sortCaret(sortTicketsKey==='amount', sortTicketsDir) }}</span>
              </th>
              <th style="width: 140px;" :class="thClass(sortTicketsKey==='status')" @click="toggleSortTickets('status')">
                Status <span class="caret">{{ sortCaret(sortTicketsKey==='status', sortTicketsDir) }}</span>
              </th>
              <th style="width: 260px; text-align:right;">Actions</th>
            </tr>
            </thead>

            <tbody>
            <tr v-for="t in sortedTickets" :key="t.id">
              <td>
                <div class="u-meta">
                  <div class="u-name"><b>#{{ String(t.id).slice(0, 8) }}</b></div>
                  <div class="muted u-id">
                    {{ t.closedAt ? new Date(t.closedAt).toLocaleString() : '—' }}
                  </div>
                </div>
              </td>

              <td class="muted">
                <div class="grid" style="gap:2px;">
                  <span>#{{ String(t.ownerId).slice(0, 8) }}</span>
                  <span v-if="t.nickname">{{ t.nickname }}</span>
                </div>
              </td>

              <td>
                <span class="badge">{{ t.type }}</span>
              </td>

              <td style="text-align:right;">
                <span class="num">{{ Number(t.amount).toFixed(2) }}</span>
              </td>

              <td>
                <span class="badge" :class="'st-' + String(t.status).toLowerCase()">{{ t.status }}</span>
              </td>

              <td style="text-align:right;">
                <div class="row" style="gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                  <button
                    class="btn btn-primary"
                    @click="approveTicket(t.id)"
                    :disabled="t.status !== 'PENDING' || loadingTickets"
                  >
                    Approve
                  </button>
                  <button
                    class="btn btn-danger"
                    @click="rejectTicket(t.id)"
                    :disabled="t.status !== 'PENDING' || loadingTickets"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!loadingTickets && filteredTickets.length === 0">
              <td colspan="6" class="muted" style="padding:16px;">No tickets found.</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </GamePageLayout>
</template>

<style scoped>
.admin-wrap{
  width: min(1150px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 16px;
}

.admin-head{
  border-radius: 18px;
  padding: 14px;
  background:
    radial-gradient(560px 220px at 20% 0%, rgba(58,145,255,.18), rgba(0,0,0,0)),
    radial-gradient(460px 180px at 80% 0%, rgba(0,231,1,.10), rgba(0,0,0,0));
  border: 1px solid rgba(255,255,255,.08);
}

.admin-card{
  border-radius: 18px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.06);
}

.tabs{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.tab{
  display:flex;
  align-items:center;
  gap:10px;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.18);
  color: rgba(255,255,255,.9);
  cursor:pointer;
  font-weight: 900;
}
.tab.on{
  background: rgba(58,145,255,.18);
  border-color: rgba(58,145,255,.28);
  box-shadow: 0 0 0 1px rgba(0,0,0,.2), 0 10px 22px rgba(0,0,0,.28);
}
.pill{
  font-size: 12px;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.22);
  color: rgba(255,255,255,.86);
}

.alert{
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.18);
  white-space: normal;
}
.alert-err{
  border-color: rgba(248,81,73,.35);
  background: rgba(248,81,73,.10);
}
.alert-ok{
  border-color: rgba(34,197,94,.35);
  background: rgba(34,197,94,.10);
}

.table-wrap{
  overflow:auto;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.06);
  background: rgba(0,0,0,.14);
}
.table{
  width:100%;
  border-collapse: collapse;
  min-width: 860px;
}
.table thead th{
  text-align:left;
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(255,255,255,.70);
  padding: 12px 12px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  background: rgba(0,0,0,.18);
  position: sticky;
  top: 0;
  z-index: 1;
}
.table tbody td{
  padding: 12px 12px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  vertical-align: middle;
}
.table tbody tr:hover td{
  background: rgba(255,255,255,.03);
}
.u-meta{ display:flex; flex-direction:column; gap:2px; }
.u-name{ display:flex; align-items:center; gap:8px; }
.u-id{ font-size: 12px; }

.input-sm{
  padding: 8px 10px;
  border-radius: 12px;
  min-height: 34px;
}

.num{
  font-weight: 900;
  color: rgba(255,255,255,.92);
}

.btn-danger{
  border-color: rgba(248,81,73,.35);
  background: rgba(248,81,73,.10);
}
.btn-danger:hover{
  background: rgba(248,81,73,.16);
}

.st-pending{ border-color: rgba(250,204,21,.45); background: rgba(250,204,21,.10); }
.st-approved{ border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.10); }
.st-rejected{ border-color: rgba(248,81,73,.45); background: rgba(248,81,73,.10); }


/* sortable headers */
.th-sort{
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.th-sort .caret{
  display: inline-block;
  margin-left: 6px;
  font-weight: 900;
  opacity: .45;
  transform: translateY(-1px);
}
.th-sort.is-active .caret{ opacity: .95; }
.th-sort:hover .caret{ opacity: .85; }

@media (max-width: 900px){
  .table{ min-width: 760px; }
}

</style>
