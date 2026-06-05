<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const login = ref('')
const password = ref('')
const error = ref('')

const canSubmit = computed(() => login.value.trim().length > 0 && password.value.length > 0 && !auth.loading)

async function submit() {
  error.value = ''
  try {
    const res = await auth.login(login.value.trim(), password.value)
    if (!res.ok) {
      error.value = (res as any).message || 'Не вдалось увійти'
      return
    }
    const next = (route.query.next as string | undefined) || '/profile'
    await router.replace(next)
  } catch (e: any) {
    error.value = e?.message || 'Помилка входу'
  }
}
</script>

<template>
  <div class="auth">
    <div class="card">
      <div class="head">
        <h1>{{ $t('ui.s_4c3fdc5cab') }}</h1>
        <p class="muted">{{ $t('ui.s_efe1b73267') }}</p>
      </div>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span class="label">{{ $t('ui.s_634e4413b8') }}</span>
          <input v-model="login" type="text" autocomplete="username" :placeholder="$t('ui.s_873362e50a')" required />
        </label>


        <label class="field">
          <span class="label">{{ $t('ui.s_5ebe553e01') }}</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </label>

        <div v-if="error" class="notice error" role="alert">{{ error }}</div>

        <button class="btn primary" type="submit" :disabled="!canSubmit">
          {{ auth.loading ? 'Входим…' : 'Ввійти' }}
        </button>

        <p class="hint">
          {{ $t('ui.s_6b3744217d') }}
          <RouterLink class="link" :to="{ name: 'register' }">{{ $t('ui.s_0b93f81293') }}</RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth{
  min-height: calc(100vh - 72px);
  display:grid;
  place-items:center;
  padding: 28px 14px;
}
.card{
  width: min(460px, 100%);
  border: 1px solid var(--border);
  background: rgba(255,255,255,.03);
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 16px 50px rgba(0,0,0,.35);
}
.head h1{
  margin: 0 0 6px;
  font-size: 22px;
}
.muted{ color: var(--muted); margin:0; }
.form{ margin-top: 14px; display:flex; flex-direction:column; gap: 12px; }
.field{ display:flex; flex-direction:column; gap: 6px; }
.label{ font-size: 13px; color: var(--muted); }
input{
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.04);
  color: var(--text);
  padding: 0 12px;
  outline: none;
}
input:focus{ border-color: var(--border2); background: rgba(255,255,255,.06); }
.notice{
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.04);
  font-size: 13px;
}
.notice.error{ border-color: rgba(255,59,87,.35); background: rgba(255,59,87,.10); }
.btn.primary{
  height: 44px;
  border-radius: 12px;
}
.btn.primary:disabled{
  opacity: .6;
  cursor: not-allowed;
}
.hint{
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}
.link{ color: var(--text); text-decoration: underline; }

</style>
