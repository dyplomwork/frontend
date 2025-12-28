<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTicketsStore } from '../stores/tickets'

const auth = useAuthStore()
const tickets = useTicketsStore()

const amount = ref<number>(100)
const amount2 = ref<number>(100)
const message = ref('')

const loading = computed(() => tickets.loading)
const mineSafe = computed(() => tickets.mine ?? [])
const pending = computed(() => mineSafe.value.filter(t => t.status === 'pending'))



async function loadMineSafe(){
  // грузим только когда есть вход
  if(!auth.isAuthed) return
  try{
    await tickets.fetchMine()
  }catch{
    // ignore
  }
}

onMounted(async () => {
  // если user уже есть — грузим сразу
  await loadMineSafe()
})

// если auth поднимется позже (init/login), мы догрузим тикеты
watch(
  () => auth.isAuthed,
  async (v) => {
    if(v) await loadMineSafe()
  },
  { immediate: true }
)

async function requestDeposit(){
  message.value = ''
  if(!auth.user){ message.value = 'Нужен вход'; return }
  if(amount.value <= 0){ message.value = 'Сумма должна быть больше 0'; return }
  try{
    await tickets.create('DEPOSIT', amount.value)
    message.value = 'Заявка на пополнение отправлена в админку.'
    await loadMineSafe()
  }catch{
    message.value = 'Не удалось создать тикет.'
  }
}

async function requestWithdraw(){
  message.value = ''
  if(!auth.user){ message.value = 'Нужен вход'; return }
  if(amount2.value <= 0){ message.value = 'Сумма должна быть больше 0'; return }
  try{
    await tickets.create('WITHDRAW', amount2.value)
    message.value = 'Заявка на вывод отправлена в админку.'
    await loadMineSafe()
  }catch{
    message.value = 'Не удалось создать тикет.'
  }
}

async function refreshAll(){
  await loadMineSafe()
  // если ты добавил fetchBalance в auth store — подтянем баланс тоже
  await (auth as any).fetchBalance?.().catch(() => {})
}
</script>

<template>
  <div class="grid" style="gap:16px;">
    <div class="card">
      <div class="row-between">
        <h2 style="margin:0;">Профиль</h2>
        <span v-if="auth.user" class="badge">Balance: {{ auth.user.balance.toFixed(2) }}</span>
      </div>

      <p class="muted" style="margin-top:8px;">
        Пополнение/вывод работают через <b>тикеты</b>: пользователь создаёт заявку, админ подтверждает или отклоняет.
      </p>

      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card2">
          <b>Пополнение</b>
          <div class="row" style="gap:10px; margin-top:10px; flex-wrap:wrap;">
            <input class="input" type="number" v-model.number="amount" min="1" />
            <button class="btn btn-primary" @click="requestDeposit" :disabled="loading">Создать тикет</button>
          </div>
        </div>

        <div class="card2">
          <b>Вывод</b>
          <div class="row" style="gap:10px; margin-top:10px; flex-wrap:wrap;">
            <input class="input" type="number" v-model.number="amount2" min="1" />
            <button class="btn btn-primary" @click="requestWithdraw" :disabled="loading">Создать тикет</button>
          </div>
        </div>
      </div>

      <div v-if="message" class="badge" style="margin-top:12px; white-space:normal;">{{ message }}</div>
    </div>

    <div class="card">
      <div class="row-between">
        <h3 style="margin:0;">Мои тикеты</h3>
        <button class="btn" @click="refreshAll" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="muted" style="margin-top:12px;">Загрузка...</div>
      <div v-else-if="mineSafe.length === 0" class="muted" style="margin-top:12px;">Тикетов пока нет.</div>

      <div v-else class="grid" style="gap:10px; margin-top:12px;">
        <div v-for="t in mineSafe" :key="String(t.id)" class="card2 row-between" style="gap:12px;">
          <div class="grid" style="gap:4px;">
            <b>#{{ String(t.id).slice(0,6) }} • {{ t.type === 'deposit' ? 'Пополнение' : 'Вывод' }}</b>
            <span class="muted">{{ t.createdAt ? new Date(t.createdAt).toLocaleString() : '-' }}</span>
            <span class="badge" :class="'st-' + t.status">{{ t.status }}</span>
          </div>
          <div class="row" style="gap:8px;">
            <span class="badge">amount: {{ t.amount }}</span>
          </div>
        </div>
      </div>

      <div v-if="!loading && pending.length" class="muted" style="margin-top:10px;">
        Pending: {{ pending.length }} (ожидают подтверждения админом)
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-pending{ border-color: rgba(250,204,21,.45); background: rgba(250,204,21,.10); }
.st-approved{ border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.10); }
.st-rejected{ border-color: rgba(248,81,73,.45); background: rgba(248,81,73,.10); }
</style>
