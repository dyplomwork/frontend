<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const nickname = ref('')
const discord = ref('')
const password = ref('')
const error = ref('')

async function submit(){
  error.value = ''
  const res = await auth.register({
    email: email.value,
    nickname: nickname.value,
    discord: discord.value,
    password: password.value,
  }).catch((e:any)=>({ ok:false, message:e?.message }))

  if(!res.ok){
    error.value = (res as any).message || 'Ошибка'
    return
  }
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="grid" style="gap:16px;">
    <div class="card" style="max-width:520px; margin: 0 auto;">
      <h2 style="margin:0;">Регистрация</h2>
      <p class="muted" style="margin-top:8px;">
        Создай аккаунт, чтобы играть. Данные и баланс будут храниться в базе (Neon).
      </p>

      <form class="grid" style="gap:12px; margin-top:16px;" @submit.prevent="submit">
        <label class="field">
          <span class="muted">Email</span>
          <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>

        <label class="field">
          <span class="muted">Никнейм</span>
          <input v-model="nickname" type="text" autocomplete="nickname" placeholder="nickname" />
        </label>

        <label class="field">
          <span class="muted">Discord (опционально)</span>
          <input v-model="discord" type="text" placeholder="@user" />
        </label>

        <label class="field">
          <span class="muted">Пароль</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="минимум 6 символов" required />
        </label>

        <div v-if="error" class="notice error">{{ error }}</div>

        <button class="btn primary" type="submit">Создать аккаунт</button>
      </form>
    </div>
  </div>
</template>
