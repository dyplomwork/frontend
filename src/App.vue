<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterView, RouterLink } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { isSfxOn, setSfxOn, sfx } from './utils/sfx'
import { getBgmVolume, initBgm, isBgmOn, setBgmVolume, toggleBgm } from './utils/bgm'
import AppFooter from './components/AppFooter.vue'
import SeoHead from './components/SeoHead.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const LS_SIDEBAR = 'sopov_sidebar_open_v1'
const sidebarOpen = ref(false)

const bgmOn = ref(true)

const bgmVol = ref(0.15)

onMounted(() => {
  // load sidebar state
  sidebarOpen.value = localStorage.getItem(LS_SIDEBAR) === '1'

  // background music preference + init
  bgmOn.value = isBgmOn()
  bgmVol.value = getBgmVolume()
  initBgm()
})

function toggleMusic(){
  // Keep the action silent (BGM is separate from SFX).
  bgmOn.value = toggleBgm()
  // если включили — применим текущую громкость сразу
  if (bgmOn.value) setBgmVolume(bgmVol.value)
}

function onBgmVolInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  bgmVol.value = v
  setBgmVolume(v)
}

onMounted(() => {
  // load sidebar state
  sidebarOpen.value = localStorage.getItem(LS_SIDEBAR) === '1'

  // background music preference + init
  bgmOn.value = isBgmOn()
  initBgm()
})

function toggleSidebar(){
  sfx('click')
  sidebarOpen.value = !sidebarOpen.value
  localStorage.setItem(LS_SIDEBAR, sidebarOpen.value ? '1' : '0')
}

const sfxOn = ref(isSfxOn())
watch(sfxOn, (v) => setSfxOn(!!v), { immediate: true })
function toggleSfx(){
  // do not play click if SFX is off; icon should still toggle.
  sfxOn.value = !sfxOn.value
}




function goLogin(){ sfx('click'); router.push('/login') }
function goRegister(){ sfx('click'); router.push('/register') }
function logout(){ sfx('click'); auth.logout(); router.push('/') }
</script>

<template>
  <SeoHead />
  <div class="stake-app" :class="{ open: sidebarOpen }">
    <!-- Left Sidebar -->
    <aside class="stake-sidebar" :class="{ open: sidebarOpen }">
      <div class="side-top">
        <button class="icon-btn" @click="toggleSidebar" title="Menu">
          <span class="ic">≡</span>
        </button>
      </div>

      <nav class="side-nav">
        <RouterLink to="/" class="side-link" :class="{ active: route.path === '/' }" title="Home">
          <span class="side-ic">🏠</span>
          <span class="side-txt" v-if="sidebarOpen">Home</span>
        </RouterLink>
        <RouterLink to="/roulette" class="side-link" :class="{ active: route.path.startsWith('/roulette') }" title="Roulette">
          <span class="side-ic">🎡</span>
          <span class="side-txt" v-if="sidebarOpen">Roulette</span>
        </RouterLink>
        <RouterLink to="/dice" class="side-link" :class="{ active: route.path.startsWith('/dice') }" title="Dice">
          <span class="side-ic">🎲</span>
          <span class="side-txt" v-if="sidebarOpen">Dice</span>
        </RouterLink>
        <RouterLink to="/plinko" class="side-link" :class="{ active: route.path.startsWith('/plinko') }" title="Plinko">
          <span class="side-ic">🔻</span>
          <span class="side-txt" v-if="sidebarOpen">Plinko</span>
        </RouterLink>
        <RouterLink to="/mines" class="side-link" :class="{ active: route.path.startsWith('/mines') }" title="Mines">
          <span class="side-ic">💎</span>
          <span class="side-txt" v-if="sidebarOpen">Mines</span>
        </RouterLink>
        <RouterLink to="/cases" class="side-link" :class="{ active: route.path.startsWith('/cases') }" title="Cases">
          <span class="side-ic">🎁</span>
          <span class="side-txt" v-if="sidebarOpen">Cases</span>
        </RouterLink>
        <RouterLink to="/profile" class="side-link" :class="{ active: route.path.startsWith('/profile') }" title="Profile">
          <span class="side-ic">👤</span>
          <span class="side-txt" v-if="sidebarOpen">Profile</span>
        </RouterLink>
        </nav>

      <div class="side-bottom">
        <!-- Music block: icon ALWAYS visible inside bgm-vol -->
        <div class="bgm-vol" :class="{ off: !bgmOn }" :title="bgmOn ? 'Music volume' : 'Music is off'">
          <span class="ic">{{ bgmOn ? '🎵' : '🔕' }}</span>
          <!-- ONLY slider part hides when sidebar is closed -->
          <transition name="fade">
            <div v-if="sidebarOpen" class="bgm-vol__content">
              <div class="bgm-vol__top">
                <span class="bgm-vol__label">Volume</span>
                <span class="bgm-vol__pct">{{ Math.round(bgmVol * 100) }}%</span>
              </div>

              <input
                class="bgm-vol__range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="bgmVol"
                @input="onBgmVolInput"
                :disabled="!bgmOn"
                :style="{ '--fill': `${Math.round(bgmVol * 100)}%` }"
                aria-label="Background music volume"
              />
            </div>
          </transition>
        </div>

        <!-- SFX toggle UNDER music block -->
        <button class="icon-btn" @click="toggleSfx" :title="sfxOn ? 'SFX on' : 'SFX off'">
          <span class="ic">{{ sfxOn ? '🔊' : '🔇' }}</span>
        </button>
      </div>


    </aside>

    <!-- Main -->
    <div class="stake-main">
      <header class="stake-topbar">
        <div class="top-left">
          <div class="logo" @click="router.push('/')">
            <span class="logo-mark">SOPOVDROP</span>
          </div>
        </div>

        <div class="top-right">
          <template v-if="auth.user">
            <div class="balance-pill">
              <span class="muted">Balance</span>
              <span class="bal">{{ auth.user.balance.toFixed(2) }}</span>
              <span class="coin">G</span>
            </div>
            <button class="btn" @click="logout">Logout</button>
          </template>
          <template v-else>
            <button class="btn" @click="goLogin">Login</button>
            <button class="btn btn-blue" @click="goRegister">Register</button>
          </template>
        </div>
      </header>

      <main class="stake-content">
        <RouterView />
      </main>

      <AppFooter class="stake-footer" />
      <AdminFab v-if="isAdmin" />
    </div>
  </div>
</template>