<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const nickname = ref('')
const password = ref('')
const error = ref('')
const googleLoading = ref(false)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

const passwordOk = computed(() => password.value.length >= 8)
const canSubmit = computed(() => nickname.value.trim().length > 0 && passwordOk.value && !auth.loading)

async function submit() {
  error.value = ''

  const nick = nickname.value.trim()
  if (password.value.length < 8) {
    error.value = 'Пароль повинен мати як мінімум 8 символів'
    return
  }

  try {
    const res = await auth.register({ nickname: nick, password: password.value })
    if (!res.ok) {
      error.value = (res as any).message || 'Не вдалось зареєструватися'
      return
    }
    await router.replace({ name: 'profile' })
  } catch (e: any) {
    error.value = e?.message || 'Помилка реєстрації'
  }
}

async function handleGoogleCredential(response: any) {
  error.value = ''
  googleLoading.value = true
  try {
    const res = await auth.loginWithGoogle(response.credential)
    if (!res.ok) { error.value = 'Google sign-in failed'; return }
    await router.replace({ name: 'profile' })
  } catch (e: any) {
    error.value = e?.message || 'Помилка Google реєстрації'
  } finally {
    googleLoading.value = false
  }
}

onMounted(() => {
  if (!GOOGLE_CLIENT_ID) return
  const g = (window as any).google
  if (!g) return
  g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential })
  g.accounts.id.renderButton(document.getElementById('google-btn-register'), {
    theme: 'filled_black', size: 'large', text: 'signup_with', width: 340, locale: 'uk',
  })
})
</script>

<template>
  <div class="auth">
    <div class="card">
      <div class="head">
        <h1>{{ $t('ui.s_0b93f81293') }}</h1>
        <p class="muted">{{ $t('ui.s_b4c974186e') }}</p>
      </div>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span class="label">{{ $t('ui.s_3fea2b66f7') }}</span>
          <input v-model="nickname" type="text" autocomplete="nickname" :placeholder="$t('ui.s_4b49f253c1')" required />
        </label>

        <label class="field">
          <span class="label">{{ $t('ui.s_5ebe553e01') }}</span>
          <input v-model="password" type="password" autocomplete="new-password" :placeholder="$t('ui.s_c7665a90a1')" required />
          <span class="tiny" :class="{ bad: password.length > 0 && !passwordOk }">
            {{ password.length === 0 ? 'Мінімум 8 символів' : (passwordOk ? 'Ок' : 'Занадто короткий пароль') }}
          </span>
        </label>

        <div v-if="error" class="notice error" role="alert">{{ error }}</div>

        <button class="btn primary" type="submit" :disabled="!canSubmit">
          {{ auth.loading ? 'Створюємо…' : 'Створити акаунт' }}
        </button>

        <template v-if="GOOGLE_CLIENT_ID">
          <div class="divider"><span>або зареєструйтесь через</span></div>
          <div id="google-btn-register" class="google-btn-wrap"></div>
        </template>

        <p class="hint">
          {{ $t('ui.s_1411042379') }}
          <RouterLink class="link" :to="{ name: 'login' }">{{ $t('ui.s_63a753751e') }}</RouterLink>
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
.tiny.bad{ color: var(--brandRed); }
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
.divider{
  display: flex; align-items: center; gap: 10px;
  color: var(--muted); font-size: 12px; margin: 4px 0;
}
.divider::before, .divider::after{
  content: ''; flex: 1; height: 1px; background: var(--border);
}
.google-btn-wrap{ display: flex; justify-content: center; }
</style>
