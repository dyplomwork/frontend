<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const login = ref('')
const password = ref('')
const error = ref('')

async function submit(){
  error.value = ''
  const res = await auth.login(login.value, password.value).catch((e:any)=>({ ok:false, message:e?.message }))
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
      <h2 style="margin:0;">Вход</h2>
      <p class="muted" style="margin-top:8px;">Введи email и пароль.</p>

      <form class="grid" style="gap:12px; margin-top:16px;" @submit.prevent="submit">
        <label class="field">
          <span class="muted">Email</span>
          <input v-model="login" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>

        <label class="field">
          <span class="muted">Пароль</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="пароль" required />
        </label>

        <div v-if="error" class="notice error">{{ error }}</div>

        <button class="btn primary" type="submit">Войти</button>
      </form>
    </div>
  </div>
</template>
