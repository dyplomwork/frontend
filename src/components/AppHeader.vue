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
        <RouterLink class="badge" to="/roulette">Games</RouterLink>
        <RouterLink class="badge" to="/cases">Cases</RouterLink>
        <RouterLink v-if="auth.user" class="badge" to="/profile">Profile</RouterLink>
        <RouterLink v-if="auth.isAdmin" class="badge" to="/admin">Admin</RouterLink>

        <RouterLink v-if="!auth.user" class="btn btn-primary" to="/login">Login</RouterLink>
        <button v-else class="btn" @click="logout">Logout</button>
        <button class="btn sfx" @click="toggleSfx" title="Sound">
          <span class="ic" aria-hidden="true">{{ sfxOn ? '🔊' : '🔇' }}</span>
        </button>
</nav>
    </div>
  </header>
</template>

<style scoped>
.sfx{ width: 44px; height: 40px; padding: 0; display:inline-grid; place-items:center; }
.ic{ font-size: 18px; }
</style>
