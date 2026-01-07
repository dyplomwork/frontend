<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { isSfxOn, setSfxOn, sfx } from '../utils/sfx'
import { ref } from 'vue'

const router = useRouter()
const auth = useAuthStore()
const sfxOn = ref(isSfxOn())
function toggleSfx(){ sfx('click'); sfxOn.value = !sfxOn.value; setSfxOn(sfxOn.value) }
const roleLabel = computed(() => auth.role === 'admin' ? 'Admin' : auth.role === 'user' ? 'User' : 'Guest')

async function logout(){
  await auth.logout()
  router.push({ name: 'home' })
}
</script>

<template>
  <header class="container">
    <div class="row-between card">
      <div class="row">
        <RouterLink to="/" class="row" style="gap:10px;">
          <span class="badge">🎰</span>
          <b>SCXDROP</b>
        </RouterLink>
        <span class="badge">role: {{ roleLabel }}</span>
        <span v-if="auth.user" class="badge">balance: {{ auth.user.balance }} credits</span>
      </div>

      <nav class="row">
        <RouterLink class="badge" to="/roulette">{{ $t('ui.s_251bd81438') }}</RouterLink>
        <RouterLink class="badge" to="/cases">{{ $t('ui.s_b1f0b866ff') }}</RouterLink>
        <RouterLink v-if="auth.user" class="badge" to="/profile">{{ $t('ui.s_cce99c598c') }}</RouterLink>
        <RouterLink v-if="auth.isAdmin" class="badge" to="/admin">{{ $t('ui.s_e3afed0047') }}</RouterLink>

        <RouterLink v-if="!auth.user" class="btn btn-primary" to="/login">{{ $t('ui.s_99dea78007') }}</RouterLink>
        <button v-else class="btn" @click="logout">Logout</button>
        <button class="btn sfx" @click="toggleSfx" title="Sound">
          <span class="ic" aria-hidden="true">{{ sfxOn ? '🔊' : '🔇' }}</span>
        </button>
</nav>
    </div>
  </header>
</template>


