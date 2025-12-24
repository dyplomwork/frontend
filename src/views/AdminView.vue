<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTicketsStore } from '../stores/tickets'

type AdminUser = {
  id: string
  nickname: string
  discord: string
  role: 'user'|'admin'
  balance: number
}

const auth = useAuthStore()
const tickets = useTicketsStore()

const users = ref<AdminUser[]>([])
const message = ref('')
const ticketMsg = ref('')

async function api(path: string, body?: any){
  const token = localStorage.getItem('casino_sim_token_v1')
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type':'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(()=> ({}))
  if(!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)
  return data
}

const can = computed(() => auth.isAdmin)
const pendingTickets = computed(() => tickets.admin.filter(t => t.status === 'pending'))

onMounted(async () => {
  if(!auth.isAdmin){
    window.location.href = '/'
    return
  }
  await reload()
  await tickets.fetchAdmin().catch(()=>{})
})

async function reload(){
  message.value = ''
  try{
    const res = await api('/api/admin/users')
    users.value = res.users
  }catch(e:any){
    message.value = e?.message || 'Ошибка'
  }
}

async function setBalance(u: AdminUser, value: number){
  message.value = ''
  try{
    await api(`/api/admin/users/${u.id}/balance`, { value })
    await reload()
    await auth.refreshMe()
  }catch(e:any){
    message.value = e?.message || 'Ошибка'
  }
}

async function toggleAdmin(u: AdminUser){
  const nextRole = u.role === 'admin' ? 'user' : 'admin'
  message.value = ''
  try{
    await api(`/api/admin/users/${u.id}/role`, { role: nextRole })
    await reload()
  }catch(e:any){
    message.value = e?.message || 'Ошибка'
  }
}

async function approveTicket(id: string){
  ticketMsg.value = ''
  try{
    await tickets.approve(id)
    await reload()
    await auth.refreshMe()
  }catch(e:any){
    ticketMsg.value = e?.message || 'Ошибка'
  }
}
async function rejectTicket(id: string){
  ticketMsg.value = ''
  try{
    await tickets.reject(id, 'Rejected by admin')
    await tickets.fetchAdmin()
  }catch(e:any){
    ticketMsg.value = e?.message || 'Ошибка'
  }
}
</script>

<template>
  <div class="admin-shell">
    <div class="admin-main grid" style="gap:16px;">
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0;">Admin</h2>
          <div class="row" style="gap:8px;">
            <button class="btn" @click="reload">Reload users</button>
            <button class="btn" @click="tickets.fetchAdmin()">Reload tickets</button>
          </div>
        </div>

        <p class="muted" style="margin-top:8px;">
          Управление пользователями (баланс/роль). Тикеты обрабатываются справа.
        </p>

        <div v-if="message" class="badge" style="border-color: rgba(248,81,73,.6); background: rgba(248,81,73,.12); white-space:normal;">
          {{ message }}
        </div>

        <div class="grid" style="gap:10px; margin-top:12px;">
          <div v-for="u in users" :key="u.id" class="card2 row-between" style="gap:12px;">
            <div class="grid" style="gap:4px;">
              <b>{{ u.nickname }}</b>
              <span class="muted">{{ u.discord }}</span>
              <span class="badge">role: {{ u.role }}</span>
            </div>

            <div class="row" style="gap:8px; flex-wrap:wrap;">
              <span class="badge">balance: {{ u.balance }}</span>
              <button class="btn" @click="setBalance(u, u.balance + 100)">+100</button>
              <button class="btn" @click="setBalance(u, u.balance - 100)">-100</button>
              <button class="btn btn-primary" @click="toggleAdmin(u)">{{ u.role === 'admin' ? 'Revoke admin' : 'Make admin' }}</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!can" class="card">
        Доступ запрещён.
      </div>
    </div>

    <!-- Right ticket panel -->
    <aside class="admin-side">
      <div class="side-card">
        <div class="row-between" style="gap:10px;">
          <b>Tickets</b>
          <span class="badge">pending: {{ pendingTickets.length }}</span>
        </div>
        <div v-if="ticketMsg" class="badge" style="margin-top:10px; border-color: rgba(248,81,73,.6); background: rgba(248,81,73,.12); white-space:normal;">
          {{ ticketMsg }}
        </div>

        <div v-if="tickets.admin.length === 0" class="muted" style="margin-top:12px;">Нет тикетов.</div>

        <div class="ticket-list">
          <div v-for="t in tickets.admin" :key="t.id" class="ticket" :class="'st-' + t.status">
            <div class="row-between" style="gap:8px;">
              <b>#{{ t.id.slice(0,6) }}</b>
              <span class="badge">{{ t.status }}</span>
            </div>
            <div class="muted" style="margin-top:4px;">
              {{ t.nickname }} • {{ t.type === 'deposit' ? 'deposit' : 'withdraw' }} • {{ t.amount }}
            </div>
            <div class="muted" style="margin-top:4px; font-size:12px;">
              {{ new Date(t.createdAt).toLocaleString() }}
            </div>

            <div class="row" style="gap:8px; margin-top:10px; flex-wrap:wrap;">
              <button class="btn btn-primary" @click="approveTicket(t.id)" :disabled="t.status !== 'pending'">Approve</button>
              <button class="btn" @click="rejectTicket(t.id)" :disabled="t.status !== 'pending'">Reject</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.admin-shell{
  display:grid;
  grid-template-columns: 1fr 340px;
  gap:16px;
  align-items:start;
}
.admin-side{
  position: sticky;
  top: 16px;
}
.side-card{
  border:1px solid #232a3b;
  border-radius: 18px;
  padding: 14px;
  background: linear-gradient(180deg, rgba(18,22,32,.92), rgba(11,13,18,.92));
  box-shadow: 0 18px 44px rgba(0,0,0,.35);
}
.ticket-list{ display:grid; gap:10px; margin-top:12px; max-height: calc(100vh - 180px); overflow:auto; padding-right:6px; }
.ticket{
  border:1px solid #2b3247;
  border-radius: 16px;
  padding: 10px;
  background: radial-gradient(140px 110px at 35% 25%, rgba(58,74,138,.18), rgba(0,0,0,0));
}
.st-pending{ border-color: rgba(250,204,21,.45); }
.st-approved{ border-color: rgba(34,197,94,.45); }
.st-rejected{ border-color: rgba(248,81,73,.45); }

@media (max-width: 980px){
  .admin-shell{ grid-template-columns: 1fr; }
  .admin-side{ position: static; }
}
</style>
