<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const nickname = ref('')
const discord = ref('')
const password = ref('')
const error = ref('')

const passwordOk = computed(() => password.value.length >= 8)
const canSubmit = computed(() => nickname.value.trim().length > 0 && discord.value.trim().length > 0 && passwordOk.value && !auth.loading)

async function submit() {
  error.value = ''

  const nick = nickname.value.trim()
  const disc = discord.value.trim()
  if (password.value.length < 8) {
    error.value = 'Пароль должен быть минимум 8 символов'
    return
  }

  try {
    const res = await auth.register({ nickname: nick, discord: disc, password: password.value })
    if (!res.ok) {
      error.value = (res as any).message || 'Не удалось зарегистрироваться'
      return
    }
    await router.replace({ name: 'profile' })
  } catch (e: any) {
    error.value = e?.message || 'Ошибка регистрации'
  }
}
</script>

<template>
  <div class="auth">
    <div class="card">
      <div class="head">
        <h1>Регистрация</h1>
        <p class="muted">Создай аккаунт — никнейм, Discord и пароль.</p>
      </div>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span class="label">Никнейм</span>
          <input v-model="nickname" type="text" autocomplete="nickname" placeholder="shadowghost31" required />
        </label>

        <label class="field">
          <span class="label">Discord</span>
          <input v-model="discord" type="text" autocomplete="username" placeholder="@user или user#1234" required />
        </label>

        <label class="field">
          <span class="label">Пароль</span>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="минимум 8 символов" required />
          <span class="tiny" :class="{ bad: password.length > 0 && !passwordOk }">
            {{ password.length === 0 ? 'Минимум 8 символов' : (passwordOk ? 'Ок' : 'Слишком короткий пароль') }}
          </span>
        </label>

        <div v-if="error" class="notice error" role="alert">{{ error }}</div>

        <button class="btn primary" type="submit" :disabled="!canSubmit">
          {{ auth.loading ? 'Создаём…' : 'Создать аккаунт' }}
        </button>

        <p class="hint">
          Уже есть аккаунт?
          <RouterLink class="link" :to="{ name: 'login' }">Войти</RouterLink>
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
  width: min(520px, 100%);
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
.tiny{ font-size: 12px; color: var(--muted); }
.tiny.bad{ color: var(--stakeRed); }
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
